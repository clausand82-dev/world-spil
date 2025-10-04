<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/capacity_usage.php';

header('Content-Type: application/json; charset=utf-8');

function respond($p, int $http=200): never {
  http_response_code($http);
  echo json_encode(['ok'=>true,'data'=>$p], JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $code, string $msg, int $http=400): never {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], JSON_UNESCAPED_UNICODE);
  exit;
}

/** Tabel-kolonne check (bruges til at undgå at røre lastupdated). */
function table_has_column(PDO $pdo, string $table, string $column): bool {
  $sql = "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
  $st = $pdo->prepare($sql);
  $st->execute([$table, $column]);
  return (bool)$st->fetchColumn();
}

/** Indlæs defs-branches; fallback til load_all_defs() hvis globals mangler. */
function _load_defs_branches(): array {
  $defs = $GLOBALS['DEFS'] ?? ($GLOBALS['defs'] ?? null);
  if (!is_array($defs) || empty($defs)) {
    try {
      $defs = load_all_defs();
      $GLOBALS['DEFS'] = $defs;
    } catch (Throwable $e) {
      $defs = [];
    }
  }
  $bld = is_array($defs) && isset($defs['bld']) ? $defs['bld'] : [];
  $add = is_array($defs) && isset($defs['add']) ? $defs['add'] : [];
  $rsd = is_array($defs) && isset($defs['rsd']) ? $defs['rsd'] : [];
  $ani = is_array($defs) && isset($defs['ani']) ? $defs['ani'] : [];
  $res = is_array($defs) && isset($defs['res']) ? $defs['res'] : [];
  $cfg = is_array($defs) && isset($defs['state']['config']) ? $defs['state']['config'] : [];
  return [$bld, $add, $rsd, $ani, $res, $cfg];
}

/** Summer kapacitet fra defs/tabeller for en rolle. */
function sum_role_capacity(PDO $pdo, int $uid, array $branches, array $keyVariants): int {
  [$bld, $add, $rsd, $ani, $res] = $branches;
  $sum = 0.0;
  if (cu_table_exists($pdo,'buildings'))     $sum += cu_sum_capacity_from_table($pdo, $uid, $bld, 'buildings', 'bld_id', 'level', $keyVariants);
  if (cu_table_exists($pdo,'addon'))         $sum += cu_sum_capacity_from_table($pdo, $uid, $add, 'addon',     'add_id', 'level', $keyVariants);
  if (cu_table_exists($pdo,'user_research')) $sum += cu_sum_capacity_from_research($pdo, $uid, $rsd, $keyVariants);
  if (cu_table_exists($pdo,'animals'))       $sum += cu_sum_capacity_from_animals($pdo, $uid, $ani, $keyVariants);
  if (cu_table_exists($pdo,'inventory'))     $sum += cu_sum_capacity_from_inventory($pdo, $uid, $res, $keyVariants);
  return (int)floor($sum);
}

