<?php
declare(strict_types=1);

/**
 * Passive yields (server):
 * - Udbetaler BÅDE base stage-bonus og almindelige yields fra ejede kilder (bld/add/ani)
 * - Respekterer <yield period="..."> pr. kilde (kontinuerlig pr. sekund)
 * - Anvender yield-buffs (mode="yield") pr. kilde før kreditering
 * - Ingen nye DB-felter: vi genbruger users.last_base_bonus_ts_utc som "last tick"
 *
 * Offentlig API:
 *   apply_passive_yields_for_user(int $userId, ?array $defs = null, ?array $state = null): void
 *     - Hvis $defs/$state udelades, udbetales kun base stage-bonus (bagudkompatibelt).
 *     - Hvis $defs og $state medsendes (som i alldata-flow), udbetales også almindelige yields.
 */

// ======================= små utils =======================
if (!function_exists('yield__root_backend')) {
  function yield__root_backend(): string {
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
    if (!preg_match('~^(?:[A-Za-z]:)?[\/\\\\]~', $dir)) {
      $dir = rtrim(yield__root_backend(), '/\\') . DIRECTORY_SEPARATOR . $dir;
    }
    $real = realpath($dir);
    return ($real && is_dir($real)) ? $real : (rtrim(yield__root_backend(), '/\\') . '/data/xml');
  }
}

// DB helper
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

// ================= stage-bonus regler =================
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

// ================= base-bonus (nu pr. sekund) =================
if (!function_exists('yield__compute_base_stage_bonus_per_seconds')) {
  /**
   * Beregn base-bonus for et antal sekunder (kontinuerlig).
   * Returnerer map: res_id => delta
   */
  function yield__compute_base_stage_bonus_per_seconds(PDO $db, int $userId, int $elapsedS): array {
    if ($elapsedS <= 0) return [];
    $stmt = $db->prepare("
      SELECT currentstage, mul_forest, mul_mining, mul_field, mul_water
        FROM users
       WHERE user_id = ?
       LIMIT 1
    ");
    $stmt->execute([$userId]);
    $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$u) return [];

    $stageId = (int)($u['currentstage'] ?? 0);
    if ($stageId <= 0) return [];

    $rulesAll = yield__load_all_stage_bonus_rules();
    $rules = $rulesAll[$stageId] ?? null;
    if (!$rules) return [];

    $bonuses = [
      'forest' => (float)($u['mul_forest'] ?? 0),
      'mining' => (float)($u['mul_mining'] ?? 0),
      'field'  => (float)($u['mul_field']  ?? 0),
      'water'  => (float)($u['mul_water']  ?? 0),
    ];

    $delta = [];
    $hours = $elapsedS / 3600.0;
    foreach ($bonuses as $key => $perHour) {
      if ($perHour <= 0) continue;
      foreach (($rules[$key] ?? []) as $resId) {
        $delta[$resId] = ($delta[$resId] ?? 0.0) + ($perHour * $hours);
      }
    }
    return $delta;
  }
}

// ================= almindelige yields + buffs =================
if (!function_exists('yield__read_period_seconds')) {
  function yield__read_period_seconds(array $def): int {
    $stats = $def['stats'] ?? [];
    foreach (['yield_period_s','yieldPeriodS','production_period_s','period_s'] as $k) {
      if (isset($def[$k]) && (int)$def[$k] > 0) return (int)$def[$k];
      if (isset($stats[$k]) && (int)$stats[$k] > 0) return (int)$stats[$k];
    }
    return 3600;
  }
}
if (!function_exists('yield__extract_yields_rows')) {
  // returnerer liste af ['res_id'=>'res.xxx','amount'=>float] fra def['yield']-arrayet
  function yield__extract_yields_rows(array $def): array {
    $out = [];
    $raw = $def['yield'] ?? null;
    if (!$raw || !is_array($raw)) return $out;
    foreach ($raw as $row) {
      $rid = $row['id'] ?? $row['res'] ?? null;
      if (!$rid) continue;
      $amt = $row['amount'] ?? $row['qty'] ?? null;
      if ($amt === null) continue;
      $out[] = ['res_id' => (string)$rid, 'amount' => (float)$amt];
    }
    return $out;
  }
}
if (!function_exists('yield__compute_ctx_id')) {
  function yield__compute_ctx_id(string $bucket, string $defKey): string {
    $pref = ($bucket === 'bld' ? 'bld.' : ($bucket === 'add' ? 'add.' : ($bucket === 'rsd' ? 'rsd.' : ($bucket==='ani'?'ani.':''))));
    $naked = preg_replace('~^(?:bld\.|add\.|rsd\.|ani\.)~i', '', $defKey);
    return $pref . $naked;
  }
}
if (!function_exists('yield__is_owned')) {
  function yield__is_owned(string $bucket, string $ctxId, array $state): bool {
    if ($bucket === 'bld') return !empty($state['bld'][$ctxId]);
    if ($bucket === 'add') return !empty($state['add'][$ctxId]);
    if ($bucket === 'rsd') {
      $k = preg_replace('~^rsd\.~', '', $ctxId);
      return !empty($state['rsd'][$k]) || !empty($state['research'][$k] ?? null) || !empty($state['rsd'][$ctxId]);
    }
    if ($bucket === 'ani') {
      $v = $state['ani'][$ctxId] ?? null;
      $qty = is_array($v) ? (float)($v['quantity'] ?? 0) : (float)$v;
      return $qty > 0;
    }
    return false;
  }
}
if (!function_exists('yield__assoc_add')) {
  function yield__assoc_add(array &$dst, array $src): void {
    foreach ($src as $k => $v) $dst[$k] = ($dst[$k] ?? 0.0) + (float)$v;
  }
}
if (!function_exists('yield__apply_yield_buffs_assoc')) {
  function yield__apply_yield_buffs_assoc(array $assoc, string $ctxId, array $buffs): array {
    if (!function_exists('apply_yield_buffs_assoc')) require_once __DIR__ . '/../actions/buffs.php';
    return apply_yield_buffs_assoc($assoc, $ctxId, $buffs);
  }
}
if (!function_exists('yield__collect_active_buffs')) {
  function yield__collect_active_buffs(array $defs, array $state, ?int $now = null): array {
    if (!function_exists('collect_active_buffs')) require_once __DIR__ . '/../actions/buffs.php';
    return collect_active_buffs($defs, $state, $now ?? time());
  }
}
if (!function_exists('yield__compute_flow_for_elapsed')) {
  /**
   * Beregn flow for elapsedS sekunder fra ejede kilder (bld/add/ani), inkl. yield-buffs.
   */
  function yield__compute_flow_for_elapsed(array $defs, array $state, int $elapsedS): array {
    if ($elapsedS <= 0) return [];
    $out = [];
    $buffs = yield__collect_active_buffs($defs, $state);

    foreach (['bld','add','ani'] as $bucket) {
      $group = $defs[$bucket] ?? [];
      foreach ($group as $defKey => $def) {
        $ctxId = yield__compute_ctx_id($bucket, (string)$defKey);
        if (!yield__is_owned($bucket, $ctxId, $state)) continue;

        $periodS = yield__read_period_seconds($def);
        if ($periodS <= 0) continue;

        $rows = yield__extract_yields_rows($def);
        if (!$rows) continue;

        $assoc = [];
        foreach ($rows as $r) {
          $perSec = $r['amount'] / $periodS;
          $delta = $perSec * $elapsedS;
          if ($delta == 0.0) continue;
          $assoc[$r['res_id']] = ($assoc[$r['res_id']] ?? 0.0) + $delta;
        }

        if ($assoc) {
          $assoc = yield__apply_yield_buffs_assoc($assoc, $ctxId, $buffs);
          yield__assoc_add($out, $assoc);
        }
      }
    }

    return $out;
  }
}

