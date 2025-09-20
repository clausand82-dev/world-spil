<?php
declare(strict_types=1);

/**
 * Passive yield backend – “Base stage bonus” 1 gang pr. hele time.
 *
 * Forudsætninger i DB:
 * - users: user_id (PK), currentstage (INT), mul_forest, mul_mining, mul_field, mul_water (FLOAT/INT),
 *          last_base_bonus_ts_utc (DATETIME NULL)
 * - inventory: user_id, res_id (fx 'res.wood'), amount (FLOAT)
 *
 * Forudsætninger i XML:
 * - En eller flere <stage id="..."> noder med underliggende <bonus key="forest|mining|field|water" res="res.foo,res.bar"/>
 * - XML-filer ligger under backend/data/xml eller den sti, der er sat i backend/data/config/config.ini (dirs.xml_dir).
 *
 * Offentlige funktioner:
 * - apply_passive_yields_for_user(int $userId): void
 *
 * Semantik:
 * - Ved første kald, hvis users.last_base_bonus_ts_utc er NULL, initialiseres den til UTC_TIMESTAMP()
 *   og der udbetales 0 (ur startes).
 * - Efterfølgende kald: udbetal kun hele timer: cycles = floor(elapsed_seconds / 3600).
 * - Udbetal pr. ressource: delta[resId] += mul_key * cycles, for alle resId i reglerne for brugerens currentstage.
 * - Når inventory er opdateret (commit), fremrykkes last_base_bonus_ts_utc med “cycles” timer.
 *
 * Bemærk:
 * - Denne fil krediterer KUN base stage-bonus. Hvis du har anden passiv udbetaling (bygninger, addons, dyr),
 *   kan du enten implementere dem her eller i din eksisterende pipeline.
 */


/* ======================= Små utils ======================= */

if (!function_exists('yield__root_backend')) {
  function yield__root_backend(): string {
    // Denne fil ligger i backend/api/lib → hop 2 op for backend/
    $backend = realpath(__DIR__ . '/..'); // backend/api
    $backend = $backend ? realpath($backend . '/..') : null; // backend/
    return $backend ?: (__DIR__ . '/../../');
  }
}

if (!function_exists('yield__load_config_ini')) {
  function yield__load_config_ini(): array {
    $path = yield__root_backend() . '/data/config/config.ini';
    if (!is_file($path)) return [];
    $cfg = parse_ini_file($path, true, INI_SCANNER_TYPED);
    return is_array($cfg) ? $cfg : [];
  }
}

if (!function_exists('yield__xml_dir')) {
  function yield__xml_dir(): string {
    $cfg = yield__load_config_ini();
    $dir = (string)($cfg['dirs']['xml_dir'] ?? 'data/xml');
    // Hvis relativ sti → relativ til backend/
    if (!preg_match('~^(?:[A-Za-z]:)?[\/\\\\]~', $dir)) {
      $dir = rtrim(yield__root_backend(), '/\\') . DIRECTORY_SEPARATOR . $dir;
    }
    $real = realpath($dir);
    return ($real && is_dir($real)) ? $real : (rtrim(yield__root_backend(), '/\\') . '/data/xml');
  }
}

/**
 * Lokal DB-helper.
 * Hvis global db() findes (defineret i alldata.php), så brug den.
 * Ellers læs backend/data/config/db.ini.
 */