/** Læs citizens-rækken for bruger. */
function load_citizens_row(PDO $pdo, int $uid): array {
  $st = $pdo->prepare("SELECT * FROM citizens WHERE user_id=? LIMIT 1");
  $st->execute([$uid]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) {
    $pdo->prepare("INSERT INTO citizens (user_id) VALUES (?)")->execute([$uid]);
    $st->execute([$uid]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
  }
  foreach ($row as $k => $v) {
    if (is_numeric($v)) $row[$k] = (int)$v;
  }
  return $row;
}

/** Politician max: "X,Y" => maks Y pr. påbegyndt X borgere. */
function compute_politician_max(array $config, array $cit): int {
  $raw = $config['student']['politicianMax'] ?? '100,2';
  if (!is_string($raw)) $raw = strval($raw);
  $parts = array_map('trim', explode(',', $raw));
  $X = max(1, (int)($parts[0] ?? 100));
  $Y = max(0, (int)($parts[1] ?? 2));
  $total = 0;
  $keys = ['baby','kidsStreet','kidsStudent','youngWorker','youngStudent','old','adultsPolice','adultsFire','adultsHealth','adultsSoldier','adultsGovernment','adultsPolitician','adultsWorker','adultsUnemployed','adultsHomeless'];
  foreach ($keys as $k) $total += (int)($cit[$k] ?? 0);
  return (int)(ceil($total / $X) * $Y);
}

/** Enkel crime-fordeling (baseline + arbejdsløshed/housing/provision + police suppression). */
function compute_crime_distribution(array $newCit, array $ratios): array {
  $adultKeys = ['adultsUnemployed','adultsWorker','adultsPolice','adultsFire','adultsHealth','adultsGovernment','adultsPolitician','adultsHomeless'];
  $adultsTotal = 0; foreach ($adultKeys as $k) $adultsTotal += (int)($newCit[$k] ?? 0);
  $unempRatio = $adultsTotal > 0 ? ((int)$newCit['adultsUnemployed'] / $adultsTotal) : 0.0;
  $polSuppression = $adultsTotal > 0 ? ((int)$newCit['adultsPolice'] / $adultsTotal) : 0.0;

  $baseline = 0.03;
  $r = $baseline + 0.6*$unempRatio + 0.2*max(0.0, 1.0 - ($ratios['provision'] ?? 1.0)) + 0.2*max(0.0, 1.0 - ($ratios['housing'] ?? 1.0)) - 0.6*$polSuppression;
  $r = max(0.0, min(0.25, $r));

    $minBaseline = 0.005; // 0.5% minimum crime rate
  $r = max($r, $minBaseline);

  $W = [
    'adultsUnemployed' => 1.35,
    'adultsWorker'     => 1.00,
    'adultsPolice'     => 0.60,
    'adultsFire'       => 0.40,
    'adultsHealth'     => 0.45,
    'adultsGovernment' => 1.15,
    'adultsPolitician' => 1.40,
    'adultsHomeless'   => 1.70,
  ];

  $crime = [
    'crimeUnemployed'=>0,'crimeWorker'=>0,'crimePolice'=>0,'crimeFire'=>0,'crimeHealth'=>0,'crimeGovernment'=>0,'crimePolitician'=>0,'crimeHomeless'=>0,
  ];

  foreach ($W as $role => $w) {
    $n = (int)($newCit[$role] ?? 0);
    if ($n <= 0) continue;
    $rw = $r * $w;
    $jitter = (mt_rand(-20, 20) / 100.0);
    $rate = max(0.0, $rw * (1.0 + $jitter));
    $target = (int)round($n * $rate);
    $ckey = 'crime' . substr($role, strlen('adults'));
    $crime[$ckey] = max(0, min($target, $n));
  }

  foreach ($crime as $ckey => $val) {
    $aKey = 'adults' . substr($ckey, strlen('crime'));
    $crime[$ckey] = max(0, min((int)$val, (int)($newCit[$aKey] ?? 0)));
  }

  return $crime;
}

/** Læs simple housing/provision kapaciteter til ratioer (bruges også til rehousing). */
function compute_basic_ratios(PDO $pdo, int $uid, array $branches): array {
  [$bld,$add,$rsd,$ani,$res] = $branches;
  $provCap = 0.0; $houseCap = 0.0;
  $provKeys = ['provisionCapacity','provision_cap'];
  $houseKeys = ['housingCapacity','housing'];
  if (cu_table_exists($pdo,'buildings')) { $provCap += cu_sum_capacity_from_table($pdo,$uid,$bld,'buildings','bld_id','level',$provKeys); $houseCap += cu_sum_capacity_from_table($pdo,$uid,$bld,'buildings','bld_id','level',$houseKeys); }
  if (cu_table_exists($pdo,'addon'))     { $provCap += cu_sum_capacity_from_table($pdo,$uid,$add,'addon','add_id','level',$provKeys); $houseCap += cu_sum_capacity_from_table($pdo,$uid,$add,'addon','add_id','level',$houseKeys); }
  if (cu_table_exists($pdo,'user_research')) { $provCap += cu_sum_capacity_from_research($pdo,$uid,$rsd,$provKeys); $houseCap += cu_sum_capacity_from_research($pdo,$uid,$rsd,$houseKeys); }
  if (cu_table_exists($pdo,'animals'))   { $provCap += cu_sum_capacity_from_animals($pdo,$uid,$ani,$provKeys); $houseCap += cu_sum_capacity_from_animals($pdo,$uid,$ani,$houseKeys); }
  if (cu_table_exists($pdo,'inventory')) { $provCap += cu_sum_capacity_from_inventory($pdo,$uid,$res,$provKeys); $houseCap += cu_sum_capacity_from_inventory($pdo,$uid,$res,$houseKeys); }
  return ['provisionCapacity'=>$provCap, 'housingCapacity'=>$houseCap];
}

/** Byg caps til sliders (STRIKS pr. rolle – ingen generiske felter blandes ind). */
function build_caps(PDO $pdo, int $uid, array $branches): array {
  $caps = [];
  // Kun rolle-specifikke kapacitetsnøgler
  $caps['adultsPoliceCapacity']     = sum_role_capacity($pdo,$uid,$branches, ['adultsPoliceCapacity','police_cap']);
  $caps['adultsFireCapacity']       = sum_role_capacity($pdo,$uid,$branches, ['adultsFireCapacity','fire_cap']);
  $caps['adultsHealthCapacity']     = sum_role_capacity($pdo,$uid,$branches, ['adultsHealthCapacity','health_adults_cap','healthAdultsCapacity']);
  $caps['adultsSoldierCapacity']    = sum_role_capacity($pdo,$uid,$branches, ['adultsSoldierCapacity','soldier_cap']);
  $caps['adultsGovernmentCapacity'] = sum_role_capacity($pdo,$uid,$branches, ['adultsGovernmentCapacity','government_cap','goverment_cap']);
  $caps['adultsPoliticianCapacity'] = sum_role_capacity($pdo,$uid,$branches, ['adultsPoliticianCapacity','politician_cap']);
  $caps['adultsWorkerCapacity']     = sum_role_capacity($pdo,$uid,$branches, ['adultsWorkerCapacity','worker_cap']);

  // Studenter-kapaciteter (bruges både til clamp ned og “fyld op”)
  $caps['kidsStudentCapacity']      = sum_role_capacity($pdo,$uid,$branches, ['kidsStudentCapacity']);
  $caps['youngStudentCapacity']     = sum_role_capacity($pdo,$uid,$branches, ['youngStudentCapacity']);
  return $caps;
}

/** Auto-korriger students mod caps (overflow -> street/worker). (Uændret) */
function adjust_students_against_caps(array &$c, array $caps): void {
  $ksCap = max(0, (int)($caps['kidsStudentCapacity'] ?? 0));
  $ysCap = max(0, (int)($caps['youngStudentCapacity'] ?? 0));
  $ks = (int)($c['kidsStudent'] ?? 0);
  if ($ks > $ksCap) { $over = $ks - $ksCap; $c['kidsStudent'] = $ksCap; $c['kidsStreet'] = max(0, (int)($c['kidsStreet'] ?? 0) + $over); }
  $ys = (int)($c['youngStudent'] ?? 0);
  if ($ys > $ysCap) { $over = $ys - $ysCap; $c['youngStudent'] = $ysCap; $c['youngWorker'] = max(0, (int)($c['youngWorker'] ?? 0) + $over); }
}

/** NYT: Fyld students op til kapacitet (underflow -> træk fra street/worker). */
function fill_students_to_capacity(array &$c, array $caps): void {
  // Kids: flyt fra kidsStreet -> kidsStudent
  $ksCap = max(0, (int)($caps['kidsStudentCapacity'] ?? 0));
  $ks    = max(0, (int)($c['kidsStudent'] ?? 0));
  $kStreet = max(0, (int)($c['kidsStreet'] ?? 0));
  if ($ks < $ksCap && $kStreet > 0) {
    $need = $ksCap - $ks;
    $move = min($need, $kStreet);
    if ($move > 0) {
      $c['kidsStudent'] = $ks + $move;
      $c['kidsStreet']  = $kStreet - $move;
    }
  }

  // Young: flyt fra youngWorker -> youngStudent
  $ysCap = max(0, (int)($caps['youngStudentCapacity'] ?? 0));
  $ys    = max(0, (int)($c['youngStudent'] ?? 0));
  $yWork = max(0, (int)($c['youngWorker'] ?? 0));
  if ($ys < $ysCap && $yWork > 0) {
    $need = $ysCap - $ys;
    $move = min($need, $yWork);
    if ($move > 0) {
      $c['youngStudent'] = $ys + $move;
      $c['youngWorker']  = $yWork - $move;
    }
  }
}

/** GET handler (uændret bortset fra build_caps ovenfor) */
function handle_get(PDO $pdo, int $uid): void {
  [$bld,$add,$rsd,$ani,$res,$cfg] = _load_defs_branches();
  $branches = [$bld,$add,$rsd,$ani,$res];

  $cit = load_citizens_row($pdo, $uid);
  $caps = build_caps($pdo, $uid, $branches);
  $polMax = compute_politician_max($cfg, $cit);

  respond([
    'citizens' => $cit,
    'caps'     => [
      'adultsPoliceCapacity'     => $caps['adultsPoliceCapacity'],
      'adultsFireCapacity'       => $caps['adultsFireCapacity'],
      'adultsHealthCapacity'     => $caps['adultsHealthCapacity'],
      'adultsSoldierCapacity'    => $caps['adultsSoldierCapacity'],
      'adultsGovernmentCapacity' => $caps['adultsGovernmentCapacity'],
      'adultsPoliticianCapacity' => $caps['adultsPoliticianCapacity'],
      'adultsWorkerCapacity'     => $caps['adultsWorkerCapacity'],
      'kidsStudentCapacity'      => $caps['kidsStudentCapacity'],
      'youngStudentCapacity'     => $caps['youngStudentCapacity'],
    ],
    'limits'   => [ 'politicianMax' => $polMax ],
  ]);
}

/** POST */
function handle_post(PDO $pdo, int $uid): void {
  [$bld,$add,$rsd,$ani,$res,$cfg] = _load_defs_branches();
  $branches = [$bld,$add,$rsd,$ani,$res];

  $raw = file_get_contents('php://input') ?: '{}';
  $payload = json_decode($raw, true);
  if (!is_array($payload) || !isset($payload['assignments']) || !is_array($payload['assignments'])) {
    fail('E_PAYLOAD', 'Forventede { assignments: { adultsPolice, adultsFire, ... } }');
  }

  $cit = load_citizens_row($pdo, $uid);
  $caps = build_caps($pdo, $uid, $branches);
  $polMax = compute_politician_max($cfg, $cit);

  $roles = ['adultsPolice','adultsFire','adultsHealth','adultsSoldier','adultsGovernment','adultsPolitician','adultsWorker'];
  $req = [];
  foreach ($roles as $r) $req[$r] = max(0, (int)($payload['assignments'][$r] ?? 0));

  $warnings = [];

  // Clamp til caps (mindst nuværende)
  foreach ($roles as $r) {
    $capKey = $r . 'Capacity';
    $cap = (int)($caps[$capKey] ?? 0);
    $cap = max($cap, (int)$cit[$r]);
    if ($req[$r] > $cap) { $req[$r] = $cap; $warnings[] = "Clamped {$r} til cap={$cap}"; }
  }

  // Politician-regel
  if ($req['adultsPolitician'] > $polMax) {
    $req['adultsPolitician'] = $polMax;
    $warnings[] = "Clamped adultsPolitician til politicianMax={$polMax}";
  }

  // Ikke-hjemløse voksne og sum targets
  $totalAdults = (int)$cit['adultsUnemployed'] + (int)$cit['adultsWorker'] + (int)$cit['adultsPolice']
               + (int)$cit['adultsFire'] + (int)$cit['adultsHealth'] + (int)$cit['adultsSoldier']
               + (int)$cit['adultsGovernment'] + (int)$cit['adultsPolitician'] + (int)$cit['adultsHomeless'];

  $nonHomeless = $totalAdults - (int)$cit['adultsHomeless'];
  $sumTargets = 0; foreach ($roles as $r) $sumTargets += (int)$req[$r];

  if ($sumTargets > $nonHomeless) {
    $scale = $nonHomeless > 0 ? ($nonHomeless / $sumTargets) : 0.0;
    foreach ($roles as $r) $req[$r] = (int)floor($req[$r] * $scale);
    $warnings[] = "Nedskalerede valg for at matche tilgængelige voksne={$nonHomeless}";
    $sumTargets = 0; foreach ($roles as $r) $sumTargets += (int)$req[$r];
  }

  // Sæt ny adultsUnemployed som rest
  $newUnemp = max(0, $nonHomeless - $sumTargets);

  // Opbyg $newCit med adults* roller + unemployed rest
  $newCit = $cit;
  foreach ($roles as $r) $newCit[$r] = (int)$req[$r];
  $newCit['adultsUnemployed'] = (int)$newUnemp;

  // 1) Clamp elever ned mod cap (ingen overflow)
  adjust_students_against_caps($newCit, $caps);

  // 2) NYT: Fyld elever op mod cap (brug street/worker som kilde)
  fill_students_to_capacity($newCit, $caps);

  // Crime init baseret på ratior
  $capRatios  = compute_basic_ratios($pdo, $uid, $branches);
  $totalPersons = 0;
  foreach (['baby','kidsStreet','kidsStudent','youngWorker','youngStudent','old','adultsUnemployed','adultsWorker','adultsPolice','adultsFire','adultsHealth','adultsSoldier','adultsGovernment','adultsPolitician','adultsHomeless'] as $k) {
    $totalPersons += (int)($newCit[$k] ?? 0);
  }
  $ratios = [
    'provision' => ($capRatios['provisionCapacity'] ?? 0) > 0 ? min(2.0, ($capRatios['provisionCapacity'] / max(1, $totalPersons))) : 0.0,
    'housing'   => ($capRatios['housingCapacity']   ?? 0) > 0 ? min(2.0, ($capRatios['housingCapacity']   / max(1, $totalPersons))) : 0.0,
  ];
  $crime = compute_crime_distribution($newCit, $ratios);

  // Sikre crime ⊆ adults (før rehousing)
  foreach ($crime as $ckey => $val) {
    $aKey = 'adults' . substr($ckey, strlen('crime'));
    $crime[$ckey] = max(0, min((int)$val, (int)$newCit[$aKey]));
  }

  /* ========== REHOUSING BLOCK (homeless -> unemployed, hvis ledig housing) ========== */

  $housingCap = (int)floor($capRatios['housingCapacity'] ?? 0);
  $adultsHomeless = (int)($newCit['adultsHomeless'] ?? 0);
  $crimeHomeless  = (int)($crime['crimeHomeless'] ?? 0);

  // Housed persons = alle personer undtagen homeless
  $housedPersons = max(0, $totalPersons - $adultsHomeless);
  $freeHousing   = max(0, $housingCap - $housedPersons);

  if ($freeHousing > 0 && $adultsHomeless > 0) {
    $reh = min($adultsHomeless, $freeHousing);

    // Flyt proportional del af crimeHomeless med
    $movedCrime = $adultsHomeless > 0 ? (int)min($crimeHomeless, round($reh * ($crimeHomeless / $adultsHomeless))) : 0;

    // Udfør flyt
    $newCit['adultsHomeless']    = $adultsHomeless - $reh;
    $newCit['adultsUnemployed']  = (int)$newCit['adultsUnemployed'] + $reh;
    $crime['crimeHomeless']      = max(0, $crimeHomeless - $movedCrime);
    $crime['crimeUnemployed']    = (int)$crime['crimeUnemployed'] + $movedCrime;

    $warnings[] = "Rehoused {$reh} fra homeless til unemployed" . ($movedCrime > 0 ? " (heraf {$movedCrime} crime)" : "");
    // Opdater working vars til efterfølgende checks
    $adultsHomeless = (int)$newCit['adultsHomeless'];
    $crimeHomeless  = (int)$crime['crimeHomeless'];
  }

  // Tving konsistens: crimeHomeless må ikke overstige adultsHomeless
  if ($crimeHomeless > $adultsHomeless) {
    $overflow = $crimeHomeless - $adultsHomeless;
    // Flyt overflow som både voksne og crime fra homeless -> unemployed
    $moveAdults = min($overflow, $adultsHomeless); // normalt lig overflow, men guard
    if ($moveAdults > 0) {
      $newCit['adultsHomeless']    = max(0, $adultsHomeless - $moveAdults);
      $newCit['adultsUnemployed']  = (int)$newCit['adultsUnemployed'] + $moveAdults;
      $crime['crimeHomeless']      = max(0, $crimeHomeless - $moveAdults);
      $crime['crimeUnemployed']    = (int)$crime['crimeUnemployed'] + $moveAdults;
      $warnings[] = "Tvangsflyttede {$moveAdults} (crime) fra homeless til unemployed pga. crime>adults";
      $adultsHomeless = (int)$newCit['adultsHomeless'];
      $crimeHomeless  = (int)$crime['crimeHomeless'];
    }
  }

  // Endelig subset-clamp for berørte grupper efter flyt
  $crime['crimeHomeless']     = min((int)$crime['crimeHomeless'],    (int)$newCit['adultsHomeless']);
  $crime['crimeUnemployed']   = min((int)$crime['crimeUnemployed'],  (int)$newCit['adultsUnemployed']);

  /* ====================== SLUT REHOUSING BLOCK ====================== */

  // Gem alt (inkl. adultsHomeless) i én transaktion – rør ikke lastupdated
  $pdo->beginTransaction();
  try {
    $fields = array_merge($roles, ['adultsUnemployed','adultsHomeless','kidsStudent','kidsStreet','youngStudent','youngWorker']);
    $crimeFields = array_keys($crime);
    $all = array_merge($fields, $crimeFields);

    $sets = []; $vals = [];
    foreach ($all as $f) { $sets[] = "{$f} = ?"; $vals[] = (int)($crime[$f] ?? $newCit[$f] ?? 0); }

    if (table_has_column($pdo, 'citizens', 'lastupdated')) {
      $sets[] = "lastupdated = lastupdated";
    }

    $vals[] = $uid;
    $sql = "UPDATE citizens SET " . implode(',', $sets) . " WHERE user_id = ?";
    $st = $pdo->prepare($sql);
    $st->execute($vals);

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    fail('E_DB', 'DB-fejl: ' . $e->getMessage(), 500);
  }

  respond([
    'applied'     => $req,
    'unemployed'  => (int)$newCit['adultsUnemployed'],
    'homeless'    => (int)$newCit['adultsHomeless'],
    'crime'       => $crime,
    'warnings'    => $warnings,
  ]);
}

try {
  $uid = auth_require_user_id(); $pdo = db();
  if ($_SERVER['REQUEST_METHOD'] === 'POST') handle_post($pdo, $uid);
  else handle_get($pdo, $uid);
} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}