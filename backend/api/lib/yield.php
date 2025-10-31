<?php
declare(strict_types=1);

/**
 * Passive yields med:
 * - Buffs (per entitet)
 * - Kapacitetsklip i "space" (unitSpace pr. ressource) for både base bonus og entiteter
 * - Delvis kreditering: kun den del der kan være, går ind — resten logges som 'yield_lost'
 * - Diskret base bonus: udbetales kun for hele timer (cycles = floor(elapsed/3600))
 * - Tidsforbrug: last_yield_ts_utc / last_base_bonus_ts_utc avanceres præcist med forbrugte sekunder
 *
 * Kapaciteter:
 * - Foretrækker caps fra state.cap.solid.total / state.cap.liquid.total, hvis de findes
 * - Ellers users-tabellen (solid_cap/liquid_cap aliaser)
 * - Ellers fallback: sum af ejede defs' stats (bld/add/rsd/ani) + inventory-baseret kapacitet (res.*)
 */

/* ========================= unitSpace / buckets / usage ========================= */

/** Læs unitSpace for en ressource (fallback: currency→0, ellers 1.0) */
if (!function_exists('yield__unit_space_of_res')) {
  function yield__unit_space_of_res(array $defs, string $resId): float {
    $key   = preg_replace('/^res\./', '', (string)$resId);
    $row   = (array)($defs['res'][$key] ?? []);
    $stats = (array)($row['stats'] ?? []);

    $cands = [
      $row['unitSpace'] ?? null,
      $stats['unitSpace'] ?? null,
      $row['space'] ?? null,
      $stats['space'] ?? null,
      $row['volume'] ?? null,
      $stats['volume'] ?? null,
    ];
    foreach ($cands as $v) {
      if ($v !== null && is_numeric($v)) return max(0.0, (float)$v);
    }

    $unit = strtolower((string)($row['unit'] ?? ''));
    if ($key === 'kr' || $unit === 'kr' || ($row['type'] ?? '') === 'currency') return 0.0;

    return 1.0;
  }
}

/** Bucket: ml/cl/dl/l/liter/litre ⇒ liquid, ellers solid */
if (!function_exists('yield__bucket_of_res')) {
  function yield__bucket_of_res(string $resId, array $defs): string {
    $key  = preg_replace('/^res\./', '', $resId);
    $unit = strtolower((string)($defs['res'][$key]['unit'] ?? ''));
    if (preg_match('/^(?:ml|cl|dl|l|liter|litre)$/', $unit)) return 'liquid';
    return 'solid';
  }
}

/* ========================= Fælles helpers (DB/defs/state) ========================= */

if (!function_exists('yield__root_backend')) {
  function yield__root_backend(): string {
    $backend = realpath(__DIR__ . '/..');         // backend/api
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

    return new PDO("mysql:host={$host};dbname={$name};charset={$charset}", $user, $pass, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
  }
}
if (!function_exists('yield__db_has_columns')) {
  function yield__db_has_columns(PDO $db, string $table, array $cols): bool {
    foreach ($cols as $c) {
      $st = $db->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
      $st->execute([$c]);
      if (!$st->fetch()) return false;
    }
    return true;
  }
}

/** Hvis defs mangler (eller mangler grene), så load dem fra XML og merge */
if (!function_exists('yield__ensure_defs')) {
  function yield__ensure_defs(?array $defs): array {
    $need = ['res','bld','add','rsd','ani'];
    $haveAll = is_array($defs);
    if ($haveAll) {
      foreach ($need as $k) if (!array_key_exists($k, $defs)) { $haveAll = false; break; }
    }
    if ($haveAll) return $defs;

    if (!function_exists('load_all_defs')) {
      $alldata = yield__root_backend() . '/api/alldata.php';
      if (is_file($alldata)) require_once $alldata;
    }
    if (function_exists('load_all_defs')) {
      $loaded = load_all_defs();
      return is_array($defs) ? array_replace_recursive($loaded, $defs) : $loaded;
    }
    return $defs ?? [];
  }
}

/** Hvis state ikke gives, byg et minimalt state så entitets-yields kan køre */
if (!function_exists('yield__build_min_state')) {
  function yield__build_min_state(PDO $db, int $userId): array {
    $state = ['bld'=>[], 'add'=>[], 'rsd'=>[], 'ani'=>[]];

    if (yield__db_has_columns($db, 'buildings', ['bld_id','user_id'])) {
      $st=$db->prepare("SELECT bld_id FROM buildings WHERE user_id=?"); $st->execute([$userId]);
      foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) {
        $state['bld'][(string)$id] = ['durability_pct'=>100];
      }
    }
    if (yield__db_has_columns($db, 'addon', ['add_id','user_id'])) {
      $st=$db->prepare("SELECT add_id FROM addon WHERE user_id=?"); $st->execute([$userId]);
      foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) $state['add'][(string)$id] = 1;
    }
    // Fuldførte research (BRUG user_research)
    if (yield__db_has_columns($db, 'research', ['rsd_id','user_id'])) {
      $st=$db->prepare("SELECT rsd_id FROM research WHERE user_id=?");
      $st->execute([$userId]);
      foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $rid) {
        $plain = preg_replace('~^rsd\.~','', (string)$rid);
        $state['rsd'][$plain] = 1;
      }
    }
    // Dyr
    if (yield__db_has_columns($db, 'animals', ['ani_id','quantity','user_id'])) {
      $st=$db->prepare("SELECT ani_id, quantity FROM animals WHERE user_id=?");
      $st->execute([$userId]);
      foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $plain = preg_replace('~^ani\.~','', (string)$r['ani_id']);
        $state['ani'][$plain] = ['quantity'=>(float)($r['quantity'] ?? 0)];
      }
    }

    return $state;
  }
}