if (!function_exists('yield__db')) {
  function yield__db(): PDO {
    if (function_exists('db')) return db();
    $ini = yield__root_backend() . '/data/config/db.ini';
    $cfg = is_file($ini) ? parse_ini_file($ini, true, INI_SCANNER_TYPED) : [];
    $db  = $cfg['database'] ?? $cfg;

    $host = $db['host'] ?? '127.0.0.1';
    $user = $db['user'] ?? 'root';
    $pass = $db['password'] ?? ($db['pass'] ?? '');
    $name = $db['name'] ?? ($db['dbname'] ?? ($db['database'] ?? ''));
    $charset = $db['charset'] ?? 'utf8mb4';
    if ($name === '') throw new RuntimeException('DB name missing in db.ini');

    $pdo = new PDO("mysql:host={$host};dbname={$name};charset={$charset}", $user, $pass, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
  }
}

/* ======================= XML parsing af <stage> regler ======================= */

if (!function_exists('yield__parse_stage_bonus_rules_from_xml')) {
  /**
   * Returnerer:
   * [ stageId => ['forest'=>['res.wood',...], 'mining'=>[], 'field'=>[], 'water'=>[]], ... ]
   */
  function yield__parse_stage_bonus_rules_from_xml(SimpleXMLElement $xml): array {
    $out = [];
    foreach (($xml->xpath('//stage') ?: []) as $stage) {
      $sid = (int)($stage['id'] ?? 0);
      if ($sid <= 0) continue;
      $bucket = $out[$sid] ?? ['forest'=>[], 'mining'=>[], 'field'=>[], 'water'=>[]];
      foreach ($stage->xpath('bonus') ?: [] as $b) {
        $key = strtolower(trim((string)($b['key'] ?? '')));
        if (!in_array($key, ['forest','mining','field','water'], true)) continue;
        $resAttr = trim((string)($b['res'] ?? ''));
        if ($resAttr === '') continue;
        foreach (explode(',', $resAttr) as $rid) {
          $rid = trim($rid); if ($rid === '') continue;
          $rid = str_starts_with($rid, 'res.') ? $rid : ("res." . $rid);
          $bucket[$key][] = $rid;
        }
      }
      $out[$sid] = $bucket;
    }
    return $out;
  }
}

if (!function_exists('yield__load_all_stage_bonus_rules')) {
  function yield__load_all_stage_bonus_rules(): array {
    $dir = yield__xml_dir();
    $rules = [];
    $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($rii as $info) {
      if (!$info->isFile() || strtolower($info->getExtension()) !== 'xml') continue;
      $xml = @simplexml_load_file($info->getPathname());
      if (!$xml) continue;
      $one = yield__parse_stage_bonus_rules_from_xml($xml);
      if ($one) $rules = array_replace_recursive($rules, $one);
    }
    return $rules;
  }
}

/* ======================= Base-bonus cycles og inventory opdatering ======================= */

/**
 * Beregn delta for base stage-bonus siden sidste udbetaling.
 *
 * Returnerer array med:
 * - delta: map res_id => amountToAdd (float)
 * - cycles: helt antal timer udbetalt
 *
 * Sideeffekt:
 * - Hvis last_base_bonus_ts_utc er NULL/invalid, initialiseres den til nu og der udbetales 0.
 */
if (!function_exists('yield__compute_base_stage_bonus_delta')) {
  function yield__compute_base_stage_bonus_delta(PDO $db, int $userId): array {
    $stmt = $db->prepare("
      SELECT currentstage,
             mul_forest, mul_mining, mul_field, mul_water,
             last_base_bonus_ts_utc
        FROM users
       WHERE user_id = ?
      LIMIT 1
    ");
    $stmt->execute([$userId]);
    $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$u) return ['delta' => [], 'cycles' => 0];

    $now = new DateTime('now', new DateTimeZone('UTC'));
    $lastStr = (string)($u['last_base_bonus_ts_utc'] ?? '');

    if ($lastStr === '' || $lastStr === '0000-00-00 00:00:00') {
      // Start uret første gang og udbetal ikke.
      $init = $db->prepare("UPDATE users SET last_base_bonus_ts_utc = UTC_TIMESTAMP() WHERE user_id = ?");
      $init->execute([$userId]);
      return ['delta' => [], 'cycles' => 0];
    }

    try {
      $last = new DateTime($lastStr, new DateTimeZone('UTC'));
    } catch (Throwable $e) {
      // Korrupt værdi → nulstil til nu, ingen udbetaling
      $fix = $db->prepare("UPDATE users SET last_base_bonus_ts_utc = UTC_TIMESTAMP() WHERE user_id = ?");
      $fix->execute([$userId]);
      return ['delta' => [], 'cycles' => 0];
    }

    $elapsed = max(0, $now->getTimestamp() - $last->getTimestamp());
    $cycles  = intdiv($elapsed, 3600);
    if ($cycles <= 0) return ['delta' => [], 'cycles' => 0];

    $stageId = (int)($u['currentstage'] ?? 0);
    if ($stageId <= 0) return ['delta' => [], 'cycles' => 0];

    $rulesAll = yield__load_all_stage_bonus_rules();
    $rules = $rulesAll[$stageId] ?? null;
    if (!$rules) return ['delta' => [], 'cycles' => 0];

    $bonuses = [
      'forest' => (float)($u['mul_forest'] ?? 0),
      'mining' => (float)($u['mul_mining'] ?? 0),
      'field'  => (float)($u['mul_field']  ?? 0),
      'water'  => (float)($u['mul_water']  ?? 0),
    ];

    $delta = [];
    foreach ($bonuses as $key => $perHour) {
      if ($perHour <= 0) continue;
      foreach (($rules[$key] ?? []) as $resId) {
        $delta[$resId] = ($delta[$resId] ?? 0.0) + ($perHour * $cycles);
      }
    }

    return ['delta' => $delta, 'cycles' => $cycles];
  }
}

if (!function_exists('yield__advance_last_base_bonus')) {
  /**
   * Fremryk last_base_bonus_ts_utc med n hele timer.
   * Kald KUN når inventory-commit er lykkedes.
   */
  function yield__advance_last_base_bonus(PDO $db, int $userId, int $cycles): void {
    if ($cycles <= 0) return;
    $stmt = $db->prepare("
      UPDATE users
         SET last_base_bonus_ts_utc = IFNULL(last_base_bonus_ts_utc, UTC_TIMESTAMP()),
             last_base_bonus_ts_utc = DATE_ADD(last_base_bonus_ts_utc, INTERVAL :cycles HOUR)
       WHERE user_id = :uid
    ");
    $stmt->execute([':cycles' => $cycles, ':uid' => $userId]);
  }
}

/**
 * Upsert til inventory for en batch ressource-deltaer.
 * deltaMap: ['res.wood'=>3.0, 'res.water'=>1.0, ...]
 */
if (!function_exists('yield__inventory_upsert_batch')) {
  function yield__inventory_upsert_batch(PDO $db, int $userId, array $deltaMap): void {
    if (empty($deltaMap)) return;

    // Prøv at opdatere eksisterende rækker først
    $upd = $db->prepare("UPDATE inventory SET amount = amount + :amt WHERE user_id = :uid AND res_id = :rid");
    $ins = $db->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (:uid, :rid, :amt)");

    foreach ($deltaMap as $rid => $amt) {
      if (!$rid || $amt == 0) continue;
      $ok = $upd->execute([':amt' => $amt, ':uid' => $userId, ':rid' => $rid]);
      if ($ok && $upd->rowCount() > 0) continue;
      $ins->execute([':uid' => $userId, ':rid' => $rid, ':amt' => $amt]);
    }
  }
}

/* ======================= Offentlig API ======================= */

/**
 * Kald denne fra alldata.php før du henter state, så inventory er opdateret.
 * Lige nu krediterer vi KUN base stage-bonus (1 gang pr. time).
 * Ønsker du at lægge bygninger/addons/dyr ind her, kan de merges i $candidates før commit.
 */
if (!function_exists('apply_passive_yields_for_user')) {
  function apply_passive_yields_for_user(int $userId): void {
    $db = yield__db();

    // 1) Indsaml kandidater (kun base-bonus her)
    $base = yield__compute_base_stage_bonus_delta($db, $userId);
    $candidates = $base['delta']; // map: res_id => amount

    if (empty($candidates)) {
      // Intet at udbetale (enten første init eller < 1 time).
      return;
    }

    // 2) Transaktion: skriv inventory og fremryk timestamp, hvis OK
    $db->beginTransaction();
    try {
      yield__inventory_upsert_batch($db, $userId, $candidates);
      yield__advance_last_base_bonus($db, $userId, (int)($base['cycles'] ?? 0));
      $db->commit();
    } catch (Throwable $e) {
      $db->rollBack();
      // Propager fejlen – alldata.php har try/catch
      throw $e;
    }
  }
}