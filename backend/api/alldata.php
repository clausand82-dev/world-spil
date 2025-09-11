<?php
declare(strict_types=1);
if (!defined('WS_RUN_MODE')) define('WS_RUN_MODE', 'run'); // 'run' = normal, 'lib' = kun funktioner
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

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
/**
 * Parse human-friendly duration strings into seconds (int).
 * Accepted formats (mixed and with/without spaces):
 *   "1d", "1h", "30m", "45s", "1d30m", "1h 30m", "2d 4h 10m 5s", "1.5h"
 * Rules:
 *   - d=86400s, h=3600s, m=60s, s=1s
 *   - Multiple tokens are summed. Decimals allowed (e.g., 1.5h = 5400s).
 *   - Returns null on invalid/empty input.
 */
function parse_duration_to_seconds(?string $str): ?int {
  if ($str === null) return null;
  $s = trim(mb_strtolower((string)$str));
  if ($s === '') return null;

  // Remove extra spaces to simplify parsing (but allow "1h 30m")
  $s = preg_replace('/\s+/', '', $s);

  $re = '/(\d+(?:\.\d+)?)([dhms])/i';
  $total = 0.0;
  $matched = false;

  if (preg_match_all($re, $s, $m, PREG_SET_ORDER)) {
    foreach ($m as $tok) {
      $matched = true;
      $val = (float)$tok[1];
      $unit = $tok[2];
      switch ($unit) {
        case 'd': $total += $val * 86400.0; break;
        case 'h': $total += $val * 3600.0;  break;
        case 'm': $total += $val * 60.0;    break;
        case 's': $total += $val;           break;
        default: /* ignore unknown */ break;
      }
    }
  }
  if (!$matched) return null;

  // Clamp to a reasonable upper bound (e.g., 30 days) to catch typos,
  // but only if you want to enforce it. Comment out if not desired.
  // $max = 30 * 86400;
  // if ($total > $max) return null;

  return (int) round($total);
}
/* ======================= duration defaults & legacy coercion ======================= */
// Global default fallback for durations (in seconds).
// Change this if you want a different test value across the board.
if (!defined('DEFAULT_DURATION_SECONDS')) {
  define('DEFAULT_DURATION_SECONDS', 60);
}

/**
 * Try to coerce any legacy duration representation into seconds.
 * Checks common attribute/child names like: duration, duration_s, duration_ms, build_time, time_seconds.
 * Priority:
 *   1) Explicit seconds field (duration_s or time_seconds)
 *   2) Milliseconds field (duration_ms)
 *   3) Generic 'duration' (assume seconds)
 *   4) 'build_time' (assume seconds unless ends with ms)
 * Returns null if nothing is found.
 */
function coerce_any_duration_to_seconds($node, array &$item): ?int {
  // 1) Seconds fields
  foreach (['duration_s', 'time_seconds'] as $k) {
    if (isset($item[$k])) {
      $v = (string)$item[$k];
      if ($v !== '') return (int) round((float)$v);
    }
    if (isset($node->$k)) {
      $v = (string)$node->$k;
      if (trim($v) !== '') return (int) round((float)$v);
    }
  }

  // 2) Milliseconds field
  foreach (['duration_ms'] as $k) {
    if (isset($item[$k])) {
      $v = (string)$item[$k];
      if ($v !== '') return (int) round(((float)$v) / 1000.0);
    }
    if (isset($node->$k)) {
      $v = (string)$node->$k;
      if (trim($v) !== '') return (int) round(((float)$v) / 1000.0);
    }
  }

  // 3) Generic 'duration' (assume seconds)
  foreach (['duration', 'build_time'] as $k) {
    if (isset($item[$k])) {
      $v = (string)$item[$k];
      if ($v !== '') {
        $v = trim($v);
        if (preg_match('/^\d+(\.\d+)?\s*ms$/i', $v)) {
          return (int) round(((float)$v) / 1000.0); // '123ms'
        }
        return (int) round((float)$v); // assume seconds
      }
    }
    if (isset($node->$k)) {
      $v = trim((string)$node->$k);
      if ($v !== '') {
        if (preg_match('/^\d+(\.\d+)?\s*ms$/i', $v)) {
          return (int) round(((float)$v) / 1000.0);
        }
        return (int) round((float)$v);
      }
    }
  }

  return null;
}


/* ======================= flatten (for ?flat=1) ======================= */

function kv_put(array &$kv, string $key, $val, bool $strict): void {
  if ($strict && array_key_exists($key, $kv)) jerr('E_DUPKEY', "Duplicate key: {$key}", 500);
  $kv[$key] = $val;
}
function flatten_into(array &$kv, $val, string $prefix, bool $strict): void {
  if (is_array($val)) {
    $isList = array_is_list($val);
    if ($isList) {
      foreach ($val as $i=>$v) flatten_into($kv, $v, "{$prefix}[{$i}]", $strict);
    } else {
      foreach ($val as $k=>$v) {
        $k = trim((string)$k);
        $dot = $prefix !== '' ? '.' : '';
        flatten_into($kv, $v, $prefix . $dot . $k, $strict);
      }
    }
  } else {
    kv_put($kv, $prefix, $val, $strict);
  }
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
    $abs = $p; // absolut
  } else {
    if (stripos($p, 'backend/') === 0 || stripos($p, 'backend\\') === 0) {
      $p = substr($p, 8); // fjern 'backend/'
    }
    $abs = rtrim($backend, '/\\') . DIRECTORY_SEPARATOR . $p;
  }
  $real = realpath($abs);
  if ($real === false || !is_dir($real)) jerr('E_CONFIG', 'Directory not found: ' . $abs, 500);
  return $real;
}

