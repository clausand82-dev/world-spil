<?php
declare(strict_types=1);
if (!defined('WS_RUN_MODE')) define('WS_RUN_MODE', 'run');
require_once __DIR__ . '/lib/lang_utils.php';

// Sørg for at yield-helperne er indlæst tidligt (vi bruger wrapper nedenfor)
require_once __DIR__ . '/lib/yield.php';

include_once __DIR__ . '/load_citizens.php';

// Justér stien herfra til repo-roden hvis nødvendigt:
$xmlPath = realpath(__DIR__ . '/data/xml/citizens.xml');
// Fallback: prøv en alternativ relativ sti hvis ovenstående ikke findes
if ($xmlPath === false) {
    $maybe = __DIR__ . '/..//data/xml/citizens.xml';
    if (is_file($maybe)) {
        $xmlPath = realpath($maybe);
    }
}

if ($xmlPath === false) {
    throw new RuntimeException('Could not locate backend/data/xml/citizens.xml relative to ' . __DIR__);
}



if (WS_RUN_MODE === 'run') {
    header('Content-Type: application/json; charset=utf-8');
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
}


/* ======================= small utils ======================= */
function jout($ok, $payload) {
  echo json_encode($ok ? ['ok'=>true,'data'=>$payload] : ['ok'=>false,'error'=>$payload], JSON_UNESCAPED_UNICODE);
  exit;
}
function jerr(string $code, string $msg, int $http=500): never {
  http_response_code($http);
  jout(false, ['code'=>$code,'message'=>$msg]);
}
function root_backend(): string {
  return realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
}

/* ======================= duration parsing ======================= */
function parse_duration_to_seconds(?string $str): ?int {
    if ($str === null || trim($str) === '') return null;
    $s = preg_replace('/\s+/', '', strtolower(trim($str)));
    $re = '/(\d+(?:\.\d+)?)([dhms])/i';
    $total = 0.0; $matched = false;
    if (preg_match_all($re, $s, $m, PREG_SET_ORDER)) {
        foreach ($m as $tok) {
            $matched = true; $val = (float)$tok[1]; $unit = $tok[2];
            switch ($unit) {
                case 'd': $total += $val * 86400; break;
                case 'h': $total += $val * 3600; break;
                case 'm': $total += $val * 60; break;
                case 's': $total += $val; break;
            }
        }
    }
    return $matched ? (int)round($total) : null;
}
if (!defined('DEFAULT_DURATION_SECONDS')) define('DEFAULT_DURATION_SECONDS', 60);
function coerce_any_duration_to_seconds($node, array &$item): ?int {
    foreach(['duration_s','time_seconds'] as $k) if(isset($item[$k])||isset($node->$k)) return (int)round((float)($item[$k]??$node->$k));
    foreach(['duration_ms'] as $k) if(isset($item[$k])||isset($node->$k)) return (int)round((float)($item[$k]??$node->$k)/1000.0);
    foreach(['duration','build_time'] as $k){
      $v=$item[$k]??(isset($node->$k)?trim((string)$node->$k):null);
      if($v){
        if(preg_match('/^\d+(\.\d+)?\s*ms$/i',$v)) return (int)round((float)$v/1000.0);
        return (int)round((float)$v);
      }
    }
    return null;
}

/* ======================= config / dirs / lang ======================= */
function load_config_ini(): array {
  $path = root_backend() . '/data/config/config.ini';
  if (!is_file($path)) jerr('E_CONFIG', 'Missing config.ini at backend/data/config/config.ini', 500);
  $cfg = parse_ini_file($path, true, INI_SCANNER_TYPED);
  if (!is_array($cfg)) jerr('E_CONFIG', 'config.ini parse error', 500);
  return $cfg;
}
function resolve_dir(string $cfgPath, string $fallbackRelativeToBackend): string {
  $backend = root_backend();
  $p = trim($cfgPath);
  if ($p === '') $p = $fallbackRelativeToBackend;

  if (preg_match('~^(?:[A-Za-z]:)?[\\\\/]~', $p)) {
    $abs = $p;
  } else {
    if (stripos($p, 'backend/') === 0 || stripos($p, 'backend\\') === 0) {
      $p = substr($p, 8);
    }
    $abs = rtrim($backend, '/\\') . DIRECTORY_SEPARATOR . $p;
  }
  $real = realpath($abs);
  if ($real === false || !is_dir($real)) jerr('E_CONFIG', 'Directory not found: ' . $abs, 500);
  return $real;
}
function load_lang_xml(string $langDir, string $langCode): array {
  $langDir = rtrim($langDir, '/\\');
  $candidates = ["$langDir/$langCode.xml", "$langDir/lang.$langCode.xml"];
  foreach (glob("$langDir/*$langCode*.xml") ?: [] as $g) if (!in_array($g, $candidates, true)) $candidates[] = $g;
  $file = null;
  foreach ($candidates as $cand) if (is_file($cand)) { $file = $cand; break; }
  if (!$file) return [];
  $raw = file_get_contents($file);
  if ($raw === false) return [];
  $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
  $xml = @simplexml_load_string($raw);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//entry[@key] | //string[@key]') ?: [] as $node) {
    $key = (string)$node['key']; if ($key === '') continue;
    $val = trim((string)$node); if ($val === '') continue;
    $out[$key] = $val;
  }
  return $out;
}

