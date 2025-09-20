<?php
declare(strict_types=1);

/**
 * Helper til base stage-bonus “en gang pr. time”.
 *
 * Offentlig API:
 * - compute_base_stage_bonus_delta(PDO $db, int $userId): array{ delta: array<string,float>, cycles:int }
 * - update_last_base_bonus_ts(PDO $db, int $userId, int $cycles): void
 */

function _bsb_root_backend(): string {
  return realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
}

function _bsb_load_config_ini(): array {
  $path = _bsb_root_backend() . '/data/config/config.ini';
  if (!is_file($path)) return [];
  $cfg = parse_ini_file($path, true, INI_SCANNER_TYPED);
  return is_array($cfg) ? $cfg : [];
}

/** Find xml-dir fra config.ini eller brug fallback backend/data/xml */
function _bsb_xml_dir(): string {
  $cfg = _bsb_load_config_ini();
  $dir = (string)($cfg['dirs']['xml_dir'] ?? 'data/xml');
  // relativ sti → relativ ift. backend/
  if (!preg_match('~^(?:[A-Za-z]:)?[\/\\\\]~', $dir)) {
    $dir = rtrim(_bsb_root_backend(), '/\\') . DIRECTORY_SEPARATOR . $dir;
  }
  $real = realpath($dir);
  return ($real && is_dir($real)) ? $real : (rtrim(_bsb_root_backend(), '/\\') . '/data/xml');
}

/** Parse <stage> bonus-regler fra en XML-fil. */
function _bsb_parse_stage_bonus_rules_from_xml(SimpleXMLElement $xml): array {
  $out = [];
  foreach ($xml->xpath('//stage') ?: [] as $stage) {
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
        $rid = str_starts_with($rid, 'res.') ? $rid : "res.$rid";
        $bucket[$key][] = $rid;
      }
    }
    $out[$sid] = $bucket;
  }
  return $out;
}

/** Scan alle XML-filer i xml-dir og merge alle stage-regler. */
function _bsb_load_all_stage_bonus_rules(): array {
  $dir = _bsb_xml_dir();
  $rules = [];
  $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
  foreach ($rii as $info) {
    if (!$info->isFile() || strtolower($info->getExtension()) !== 'xml') continue;
    $xml = @simplexml_load_file($info->getPathname());
    if (!$xml) continue;
    $one = _bsb_parse_stage_bonus_rules_from_xml($xml);
    if ($one) $rules = array_replace_recursive($rules, $one);
  }
  return $rules;
}

/**
 * Returnér delta pr. ressource og antal hele timer, der kan krediteres.
 * - Sætter INGEN felter i DB (det gør update_last_base_bonus_ts).
 * - Krediterer KUN hele timer (intdiv(elapsed, 3600)).
 *
 * return ['delta' => ['res.wood' => 3.0, ...], 'cycles' => 3]
 */
function compute_base_stage_bonus_delta(PDO $db, int $userId): array {
  // Hent brugerdata
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
    // Initialize: sæt til nu og spring udbetaling over første gang
    $init = $db->prepare("UPDATE users SET last_base_bonus_ts_utc = UTC_TIMESTAMP() WHERE user_id = ?");
    $init->execute([$userId]);
    return ['delta' => [], 'cycles' => 0];
  }

  try {
    $last = new DateTime($lastStr, new DateTimeZone('UTC'));
  } catch (Throwable $e) {
    // Hvis korrupt værdi — reset til nu
    $fix = $db->prepare("UPDATE users SET last_base_bonus_ts_utc = UTC_TIMESTAMP() WHERE user_id = ?");
    $fix->execute([$userId]);
    return ['delta' => [], 'cycles' => 0];
  }

  $elapsed = max(0, $now->getTimestamp() - $last->getTimestamp());
  $cycles = intdiv($elapsed, 3600);
  if ($cycles <= 0) return ['delta' => [], 'cycles' => 0];

  $stageId = (int)($u['currentstage'] ?? 0);
  if ($stageId <= 0) return ['delta' => [], 'cycles' => 0];

  $rulesAll = _bsb_load_all_stage_bonus_rules();
  $rules = $rulesAll[$stageId] ?? null;
  if (!$rules) return ['delta' => [], 'cycles' => 0];

  $bonuses = [
    'forest' => (float)($u['mul_forest'] ?? 0),
    'mining' => (float)($u['mul_mining'] ?? 0),
    'field'  => (float)($u['mul_field']  ?? 0),
    'water'  => (float)($u['mul_water']  ?? 0),
  ];

  $delta = [];
  foreach ($bonuses as $key => $amountPerHour) {
    if ($amountPerHour <= 0) continue;
    foreach (($rules[$key] ?? []) as $resId) {
      $delta[$resId] = ($delta[$resId] ?? 0.0) + ($amountPerHour * $cycles);
    }
  }

  return ['delta' => $delta, 'cycles' => $cycles];
}

/**
 * Fremryk last_base_bonus_ts_utc med n hele timer.
 * Kald KUN efter at delta er krediteret i inventory uden fejl.
 */
function update_last_base_bonus_ts(PDO $db, int $userId, int $cycles): void {
  if ($cycles <= 0) return;
  $stmt = $db->prepare("
    UPDATE users
       SET last_base_bonus_ts_utc = IFNULL(last_base_bonus_ts_utc, UTC_TIMESTAMP()),
           last_base_bonus_ts_utc = DATE_ADD(last_base_bonus_ts_utc, INTERVAL :cycles HOUR)
     WHERE user_id = :uid
  ");
  $stmt->execute([':cycles' => $cycles, ':uid' => $userId]);
}