function load_lang_xml(string $langDir, string $langCode): array {
  $langDir = rtrim($langDir, '/\\');
  $candidates = [
    "$langDir/$langCode.xml",
    "$langDir/lang.$langCode.xml",
  ];
  foreach (glob("$langDir/*$langCode*.xml") ?: [] as $g) {
    if (!in_array($g, $candidates, true)) $candidates[] = $g;
  }
  $file = null;
  foreach ($candidates as $cand) if (is_file($cand)) { $file = $cand; break; }
  if (!$file) return [];

  $raw = file_get_contents($file);
  if ($raw === false) return [];
  $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw); // strip BOM
  $xml = @simplexml_load_string($raw);
  if (!$xml) return [];

  $out = [];
  foreach ($xml->xpath('//entry[@key] | //string[@key]') ?: [] as $node) {
    $key = (string)$node['key'];
    if ($key === '') continue;
    $val = trim((string)$node);
    if ($val === '') continue;
    $out[$key] = $val;
  }
  return $out;
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

/* ======================= XML parsers (defs) ======================= */

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

/* resources.xml → defs.res.<id>.* ---------------------------------------------------------- */
function load_resources_xml(string $file): array {
  if (!is_file($file)) return [];
  $xml = @simplexml_load_file($file);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//resource') ?: [] as $res) {
    $idRaw = (string)($res['id'] ?? '');
    if ($idRaw === '') continue;
    $id = strip_prefix($idRaw, 'res');

    $item = ['id'=>$id];
    foreach ($res->attributes() as $k=>$v) {
      if ($k === 'id') continue;
      $val = (string)$v;
      $item[(string)$k] = is_numeric($val) ? $val + 0 : $val;
    }
    foreach ($res->children() as $ck=>$cv) {
      $val = trim((string)$cv);
      if ($val === '') continue;
      $item[(string)$ck] = is_numeric($val) ? $val + 0 : $val;
    }
    $out[$id] = $item;
  }
  return $out;
}

/* buildings.xml → defs.bld.<id>.* --------------------------------------------*/
function load_buildings_xml(string $file): array {
  if (!is_file($file)) return [];
  $xml = @simplexml_load_file($file);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//building') ?: [] as $b) {
    $idRaw = (string)($b['id'] ?? '');
    if ($idRaw === '') continue;
    $id = strip_prefix($idRaw, 'bld');

    $item = ['id'=>$id];
    foreach ($b->attributes() as $k=>$v) {
      if ($k === 'id') continue;
      $val = (string)$v;
      $item[(string)$k] = is_numeric($val) ? $val + 0 : $val;
    }
    if (isset($b->stats)) $item['stats'] = parse_stats_string((string)$b->stats);

    $costs = [];
    foreach ($b->xpath('cost/*') ?: [] as $c) {
      $row = ['type'=>$c->getName()];
      foreach ($c->attributes() as $k=>$v) {
        $val = (string)$v;
        $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
      }
      $costs[] = $row;
    }
    if ($costs) $item['cost'] = $costs;

    // --- YIELD (period + lines) ---
$yieldPeriodStr = null;
$yieldPeriodS   = null;

// læs <yield>-noden (for period/period_s på selve blokken)
$yNode = ($b->xpath('yield')[0] ?? null);
if ($yNode) {
  if (isset($yNode['period_s'])) {
    $yieldPeriodS   = (int)$yNode['period_s'];
    $yieldPeriodStr = $yieldPeriodS . 's';
  } elseif (isset($yNode['period'])) {
    $yieldPeriodStr = (string)$yNode['period'];
    $yieldPeriodS   = parse_duration_to_seconds($yieldPeriodStr); // genbrug din parser
  }
}

$yields = [];
foreach ($b->xpath('yield/*') ?: [] as $p) {
  $row = ['type' => $p->getName()];
  foreach ($p->attributes() as $k => $v) {
    $val = (string)$v;
    $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
  }
  $yields[] = $row;
}

// Back-compat: hvis period ikke var sat på <yield>, så tjek per-res 'time'/'time_s'
if ($yieldPeriodS === null && $yields) {
  $unique = [];
  foreach ($yields as $r) {
    if (isset($r['time_s'])) {
      $unique[] = (int)$r['time_s'];
    } elseif (isset($r['time'])) {
      $parsed = parse_duration_to_seconds((string)$r['time']);
      if ($parsed !== null) $unique[] = $parsed;
    }
  }
  $unique = array_values(array_unique(array_filter($unique, fn($x) => $x !== null)));
  if (count($unique) === 1) {
    $yieldPeriodS   = (int)$unique[0];
    $yieldPeriodStr = $yieldPeriodS . 's';
    // fjern deprec. felter, så defs bliver rene
    foreach ($yields as &$r) { unset($r['time'], $r['time_s']); }
    unset($r);
  } elseif (count($unique) > 1) {
    // konfigurationsfejl i "fælles tick" model – valgfrit flag til debug
    $item['yield_period_error'] = 'mixed_per_res_times';
  }
}

if ($yields) {
  $item['yield'] = $yields;
  if ($yieldPeriodS !== null) {
    $item['yield_period_s']   = (int)$yieldPeriodS;   // canonical
    $item['yield_period_str'] = (string)$yieldPeriodStr; // til UI/debug
  }
}


    if (isset($b->durability)) $item['durability'] = (float)$b->durability;
    if (isset($b->upgradesTo)) $item['upgradesTo'] = trim((string)$b->upgradesTo);
    if (isset($b->require)) $item['require'] = trim((string)$b->require);

    // --- Normalize time/duration: prefer human strings like "1d", "1h 30m", "1d30m" ---
    $timeStr = null;
    if (isset($item['time'])) {
      $timeStr = (string)$item['time']; // attribute form
    } elseif (isset($b->time)) {
      $timeStr = trim((string)$b->time); // child node form
    }

    $secs = null;
    if ($timeStr !== null && $timeStr !== '') {
      // New system: parse tokens to seconds
      $secs = parse_duration_to_seconds($timeStr);
      if ($secs !== null) {
        $item['time_str']   = $timeStr; // keep human-readable for UI/debug
        unset($item['time']);           // remove raw to avoid duplicates
      }
    }

    if ($secs === null) {
      // Legacy compatibility: look for other duration-shaped fields
      $legacy = coerce_any_duration_to_seconds($b, $item);
      if ($legacy !== null) {
        $secs = $legacy;
        $item['time_str'] = isset($timeStr) && $timeStr !== '' ? $timeStr : (string)$legacy . 's';
      }
    }

    if ($secs === null) {
      // Final fallback: global default (testing-friendly)
      $secs = (int) DEFAULT_DURATION_SECONDS;
      $item['time_str'] = 'default:' . $secs . 's';
    }

    $item['duration_s'] = (int)$secs; // canonical seconds for system logic

    $out[$id] = $item;
  }
  return $out;
}