/* === NY: vælg effektivt sprog (GET -> SESSION -> DB -> default fra config) === */
function select_lang_code_effective(array $cfg, array $allowed = ['da','en']): string {
  // 1) default fra config: kan være 'lang.da' eller 'da'
  $cfgLangRaw = (string)($cfg['game_data']['lang'] ?? 'lang.da');
  if (preg_match('~([a-z]{2})~i', $cfgLangRaw, $m)) {
    $default = strtolower($m[1]);
  } else {
    $default = 'da';
  }

  // 2) GET parameter
  $lang = null;
  if (!empty($_GET['lang'])) {
    $lang = strtolower(preg_replace('/[^a-z]/','', substr((string)$_GET['lang'], 0, 2)));
  }

  // 3) SESSION
  if (!$lang && !empty($_SESSION['lang'])) {
    $lang = strtolower(preg_replace('/[^a-z]/','', substr((string)$_SESSION['lang'], 0, 2)));
  }

  // 4) DB (valgfrit)
  // if (!$lang && function_exists('auth_get_user_id_if_any')) {
  //   $uid = auth_get_user_id_if_any();
  //   if ($uid) {
  //     $pdo = db();
  //     $st = $pdo->prepare('SELECT preferred_lang FROM users WHERE user_id = ? LIMIT 1');
  //     $st->execute([$uid]);
  //     if ($row = $st->fetchColumn()) {
  //       $lang = strtolower(preg_replace('/[^a-z]/','', substr((string)$row,0,2)));
  //     }
  //   }
  // }

  if (!$lang) $lang = $default;
  if (!in_array($lang, $allowed, true)) $lang = $default;
  return $lang;
}