/* ========================= Usage og Caps ========================= */

if (!function_exists('yield__compute_bucket_usage')) {
  function yield__compute_bucket_usage(PDO $db, int $userId, array $defs): array {
    $st = $db->prepare("SELECT res_id, amount FROM inventory WHERE user_id = ?");
    $st->execute([$userId]);
    $used = ['solid' => 0.0, 'liquid' => 0.0];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $rid = (string)$r['res_id'];
      $amt = (float)$r['amount'];
      if ($amt <= 0) continue;
      $bucket       = yield__bucket_of_res($rid, $defs);
      $spacePerUnit = yield__unit_space_of_res($defs, $rid);
      $used[$bucket] += $amt * max(0.0, $spacePerUnit);
    }
    return $used;
  }
}

/**
 * Læs brugerens kapaciteter for solid/liquid:
 * 1) state.cap.* hvis angivet
 * 2) users-kolonner
 * 3) Fallback: bld/add/rsd/ani + inventory (res.*) + base fra config.ini
 */
if (!function_exists('yield__read_user_caps')) {
  function yield__read_user_caps(PDO $db, int $userId, array $defs, array $state): array {
    // 1) From state.cap.*
    $sCap = $state['cap']['solid']['total']  ?? $state['cap']['solid']['max']  ?? null;
    $lCap = $state['cap']['liquid']['total'] ?? $state['cap']['liquid']['max'] ?? null;
    if (is_numeric($sCap) || is_numeric($lCap)) {
      return [
        'solid'  => max(0.0, (float)($sCap ?? 0)),
        'liquid' => max(0.0, (float)($lCap ?? 0)),
      ];
    }

    // 2) users-tabellen
    $cols = $db->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN, 0);
    $has  = fn(string $c) => in_array($c, $cols, true);

    $candSolid  = array_values(array_filter(['solid_cap','cap_solid','inv_cap_solid'], $has));
    $candLiquid = array_values(array_filter(['liquid_cap','cap_liquid','inv_cap_liquid'], $has));
    if ($candSolid && $candLiquid) {
      $sql = "SELECT {$candSolid[0]} AS solid_cap, {$candLiquid[0]} AS liquid_cap FROM users WHERE user_id = ? LIMIT 1";
      $st  = $db->prepare($sql);
      $st->execute([$userId]);
      if ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        return [
          'solid'  => max(0.0, (float)($row['solid_cap']  ?? 0)),
          'liquid' => max(0.0, (float)($row['liquid_cap'] ?? 0)),
        ];
      }
    }

    // 3) Fallback: summer fra defs + inventory
    $acc = ['solid'=>0.0,'liquid'=>0.0];

    $readStat = function($node, array $keys): float {
      if (!$node) return 0.0;
      if (is_array($node)) {
        $stats = $node['stats'] ?? null;
        if (is_array($stats)) {
          foreach ($keys as $k) if (array_key_exists($k, $stats)) return (float)$stats[$k];
        } elseif (is_string($stats)) {
          $s = str_replace(["\xC2\xA0", "\xEF\xBC\x9B", "\xEF\xBC\x8C", "\xE2\x80\x8B"], [' ', ';', ',', ''], $stats);
          foreach (preg_split('/[;,]\s*/u', $s) as $p) {
            foreach ($keys as $k) if (preg_match('/^\s*'.preg_quote($k,'/').'\s*=\s*([+-]?\d+(?:\.\d+)?)\s*$/u', (string)$p, $m)) return (float)$m[1];
          }
        }
      }
      return 0.0;
    };

    // Buildings
    if (!empty($defs['bld']) && yield__db_has_columns($db, 'buildings', ['bld_id','level','user_id'])) {
      $st = $db->prepare("SELECT bld_id AS id, level AS lvl FROM buildings WHERE user_id=?");
      $st->execute([$userId]);
      while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $id = (string)$row['id'];
        $lvl= (int)$row['lvl'];
        $plain = preg_replace('/^bld\./','', $id);
        $node = $defs['bld'][$plain] ?? $defs['bld']["{$plain}.l{$lvl}"] ?? null;
        if (!$node) continue;
        $acc['solid']  += (float)$readStat($node, ['storageSolidCap','storage_solid_cap','solidCap']);
        $acc['liquid'] += (float)$readStat($node, ['storageLiquidCap','storage_liquid_cap','liquidCap']);
      }
    }
    // Addons
    if (!empty($defs['add']) && yield__db_has_columns($db, 'addon', ['add_id','level','user_id'])) {
      $st = $db->prepare("SELECT add_id AS id, level AS lvl FROM addon WHERE user_id=?");
      $st->execute([$userId]);
      while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $id = (string)$row['id'];
        $lvl= (int)$row['lvl'];
        $plain = preg_replace('/^add\./','', $id);
        $node = $defs['add'][$plain] ?? $defs['add']["{$plain}.l{$lvl}"] ?? null;
        if (!$node) continue;
        $acc['solid']  += (float)$readStat($node, ['storageSolidCap','storage_solid_cap','solidCap']);
        $acc['liquid'] += (float)$readStat($node, ['storageLiquidCap','storage_liquid_cap','liquidCap']);
      }
    }
    // Research (BRUG user_research, completed=1)
    if (!empty($defs['rsd']) && yield__db_has_columns($db, 'research', ['rsd_id','user_id'])) {
      $st = $db->prepare("SELECT rsd_id FROM research WHERE user_id=?");
      $st->execute([$userId]);
      while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $rid = preg_replace('/^rsd\./','', (string)$row['rsd_id']);
        $node = $defs['rsd'][$rid] ?? null;
        if (!$node) continue;
        $acc['solid']  += (float)$readStat($node, ['storageSolidCap','storage_solid_cap','solidCap']);
        $acc['liquid'] += (float)$readStat($node, ['storageLiquidCap','storage_liquid_cap','liquidCap']);
      }
    }
    // Animals (sjældent bærer storage, men understøttes)
    if (!empty($defs['ani']) && yield__db_has_columns($db, 'animals', ['ani_id','quantity','user_id'])) {
      $st = $db->prepare("SELECT ani_id, quantity FROM animals WHERE user_id=?");
      $st->execute([$userId]);
      while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $aid = preg_replace('/^ani\./','', (string)$row['ani_id']);
        $qty = (float)($row['quantity'] ?? 0);
        if ($qty <= 0) continue;
        $node = $defs['ani'][$aid] ?? null;
        if (!$node) continue;
        $acc['solid']  += $qty * (float)$readStat($node, ['storageSolidCap','storage_solid_cap','solidCap']);
        $acc['liquid'] += $qty * (float)$readStat($node, ['storageLiquidCap','storage_liquid_cap','liquidCap']);
      }
    }
    // Inventory (res.* kan give kapacitet)
    if (!empty($defs['res']) && yield__db_has_columns($db, 'inventory', ['res_id','amount','user_id'])) {
      $st = $db->prepare("SELECT res_id, amount FROM inventory WHERE user_id=?");
      $st->execute([$userId]);
      while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $rid = preg_replace('/^res\./','', (string)$row['res_id']);
        $amt = (float)($row['amount'] ?? 0);
        if ($amt <= 0) continue;
        $node = $defs['res'][$rid] ?? null; if (!$node) continue;
        $capSolidPer  = (float)$readStat($node, ['storageSolidCap','storage_solid_cap','solidCap']);
        $capLiquidPer = (float)$readStat($node, ['storageLiquidCap','storage_liquid_cap','liquidCap']);
        if ($capSolidPer  !== 0.0) $acc['solid']  += $amt * $capSolidPer;
        if ($capLiquidPer !== 0.0) $acc['liquid'] += $amt * $capLiquidPer;
      }
    }
    // NYT: læg base-cap fra config.ini oveni (samme som UI/summary gør)
    $cfg = yield__load_config_ini();
    $solidBase  = (float)($cfg['start_limitations_cap']['storageSolidCap']  ?? $cfg['start_limitations_cap']['storageSolidBaseCap']  ?? 0);
    $liquidBase = (float)($cfg['start_limitations_cap']['storageLiquidCap'] ?? $cfg['start_limitations_cap']['storageLiquidBaseCap'] ?? 0);
    $acc['solid']  += max(0.0, $solidBase);
    $acc['liquid'] += max(0.0, $liquidBase);

    // Clamp og retur
    $acc['solid']  = max(0.0, (float)$acc['solid']);
    $acc['liquid'] = max(0.0, (float)$acc['liquid']);
    return $acc;
  }
}