/* animal.xml --> defs.ani.ID ------------------------------------------------------- */
function load_animals_xml(string $file): array {
  if (!is_file($file)) return [];
  $xml = @simplexml_load_file($file);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//animal') ?: [] as $an) {
    $idRaw = (string)($an['id'] ?? '');
    if ($idRaw === '') continue;
    $id = strip_prefix($idRaw, 'ani');

    $item = ['id'=>$id];
    foreach ($an->attributes() as $k=>$v) {
      if ($k === 'id') continue;
      $val = (string)$v;
      $item[(string)$k] = is_numeric($val) ? $val + 0 : $val;
    }
    if (isset($an->stats)) $item['stats'] = parse_stats_string((string)$an->stats);

    $costs = [];
    foreach ($an->xpath('cost/*') ?: [] as $c) {
      $row = ['type'=>$c->getName()];
      foreach ($c->attributes() as $k=>$v) {
        $val = (string)$v;
        $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
      }
      $costs[] = $row;
    }
    if ($costs) $item['cost'] = $costs;

    // --- YIELD (period + lines) ---
$yieldPeriodStr = null;
$yieldPeriodS   = null;

// læs <yield>-noden (for period/period_s på selve blokken)
$yNode = ($an->xpath('yield')[0] ?? null);
if ($yNode) {
  if (isset($yNode['period_s'])) {
    $yieldPeriodS   = (int)$yNode['period_s'];
    $yieldPeriodStr = $yieldPeriodS . 's';
  } elseif (isset($yNode['period'])) {
    $yieldPeriodStr = (string)$yNode['period'];
    $yieldPeriodS   = parse_duration_to_seconds($yieldPeriodStr); // genbrug din parser
  }
}

$yields = [];
foreach ($an->xpath('yield/*') ?: [] as $p) {
  $row = ['type' => $p->getName()];
  foreach ($p->attributes() as $k => $v) {
    $val = (string)$v;
    $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
  }
  $yields[] = $row;
}

// Back-compat: hvis period ikke var sat på <yield>, så tjek per-res 'time'/'time_s'
if ($yieldPeriodS === null && $yields) {
  $unique = [];
  foreach ($yields as $r) {
    if (isset($r['time_s'])) {
      $unique[] = (int)$r['time_s'];
    } elseif (isset($r['time'])) {
      $parsed = parse_duration_to_seconds((string)$r['time']);
      if ($parsed !== null) $unique[] = $parsed;
    }
  }
  $unique = array_values(array_unique(array_filter($unique, fn($x) => $x !== null)));
  if (count($unique) === 1) {
    $yieldPeriodS   = (int)$unique[0];
    $yieldPeriodStr = $yieldPeriodS . 's';
    // fjern deprec. felter, så defs bliver rene
    foreach ($yields as &$r) { unset($r['time'], $r['time_s']); }
    unset($r);
  } elseif (count($unique) > 1) {
    // konfigurationsfejl i "fælles tick" model – valgfrit flag til debug
    $item['yield_period_error'] = 'mixed_per_res_times';
  }
}

if ($yields) {
  $item['yield'] = $yields;
  if ($yieldPeriodS !== null) {
    $item['yield_period_s']   = (int)$yieldPeriodS;   // canonical
    $item['yield_period_str'] = (string)$yieldPeriodStr; // til UI/debug
  }
}


    // --- Normalize time/duration: prefer human strings like "1d", "1h 30m", "1d30m" ---
    $timeStr = null;
    if (isset($item['time'])) {
      $timeStr = (string)$item['time']; // attribute form
    } elseif (isset($b->time)) {
      $timeStr = trim((string)$b->time); // child node form
    }

    $secs = null;
    if ($timeStr !== null && $timeStr !== '') {
      // New system: parse tokens to seconds
      $secs = parse_duration_to_seconds($timeStr);
      if ($secs !== null) {
        $item['time_str']   = $timeStr; // keep human-readable for UI/debug
        unset($item['time']);           // remove raw to avoid duplicates
      }
    }

    if ($secs === null) {
      // Legacy compatibility: look for other duration-shaped fields
      $legacy = coerce_any_duration_to_seconds($an, $item);
      if ($legacy !== null) {
        $secs = $legacy;
        $item['time_str'] = isset($timeStr) && $timeStr !== '' ? $timeStr : (string)$legacy . 's';
      }
    }

    if ($secs === null) {
      // Final fallback: global default (testing-friendly)
      $secs = (int) DEFAULT_DURATION_SECONDS;
      $item['time_str'] = 'default:' . $secs . 's';
    }

    $item['duration_s'] = (int)$secs; // canonical seconds for system logic

    $out[$id] = $item;
  }
  return $out;
}