/* ======================= DB ======================= */
function db(): PDO {
  $ini = root_backend() . '/data/config/db.ini';
  if (!is_file($ini)) jerr('E_CONFIG', 'Missing db.ini at backend/data/config/db.ini', 500);
  $cfg = parse_ini_file($ini, true, INI_SCANNER_TYPED);
  $db  = $cfg['database'] ?? $cfg;

  $host = $db['host'] ?? '127.0.0.1';
  $user = $db['user'] ?? 'root';
  $pass = $db['password'] ?? ($db['pass'] ?? '');
  $name = $db['name'] ?? ($db['dbname'] ?? ($db['database'] ?? ''));
  $charset = $db['charset'] ?? 'utf8mb4';
  if ($name === '') jerr('E_CONFIG', 'DB name missing in db.ini', 500);

  try {
    return new PDO("mysql:host={$host};dbname={$name};charset={$charset}", $user, $pass, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
  } catch (Throwable $e) {
    jerr('E_DB', 'DB connect failed: '.$e->getMessage(), 500);
  }
}

/* ======================= Misc helpers (alldata scope) ======================= */
function parse_stats_string(string $s): array {
  $out = [];
  foreach (preg_split('/[;,\n]/', $s) as $pair) {
    $pair = trim($pair);
    if ($pair === '') continue;
    [$k,$v] = array_pad(explode('=', $pair, 2), 2, '');
    $k = trim($k); $v = trim($v);
    if ($k === '') continue;
    $out[$k] = is_numeric($v) ? $v + 0 : $v;
  }
  return $out;
}
function strip_prefix(string $id, string $prefix): string {
  $p = $prefix . '.';
  return (strncmp($id, $p, strlen($p)) === 0) ? substr($id, strlen($p)) : $id;
}

/* ======================= BUFF HELPERS (parsing) ======================= */
function _xml_attr($node, $name, $default=null) { return isset($node[$name]) ? (string)$node[$name] : $default; }
function _buff_map_op($typeAttr) {
  $t = strtolower(trim((string)$typeAttr));
  if ($t === 'adds' || $t === 'add') return 'adds';
  if ($t === 'subt' || $t === 'sub') return 'subt';
  return 'mult';
}
function _buff_parse_res($resNode, string $sourceId, $appliesTo='all') {
  return [
    'kind'=>'res','scope'=>_xml_attr($resNode,'id','all'),'mode'=>_xml_attr($resNode,'mode','both'),
    'op'=>_buff_map_op(_xml_attr($resNode,'type','mult')),'amount'=>(float)_xml_attr($resNode,'amount',0),
    'applies_to'=>$appliesTo,'source_id'=>$sourceId,
  ];
}
function _buff_parse_speed($speedNode, string $sourceId, $appliesTo='all') {
  $target = strtolower(trim((string)_xml_attr($speedNode,'target','all')));
  $actions = ($target==='all')?'all':array_values(array_filter(array_map('trim', explode(',', $target))));
  return ['kind'=>'speed','actions'=>$actions,'op'=>_buff_map_op(_xml_attr($speedNode,'type','mult')),'amount'=>(float)_xml_attr($speedNode,'amount',0),'applies_to'=>$appliesTo,'source_id'=>$sourceId];
}
function _buff_collect_from($xmlNode, string $sourceId, $defaultAppliesTo='all'): array {
  $out = []; if (!$xmlNode) return $out;
  foreach ($xmlNode->xpath('buff|buffs') ?: [] as $container) {
    $appliesAttr = isset($container['applies_to']) ? (string)$container['applies_to'] : (isset($container['applies-to']) ? (string)$container['applies-to'] : null);
    if ($appliesAttr === null || $appliesAttr === '') $appliesTo = $defaultAppliesTo;
    else { $v=strtolower(trim($appliesAttr)); $appliesTo = ($v==='all')?'all':array_values(array_filter(array_map('trim', explode(',', $appliesAttr)))); }
    foreach ($container->xpath('res') ?: [] as $resNode)   $out[] = _buff_parse_res($resNode, $sourceId, $appliesTo);
    foreach ($container->xpath('speed') ?: [] as $speedNode)$out[] = _buff_parse_speed($speedNode, $sourceId, $appliesTo);
  }
  return $out;
}

/**
 * Wrapper så vi altid har en gyldig funktion – bruger yield.php’s helper.
 */
function _parse_stage_bonus_rules(SimpleXMLElement $xml): array {
  if (!function_exists('yield__parse_stage_bonus_rules_from_xml')) {
    require_once __DIR__ . '/lib/yield.php';
  }
  return yield__parse_stage_bonus_rules_from_xml($xml);
}

/* ======================= GENERIC XML PARSER HELPERS ======================= */
function _parse_generic_xml_node(SimpleXMLElement $node, string $idPrefix): array {
    $idRaw = (string)($node['id'] ?? ''); $id = strip_prefix($idRaw, $idPrefix);
    $item = ['id' => $id];
    foreach ($node->attributes() as $k => $v) { if ($k === 'id') continue; $val=(string)$v; $item[(string)$k] = is_numeric($val) ? $val + 0 : $val; }
    foreach ($node->children() as $child) {
        $key = $child->getName(); if (in_array($key, ['stats', 'cost', 'yield'])) continue;
        $val = trim((string)$child); if ($val !== '') $item[$key] = is_numeric($val) ? $val + 0 : $val;
    }
    if (isset($node->stats)) $item['stats'] = parse_stats_string((string)$node->stats);
    $costs = [];
    foreach ($node->xpath('cost/*') ?: [] as $c) {
        $row = ['type' => $c->getName()];
        foreach ($c->attributes() as $k => $v) $row[(string)$k] = is_numeric((string)$v) ? (string)$v + 0 : (string)$v;
        $costs[] = $row;
    }
    if ($costs) $item['cost'] = $costs;
    $yNode = $node->xpath('yield')[0] ?? null;
    if ($yNode) {
        $yields = [];
        if (isset($yNode['period_s'])) $item['yield_period_s'] = (int)$yNode['period_s'];
        elseif (isset($yNode['period'])) $item['yield_period_s'] = parse_duration_to_seconds((string)$yNode['period']);
        foreach ($yNode->children() as $p) {
            $row = ['type' => $p->getName()];
            foreach ($p->attributes() as $k => $v) $row[(string)$k] = is_numeric((string)$v) ? (string)$v + 0 : (string)$v;
            $yields[] = $row;
        }
        if ($yields) $item['yield'] = $yields;
    }
    $fullId = $idPrefix . '.' . $id;
    $appliesTo = [$fullId];
    $buffs = _buff_collect_from($node, $fullId, $appliesTo);
    if ($buffs) $item['buffs'] = $buffs;
    if (isset($node->durability)) $item['durability'] = (float)$node->durability;
    if (isset($node->upgradesTo)) $item['upgradesTo'] = trim((string)$node->upgradesTo);
    if (isset($node->require)) $item['require'] = trim((string)$node->require);
    $timeStr = $item['time'] ?? (isset($node->time) ? trim((string)$node->time) : null);
    $secs = $timeStr ? parse_duration_to_seconds($timeStr) : null;
    if ($secs === null) $secs = coerce_any_duration_to_seconds($node, $item) ?? DEFAULT_DURATION_SECONDS;
    $item['duration_s'] = (int)$secs;
    if ($timeStr) $item['time_str'] = $timeStr;
    unset($item['time']);
    return [$id, $item];
}
function _load_defs_from_file(string $file, string $tag, string $prefix): array {
    if (!is_file($file)) return [];
    $xml = @simplexml_load_file($file);
    if (!$xml) return [];
    $out = [];
    foreach ($xml->xpath("//{$tag}") ?: [] as $node) {
        if (empty((string)($node['id'] ?? ''))) continue;
        [$id, $item] = _parse_generic_xml_node($node, $prefix);
        if ($id) $out[$id] = $item;
    }
    return $out;
}
function load_resources_xml(string $file): array { return _load_defs_from_file($file, 'resource', 'res'); }
function load_buildings_xml(string $file): array { return _load_defs_from_file($file, 'building', 'bld'); }
function load_research_xml(string $file): array { return _load_defs_from_file($file, 'research', 'rsd'); }
function load_recipes_xml(string $file): array { return _load_defs_from_file($file, 'recipe', 'rcp'); }
function load_addons_xml(string $file): array { return _load_defs_from_file($file, 'addon', 'add'); }
function load_animals_xml(string $file): array { return _load_defs_from_file($file, 'animal', 'ani'); }

/* ======================= users helpers ======================= */
function _db_table_has_columns_alldata(PDO $db, string $table, array $cols): bool {
  foreach ($cols as $c) {
    $st = $db->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $st->execute([$c]);
    if (!$st->fetch()) return false;
  }
  return true;
}
function _detect_users_pk_alldata(PDO $db): string {
  return _db_table_has_columns_alldata($db, 'users', ['user_id']) ? 'user_id' : 'id';
}

/* ======================= main ======================= */
if (WS_RUN_MODE === 'run') {
    try {
        $strict = isset($_GET['strict']);
        $modeFlat = isset($_GET['flat']);
        $debug = isset($_GET['debug']);

        /* 1) config + dirs */
        $cfg = load_config_ini();
        $xmlDir  = resolve_dir((string)($cfg['dirs']['xml_dir']  ?? ''), 'data/xml');
        $langDir = resolve_dir((string)($cfg['dirs']['lang_dir'] ?? ''), 'data/lang');

        /* 1b) Vælg aktivt sprog (GET/SESSION/DB/CFG) og brug altid 2-bogstavskode herfra */
        $langCode = select_lang_code_effective($cfg, ['da','en']);

        /* 2) defs fra XML (rekursiv scan) */
        $defs = ['res' => [], 'bld' => [], 'rsd' => [], 'rcp' => [], 'add' => [], 'ani' => []];
        $debugXml = [];

        $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS));
        foreach ($rii as $fileInfo) {
            if (!$fileInfo->isFile() || strtolower($fileInfo->getExtension()) !== 'xml') continue;
            $path = $fileInfo->getPathname();
            $xml = @simplexml_load_file($path);
            if (!$xml) { $debug && $debugXml[] = ['file' => $path, 'error' => 'parse-failed']; continue; }
            $found = ['file' => $path];

            if ($xml->xpath('//animal')) {
                $pack = load_animals_xml($path);
                if ($pack) { $defs['ani'] = array_merge($defs['ani'], $pack); $found['animals'] = count($pack); }
            } elseif ($xml->xpath('//addon')) {
                $pack = load_addons_xml($path);
                if ($pack) { $defs['add'] = array_merge($defs['add'], $pack); $found['addons'] = count($pack); }
            }
            if ($xml->xpath('//resource')) {
                $pack = load_resources_xml($path);
                if ($pack) { $defs['res'] = array_merge($defs['res'], $pack); $found['resources'] = count($pack); }
            }
            if ($xml->xpath('//building')) {
                $pack = load_buildings_xml($path);
                if ($pack) { $defs['bld'] = array_merge($defs['bld'], $pack); $found['buildings'] = count($pack); }
            }
            if ($xml->xpath('//research')) {
                $pack = load_research_xml($path);
                if ($pack) { $defs['rsd'] = array_merge($defs['rsd'], $pack); $found['research'] = count($pack); }
            }
            if ($xml->xpath('//recipe')) {
                $pack = load_recipes_xml($path);
                if ($pack) { $defs['rcp'] = array_merge($defs['rcp'], $pack); $found['recipes'] = count($pack); }
            }
            if ($xml->xpath('//stage')) {
              $rules = _parse_stage_bonus_rules($xml);
              if (!empty($rules)) $defs['stage_bonus_rules'] = array_replace_recursive($defs['stage_bonus_rules'] ?? [], $rules);
            }
            if ($debug && count($found) > 1) $debugXml[] = $found;
        }

        /* 3) lang */
        $langMap = load_lang_xml($langDir, $langCode);

        /* 4) state fra DB */
        $state = [];
        if (isset($_SESSION['uid'])) {
            $uid = (int)$_SESSION['uid'];
            $pdo = db();

            // 4a) Hent bruger
            $pk = _detect_users_pk_alldata($pdo);
            $sql = "SELECT $pk AS userId,
                           username, email, created_at,
                           world_id, map_id, field_id, x_coord AS x, y_coord AS y,
                           is_active, currentstage,
                           mul_forest AS bonus_forest,
                           mul_mining AS bonus_mining,
                           mul_field  AS bonus_field,
                           mul_water  AS bonus_water,
                           last_base_bonus_ts_utc
                      FROM users
                     WHERE $pk = ?";
            $st = $pdo->prepare($sql);
            $st->execute([$uid]);
            if ($row = $st->fetch()) {
              $row['bonus_forest'] = (int)($row['bonus_forest'] ?? 0);
              $row['bonus_mining'] = (int)($row['bonus_mining'] ?? 0);
              $row['bonus_field']  = (int)($row['bonus_field']  ?? 0);
              $row['bonus_water']  = (int)($row['bonus_water']  ?? 0);
              $state['user'] = $row;
            }

// 4b) Ejerstatus (bld/add/rsd/ani)
            if (!function_exists('dur__effective_abs')) require_once __DIR__ . '/lib/durability.php';

                // Byg fleksibelt SELECT afhængig af kolonner
                $cols = ['bld_id','level','durability'];
                if (_db_table_has_columns_alldata($pdo, 'buildings', ['created_at'])) $cols[] = 'created_at';
                if (_db_table_has_columns_alldata($pdo, 'buildings', ['last_repair_ts_utc'])) $cols[] = 'last_repair_ts_utc';
                $sqlB = "SELECT " . implode(',', $cols) . " FROM buildings WHERE user_id = ?";
                $stmt = $pdo->prepare($sqlB);
                $stmt->execute([$uid]);
                $owned_bld = [];
                foreach ($stmt as $r) {
               // Beregn effektiv durability og pct baseret på defs + cfg
               $fullId = (string)($r['bld_id'] ?? '');
               $key    = preg_replace('/^bld\\./','', $fullId);
               $defMax = (float)($defs['bld'][$key]['durability'] ?? 0.0);
               $rowDur = (float)($r['durability'] ?? 0.0);
               $createdAt = $r['created_at'] ?? null;
               $lastRep   = $r['last_repair_ts_utc'] ?? null;
               $effAbs = dur__effective_abs($defMax, $rowDur, $createdAt, $lastRep, time(), $cfg);
               $pct    = dur__pct($defMax, $effAbs);
 
               $r['durability_eff_abs'] = $effAbs;
               $r['durability_pct']     = $pct;
               $owned_bld[$fullId] = $r;
             }

        $owned_add=[]; $stmt=$pdo->prepare("SELECT add_id,level FROM addon WHERE user_id=?"); $stmt->execute([$uid]); foreach($stmt as $r)$owned_add[$r['add_id']]=$r;
         $owned_rsd=[]; $stmt=$pdo->prepare("SELECT rsd_id,level FROM research WHERE user_id=?"); $stmt->execute([$uid]); foreach($stmt as $r)$owned_rsd[$r['rsd_id']]=$r;
         $owned_ani=[]; $stmt=$pdo->prepare("SELECT ani_id, quantity FROM animals WHERE user_id=?"); $stmt->execute([$uid]); foreach($stmt as $r){ $owned_ani[$r['ani_id']] = ['quantity'=>(int)($r['quantity'] ?? 0)]; 
          }

            // Lige før I returnerer payload, efter stateMin er kendt og apply_passive_yields_for_user er kaldt:
// collect active buffs from defs (existing) + stat-based buffs (new)
if (!function_exists('collect_active_buffs')) require_once __DIR__ . '/actions/buffs.php';

// existing buffs from defs
$activeBuffs = collect_active_buffs($defs, ['bld'=>$owned_bld,'add'=>$owned_add,'rsd'=>$owned_rsd,'ani'=>$owned_ani], time());

// --- stat-based buffs: (no DB) compute from rules + summary metrics ---
require_once __DIR__ . '/lib/stat_rules.php';
require_once __DIR__ . '/lib/stat_watchers.php';

// Build a metrics array from your existing summary variables. Adapt keys if different.
// I use $fine[...] as in your repo snippets; adjust if your summary uses other variable names.
function _extract_metric_value($candidate) {
  if ($candidate === null) return 0.0;
  if (is_numeric($candidate)) return floatval($candidate);
  if (is_array($candidate)) {
    // almindelige navne vi forsøger at støtte:
    foreach (['effective','happiness','popularity','value','val'] as $k) {
      if (isset($candidate[$k]) && is_numeric($candidate[$k])) return floatval($candidate[$k]);
    }
    // nogle gange kommer SimpleXMLElement -> object med properties
    if (isset($candidate['happiness']) && is_numeric($candidate['happiness'])) return floatval($candidate['happiness']);
    return 0.0;
  }
  // SimpleXMLElement eller object-like
  if (is_object($candidate)) {
    if (isset($candidate->effective) && is_numeric((string)$candidate->effective)) return floatval((string)$candidate->effective);
    if (isset($candidate->happiness) && is_numeric((string)$candidate->happiness)) return floatval((string)$candidate->happiness);
    if (isset($candidate->popularity) && is_numeric((string)$candidate->popularity)) return floatval((string)$candidate->popularity);
  }
  // fallback: attempt numeric string
  if (is_string($candidate) && is_numeric($candidate)) return floatval($candidate);
  return 0.0;
}

$metrics = [];
$metrics['happiness'] = _extract_metric_value($fine['happiness'] ?? ($data['happiness'] ?? null));
$metrics['popularity'] = _extract_metric_value($fine['popularity'] ?? ($data['popularity'] ?? null));

// crimePercent: use explicit field if present, else compute from adultsCrime/adults counts
if (isset($data['crimePercent'])) {
  $metrics['crimePercent'] = _extract_metric_value($data['crimePercent']);
} elseif (isset($fine['adultsCrime']) && isset($fine['adults']) && $fine['adults'] > 0) {
  $metrics['crimePercent'] = floatval($fine['adultsCrime']) / max(1.0, floatval($fine['adults']));
} else {
  $metrics['crimePercent'] = 0.0;
}

$metrics['useFire']      = _extract_metric_value($fine['useFire'] ?? ($data['useFire'] ?? null));
$metrics['fireCapacity'] = _extract_metric_value($fine['fireCapacity'] ?? ($data['fireCapacity'] ?? null));
$metrics['weather']      = isset($data['weather']) ? $data['weather'] : (isset($fine['weather']) ? $fine['weather'] : null);

// user stage: adjust variable name if different in your code
$userStage = isset($userStage) ? intval($userStage) : (isset($fine['stage']) ? intval($fine['stage']) : 1);

// load rules and compute stat buffs
$statRules = stat_rules_config();
$statBuffs = stat_watcher_compute_buffs($statRules, $metrics, $userStage, time());

// efter $statRules = stat_rules_config();
// efter $statBuffs = stat_watcher_compute_buffs(...)
error_log("stat_rules: " . json_encode(array_keys($statRules)));
error_log("userStage: " . json_encode($userStage));
error_log("metrics: " . json_encode($metrics));
error_log("statBuffs: " . json_encode($statBuffs));

// Merge stat buffs into activeBuffs so downstream code sees them
if (!empty($statBuffs) && is_array($statBuffs)) {
  $activeBuffs = array_merge($activeBuffs, $statBuffs);
}

// (optional) expose activeBuffs in alldata response for frontend convenience:
$data['activeBuffs'] = $activeBuffs;

$yields_preview = []; // pr. entitet, efter buffs, for én fuld periode
foreach (['bld','add','rsd','ani'] as $bucket) {
  foreach (($defs[$bucket] ?? []) as $key => $def) {
    $ctxId   = ($bucket === 'bld' ? 'bld.' : ($bucket === 'add' ? 'add.' : ($bucket === 'rsd' ? 'rsd.' : 'ani.'))) . $key;
    $owned   = $bucket==='ani' ? !empty($owned_ani[$ctxId]) : (!empty($owned_bld[$ctxId]) || !empty($owned_add[$ctxId]) || !empty($owned_rsd[$key]) || !empty($owned_rsd[$ctxId]));
    if (!$owned) continue;

    $periodS = (function(array $def){
      $stats = $def['stats'] ?? [];
      foreach (['yield_period_s','yieldPeriodS','production_period_s','period_s'] as $k) {
        if (!empty($def[$k])) return (int)$def[$k];
        if (!empty($stats[$k])) return (int)$stats[$k];
      }
      return 3600;
    })($def);

    $rows = $def['yield'] ?? [];
    $assoc = [];
    foreach ($rows as $row) {
      $rid = $row['id'] ?? $row['res'] ?? null;
      $amt = $row['amount'] ?? $row['qty'] ?? null;
      if ($rid === null || $amt === null) continue;
      $rid = str_starts_with((string)$rid,'res.') ? (string)$rid : 'res.'.(string)$rid;
      $assoc[$rid] = ($assoc[$rid] ?? 0.0) + (float)$amt; // én cyklus
    }
    if (!$assoc) continue;

    // Anvend aktive buffs
    if (!function_exists('apply_yield_buffs_assoc')) require_once __DIR__ . '/actions/buffs.php';
    $assocBuffed = apply_yield_buffs_assoc($assoc, $ctxId, $activeBuffs);

    $yields_preview[$ctxId] = [
      'period_s' => $periodS,
      'base'     => $assoc,
      'buffed'   => $assocBuffed,
    ];
  }
}
$data['yields_preview'] = $yields_preview;

// 4b.1) Repair preview for alle ejede bygninger
            if (!function_exists('dur__repair_preview_for_def')) require_once __DIR__ . '/lib/durability.php';
            if (!function_exists('normalize_costs')) require_once __DIR__ . '/lib/purchase_helpers.php';
            $repair_preview = [];
            foreach ($owned_bld as $ctxId => $row) {
              $defKey = preg_replace('/^bld\\./', '', (string)$ctxId);
              $def    = $defs['bld'][$defKey] ?? null;
              if (!$def) continue;
              $defMax = (float)($def['durability'] ?? 0.0);
              if ($defMax <= 0) continue;
              $effAbs = (float)($row['durability_eff_abs'] ?? 0.0);
              $prev   = dur__repair_preview_for_def($def, $effAbs, $defMax, $cfg);
              $prev['def_max'] = $defMax;
              $prev['eff_abs'] = $effAbs;
              $prev['pct']     = isset($row['durability_pct']) ? (int)$row['durability_pct'] : dur__pct($defMax, $effAbs);
              $repair_preview[$ctxId] = $prev;
            }
            $data['repair_preview'] = $repair_preview;

            // 4c) Anvend passive yields (base + normale yields) FØR vi læser inventory
             $stateMin = ['bld'=>$owned_bld,'add'=>$owned_add,'rsd'=>$owned_rsd,'ani'=>$owned_ani];
             apply_passive_yields_for_user($uid, $defs, $stateMin);

            // 4d) Normaliser defs['res'] FØR inventory
            if (!empty($defs['res'])) {
                $norm = [];
                foreach ($defs['res'] as $id => $row) $norm[strip_prefix($id, 'res')] = $row;
                $defs['res'] = $norm;
            }

            // 4e) Inventory (efter udbetaling)
            $invRows = $pdo->prepare("SELECT res_id, amount FROM inventory WHERE user_id = ?");
            $invRows->execute([$uid]);
            $state['inv'] = ['solid' => [], 'liquid' => []];
            foreach ($invRows->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $key = preg_replace('/^res\./', '', (string)$r['res_id']);
                $unit = strtolower((string)($defs['res'][$key]['unit'] ?? ''));
                $inv_key = ($unit === 'l') ? 'liquid' : 'solid';
                $state['inv'][$inv_key][$key] = ($state['inv'][$inv_key][$key] ?? 0) + (float)$r['amount'];
            }

            // 4f) Gem ejerskab i state til klienten
            $state['bld'] = $owned_bld;
            $state['add'] = $owned_add;
            $state['rsd'] = $owned_rsd;
            $state['ani'] = $owned_ani;

            // 4g) Resource locks
            $locksStmt = $pdo->prepare("SELECT res_id, amount FROM resource_locks WHERE user_id = ? AND released_at IS NULL AND consumed_at IS NULL");
            $locksStmt->execute([$uid]);
            foreach ($locksStmt->fetchAll(PDO::FETCH_ASSOC) as $lock) {
                $lockId = (string)($lock['res_id'] ?? '');
                $lockAmt = (float)($lock['amount'] ?? 0);
                if ($lockId === '' || $lockAmt <= 0) continue;
                if (str_starts_with($lockId, 'ani.')) {
                    $currentAni = (float)($state['ani'][$lockId]['quantity'] ?? 0);
                    $state['ani'][$lockId]['quantity'] = max(0, $currentAni - $lockAmt);
                    continue;
                }
                $resourceKey = preg_replace('/^res\\./', '', $lockId);
                $unit = strtolower((string)($defs['res'][$resourceKey]['unit'] ?? ''));
                $bucket = ($unit === 'l') ? 'liquid' : 'solid';
                if (!array_key_exists($resourceKey, $state['inv'][$bucket])) {
                    $otherBucket = $bucket === 'liquid' ? 'solid' : 'liquid';
                    if (array_key_exists($resourceKey, $state['inv'][$otherBucket])) {
                        $bucket = $otherBucket;
                    } else {
                        $state['inv'][$bucket][$resourceKey] = 0.0;
                    }
                }
                $current = (float)($state['inv'][$bucket][$resourceKey] ?? 0.0);
                $state['inv'][$bucket][$resourceKey] = max(0.0, $current - $lockAmt);
            }

            // 4h) Aktive byggejobs
            $jobs = [];
            $jobsStmt = $pdo->prepare("SELECT id, bld_id, start_utc, duration_s, end_utc FROM build_jobs WHERE user_id = ? AND state = 'running'");
            $jobsStmt->execute([$uid]);
            foreach ($jobsStmt->fetchAll(PDO::FETCH_ASSOC) as $jobRow) {
                $startUtc = (string)($jobRow['start_utc'] ?? '');
                $duration = (int)($jobRow['duration_s'] ?? 0);
                $endUtcRaw = (string)($jobRow['end_utc'] ?? '');
                if ($endUtcRaw === '' && $startUtc !== '' && $duration > 0) {
                    try {
                        $startDt = new DateTime($startUtc, new DateTimeZone('UTC'));
                        $endDt = (clone $startDt)->modify('+' . $duration . ' seconds');
                        $endUtcRaw = $endDt->format('Y-m-d H:i:s');
                    } catch (Throwable $e) {
                        $endUtcRaw = $startUtc;
                    }
                }
                $jobs[] = [
                    'id' => (int)$jobRow['id'],
                    'bld_id' => (string)$jobRow['bld_id'],
                    'start_utc' => $startUtc,
                    'end_utc' => $endUtcRaw,
                    'duration_s' => $duration,
                ];
            }
            $state['jobs'] = ['running' => $jobs];
        }

        /* 5) Normaliser og merge sprog-data */
        if (!empty($defs['res'])) {
            $norm = [];
            foreach ($defs['res'] as $id => $row) $norm[strip_prefix($id, 'res')] = $row;
            $defs['res'] = $norm;
        }
        foreach (['res', 'bld', 'rsd', 'rcp', 'add', 'ani'] as $type) {
            foreach ($defs[$type] as $id => &$item) {
                if (isset($langMap["$type.$id.name"])) $item['name'] = $langMap["$type.$id.name"];
                if (isset($langMap["$type.$id.desc"])) $item['desc'] = $langMap["$type.$id.desc"];
            }
            unset($item);
        }

        $defs['citizens'] = loadCitizens($xmlPath, true, 0);

          // FJERN NAME/DESC FRA langMap (behold kun ui.*) – brug samme effektive langCode
          $langRaw = load_lang_xml($langDir, $langCode);
          $langMap = filter_lang_for_ui($langRaw);

                // === CAP-BEREGNING ===
        $getResDef = function(array $defsRes, string $key) {
          if (isset($defsRes[$key])) return $defsRes[$key];
          $rid = (strpos($key, 'res.') === 0) ? $key : "res.$key";
          if (isset($defsRes[$rid])) return $defsRes[$rid];
          $bare = (strpos($key, 'res.') === 0) ? substr($key, 4) : $key;
          return $defsRes[$bare] ?? null;
        };
        $invLiq = $state['inv']['liquid'] ?? [];
        $invSol = $state['inv']['solid']  ?? [];
        $usedLiquid = 0.0; $usedSolid  = 0.0; $capWarns=[];
        foreach ($invLiq as $key => $amount) { $def=$getResDef($defs['res'], (string)$key); if(!$def){$capWarns[]="No defs for liquid '$key'"; continue;} if(!isset($def['unitSpace'])){$capWarns[]="No unitSpace for liquid '$key'"; continue;} $usedLiquid += ((float)$amount) * ((float)$def['unitSpace']); }
        foreach ($invSol as $key => $amount) { $def=$getResDef($defs['res'], (string)$key); if(!$def){$capWarns[]="No defs for solid '$key'"; continue;} if(!isset($def['unitSpace'])) {$capWarns[]="No unitSpace for solid '$key'"; continue;} $usedSolid  += ((float)$amount) * ((float)$def['unitSpace']); }

        // footprint
        $availableFP=0; $usedFP=0;
        foreach ($state['bld'] as $id => $val) { $key=preg_replace('/^bld\./','',$id); if(isset($defs['bld'][$key]['stats']['footprint'])){ $fp=(int)$defs['bld'][$key]['stats']['footprint']; if($fp>0)$availableFP+=$fp; elseif($fp<0)$usedFP+=$fp; } }
        foreach ($state['add'] as $id => $val) { $key=preg_replace('/^add\./','',$id); if(isset($defs['add'][$key]['stats']['footprint'])){ $fp=(int)$defs['add'][$key]['stats']['footprint']; if($fp>0)$availableFP+=$fp; elseif($fp<0)$usedFP+=$fp; } }

        // animal cap bonus fra bygninger/addons
        $availableAC=0; $usedAC=0;
        foreach ($state['bld'] as $id => $val) { $key=preg_replace('/^bld\./','',$id); if(isset($defs['bld'][$key]['stats']['animal_cap'])){ $ac=(int)$defs['bld'][$key]['stats']['animal_cap']; if($ac>0)$availableAC+=$ac; elseif($ac<0)$usedAC+=$ac; } }
        foreach ($state['add'] as $id => $val) { $key=preg_replace('/^add\./','',$id); if(isset($defs['add'][$key]['stats']['animal_cap'])){ $ac=(int)$defs['add'][$key]['stats']['animal_cap']; if($ac>0)$availableAC+=$ac; elseif($ac<0)$usedAC+=$ac; } }

        // animal used af dyr
        $usedAnimalCapByAnimals=0;
        if (!empty($state['ani']) && !empty($defs['ani'])) {
          foreach ($state['ani'] as $aniId => $row) {
            $qty = (int)($row['quantity'] ?? 0); if ($qty <= 0) continue;
            $key = preg_replace('/^ani\./', '', (string)$aniId);
            $def = $defs['ani'][$key] ?? null; if (!$def) continue;
           $capPer = 0;
            if (isset($def['stats']['animal_cap'])) {
                // brug absolut værdi og cast til int
                $capPer = (int) abs((int) $def['stats']['animal_cap']);
                // ignore zero/negative (tæl ikke) — hvis I vil behandle negative som 0, dette gør det
                if ($capPer <= 0) $capPer = 0;
            } else {
                // ingen animal_cap i def -> tæl ikke automatisk som 1
                $capPer = 0;
            }
          $usedAnimalCapByAnimals += $capPer * $qty;
          }
        }

        // storage caps
        // --- Storage caps: solid ---
$availableSS = 0; $usedSS = 0;
// buildings
foreach ($state['bld'] as $id => $val) {
    $key = preg_replace('/^bld\\./','',$id);
    $ss = isset($defs['bld'][$key]['stats']['storageSolidCap']) ? (int)$defs['bld'][$key]['stats']['storageSolidCap'] : 0;
    if ($ss > 0) $availableSS += $ss;
    elseif ($ss < 0) $usedSS += $ss;
}
// addons
foreach ($state['add'] as $id => $val) {
    $key = preg_replace('/^add\\./','',$id);
    $ss = isset($defs['add'][$key]['stats']['storageSolidCap']) ? (int)$defs['add'][$key]['stats']['storageSolidCap'] : 0;
    if ($ss > 0) $availableSS += $ss;
    elseif ($ss < 0) $usedSS += $ss;
}
// animals: multiplicer med qty og kun hvis stat findes
foreach ($state['ani'] as $id => $val) {
    $key = preg_replace('/^ani\\./','',$id);
    $qty = (int)($val['quantity'] ?? 0);
    if ($qty <= 0) continue;
    if (isset($defs['ani'][$key]['stats']['storageSolidCap'])) {
        $ss = (int)$defs['ani'][$key]['stats']['storageSolidCap'];
        if ($ss > 0) $availableSS += $ss * $qty;
        elseif ($ss < 0) $usedSS += $ss * $qty;
    }
}

// --- Storage caps: liquid ---
$availableSL = 0; $usedSL = 0;
// buildings
foreach ($state['bld'] as $id => $val) {
    $key = preg_replace('/^bld\\./','',$id);
    $sl = isset($defs['bld'][$key]['stats']['storageLiquidCap']) ? (int)$defs['bld'][$key]['stats']['storageLiquidCap'] : 0;
    if ($sl > 0) $availableSL += $sl;
    elseif ($sl < 0) $usedSL += $sl;
}
// addons
foreach ($state['add'] as $id => $val) {
    $key = preg_replace('/^add\\./','',$id);
    $sl = isset($defs['add'][$key]['stats']['storageLiquidCap']) ? (int)$defs['add'][$key]['stats']['storageLiquidCap'] : 0;
    if ($sl > 0) $availableSL += $sl;
    elseif ($sl < 0) $usedSL += $sl;
}
// animals: multiplicer med qty og kun hvis stat findes
foreach ($state['ani'] as $id => $val) {
    $key = preg_replace('/^ani\\./','',$id);
    $qty = (int)($val['quantity'] ?? 0);
    if ($qty <= 0) continue;
    if (isset($defs['ani'][$key]['stats']['storageLiquidCap'])) {
        $sl = (int)$defs['ani'][$key]['stats']['storageLiquidCap'];
        if ($sl > 0) $availableSL += $sl * $qty;
        elseif ($sl < 0) $usedSL += $sl * $qty;
    }
}
        // Base fra config
        $CONFIG = isset($config) ? $config : (isset($cfg) ? $cfg : []);
        $liquidBase = (int)($CONFIG['start_limitations_cap']['storageLiquidCap'] ?? $CONFIG['start_limitations_cap']['storageLiquidBaseCap'] ?? 0);
        $solidBase  = (int)($CONFIG['start_limitations_cap']['storageSolidCap']  ?? $CONFIG['start_limitations_cap']['storageSolidBaseCap']  ?? 0);
        $footprintBase = (int)($CONFIG['start_limitations_cap']['footprintBaseCap'] ?? 0);
        $animalBaseCap = (int)($CONFIG['start_limitations_cap']['animalBaseCap'] ?? 0);

        // Bonus fra bygninger/addons
        $bonusLiquid = $availableSL;
        $bonusSolid  = $availableSS;
        $bonusFootprint  = $availableFP;
        $usedFootprint   = $usedFP;
        $bonusAnimalCap  = $availableAC;

        $usedAnimalCap = $usedAnimalCapByAnimals;

        $state['cap'] = [
          'liquid' => ['base'=>$liquidBase,'bonus'=>$bonusLiquid,'total'=>$liquidBase+$bonusLiquid,'used'=>$usedLiquid],
          'solid'  => ['base'=>$solidBase, 'bonus'=>$bonusSolid, 'total'=>$solidBase +$bonusSolid, 'used'=>$usedSolid ],
          'footprint' => ['base'=>$footprintBase,'bonus'=>$bonusFootprint,'total'=>$footprintBase+$bonusFootprint,'used'=>$usedFootprint],
          'animal_cap'=> ['base'=>$animalBaseCap,'bonus'=>$bonusAnimalCap,'total'=>$animalBaseCap+$bonusAnimalCap,'used'=>$usedAnimalCap],
        ];
        if (!empty($_GET['debug']) && $capWarns) $state['__cap_warnings']=$capWarns;

        /* 7) Output */
        $out = [
  'defs' => $defs,
  'state' => $state,
  'lang' => $langMap,
  'config' => $cfg,
  'activeBuffs' => $activeBuffs,
];
        if ($debug) $out['__debug'] = ['xml_scan' => $debugXml ?? []];

        // ETag / cache helpers: send 304 if client already has same payload
        // Bemærk: Content-Type sættes tidligere når WS_RUN_MODE === 'run'
        header('Cache-Control: no-cache');
        $etag = '"' . md5(json_encode($out['state']['inv'] ?? []) . json_encode($out['state']['user'] ?? [])) . '"';
        // send 304 hvis If-None-Match matcher
        $ifNone = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
        if ($ifNone === $etag) {
            http_response_code(304);
            exit;
        }
        // ellers offentliggør etag header så klient kan cache/validerer næste gang
        header('ETag: ' . $etag);

        jout(true, $out);

        

    } catch (Throwable $e) {
      jerr('E_SERVER', $e->getMessage(), 500);
    }
}