/* ========================= Kapacitetsklip ========================= */

if (!function_exists('yield__apply_caps_to_assoc')) {
  function yield__apply_caps_to_assoc(array $assoc, array &$usage, array $caps, array $defs): array {
    $credited  = [];
    $lost      = [];
    $perBucket = ['solid'=>[], 'liquid'=>[]];

    foreach ($assoc as $rid => $amt) {
      $bucket = yield__bucket_of_res($rid, $defs);
      $perBucket[$bucket][$rid] = ($perBucket[$bucket][$rid] ?? 0.0) + (float)$amt;
    }

    foreach (['solid','liquid'] as $b) {
      if (empty($perBucket[$b])) continue;
      $capTotal  = max(0.0, (float)($caps[$b]  ?? 0));
      $usedSpace = max(0.0, (float)($usage[$b] ?? 0));
      $freeSpace = max(0.0, $capTotal - $usedSpace);

      foreach ($perBucket[$b] as $rid => $amt) {
        $amt = (float)$amt; if ($amt <= 0) continue;

        $spacePerUnit = yield__unit_space_of_res($defs, $rid);
        if ($spacePerUnit <= 0.0) {
          $credited[$rid] = ($credited[$rid] ?? 0.0) + $amt;
          continue;
        }

        $needSpace = $amt * $spacePerUnit;
        if ($freeSpace <= 0.0) {
          $lost[$rid] = ($lost[$rid] ?? 0.0) + $amt;
          continue;
        }

        $takeSpace = min($needSpace, $freeSpace);
        $takeAmt   = max(0.0, min($amt, $takeSpace / $spacePerUnit));

        if ($takeAmt > 0) {
          $credited[$rid] = ($credited[$rid] ?? 0.0) + $takeAmt;
          $usedSpace     += $takeAmt * $spacePerUnit;
          $freeSpace     -= $takeAmt * $spacePerUnit;
          $usage[$b]      = $usedSpace;
        }

        $remAmt = $amt - $takeAmt;
        if ($remAmt > 0) {
          $lost[$rid] = ($lost[$rid] ?? 0.0) + $remAmt;
        }
      }
    }

    return [$credited, $lost];
  }
}