/* research.xml → defs.rsd.<id>.* ----------------------------------------------- */
function load_research_xml(string $file): array {
  if (!is_file($file)) return [];
  $xml = @simplexml_load_file($file);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//research') ?: [] as $r) {
    $idRaw = (string)($r['id'] ?? '');
    if ($idRaw === '') continue;
    $id = strip_prefix($idRaw, 'rsd');

    $item = ['id'=>$id];
    foreach ($r->attributes() as $k=>$v) {
      if ($k === 'id') continue;
      $val = (string)$v;
      $item[(string)$k] = is_numeric($val) ? $val + 0 : $val;
    }
    foreach ($r->children() as $ck=>$cv) {
      $val = trim((string)$cv);
      if ($val === '') continue;
      $item[(string)$ck] = is_numeric($val) ? $val + 0 : $val;
    }

    $costs = [];
    foreach ($r->xpath('cost/*') ?: [] as $c) {
      $row = ['type'=>$c->getName()];
      foreach ($c->attributes() as $k=>$v) {
        $val = (string)$v;
        $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
      }
      $costs[] = $row;
    }
    if ($costs) $item['cost'] = $costs;

    // --- Normalize time/duration: prefer human strings like "1d", "1h 30m", "1d30m" ---
    $timeStr = null;
    if (isset($item['time'])) {
      $timeStr = (string)$item['time']; // attribute form
    } elseif (isset($b->time)) {
      $timeStr = trim((string)$b->time); // child node form
    }

    $secs = null;
    if ($timeStr !== null && $timeStr !== '') {
      // New system: parse tokens to seconds
      $secs = parse_duration_to_seconds($timeStr);
      if ($secs !== null) {
        $item['time_str']   = $timeStr; // keep human-readable for UI/debug
        unset($item['time']);           // remove raw to avoid duplicates
      }
    }

    if ($secs === null) {
      // Legacy compatibility: look for other duration-shaped fields
      $legacy = coerce_any_duration_to_seconds($r, $item);
      if ($legacy !== null) {
        $secs = $legacy;
        $item['time_str'] = isset($timeStr) && $timeStr !== '' ? $timeStr : (string)$legacy . 's';
      }
    }

    if ($secs === null) {
      // Final fallback: global default (testing-friendly)
      $secs = (int) DEFAULT_DURATION_SECONDS;
      $item['time_str'] = 'default:' . $secs . 's';
    }

    $item['duration_s'] = (int)$secs; // canonical seconds for system logic

    $out[$id] = $item;
  }
  return $out;
}

/* recipes.xml → defs.rcp.<id>.* */
function load_recipes_xml(string $file): array {
  if (!is_file($file)) return [];
  $xml = @simplexml_load_file($file);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//recipe') ?: [] as $r) {
    $idRaw = (string)($r['id'] ?? '');
    if ($idRaw === '') continue;
    $id = strip_prefix($idRaw, 'rcp');

    $item = ['id'=>$id];
    foreach ($r->attributes() as $k=>$v) {
      if ($k === 'id') continue;
      $val = (string)$v;
      $item[(string)$k] = is_numeric($val) ? $val + 0 : $val;
    }
    $costs = [];
    foreach ($r->xpath('cost/*') ?: [] as $c) {
      $row = ['type'=>$c->getName()];
      foreach ($c->attributes() as $k=>$v) {
        $val = (string)$v;
        $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
      }
      $costs[] = $row;
    }
    if ($costs) $item['cost'] = $costs;

    $outs = [];
    foreach ($r->xpath('yield/*') ?: [] as $o) {
      $row = ['type'=>$o->getName()];
      foreach ($o->attributes() as $k=>$v) {
        $val = (string)$v;
        $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
      }
      $outs[] = $row;
    }
    if ($outs) $item['yield'] = $outs;
    if (isset($r->require)) $item['require'] = trim((string)$r->require);

    // --- Normalize time/duration: prefer human strings like "1d", "1h 30m", "1d30m" ---
    $timeStr = null;
    if (isset($item['time'])) {
      $timeStr = (string)$item['time']; // attribute form
    } elseif (isset($r->time)) {
      $timeStr = trim((string)$r->time); // child node form
    }

    $secs = null;
    if ($timeStr !== null && $timeStr !== '') {
      // New system: parse tokens to seconds
      $secs = parse_duration_to_seconds($timeStr);
      if ($secs !== null) {
        $item['time_str']   = $timeStr; // keep human-readable for UI/debug
        unset($item['time']);           // remove raw to avoid duplicates
      }
    }

    if ($secs === null) {
      // Legacy compatibility: look for other duration-shaped fields
      $legacy = coerce_any_duration_to_seconds($r, $item);
      if ($legacy !== null) {
        $secs = $legacy;
        $item['time_str'] = isset($timeStr) && $timeStr !== '' ? $timeStr : (string)$legacy . 's';
      }
    }

    if ($secs === null) {
      // Final fallback: global default (testing-friendly)
      $secs = (int) DEFAULT_DURATION_SECONDS;
      $item['time_str'] = 'default:' . $secs . 's';
    }

    $item['duration_s'] = (int)$secs; // canonical seconds for system logic

    $out[$id] = $item;
  }
  return $out;
}