// ================= inventory upsert (UPSERT) =================
if (!function_exists('yield__inventory_upsert_batch')) {
  function yield__inventory_upsert_batch(PDO $db, int $userId, array $deltaMap): void {
    if (empty($deltaMap)) return;

    $sql = "INSERT INTO inventory (user_id, res_id, amount)
            VALUES (:uid, :rid, :amt)
            ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)";
    $stmt = $db->prepare($sql);

    foreach ($deltaMap as $rid => $amt) {
      if (!$rid) continue;
      $a = (float)$amt;
      if ($a == 0.0) continue;
      $stmt->execute([':uid' => (int)$userId, ':rid' => (string)$rid, ':amt' => $a]);
    }
  }
}

// ================= tidspunkt-håndtering =================
if (!function_exists('yield__get_last_tick_ts')) {
  function yield__get_last_tick_ts(PDO $db, int $userId): ?string {
    $st = $db->prepare("SELECT last_base_bonus_ts_utc FROM users WHERE user_id = ?");
    $st->execute([$userId]);
    $ts = $st->fetchColumn();
    return $ts ? (string)$ts : null;
  }
}
if (!function_exists('yield__set_last_tick_ts_now')) {
  function yield__set_last_tick_ts_now(PDO $db, int $userId): void {
    $st = $db->prepare("UPDATE users SET last_base_bonus_ts_utc = UTC_TIMESTAMP() WHERE user_id = ?");
    $st->execute([$userId]);
  }
}
if (!function_exists('yield__seconds_diff')) {
  function yield__seconds_diff(PDO $db, string $fromTs): int {
    $st = $db->prepare("SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, ?, UTC_TIMESTAMP()))");
    $st->execute([$fromTs]);
    return (int)$st->fetchColumn();
  }
}

// ================= offentlig API =================
if (!function_exists('apply_passive_yields_for_user')) {
  /**
   * Hvis $defs/$state er null → kun base stage-bonus (bagudkompatibelt).
   * Hvis $defs/$state er med → base + almindelige yields (kontinuerligt).
   */
  function apply_passive_yields_for_user(int $userId, ?array $defs = null, ?array $state = null): void {
    $db = yield__db();

    $lastTs = yield__get_last_tick_ts($db, $userId);
    if (!$lastTs) {
      // Første init – sæt tidspunkt og udbetal ikke
      yield__set_last_tick_ts_now($db, $userId);
      return;
    }

    $elapsedS = yield__seconds_diff($db, $lastTs);
    if ($elapsedS <= 0) return;

    // 1) base-bonus pr. sekund
    $deltaBase = yield__compute_base_stage_bonus_per_seconds($db, $userId, $elapsedS);

    // 2) almindelige yields (hvis defs+state findes)
    $deltaFlow = [];
    if ($defs !== null && $state !== null) {
      $deltaFlow = yield__compute_flow_for_elapsed($defs, $state, $elapsedS);
    }

    // 3) merge og commit
    $delta = $deltaBase;
    foreach ($deltaFlow as $rid => $amt) $delta[$rid] = ($delta[$rid] ?? 0.0) + (float)$amt;

    $db->beginTransaction();
    try {
      if (!empty($delta)) {
        yield__inventory_upsert_batch($db, $userId, $delta);
      }
      // AVANCER til NU (sekund-precis) → undgår dobbelt-udbetaling
      yield__set_last_tick_ts_now($db, $userId);
      $db->commit();
    } catch (Throwable $e) {
      $db->rollBack();
      throw $e;
    }
  }
}