/* ========================= Debug logging til user_event_log ========================= */

if (!function_exists('yield__log_debug_caps')) {
  function yield__log_debug_caps(PDO $db, int $userId, array $caps, array $usage, string $tag=''): void {
    try {
      $payload = json_encode([
        'tag'   => $tag,
        'caps'  => $caps,
        'usage' => $usage,
      ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      $sql = "INSERT INTO user_event_log (user_id, event_type, subject_scope, subject_key, payload_json, event_time)
              VALUES (?, 'yield_debug', 'sys', ?, ?, UTC_TIMESTAMP())";
      $db->prepare($sql)->execute([$userId, $tag, $payload]);
    } catch (Throwable $e) { /* ignore */ }
  }
}

/* ========================= Stage-bonus regler (fra XML) ========================= */

if (!function_exists('yield__parse_stage_bonus_rules_from_xml')) {
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
    $dir   = yield__xml_dir();
    $rules = [];
    $rii   = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
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

/** Base bonus per fuld time (ikke pr. sekund) */
if (!function_exists('yield__compute_base_stage_bonus_per_hour')) {
  function yield__compute_base_stage_bonus_per_hour(PDO $db, int $userId): array {
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
    $rules    = $rulesAll[$stageId] ?? null;
    if (!$rules) return [];

    $bonuses = [
      'forest' => (float)($u['mul_forest'] ?? 0),
      'mining' => (float)($u['mul_mining'] ?? 0),
      'field'  => (float)($u['mul_field']  ?? 0),
      'water'  => (float)($u['mul_water']  ?? 0),
    ];

    $perHour = [];
    foreach ($bonuses as $key => $perHourAmt) {
      if ($perHourAmt <= 0) continue;
      foreach (($rules[$key] ?? []) as $resId) {
        $perHour[$resId] = ($perHour[$resId] ?? 0.0) + (float)$perHourAmt;
      }
    }
    return $perHour;
  }
}

/** Avancer base-timestamp præcist med n sekunder (bevarer rest) */
if (!function_exists('yield__advance_base_tick_ts')) {
  function yield__advance_base_tick_ts(PDO $db, int $userId, int $seconds): void {
    if ($seconds <= 0) return;
    $sql = "UPDATE users
               SET last_base_bonus_ts_utc = CASE
                 WHEN last_base_bonus_ts_utc IS NULL THEN UTC_TIMESTAMP()
                 ELSE DATE_ADD(last_base_bonus_ts_utc, INTERVAL :sec SECOND)
               END
             WHERE user_id = :uid";
    $st = $db->prepare($sql);
    $st->execute([':sec' => $seconds, ':uid' => $userId]);
  }
}

/* ========================= Defs / buffs helpers ========================= */

if (!function_exists('yield__read_period_seconds')) {
  function yield__read_period_seconds(array $def): int {
    $stats = $def['stats'] ?? [];
    foreach (['yield_period_s','yieldPeriodS','production_period_s','period_s'] as $k) {
      if (isset($def[$k])   && (int)$def[$k]   > 0) return (int)$def[$k];
      if (isset($stats[$k]) && (int)$stats[$k] > 0) return (int)$stats[$k];
    }
    return 3600;
  }
}
if (!function_exists('yield__extract_yields_rows')) {
  function yield__extract_yields_rows(array $def): array {
    $out = [];
    $raw = $def['yield'] ?? null;
    if (!$raw || !is_array($raw)) return $out;
    foreach ($raw as $row) {
      $rid = $row['id'] ?? $row['res'] ?? null;
      if (!$rid) continue;
      $amt = $row['amount'] ?? $row['qty'] ?? null;
      if ($amt === null) continue;
      $rid = (string)$rid;
      if (!str_starts_with($rid, 'res.')) $rid = 'res.' . $rid;
      $out[] = ['res_id' => $rid, 'amount' => (float)$amt];
    }
    return $out;
  }
}
if (!function_exists('yield__compute_ctx_id')) {
  function yield__compute_ctx_id(string $bucket, string $defKey): string {
    $pref  = ($bucket === 'bld' ? 'bld.' : ($bucket === 'add' ? 'add.' : ($bucket === 'rsd' ? 'rsd.' : ($bucket==='ani'?'ani.':''))));
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

/* Buff bridges */
if (!function_exists('yield__apply_yield_buffs_assoc')) {
  function yield__apply_yield_buffs_assoc(array $assoc, string $ctxId, array $buffs): array {
    if (!function_exists('apply_yield_buffs_assoc')) require_once __DIR__ . '/../actions/buffs.php';
    return apply_yield_buffs_assoc($assoc, $ctxId, $buffs);
  }
}
if (!function_exists('yield__collect_active_buffs')) {
  function yield__collect_active_buffs(array $defs, array $state, ?int $now = null): array {
    if ($now === null) $now = time();

    // 1) Collect existing buffs from defs (as before)
    if (!function_exists('collect_active_buffs')) require_once __DIR__ . '/../actions/buffs.php';
    $out = collect_active_buffs($defs, $state, $now);

    // 2) Ensure statsbuffs implementation is available (may live in actions/statsbuffs.php)
    $statsFile = __DIR__ . '/../actions/statsbuffs.php';
    if (!function_exists('compute_stats_buffs') && is_file($statsFile)) {
      require_once $statsFile;
    }

    // 3) If compute_stats_buffs exists, build a best-effort summary and call it
    $statBuffs = [];
    if (function_exists('compute_stats_buffs')) {
      $summary = [];

      // Try to pick up explicit fields from state.user
      if (!empty($state['user']) && is_array($state['user'])) {
        $u = $state['user'];
        if (isset($u['happiness_percentage'])) $summary['happiness_percentage'] = (float)$u['happiness_percentage'];
        if (isset($u['happiness_total']))      $summary['happiness_total'] = (float)$u['happiness_total'];
        if (isset($u['happiness_max']))        $summary['happiness_max'] = (float)$u['happiness_max'];
        if (isset($u['happiness']))            $summary['happiness'] = (float)$u['happiness'];
        if (isset($u['happiness_current']))    $summary['happiness_current'] = (float)$u['happiness_current'];
      }

      // Fallback: hvis statsbuffs også definerer get_happiness_percentage, brug den
      if (empty($summary) && function_exists('get_happiness_percentage')) {
        $hp = get_happiness_percentage($state['user'] ?? []);
        if ($hp !== null) $summary['happiness_percentage'] = (float)$hp;
      }

      // Hvis vi stadig intet har, og vi har happiness helpers, prøv at beregne vha. cfg weights
      if (empty($summary) && function_exists('happiness_calc_all')) {
        try {
          $cfg = yield__load_config_ini();
          if (!empty($cfg) && isset($cfg['happiness']) && is_array($cfg['happiness'])) {
            $usages = [];
            foreach ($cfg['happiness'] as $cfgKey => $_w) {
              $usageKey = preg_match('/HappinessWeight$/', (string)$cfgKey) ? preg_replace('/HappinessWeight$/','', (string)$cfgKey) : (string)$cfgKey;
              $used = 0.0; $capacity = 0.0;
              if (!empty($state['cap']) && is_array($state['cap'])) {
                $candidates = [$usageKey, strtolower($usageKey), preg_replace('/[-_ ]+/', '', strtolower($usageKey))];
                foreach ($candidates as $cand) {
                  if (isset($state['cap'][$cand]) && is_array($state['cap'][$cand])) {
                    $capRec = $state['cap'][$cand];
                    $used = (float)($capRec['used'] ?? 0.0);
                    $capacity = isset($capRec['total']) ? (float)$capRec['total'] : (float)(($capRec['base'] ?? 0.0) + ($capRec['bonus'] ?? 0.0));
                    break;
                  }
                }
              }
              $usages[$usageKey] = ['used' => $used, 'capacity' => $capacity];
            }
            $hRes = happiness_calc_all($usages, $cfg['happiness']);
            if (isset($hRes['happiness'])) {
              $summary['happiness_percentage'] = (float)$hRes['happiness'] * 100.0;
              $summary['happiness'] = $summary['happiness_percentage'];
            }
          }
        } catch (Throwable $e) {
          // ignore, best-effort only
        }
      }

      // Endelig: kald compute_stats_buffs med summary (kan være tom)
      try {
        $computed = compute_stats_buffs($summary ?: []);
        if (is_array($computed) && !empty($computed)) {
          // Antag at compute_stats_buffs returnerer buffs i kompatibelt schema
          foreach ($computed as $b) {
            if (is_array($b)) $statBuffs[] = $b;
          }
        }
      } catch (Throwable $e) {
        // ignore - stat-buffs er ikke kritiske
      }
    }

    // 4) Merge stat-buffs ind i output så server-udbetaling også bruger dem
    if (!empty($statBuffs)) {
      $out = array_merge($out, $statBuffs);
    }

    return $out;
  }
}

/* ========================= Durability multiplier (buildings) ========================= */
if (!function_exists('yield__apply_durability_multiplier')) {
  function yield__apply_durability_multiplier(array $assoc, string $ctxId, array $state = []): array {
    if (empty($assoc)) return $assoc;
    $id = (string)$ctxId;
    if ($id === '' || !str_starts_with($id, 'bld.')) return $assoc;
    $row = $state['bld'][$id] ?? null;
    if (!$row) {
      $series = preg_replace('~\\.l\\d+$~', '', $id);
      if ($series && isset($state['bld'][$series])) $row = $state['bld'][$series];
    }
    if (!$row) return $assoc;
    $pct = (int)($row['durability_pct'] ?? 100);
    if ($pct >= 25) return $assoc;
    $out = [];
    foreach ($assoc as $rid => $amt) $out[$rid] = (float)$amt * 0.5;
    return $out;
  }
}

/* ========================= Event log bridges ========================= */

if (!function_exists('normalize_rows')) {
  function normalize_rows(array $rows, string $reason = ''): array {
    $out = [];
    foreach ($rows as $rid => $amt) {
      $a = (float)$amt;
      if ($a <= 0) continue;
      $r = ['res_id' => (string)$rid, 'amount' => $a];
      if ($reason !== '') $r['reason'] = $reason;
      $out[] = $r;
    }
    return $out;
  }
}
if (!function_exists('yield__log_paid')) {
  function yield__log_paid(PDO $db, int $userId, string $itemId, array $creditedRows): void {
    require_once __DIR__ . '/event_log.php';
    log_yield_paid($db, $userId, $itemId, normalize_rows($creditedRows));
  }
}
if (!function_exists('yield__log_lost')) {
  function yield__log_lost(PDO $db, int $userId, string $itemId, array $lostRows, string $reason = ''): void {
    require_once __DIR__ . '/event_log.php';
    log_yield_lost($db, $userId, $itemId, normalize_rows($lostRows, $reason), $reason);
  }
}

/* ========================= Inventory upsert ========================= */

if (!function_exists('yield__inventory_upsert_batch')) {
  function yield__inventory_upsert_batch(PDO $db, int $userId, array $deltaMap): void {
    if (empty($deltaMap)) return;
    $sql  = "INSERT INTO inventory (user_id, res_id, amount)
             VALUES (:uid, :rid, :amt)
             ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)";
    $stmt = $db->prepare($sql);
    foreach ($deltaMap as $rid => $amt) {
      $a = (float)$amt; if ($a == 0.0) continue;
      $stmt->execute([':uid' => (int)$userId, ':rid' => (string)$rid, ':amt' => $a]);
    }
  }
}

/* ========================= Progress timestamps ========================= */

if (!function_exists('yield__get_last_base_tick_ts')) {
  function yield__get_last_base_tick_ts(PDO $db, int $userId): ?string {
    $st = $db->prepare("SELECT last_base_bonus_ts_utc FROM users WHERE user_id = ?");
    $st->execute([$userId]);
    $ts = $st->fetchColumn();
    return $ts ? (string)$ts : null;
  }
}
if (!function_exists('yield__set_last_base_tick_ts_now')) {
  function yield__set_last_base_tick_ts_now(PDO $db, int $userId): void {
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

/* ========================= Entitets-yields (diskrete) ========================= */

if (!function_exists('yield__table_meta')) {
  function yield__table_meta(): array {
    return [
      'bld' => ['table' => 'buildings', 'id_col' => 'bld_id', 'extra_cols' => ['level', 'durability']],
      'add' => ['table' => 'addon',     'id_col' => 'add_id', 'extra_cols' => ['level']],
      'rsd' => ['table' => 'research',  'id_col' => 'rsd_id', 'extra_cols' => ['level']], // kun hvis du senere vil have research-yields
      'ani' => ['table' => 'animals',   'id_col' => 'ani_id', 'extra_cols' => ['quantity']],
    ];
  }
}
if (!function_exists('yield__load_owned_rows_with_progress')) {
  function yield__load_owned_rows_with_progress(PDO $db, int $userId, string $bucket): array {
    $meta        = yield__table_meta()[$bucket] ?? null;
    if (!$meta) return [];
    $tbl         = $meta['table'];
    $idCol       = $meta['id_col'];
    $extra       = $meta['extra_cols'];
    $hasProgress = yield__db_has_columns($db, $tbl, ['last_yield_ts_utc','yield_cycles_total']);
    $cols        = array_merge([$idCol], $extra, $hasProgress ? ['last_yield_ts_utc','yield_cycles_total'] : []);
    $sql         = "SELECT " . implode(',', $cols) . " FROM `$tbl` WHERE user_id = ?";
    $st          = $db->prepare($sql);
    $st->execute([$userId]);

    $rows = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $rows[] = $r + ['__has_progress' => $hasProgress];
    }
    return $rows;
  }
}
if (!function_exists('yield__update_entity_progress')) {
  function yield__update_entity_progress(PDO $db, string $bucket, int $userId, string $ctxId, int $advanceSeconds, int $addCycles): void {
    $meta = yield__table_meta()[$bucket] ?? null; if (!$meta) return;
    $tbl  = $meta['table']; $idCol = $meta['id_col'];
    if (!yield__db_has_columns($db, $tbl, ['last_yield_ts_utc','yield_cycles_total'])) return;

    $sql = "UPDATE `$tbl`
               SET last_yield_ts_utc = CASE
                                         WHEN last_yield_ts_utc IS NULL THEN UTC_TIMESTAMP()
                                         ELSE DATE_ADD(last_yield_ts_utc, INTERVAL :adv SECOND)
                                       END,
                   yield_cycles_total = yield_cycles_total + :cyc
             WHERE user_id = :uid AND $idCol = :id";
    $st = $db->prepare($sql);
    $st->execute([
      ':adv' => max(0, $advanceSeconds),
      ':cyc' => max(0, $addCycles),
      ':uid' => $userId,
      ':id'  => $ctxId,
    ]);
  }
}
if (!function_exists('yield__compute_and_apply_entity_yields')) {
  function yield__compute_and_apply_entity_yields(PDO $db, int $userId, array $defs, array $state, array &$usage, array $caps): array {
    $buffs         = yield__collect_active_buffs($defs, $state);
    $totalCredited = [];
    $metaMap       = yield__table_meta();

    foreach (['bld','add','rsd','ani'] as $bucket) {
      $ownedRows = yield__load_owned_rows_with_progress($db, $userId, $bucket);
      if (!$ownedRows) continue;

      foreach ($ownedRows as $row) {
        $idCol = $metaMap[$bucket]['id_col'];
        $ctxId = (string)($row[$idCol] ?? '');
        if ($ctxId === '') continue;
        if (!yield__is_owned($bucket, $ctxId, $state)) continue;

        $defKey  = preg_replace('~^(?:bld\.|add\.|rsd\.|ani\.)~', '', $ctxId);
        $def     = $defs[$bucket][$defKey] ?? null;
        if (!$def) continue;

        $periodS = yield__read_period_seconds($def);
        if ($periodS <= 0) continue;

        $hasProgress = !empty($row['__has_progress']);
        $lastTs      = $hasProgress ? (string)($row['last_yield_ts_utc'] ?? '') : '';
        if ($hasProgress && $lastTs === '') {
          yield__update_entity_progress($db, $bucket, $userId, $ctxId, 0, 0);
          continue;
        }
        if (!$hasProgress) continue;

        $st = $db->prepare("SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, ?, UTC_TIMESTAMP()))");
        $st->execute([$lastTs]);
        $elapsedS = (int)$st->fetchColumn();
        $cycles   = intdiv($elapsedS, $periodS);
        if ($cycles <= 0) continue;

        $rows  = yield__extract_yields_rows($def);
        $assoc = [];
        foreach ($rows as $r) {
          $delta = $cycles * (float)$r['amount'];
          if ($bucket === 'ani') {
            $qty = (float)($row['quantity'] ?? 0);
            if ($qty > 0) $delta *= $qty;
          }
          if ($delta == 0.0) continue;
          $assoc[$r['res_id']] = ($assoc[$r['res_id']] ?? 0.0) + $delta;
        }

        if ($assoc) {
          $assoc = yield__apply_yield_buffs_assoc($assoc, $ctxId, $buffs);
          $assoc = yield__apply_durability_multiplier($assoc, $ctxId, $state);

          [$credited, $lost] = yield__apply_caps_to_assoc($assoc, $usage, $caps, $defs);
          if (!empty($credited)) {
            yield__assoc_add($totalCredited, $credited);
            yield__log_paid($db, $userId, $ctxId, $credited);
          }
          if (!empty($lost)) {
            yield__log_lost($db, $userId, $ctxId, $lost, 'Yield tabt pga. ingen plads (kapacitetsgrænse)');
          }
        }

        yield__update_entity_progress($db, $bucket, $userId, $ctxId, $cycles * $periodS, $cycles);
      }
    }

    return $totalCredited;
  }
}

/* ========================= Offentlig API ========================= */

if (!function_exists('apply_passive_yields_for_user')) {
  function apply_passive_yields_for_user(int $userId, ?array $defs = null, ?array $state = null): void {
    $db = yield__db();

    $defsSafe  = yield__ensure_defs($defs);
    $stateSafe = $state ?? yield__build_min_state($db, $userId);

    // Første run: init timestamps uden udbetaling
    $lastBase = yield__get_last_base_tick_ts($db, $userId);
    if (!$lastBase) {
      yield__set_last_base_tick_ts_now($db, $userId);
      foreach (['buildings','addon','research','animals'] as $tbl) {
        if (!yield__db_has_columns($db, $tbl, ['last_yield_ts_utc','yield_cycles_total'])) continue;
        $st = $db->prepare("UPDATE `$tbl` SET last_yield_ts_utc = COALESCE(last_yield_ts_utc, UTC_TIMESTAMP()) WHERE user_id = ?");
        $st->execute([$userId]);
      }
      return;
    }

    // Caps og usage
    $caps  = yield__read_user_caps($db, $userId, $defsSafe, $stateSafe);
    $usage = yield__compute_bucket_usage($db, $userId, $defsSafe);

    // DEBUG: skriv caps/usage til log (kan fjernes når verificeret)
    yield__log_debug_caps($db, $userId, $caps, $usage, 'pre');

    // Base bonus (hele timer)
    $elapsedBase  = yield__seconds_diff($db, $lastBase);
    $creditedBase = [];
    if ($elapsedBase >= 3600) {
      $cycles  = intdiv($elapsedBase, 3600);
      $perHour = yield__compute_base_stage_bonus_per_hour($db, $userId);
      if (!empty($perHour)) {
        $want = [];
        foreach ($perHour as $rid => $amt) $want[$rid] = (float)$amt * $cycles;
        [$credited, $lost] = yield__apply_caps_to_assoc($want, $usage, $caps, $defsSafe);
        if (!empty($credited)) {
          $creditedBase = $credited;
          yield__log_paid($db, $userId, 'base_bonus', $credited);
        }
        if (!empty($lost)) {
          yield__log_lost($db, $userId, 'base_bonus', $lost, 'Yield tabt pga. ingen plads (kapacitetsgrænse)');
        }
      }
      yield__advance_base_tick_ts($db, $userId, $cycles * 3600);
    }

    // Entiteter
    $creditedFlow = yield__compute_and_apply_entity_yields($db, $userId, $defsSafe, $stateSafe, $usage, $caps);

    // DEBUG: skriv caps/usage efter flows (skal være steget i usage, reduceret freeSpace)
    yield__log_debug_caps($db, $userId, $caps, $usage, 'post');

    // Persistér krediterede mængder
    $delta = $creditedBase;
    foreach ($creditedFlow as $rid => $amt) $delta[$rid] = ($delta[$rid] ?? 0.0) + (float)$amt;
    if (empty($delta)) return;

    $db->beginTransaction();
    try {
      yield__inventory_upsert_batch($db, $userId, $delta);
      $db->commit();
    } catch (Throwable $e) {
      $db->rollBack();
      throw $e;
    }
  }
}