/* addons.xml (eller hvor end de ligger) → defs.add.<id>.*  */
function load_addons_xml(string $file): array {
  if (!is_file($file)) return [];
  $xml = @simplexml_load_file($file);
  if (!$xml) return [];
  $out = [];
  foreach ($xml->xpath('//addon') ?: [] as $a) {
    $idRaw = (string)($a['id'] ?? '');
    if ($idRaw === '') continue;
    $id = strip_prefix($idRaw, 'add'); // accepterer "add.xxx" eller bare "xxx"

    $item = ['id'=>$id];
    foreach ($a->attributes() as $k=>$v) {
      if ($k === 'id') continue;
      $val = (string)$v;
      $item[(string)$k] = is_numeric($val) ? $val + 0 : $val;
    }
    // simple children (inkl. <stats>…)
    foreach ($a->children() as $ck=>$cv) {
      if ($ck === 'stats') {
        $item['stats'] = parse_stats_string((string)$cv);
      } else {
        $val = trim((string)$cv);
        if ($val !== '') $item[(string)$ck] = is_numeric($val) ? $val + 0 : $val;
      }
    }
    // <cost> blok (res/bygningskrav mv.)
    $costs = [];
    foreach ($a->xpath('cost/*') ?: [] as $c) {
      $row = ['type'=>$c->getName()];
      foreach ($c->attributes() as $k=>$v) {
        $val = (string)$v;
        $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
      }
      $costs[] = $row;
    }
    if ($costs) $item['cost'] = $costs;

    // --- YIELD (period + lines) ---
$yieldPeriodStr = null;
$yieldPeriodS   = null;

// læs <yield>-noden (for period/period_s på selve blokken)
$yNode = ($a->xpath('yield')[0] ?? null);
if ($yNode) {
  if (isset($yNode['period_s'])) {
    $yieldPeriodS   = (int)$yNode['period_s'];
    $yieldPeriodStr = $yieldPeriodS . 's';
  } elseif (isset($yNode['period'])) {
    $yieldPeriodStr = (string)$yNode['period'];
    $yieldPeriodS   = parse_duration_to_seconds($yieldPeriodStr); // genbrug din parser
  }
}

$yields = [];
foreach ($a->xpath('yield/*') ?: [] as $p) {
  $row = ['type' => $p->getName()];
  foreach ($p->attributes() as $k => $v) {
    $val = (string)$v;
    $row[(string)$k] = is_numeric($val) ? $val + 0 : $val;
  }
  $yields[] = $row;
}

// Back-compat: hvis period ikke var sat på <yield>, så tjek per-res 'time'/'time_s'
if ($yieldPeriodS === null && $yields) {
  $unique = [];
  foreach ($yields as $r) {
    if (isset($r['time_s'])) {
      $unique[] = (int)$r['time_s'];
    } elseif (isset($r['time'])) {
      $parsed = parse_duration_to_seconds((string)$r['time']);
      if ($parsed !== null) $unique[] = $parsed;
    }
  }
  $unique = array_values(array_unique(array_filter($unique, fn($x) => $x !== null)));
  if (count($unique) === 1) {
    $yieldPeriodS   = (int)$unique[0];
    $yieldPeriodStr = $yieldPeriodS . 's';
    // fjern deprec. felter, så defs bliver rene
    foreach ($yields as &$r) { unset($r['time'], $r['time_s']); }
    unset($r);
  } elseif (count($unique) > 1) {
    // konfigurationsfejl i "fælles tick" model – valgfrit flag til debug
    $item['yield_period_error'] = 'mixed_per_res_times';
  }
}

if ($yields) {
  $item['yield'] = $yields;
  if ($yieldPeriodS !== null) {
    $item['yield_period_s']   = (int)$yieldPeriodS;   // canonical
    $item['yield_period_str'] = (string)$yieldPeriodStr; // til UI/debug
  }
}


    if (isset($b->durability)) $item['durability'] = (float)$b->durability;
    if (isset($b->upgradesTo)) $item['upgradesTo'] = trim((string)$b->upgradesTo);
    if (isset($b->require)) $item['require'] = trim((string)$b->require);

    // --- Normalize time/duration: prefer human strings like "1d", "1h 30m", "1d30m" ---
    $timeStr = null;
    if (isset($item['time'])) {
      $timeStr = (string)$item['time']; // attribute form
    } elseif (isset($b->time)) {
      $timeStr = trim((string)$b->time); // child node form
    }

    $secs = null;
    if ($timeStr !== null && $timeStr !== '') {
      // New system: parse tokens to seconds
      $secs = parse_duration_to_seconds($timeStr);
      if ($secs !== null) {
        $item['time_str']   = $timeStr; // keep human-readable for UI/debug
        unset($item['time']);           // remove raw to avoid duplicates
      }
    }

    if ($secs === null) {
      // Legacy compatibility: look for other duration-shaped fields
      $legacy = coerce_any_duration_to_seconds($a, $item);
      if ($legacy !== null) {
        $secs = $legacy;
        $item['time_str'] = isset($timeStr) && $timeStr !== '' ? $timeStr : (string)$legacy . 's';
      }
    }

    if ($secs === null) {
      // Final fallback: global default (testing-friendly)
      $secs = (int) DEFAULT_DURATION_SECONDS;
      $item['time_str'] = 'default:' . $secs . 's';
    }

    $item['duration_s'] = (int)$secs; // canonical seconds for system logic

    $out[$id] = $item;
  }
  return $out;
}



/* ======================= main ======================= */

if (WS_RUN_MODE === 'run') {
  try {
    // ... (ALT det der allerede står i din main)


try {
  $strict = isset($_GET['strict']) && (string)$_GET['strict'] === '1';
  $modeFlat = isset($_GET['flat']) && $_GET['flat'] === '1';
  $debug = isset($_GET['debug']) && $_GET['debug'] === '1';

  /* 1) config + dirs */
  $cfg = load_config_ini();
  $xmlDir  = resolve_dir((string)($cfg['dirs']['xml_dir']  ?? ''), 'data/xml');
  $langDir = resolve_dir((string)($cfg['dirs']['lang_dir'] ?? ''), 'data/lang');
  $langCode = (string)($cfg['game_data']['lang'] ?? 'da');

  /* 2) defs fra XML (rekursiv scan) */
  $defs = [
    'res' => [],
    'bld' => [],
    'rsd' => [],
    'rcp' => [],
    'add' => [],
    'ani' => [],
  ];
  $debugXml = [];

  $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS));
  foreach ($rii as $fileInfo) {
    if (!$fileInfo->isFile()) continue;
    if (strtolower($fileInfo->getExtension()) !== 'xml') continue;
    $path = $fileInfo->getPathname();

    $xml = @simplexml_load_file($path);
    if (!$xml) { $debug && $debugXml[] = ['file'=>$path,'error'=>'parse-failed']; continue; }

    $found = ['file'=>$path, 'resources'=>0, 'buildings'=>0, 'research'=>0, 'recipes'=>0, 'addons'=>0, 'animals'=>0];

    $resNodes = $xml->xpath('//resource') ?: [];
    if ($resNodes) {
      $pack = load_resources_xml($path);
      foreach ($pack as $id=>$obj) { $defs['res'][$id] = $obj; }
      $found['resources'] = count($resNodes);
    }

    $bldNodes = $xml->xpath('//building') ?: [];
    if ($bldNodes) {
      $pack = load_buildings_xml($path);
      foreach ($pack as $id=>$obj) { $defs['bld'][$id] = $obj; }
      $found['buildings'] = count($bldNodes);
    }

    $rsdNodes = $xml->xpath('//research') ?: [];
    if ($rsdNodes) {
      $pack = load_research_xml($path);
      foreach ($pack as $id=>$obj) { $defs['rsd'][$id] = $obj; }
      $found['research'] = count($rsdNodes);
    }

    $rcpNodes = $xml->xpath('//recipe') ?: [];
    if ($rcpNodes) {
      $pack = load_recipes_xml($path);
      foreach ($pack as $id=>$obj) { $defs['rcp'][$id] = $obj; }
      $found['recipes'] = count($rcpNodes);
    }

    $addNodes = $xml->xpath('//addon') ?: [];
    if ($addNodes) {
      $pack = load_addons_xml($path);
      foreach ($pack as $id=>$obj) { $defs['add'][$id] = $obj; }
      $found['addons'] = count($addNodes);
    }

    $addNodes = $xml->xpath('//animal') ?: [];
    if ($addNodes) {
      $pack = load_animals_xml($path);
      foreach ($pack as $id=>$obj) { $defs['ani'][$id] = $obj; }
      $found['animals'] = count($addNodes);
    }

    $debug && $debugXml[] = $found;
  }

  /* 3) lang */
  $langMap = load_lang_xml($langDir, $langCode);

  /* 4) state fra DB */
  $state = [];
  $uid = $_SESSION['uid'] ?? null;
  if ($uid) {
    $pdo = db();

    require_once __DIR__ . '/lib/yield.php';
apply_passive_yields_for_user((int)$uid);

    $st = $pdo->prepare("
      SELECT
        user_id      AS userId,
        username,
        email,
        created_at,
        last_login,
        world_id,
        map_id,
        field_id,
        x_coord      AS x,
        y_coord      AS y,
        is_active,
        currentstage,
        role
      FROM users
      WHERE user_id = ?
      LIMIT 1
    ");
    $st->execute([(int)$uid]);
    if ($row = $st->fetch()) $state['user'] = $row;

// 1) Læs alt fra unified inventory
$invRows = $pdo->prepare("SELECT res_id, amount FROM inventory WHERE user_id = ?");
$invRows->execute([$uid]);
$invRows = $invRows->fetchAll(PDO::FETCH_ASSOC);

// 2) Split til state.inv.solid / state.inv.liquid vha. defs.res[...].unit
$state['inv']['solid']  = [];
$state['inv']['liquid'] = [];

foreach ($invRows as $r) {
  $ridFull = (string)$r['res_id'];                   // "res.money"
  $key     = preg_replace('/^res\./', '', $ridFull); // "money"
  $unit    = strtolower((string)($defs['res'][$key]['unit'] ?? ''));

  if ($unit === 'l') {
    $state['inv']['liquid'][$key] = ($state['inv']['liquid'][$key] ?? 0) + (int)$r['amount'];
  } else {
    $state['inv']['solid'][$key]  = ($state['inv']['solid'][$key]  ?? 0) + (int)$r['amount'];
  }
}

/*    // Inventory (liquid/solid)
    $state['inv']['liquid'] = [];
    $qL = $pdo->prepare("SELECT res_id, amount FROM inventory_liquid WHERE user_id = ?");
    $qL->execute([(int)$uid]);
    foreach ($qL as $r) {
      $ridRaw = (string)$r['res_id'];
      $rid = (strncmp($ridRaw, 'res.', 4) === 0) ? substr($ridRaw, 4) : $ridRaw;
      $amt = is_numeric($r['amount']) ? ($r['amount'] + 0) : 0;
      $state['inv']['liquid'][$rid] = $amt;
    }

    $state['inv']['solid'] = [];
    $qS = $pdo->prepare("SELECT res_id, amount FROM inventory_solid WHERE user_id = ?");
    $qS->execute([(int)$uid]);
    foreach ($qS as $r) {
      $ridRaw = (string)$r['res_id'];
      $rid = (strncmp($ridRaw, 'res.', 4) === 0) ? substr($ridRaw, 4) : $ridRaw;
      $amt = is_numeric($r['amount']) ? ($r['amount'] + 0) : 0;
      $state['inv']['solid'][$rid] = $amt;
    }*/


    // 3) Hent rækker
    $state['bld'] = [];
    $sql = "SELECT bld_id, level, durability FROM buildings WHERE user_id = :uid";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':uid' => $uid]);
    $rows = $stmt->fetchAll();

    // 4) Byg træ: state/bld/<bld_id>.l<level>/DATA[]
    $bld = [];
    foreach ($rows as $r) {
        $key = sprintf((string)$r['bld_id'], (int)$r['level']);
        if (!isset($bld[$key])) $bld[$key] = [];
        $bld[$key][] = [
            'bld_id'     => (string)$r['bld_id'],
            'level'      => (int)$r['level'],
            'durability' => is_null($r['durability']) ? null : (float)$r['durability'],
        ];
        $state['bld'][$key] = $r;
    }

    // Henter add fra DB
    $state['add'] = [];
    $sql = "SELECT add_id, level FROM addon WHERE user_id = :uid";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':uid' => $uid]);
    $rows = $stmt->fetchAll();


    // Byg Add ind i state
        $add = [];
    foreach ($rows as $r) {
        $key = sprintf((string)$r['add_id'], (int)$r['level']);
        if (!isset($add[$key])) $add[$key] = [];
        $add[$key][] = [
            'add_id'     => (string)$r['add_id'],
            'level'      => (int)$r['level'],
                 ];
        $state['add'][$key] = $r;
    }   

        // Henter rsd fra DB
    $state['rsd'] = [];
    $sql = "SELECT rsd_id, level FROM research WHERE user_id = :uid";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':uid' => $uid]);
    $rows = $stmt->fetchAll();


    // Byg rsd ind i state
        $rsd = [];
    foreach ($rows as $r) {
        $key = sprintf((string)$r['rsd_id'], (int)$r['level']);
        if (!isset($add[$key])) $add[$key] = [];
        $add[$key][] = [
            'rsd_id'     => (string)$r['rsd_id'],
            'level'      => (int)$r['level'],
                 ];
        $state['rsd'][$key] = $r;
    }  

  }

// Normaliser defs['res'] til kort id ("water","wood"...)
if (!empty($defs['res'])) {
    $norm = [];
    foreach ($defs['res'] as $id => $row) {
        $bare = (strpos($id, 'res.') === 0) ? substr($id, 4) : $id;
        $norm[$bare] = $row;
    }
    $defs['res'] = $norm;
}

  /* MERGE SPROG NAVNE OG BESKRIVELSER IND I DEFS UNDER NØGLER */
if (!empty($defs['res'])) {
    foreach ($defs['res'] as $id => &$res) {
        $nKey = "res.$id.name"; // res.water.name
        $dKey = "res.$id.desc"; // res.water.desc
        if (isset($langMap[$nKey])) $res['name'] = $langMap[$nKey];
        if (isset($langMap[$dKey])) $res['desc'] = $langMap[$dKey];
    }
    unset($res);
}

  foreach ($defs['bld'] as $id => &$b) {
    $nKey = "bld.$id.name"; $dKey = "bld.$id.desc";
    if (isset($langMap[$nKey])) $b['name'] = $langMap[$nKey];
    if (isset($langMap[$dKey])) $b['desc'] = $langMap[$dKey];
  } unset($b);

  foreach ($defs['rsd'] as $id => &$r) {
    $nKey = "rsd.$id.name"; $dKey = "rsd.$id.desc";
    if (isset($langMap[$nKey])) $r['name'] = $langMap[$nKey];
    if (isset($langMap[$dKey])) $r['desc'] = $langMap[$dKey];
  } unset($r);

  foreach ($defs['rcp'] as $id => &$rc) {
    $nKey = "rcp.$id.name"; $dKey = "rcp.$id.desc";
    if (isset($langMap[$nKey])) $rc['name'] = $langMap[$nKey];
    if (isset($langMap[$dKey])) $rc['desc'] = $langMap[$dKey];
  } unset($rc);

  foreach ($defs['add'] as $id => &$ad) {
    $nKey = "add.$id.name"; $dKey = "add.$id.desc";
    if (isset($langMap[$nKey])) $ad['name'] = $langMap[$nKey];
    if (isset($langMap[$dKey])) $ad['desc'] = $langMap[$dKey];
  } unset($ad);

foreach ($defs['ani'] as $id => &$an) {
    $nKey = "ani.$id.name"; $dKey = "ani.$id.desc";
    if (isset($langMap[$nKey])) $an['name'] = $langMap[$nKey]; // Rettet fra $ad til $an
    if (isset($langMap[$dKey])) $an['desc'] = $langMap[$dKey]; // Rettet fra $ad til $an
  } unset($an); // Rettet fra $ad til $an

// ---- Compute caps (place AFTER config/defs/state are ready, BEFORE echo json) ----
// EFTER (tolerant mod dine faktiske nøgler)
$liquidBase = (int)(
  $config['start_limitations_cap']['storageLiquidCap']
  ?? $config['start_limitations_cap']['storageLiquidBaseCap']
  ?? 0
);

$solidBase = (int)(
  $config['start_limitations_cap']['storageSolidCap']
  ?? $config['start_limitations_cap']['storageSolidBaseCap']
  ?? 0
);

// === CAP-BEREGNING (PLACÉR SENT I alldata.php, FØR json_encode/jout) ===
// ---- CAPS: beregn used (vægtet med unitSpace) + base/bonus/total ----

// 0) Hjælpere
$getResDef = function(array $defsRes, string $key) {
  // accepter både "water" og "res.water"
  if (isset($defsRes[$key])) return $defsRes[$key];
  $rid = (strpos($key, 'res.') === 0) ? $key : "res.$key";
  if (isset($defsRes[$rid])) return $defsRes[$rid];
  $bare = (strpos($key, 'res.') === 0) ? substr($key, 4) : $key;
  return $defsRes[$bare] ?? null;
};

// 1) Inventory-kilder
$invLiq = $state['inv']['liquid'] ?? [];
$invSol = $state['inv']['solid']  ?? [];

// 2) Summer vægtet med unitSpace
$usedLiquid = 0.0;
$usedSolid  = 0.0;
$capWarns   = []; // debug: manglende defs/unitSpace

foreach ($invLiq as $key => $amount) {
  $def = $getResDef($defs['res'], (string)$key);
  if (!$def) { $capWarns[] = "No defs for liquid '$key'"; continue; }
  if (!isset($def['unitSpace'])) { $capWarns[] = "No unitSpace for liquid '$key'"; continue; }
  $usedLiquid += ((float)$amount) * ((float)$def['unitSpace']);
}
foreach ($invSol as $key => $amount) {
  $def = $getResDef($defs['res'], (string)$key);
  if (!$def) { $capWarns[] = "No defs for solid '$key'"; continue; }
  if (!isset($def['unitSpace'])) { $capWarns[] = "No unitSpace for solid '$key'"; continue; }
  $usedSolid += ((float)$amount) * ((float)$def['unitSpace']);
}

//--- UDREGN footprint used ud fra de bygninger man har
$availableFP = 0; // summerer alle positive footprints
$usedFP      = 0; // summerer alle negative footprints

foreach ($state['bld'] as $id => $val) {
    $key = preg_replace('/^bld\./', '', $id);

    if (isset($defs['bld'][$key]['stats']['footprint'])) {
        $fp = (int)$defs['bld'][$key]['stats']['footprint'];

        if ($fp > 0) {
            $availableFP += $fp;
        } elseif ($fp < 0) {
            $usedFP += $fp; // her bliver det negativt
        }
    }
}

foreach ($state['add'] as $id => $val) {
    $key = preg_replace('/^add\./', '', $id);

    if (isset($defs['add'][$key]['stats']['footprint'])) {
        $fp = (int)$defs['add'][$key]['stats']['footprint'];

        if ($fp > 0) {
            $availableFP += $fp;
        } elseif ($fp < 0) {
            $usedFP += $fp; // her bliver det negativt
        }
    }
}

//--- UDREGN animal_cap used ud fra de bygninger man har
$availableAC = 0; // summerer alle positive footprints
$usedAC     = 0; // summerer alle negative footprints

foreach ($state['bld'] as $id => $val) {
    $key = preg_replace('/^bld\./', '', $id);

    if (isset($defs['bld'][$key]['stats']['animal_cap'])) {
        $ac = (int)$defs['bld'][$key]['stats']['animal_cap'];

        if ($ac > 0) {
            $availableAC += $ac;
        } elseif ($ac < 0) {
            $usedAC += $ac; // her bliver det negativt
        }
    }
}

foreach ($state['add'] as $id => $val) {
    $key = preg_replace('/^add\./', '', $id);

    if (isset($defs['add'][$key]['stats']['animal_cap'])) {
        $ac = (int)$defs['add'][$key]['stats']['animal_cap'];

        if ($ac > 0) {
            $availableAC += $ac;
        } elseif ($ac < 0) {
            $usedAC += $ac; // her bliver det negativt
        }
    }
}

// 3) Base fra config (tolerér begge navne)
$CONFIG = isset($config) ? $config : (isset($cfg) ? $cfg : []);
$liquidBase = (int)(
  $CONFIG['start_limitations_cap']['storageLiquidCap']
  ?? $CONFIG['start_limitations_cap']['storageLiquidBaseCap']
  ?? 0
);
$solidBase = (int)(
  $CONFIG['start_limitations_cap']['storageSolidCap']
  ?? $CONFIG['start_limitations_cap']['storageSolidBaseCap']
  ?? 0
);

$footprintBase = (int)(
  $CONFIG['start_limitations_cap']['footprintBaseCap']
  ?? $CONFIG['start_limitations_cap']['footprintBaseCap']
  ?? 0
);

$animalBaseCap = (int)(
  $CONFIG['start_limitations_cap']['animalBaseCap']
  ?? $CONFIG['start_limitations_cap']['animalBaseCap']
  ?? 0
);

// 4) Bonus (udvid senere)
$bonusLiquid = 0;
$bonusSolid  = 0;
$bonusFootprint  = $availableFP;
$usedFootprint = $usedFP;
$bonusAnimalCap  = $availableAC;
$usedAnimalCap = $usedAC;

// 5) Sæt i state
$state['cap'] = [
  'liquid' => [
    'base'  => $liquidBase,
    'bonus' => $bonusLiquid,
    'total' => $liquidBase + $bonusLiquid,
    'used'  => $usedLiquid,
  ],
  'solid' => [
    'base'  => $solidBase,
    'bonus' => $bonusSolid,
    'total' => $solidBase + $bonusSolid,
    'used'  => $usedSolid,
  ],
    'footprint' => [
    'base'  => $footprintBase,
    'bonus' => $bonusFootprint,
    'total' => $footprintBase + $bonusFootprint,
    'used'  => $usedFootprint,
  ],
    'animal_cap' => [
    'base'  => $animalBaseCap,
    'bonus' => $bonusAnimalCap,
    'total' => $animalBaseCap + $bonusAnimalCap,
    'used'  => $usedAnimalCap,
  ],
];

// (valgfrit) smid advarsler med i debug-output
if (!empty($_GET['debug']) && $capWarns) {
  $state['__cap_warnings'] = $capWarns;
}

// === SLUT CAP-BEREGNING ===

  
  /* 6) output: nested by default; flat with ?flat=1 */
  if ($modeFlat) {
    $kv = [];
    flatten_into($kv, $defs,  'defs',   $strict);
    flatten_into($kv, $state, 'state',  $strict);
    flatten_into($kv, $cfg,   'config', $strict);
    foreach ($langMap as $k=>$v) kv_put($kv, 'lang.'.$k, $v, $strict);
    if ($debug) {
      $kv['__debug.xml_dir']  = $xmlDir;
      $kv['__debug.xml_scan'] = $debugXml;
    }
    jout(true, $kv);
  } else {
    $out = [
      'defs'   => $defs,
      'state'  => $state,
      'lang'   => $langMap,
      'config' => $cfg
    ];
    if ($debug) {
      $out['__debug'] = [
        'xml_dir'  => $xmlDir,
        'xml_scan' => $debugXml
      ];
    }
    jout(true, $out);
  }

} catch (Throwable $e) {
  jerr('E_SERVER', $e->getMessage(), 500);
}
    jout(true, $out);
  } catch (Throwable $e) {
    jerr('E_SERVER', $e->getMessage(), 500);
  }
}