<?php
declare(strict_types=1);

require_once __DIR__ . '/../alldata.php';
require_once __DIR__ . '/capacity_usage.php';

/* ===== Helpers: config/ini ===== */
function repro__root_backend(): string {
  $backend = realpath(__DIR__ . '/..');
  $backend = $backend ? realpath($backend . '/..') : null;
  return $backend ?: (__DIR__ . '/../../');
}
function repro__load_config_ini(): array {
  $path = repro__root_backend() . '/data/config/config.ini';
  if (!is_file($path)) return [];
  $cfg = parse_ini_file($path, true, INI_SCANNER_TYPED);
  return is_array($cfg) ? $cfg : [];
}

/* ===== Citizens IO ===== */
function repro__fetch_citizens_row(PDO $db, int $userId): array {
  $st = $db->prepare("SELECT * FROM citizens WHERE user_id = ? LIMIT 1");
  $st->execute([$userId]);
  return $st->fetch(PDO::FETCH_ASSOC) ?: [];
}
function repro__update_citizens_row(PDO $db, int $userId, array $next): void {
  $set = [];
  $args = [];
  foreach ($next as $k => $v) {
    if (in_array($k, ['id','user_id','lastupdated'], true)) continue;
    $set[] = "`$k` = ?";
    $args[] = (int)$v;
  }
  $set[] = "lastupdated = UTC_TIMESTAMP()";
  $sql = "UPDATE citizens SET " . implode(', ', $set) . " WHERE user_id = ?";
  $args[] = $userId;
  $db->prepare($sql)->execute($args);
}
function repro__get_last_tick_ts(PDO $db, int $userId): ?string {
  $st = $db->prepare("SELECT lastupdated FROM citizens WHERE user_id = ? LIMIT 1");
  $st->execute([$userId]);
  $ts = $st->fetchColumn();
  return $ts ? (string)$ts : null;
}
function repro__seconds_since(PDO $db, string $fromTs): int {
  $st = $db->prepare("SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, ?, UTC_TIMESTAMP()))");
  $st->execute([$fromTs]);
  return (int)$st->fetchColumn();
}

/* ===== Caps/usages for ratios/slack ===== */
function repro__read_core_caps_and_usage(PDO $db, int $userId, array $defs): array {
  $bld = $defs['bld'] ?? []; $add = $defs['add'] ?? []; $rsd = $defs['rsd'] ?? []; $ani = $defs['ani'] ?? []; $res = $defs['res'] ?? [];
  $caps = [];
  $caps['housing'] =
      (cu_table_exists($db,'buildings') ? cu_sum_capacity_from_table($db,$userId,$bld,'buildings','bld_id','level',['housingCapacity','housing']):0)
    + (cu_table_exists($db,'addon')     ? cu_sum_capacity_from_table($db,$userId,$add,'addon','add_id','level',['housingCapacity','housing']):0)
    + (cu_table_exists($db,'research')  ? cu_sum_capacity_from_research($db,$userId,$rsd,['housingCapacity','housing']):0)
    + (cu_table_exists($db,'animals')   ? cu_sum_capacity_from_animals($db,$userId,$ani,['housingCapacity','housing']):0)
    + (cu_table_exists($db,'inventory') ? cu_sum_capacity_from_inventory($db,$userId,$res,['housingCapacity','housing']):0);

  $caps['provision'] =
      (cu_table_exists($db,'buildings') ? cu_sum_capacity_from_table($db,$userId,$bld,'buildings','bld_id','level',['provisionCapacity','provision_cap']):0)
    + (cu_table_exists($db,'addon')     ? cu_sum_capacity_from_table($db,$userId,$add,'addon','add_id','level',['provisionCapacity','provision_cap']):0)
    + (cu_table_exists($db,'research')  ? cu_sum_capacity_from_research($db,$userId,$rsd,['provisionCapacity','provision_cap']):0)
    + (cu_table_exists($db,'animals')   ? cu_sum_capacity_from_animals($db,$userId,$ani,['provisionCapacity','provision_cap']):0)
    + (cu_table_exists($db,'inventory') ? cu_sum_capacity_from_inventory($db,$userId,$res,['provisionCapacity','provision_cap']):0);

  $caps['water'] =
      (cu_table_exists($db,'buildings') ? cu_sum_capacity_from_table($db,$userId,$bld,'buildings','bld_id','level',['waterCapacity']):0)
    + (cu_table_exists($db,'addon')     ? cu_sum_capacity_from_table($db,$userId,$add,'addon','add_id','level',['waterCapacity']):0)
    + (cu_table_exists($db,'research')  ? cu_sum_capacity_from_research($db,$userId,$rsd,['waterCapacity']):0)
    + (cu_table_exists($db,'animals')   ? cu_sum_capacity_from_animals($db,$userId,$ani,['waterCapacity']):0)
    + (cu_table_exists($db,'inventory') ? cu_sum_capacity_from_inventory($db,$userId,$res,['waterCapacity']):0);

  $caps['health'] =
      (cu_table_exists($db,'buildings') ? cu_sum_capacity_from_table($db,$userId,$bld,'buildings','bld_id','level',['healthCapacity']):0)
    + (cu_table_exists($db,'addon')     ? cu_sum_capacity_from_table($db,$userId,$add,'addon','add_id','level',['healthCapacity']):0)
    + (cu_table_exists($db,'research')  ? cu_sum_capacity_from_research($db,$userId,$rsd,['healthCapacity']):0)
    + (cu_table_exists($db,'animals')   ? cu_sum_capacity_from_animals($db,$userId,$ani,['healthCapacity']):0)
    + (cu_table_exists($db,'inventory') ? cu_sum_capacity_from_inventory($db,$userId,$res,['healthCapacity']):0);

  $citDefs = cu_load_defs_citizens($defs);
  $rawCit  = cu_fetch_citizens_row($db, $userId);
  $use = [];
  $use['housing']   = (float)(cu_usage_breakdown($rawCit, $citDefs, 'useHousing')['total']   ?? 0.0);
  $use['provision'] = (float)(cu_usage_breakdown($rawCit, $citDefs, 'useProvision')['total'] ?? 0.0);
  $use['water']     = (float)(cu_usage_breakdown($rawCit, $citDefs, 'useWater')['total']     ?? 0.0);
  $use['health']    = (float)(cu_usage_breakdown($rawCit, $citDefs, 'useHealth')['total']    ?? 0.0);

  return ['caps'=>$caps, 'use'=>$use];
}

/* ===== BirthRate fra citizens.xml ===== */
function repro__read_stat_from_node($node, string $key): float {
  if (!$node) return 0.0;
  if (is_array($node)) {
    $stats = $node['stats'] ?? null;
    if (is_array($stats) && isset($stats[$key]) && is_numeric($stats[$key])) return (float)$stats[$key];
    if (is_string($stats)) {
      $s = str_replace(["\xC2\xA0","\xEF\xBC\x9B","\xEF\xBC\x8C","\xE2\x80\x8B"],[' ',';',',',''], $stats);
      foreach (preg_split('/[;,]\s*/u', $s) as $p) {
        if (preg_match('/^\s*'.preg_quote($key,'/').'\s*=\s*([+-]?\d+(?:\.\d+)?)\s*$/u', $p, $m)) return (float)$m[1];
      }
    }
  }
  return 0.0;
}
function repro__normalize_def_key_to_citizen_field(string $key): string {
  // "young.worker" -> "youngWorker", "adults-unemployed" -> "adultsUnemployed"
  $parts = preg_split('/[\\.\\-_]+/', $key);
  if (!$parts || count($parts) === 0) return $key;
  $out = array_shift($parts);
  foreach ($parts as $p) $out .= ucfirst($p);
  return $out;
}
function repro__read_birth_rates(array $defs): array {
  $out = [];
  $cit = $defs['citizens'] ?? $defs['cit'] ?? [];
  foreach ($cit as $key => $node) {
    $rate = repro__read_stat_from_node($node, 'birthRate');
    $out[$key] = $rate;
    $norm = repro__normalize_def_key_to_citizen_field($key);
    if ($norm !== $key) $out[$norm] = $rate;
  }
  return $out;
}

/* ===== Math helpers ===== */
function repro__clampi(int $v, int $min=0): int { return $v < $min ? $min : $v; }
function repro__sum_groups(array $src, array $keys): int { $s=0; foreach ($keys as $k) $s+=(int)($src[$k]??0); return $s; }

/* Stochastic rounding: preserve fractional expected values across ticks.
   This avoids systematic loss when contributions << 1 per tick. */
function repro__stochastic_round(float $v): int {
  if ($v <= 0.0) return 0;
  $i = (int) floor($v);
  $frac = $v - $i;
  if ($frac <= 0.0) return $i;
  if (mt_rand(0, mt_getrandmax()) / mt_getrandmax() < $frac) return $i + 1;
  return $i;
}

/* Distribute an integer amount among subkeys proportional to existing counts, or evenly if none exist */
function repro__distribute_to_subkeys(array &$c, array $subkeys, int $amount): array {
  $res = array_fill_keys($subkeys, 0);
  if ($amount <= 0) return $res;
  $total = 0;
  foreach ($subkeys as $k) $total += max(0, (int)($c[$k] ?? 0));
  if ($total <= 0) {
    // split evenly
    $n = count($subkeys);
    $base = (int)floor($amount / $n);
    $left = $amount - $base*$n;
    foreach ($subkeys as $k) $res[$k] = $base;
    $i = 0;
    while ($left > 0) { $res[$subkeys[$i % $n]]++; $left--; $i++; }
    return $res;
  }
  // proportional distribution with stochastic rounding
  $allocated = 0;
  foreach ($subkeys as $k) {
    $ratio = max(0, (int)($c[$k] ?? 0)) / $total;
    $take = repro__stochastic_round($amount * $ratio);
    $res[$k] = $take;
    $allocated += $take;
  }
  // adjust difference
  if ($allocated > $amount) {
    $over = $allocated - $amount;
    foreach ($subkeys as $k) {
      if ($over <= 0) break;
      if ($res[$k] > 0) { $dec = min($res[$k], $over); $res[$k]-=$dec; $over-=$dec; }
    }
  } elseif ($allocated < $amount) {
    $left = $amount - $allocated;
    // give extras to largest groups
    uasort($res, function($a,$b){ return $b <=> $a; });
    foreach (array_keys($res) as $k) {
      if ($left<=0) break;
      $res[$k]++; $left--;
    }
  }
  return $res;
}

/* ===== Aging pipeline ===== */
function repro__age_pipeline(array &$c, array $cfgAging, float $intervalHours): array {
  $delta = [];

  $avg = [
    'babyToKids'   => max(1.0, (float)($cfgAging['avgHours.babyToKids']   ?? 48)),
    'kidsToYoung'  => max(1.0, (float)($cfgAging['avgHours.kidsToYoung']  ?? 96)),
    'youngToAdults'=> max(1.0, (float)($cfgAging['avgHours.youngToAdults']?? 120)),
    'adultsToOld'  => max(1.0, (float)($cfgAging['avgHours.adultsToOld']  ?? 480)),
  ];
  $f = [
    'b2k' => min(1.0, $intervalHours / $avg['babyToKids']),
    'k2y' => min(1.0, $intervalHours / $avg['kidsToYoung']),
    'y2a' => min(1.0, $intervalHours / $avg['youngToAdults']),
    'a2o' => min(1.0, $intervalHours / $avg['adultsToOld']),
  ];

  // Baby -> Kids (fordel til kidsStreet og kidsStudent) - stochastic rounding
  $b2k = repro__stochastic_round(($c['baby'] ?? 0) * $f['b2k']);
  $kidsSplit = repro__distribute_to_subkeys($c, ['kidsStreet','kidsStudent'], $b2k);
  $addStreet = $kidsSplit['kidsStreet']; $addStudent = $kidsSplit['kidsStudent'];
  $c['baby'] = repro__clampi(($c['baby'] ?? 0) - $b2k);
  $c['kidsStreet'] = ($c['kidsStreet'] ?? 0) + $addStreet;
  $c['kidsStudent'] = ($c['kidsStudent'] ?? 0) + $addStudent;
  $delta['baby'] = ($delta['baby'] ?? 0) - $b2k;
  $delta['kidsStreet'] = ($delta['kidsStreet'] ?? 0) + $addStreet;
  $delta['kidsStudent'] = ($delta['kidsStudent'] ?? 0) + $addStudent;

  // Kids -> Young (proportionalt fra kidsStreet/kidsStudent, fordeles til youngWorker/youngStudent)
  $kidsKeys = ['kidsStreet','kidsStudent'];
  $youngKeys = ['youngWorker','youngStudent'];
  $totalKids = array_sum(array_map(fn($k)=>$c[$k]??0, $kidsKeys));
  $k2y_float = $totalKids * $f['k2y'];
  $k2y = repro__stochastic_round($k2y_float);
  $fromKidsSplit = repro__distribute_to_subkeys(array_combine($kidsKeys, array_map(fn($k)=>$c[$k]??0, $kidsKeys)), $kidsKeys, $k2y);
  $c['kidsStreet'] = repro__clampi(($c['kidsStreet'] ?? 0) - $fromKidsSplit['kidsStreet']);
  $c['kidsStudent'] = repro__clampi(($c['kidsStudent'] ?? 0) - $fromKidsSplit['kidsStudent']);
  // When kids age to young, allocate into youngWorker/youngStudent proportionally to source kids types.
  // We'll distribute each source group's aged people into youngWorker/youngStudent proportional to current young subgroups.
  $toYoungTotal = $fromKidsSplit['kidsStreet'] + $fromKidsSplit['kidsStudent'];
  if ($toYoungTotal > 0) {
    // use existing young distribution as preference
    $youngExisting = array_sum(array_map(fn($k)=>$c[$k]??0, $youngKeys));
    // allocate proportionally to young subgroups, but prefer mapping kidsStreet -> youngWorker and kidsStudent -> youngStudent
    $addYoung = ['youngWorker'=>0,'youngStudent'=>0];
    // direct mapping heuristic
    $addYoung['youngWorker'] += $fromKidsSplit['kidsStreet'];
    $addYoung['youngStudent'] += $fromKidsSplit['kidsStudent'];
    // if any of addYoung are zero but youngExisting has capacity split some from the other bucket
    $c['youngWorker'] = ($c['youngWorker'] ?? 0) + $addYoung['youngWorker'];
    $c['youngStudent'] = ($c['youngStudent'] ?? 0) + $addYoung['youngStudent'];
    $delta['kidsStreet'] = ($delta['kidsStreet'] ?? 0) - $fromKidsSplit['kidsStreet'];
    $delta['kidsStudent'] = ($delta['kidsStudent'] ?? 0) - $fromKidsSplit['kidsStudent'];
    $delta['youngWorker'] = ($delta['youngWorker'] ?? 0) + $addYoung['youngWorker'];
    $delta['youngStudent'] = ($delta['youngStudent'] ?? 0) + $addYoung['youngStudent'];
  }

  // Young -> AdultsUnemployed (proportionalt fra youngWorker/youngStudent)
  $youngKeys = ['youngWorker','youngStudent'];
  $totalYoung = array_sum(array_map(fn($k)=>$c[$k]??0, $youngKeys));
  $y2a_float = $totalYoung * $f['y2a'];
  $y2a = repro__stochastic_round($y2a_float);
  $fromYoung = repro__distribute_to_subkeys($c, $youngKeys, $y2a);
  $c['youngWorker'] = repro__clampi(($c['youngWorker'] ?? 0) - $fromYoung['youngWorker']);
  $c['youngStudent'] = repro__clampi(($c['youngStudent'] ?? 0) - $fromYoung['youngStudent']);
  $c['adultsUnemployed'] = ($c['adultsUnemployed'] ?? 0) + $y2a;
  $delta['youngWorker'] = ($delta['youngWorker'] ?? 0) - $fromYoung['youngWorker'];
  $delta['youngStudent'] = ($delta['youngStudent'] ?? 0) - $fromYoung['youngStudent'];
  $delta['adultsUnemployed'] = ($delta['adultsUnemployed'] ?? 0) + $y2a;

  // Adults* -> Old (uændret, men husk at summer over alle adults-varianter)
  $adultKeys = ['adultsUnemployed','adultsWorker','adultsPolice','adultsFire','adultsHealth','adultsGovernment','adultsPolitician','adultsHomeless','adultsSoldier'];
  $adultsTotal = array_sum(array_map(fn($k)=>$c[$k]??0, $adultKeys));
  $a2o_float = $adultsTotal * $f['a2o'];
  $a2o = repro__stochastic_round($a2o_float);
  if ($a2o > 0) {
    $remaining = $a2o;
    foreach ($adultKeys as $k) {
      if ($remaining <= 0) break;
      $cnt = (int)($c[$k] ?? 0);
      if ($cnt <= 0) continue;
      $take = repro__stochastic_round($a2o * ($cnt / max(1, $adultsTotal)));
      if ($take <= 0) $take = 1;
      $take = min($take, $remaining, $cnt);
      $c[$k] = $cnt - $take;
      $c['old'] = ($c['old'] ?? 0) + $take;
      $delta[$k]   = ($delta[$k]   ?? 0) - $take;
      $delta['old']= ($delta['old']?? 0) + $take;
      $remaining -= $take;
    }
  }

  return $delta;
}

/* ===== Birth / migration / emigration / deaths / crime / homeless ===== */
function repro__compute_births(array $c, array $birthRates, array $cfgBirth, float $happiness01, float $popularity01, array $ratios): int {
  $raw = 0.0;
  foreach ($birthRates as $g => $br) {
    $cnt = (float)($c[$g] ?? 0);
    $raw += $cnt * (float)$br;
  }
  $lerp = fn($a,$b,$t) => $a + ($b - $a) * max(0.0, min(1.0, (float)$t));
  $mHappy = $lerp(0.6, 1.3, $happiness01);
  $mPop   = $lerp(0.8, 1.2, $popularity01);
  $slack = min(
    max(0.0, 1.0 - $ratios['housing']),
    max(0.0, 1.0 - $ratios['provision']),
    max(0.0, 1.0 - $ratios['water'])
  );
  $mCaps  = 1.0 - (1.0 - min(1.0, (float)($cfgBirth['capacityCeilingFactor'] ?? 1.0))) * (1.0 - $slack);
  $mHealth = 1.0;
  $healthRatio = $ratios['health'];
  if ($healthRatio > 1.0)      $mHealth = 0.5;
  elseif ($healthRatio > 0.95) $mHealth = 0.7;
  elseif ($healthRatio < 0.6)  $mHealth = 1.1;

  $val = $raw * $mHappy * $mPop * $mHealth * $mCaps;
  return repro__stochastic_round(max(0, $val));
}
function repro__compute_immigration(array $c, array $cfgImm, float $popularity01, array $ratios, float $unempRatio): int {
  $total=0; foreach ($c as $v) $total+=(int)$v; if ($total<=0) return 0;
  $basePer1000 = (float)($cfgImm['basePer1000'] ?? 3.0);
  $imm = $basePer1000 * $total / 1000.0;
  $mPop = 0.8 + 0.8 * $popularity01;
  $capSlack = min(max(0.0, 1.0 - $ratios['housing']), max(0.0, 1.0 - $ratios['provision']), max(0.0, 1.0 - $ratios['water']));
  $mCaps = 0.5 + 0.5 * $capSlack;
  $mUnemp = max(0.5, 1.0 - 0.8 * $unempRatio);
  $val = $imm * $mPop * $mCaps * $mUnemp;
  return repro__stochastic_round(max(0, $val));
}
function repro__compute_emigration(array $c, array $cfgEmi, float $happiness01, float $popularity01, array $ratios, float $unempRatio, float $crimeRatio): int {
  $total=0; foreach ($c as $v) $total+=(int)$v; if ($total<=0) return 0;
  $basePer1000 = (float)($cfgEmi['basePer1000'] ?? 1.0);
  $emi = $basePer1000 * $total / 1000.0;
  $def = max(0.0,$ratios['housing']-1.0)+max(0.0,$ratios['provision']-1.0)+max(0.0,$ratios['water']-1.0)+max(0.0,$ratios['health']-1.0);
  $def = min(3.0,$def);
  $mDef = 1.0 + 0.5*$def;
  $mHappy = 1.2 - 0.6*$happiness01;
  $mPop   = 1.2 - 0.6*$popularity01;
  $mUnemp = 1.0 + 0.8*$unempRatio;
  $mCrime = 1.0 + 0.6*$crimeRatio;
  $val = $emi * $mDef * $mHappy * $mPop * $mUnemp * $mCrime;
  return repro__stochastic_round(max(0, $val));
}
function repro__compute_deaths_by_group(array $c, array $cfgDeath, array $ratios, float $crimeRatio, float $homelessRatio): array {
  $base = [
    'baby'  => (float)($cfgDeath['basePer1000.baby']   ?? 0.2),
    'kids'  => (float)($cfgDeath['basePer1000.kids']   ?? 0.1),
    'young' => (float)($cfgDeath['basePer1000.young']  ?? 0.2),
    'adults'=> (float)($cfgDeath['basePer1000.adults'] ?? 0.3),
    'old'   => (float)($cfgDeath['basePer1000.old']    ?? 3.0),
  ];
  $mH = 1.0 + 0.5 * max(0.0, $ratios['health'] - 1.0);
  $mD = 1.0 + 0.2 * max(0.0,$ratios['provision']-1.0) + 0.2 * max(0.0,$ratios['water']-1.0);
  $mC = 1.0 + 0.5 * $crimeRatio;
  $mHomeless = 1.0 + 0.4 * $homelessRatio;

  $deaths = [];

  // baby
  $deaths['baby'] = repro__stochastic_round((($c['baby']  ?? 0) * ($base['baby']  /1000.0) * $mH * $mD));

  // kids: distribute between kidsStreet and kidsStudent
  $kidsTotal = (($c['kidsStreet'] ?? 0) + ($c['kidsStudent'] ?? 0));
  $kidsDeathsTotal = repro__stochastic_round($kidsTotal * ($base['kids']/1000.0) * $mH * $mD);
  $kidsSplit = repro__distribute_to_subkeys($c, ['kidsStreet','kidsStudent'], $kidsDeathsTotal);
  $deaths['kidsStreet'] = $kidsSplit['kidsStreet'];
  $deaths['kidsStudent'] = $kidsSplit['kidsStudent'];

  // young: distribute between youngWorker and youngStudent
  $youngTotal = (($c['youngWorker'] ?? 0) + ($c['youngStudent'] ?? 0));
  $youngDeathsTotal = repro__stochastic_round($youngTotal * ($base['young']/1000.0) * $mH * $mD);
  $youngSplit = repro__distribute_to_subkeys($c, ['youngWorker','youngStudent'], $youngDeathsTotal);
  $deaths['youngWorker'] = $youngSplit['youngWorker'];
  $deaths['youngStudent'] = $youngSplit['youngStudent'];

  // old
  $deaths['old'] = repro__stochastic_round((($c['old']   ?? 0) * ($base['old']   /1000.0) * $mH * $mD * 1.2));

  // adults (aggregate across adult subgroups)
  $adultKeys = ['adultsUnemployed','adultsWorker','adultsPolice','adultsFire','adultsHealth','adultsGovernment','adultsPolitician','adultsHomeless'];
  $adultsTotal = repro__sum_groups($c, $adultKeys);
  $adultsDeathsAll = repro__stochastic_round($adultsTotal * ($base['adults']/1000.0) * $mH * $mD * $mC * $mHomeless);
  $remaining = $adultsDeathsAll;
  foreach ($adultKeys as $k) {
    if ($remaining <= 0) break;
    $cnt = (int)($c[$k] ?? 0);
    if ($cnt <= 0) continue;
    $take = repro__stochastic_round($adultsDeathsAll * ($cnt / max(1,$adultsTotal)));
    $take = min($take, $cnt, $remaining);
    if ($take <= 0 && $remaining > 0 && $cnt > 0) $take = 1;
    $deaths[$k] = ($deaths[$k] ?? 0) + $take;
    $remaining -= $take;
  }
  return $deaths;
}
function repro__redistribute_crime(array &$c, array $cfgCrime, float $housingDef, float $provDef, float $waterDef): array {
  $adultKeys = ['adultsUnemployed','adultsWorker','adultsPolice','adultsFire','adultsHealth','adultsGovernment','adultsPolitician','adultsHomeless'];
  $crimeKeys = ['crimeUnemployed','crimeWorker','crimePolice','crimeFire','crimeHealth','crimeGovernment','crimePolitician','crimeHomeless'];
  $baseline = max(0.0, min(1.0, (float)($cfgCrime['baseline'] ?? 0.03)));
  $adultsTotal = repro__sum_groups($c, $adultKeys);
  $unemp = $adultsTotal>0 ? (($c['adultsUnemployed'] ?? 0)/$adultsTotal) : 0.0;
  $suppression = min(0.5, (($c['adultsPolice'] ?? 0)/max(1,$adultsTotal)) * 1.5);
  $ratio = $baseline + 0.6*$unemp + 0.4*max(0.0,$housingDef) + 0.3*max(0.0,$provDef) + 0.2*max(0.0,$waterDef) - 0.8*$suppression;
  $ratio = max((float)($cfgCrime['minRatio'] ?? 0.0), min((float)($cfgCrime['maxRatio'] ?? 0.5), $ratio));

  $res=[];
  foreach ($adultKeys as $i=>$g) {
    $cnt = (int)($c[$g] ?? 0);
    $res[$crimeKeys[$i]] = (int)floor($cnt * $ratio);
  }
  return $res;
}
function repro__rehousing(array &$c, float $housingSlack): array {
  $moved = 0;
  if ($housingSlack > 0.0) {
    $canHost = (int)floor($housingSlack);
    $homeless = (int)($c['adultsHomeless'] ?? 0);
    if ($homeless > 0 && $canHost > 0) {
      $move = min($homeless, $canHost);
      $c['adultsHomeless'] -= $move;
      $c['adultsUnemployed'] = ($c['adultsUnemployed'] ?? 0) + $move;
      $moved = $move;
    }
  }
  return ['rehoused'=>$moved];
}

/* ===== Public API ===== */
function apply_citizens_reproduction_for_user(int $userId, ?array $defs=null, ?array $state=null): array {
  $db  = db();
  $cfg = repro__load_config_ini();
  $intervalH = (float)($cfg['reproduction']['citizensReproductionInterval'] ?? 1.0);
  if ($intervalH <= 0) $intervalH = 1.0;
  if (!$defs) $defs = load_all_defs();

  $lastTs = repro__get_last_tick_ts($db, $userId);
  if (!$lastTs) {
    $row = repro__fetch_citizens_row($db, $userId);
    if (!$row) return ['ok'=>false,'reason'=>'NO_CITIZENS_ROW'];
    repro__update_citizens_row($db, $userId, $row);
    return ['ok'=>true,'cycles'=>0,'message'=>'Initialized citizens.lastupdated'];
  }

  $elapsedS = repro__seconds_since($db, $lastTs);
  $cycles = (int)floor($elapsedS / (3600.0 * $intervalH));
  if ($cycles <= 0) return ['ok'=>true,'cycles'=>0,'message'=>'No cycles due'];

  $birthRates = repro__read_birth_rates($defs);

  // fallback birthRates if defs missing
  if (empty($birthRates)) {
    $birthRates = [
      'adultsUnemployed' => 0.06,
      'adultsWorker'     => 0.04,
      'youngWorker'      => 0.03,
      'youngStudent'     => 0.02,
      'kidsStreet'       => 0.0,
      'kidsStudent'      => 0.0,
      'baby'             => 0.0,
      'old'              => 0.0,
    ];
    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "NOTICE: using fallback birthRates\n", FILE_APPEND);
  }

  $summary = ['cycles'=>$cycles, 'byCycle'=>[]];

  for ($i=0; $i<$cycles; $i++) {
    $row = repro__fetch_citizens_row($db, $userId);
    if (!$row) break;
    $c=[]; foreach ($row as $k=>$v){ if (!in_array($k,['id','user_id','lastupdated'],true)) $c[$k]=(int)$v; }

    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "BEFORE #$i\n".print_r($c,true), FILE_APPEND);

    $core = repro__read_core_caps_and_usage($db, $userId, $defs);
    $caps = $core['caps']; $use = $core['use'];
    $ratios = [];
    foreach (['housing','provision','water','health'] as $k) {
      $u=(float)($use[$k]??0); $cap=(float)($caps[$k]??0);
      $ratios[$k] = $cap>0 ? ($u/$cap) : ($u>0 ? 2.0 : 0.0);
    }
    $housingSlack = max(0.0, ($caps['housing'] ?? 0.0) - ($use['housing'] ?? 0.0));

    // Approximations if needed (could be replaced with backend-calculated happiness/popularity if available)
    $happiness01  = 1.0 - min(1.0, max(0.0, $ratios['housing']-1.0 + $ratios['provision']-1.0 + $ratios['water']-1.0 + $ratios['health']-1.0)/2.0);
    $popularity01 = 1.0 - min(1.0, max(0.0, $ratios['housing']-1.0 + $ratios['provision']-1.0 + $ratios['water']-1.0)/2.0);

    $adultKeys = ['adultsUnemployed','adultsWorker','adultsPolice','adultsFire','adultsHealth','adultsGovernment','adultsPolitician','adultsHomeless'];
    $crimeKeys = ['crimeUnemployed','crimeWorker','crimePolice','crimeFire','crimeHealth','crimeGovernment','crimePolitician','crimeHomeless'];
    $adultsTotal = repro__sum_groups($c, $adultKeys);
    $unempRatio = $adultsTotal>0 ? (($c['adultsUnemployed'] ?? 0)/$adultsTotal) : 0.0;
    $homelessRatio = $adultsTotal>0 ? (($c['adultsHomeless'] ?? 0)/$adultsTotal) : 0.0;
    $crimeTotal = repro__sum_groups($c, $crimeKeys);
    $crimeRatio = $adultsTotal>0 ? ($crimeTotal/$adultsTotal) : 0.0;

    $detail = [
      'aging'        => [],
      'births'       => ['total'=>0, 'byGroup'=>[]],
      'immigration'  => ['total'=>0, 'byGroup'=>[]],
      'emigration'   => ['total'=>0, 'byGroup'=>[]],
      'deaths'       => ['total'=>0, 'byGroup'=>[]],
      'homeless'     => ['toHomeless'=>0, 'rehoused'=>0],
      'ratios'       => $ratios,
    ];

    // 1) Aging
    $deltaAging = repro__age_pipeline($c, ($cfg['reproduction.aging'] ?? $cfg['reproduction'] ?? []), $intervalH);
    $detail['aging'] = $deltaAging;

    // debug: birth contributors
    $rawContrib = [];
    foreach ($birthRates as $g => $br) {
      $cnt = (float)($c[$g] ?? 0);
      $rawContrib[$g] = ['count'=>$cnt, 'birthRate'=>$br, 'contrib'=>$cnt * (float)$br];
    }
    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "RAW CONTRIBUTIONS #$i:\n" . print_r($rawContrib, true), FILE_APPEND);

    // 2) Births -> baby
    $births = repro__compute_births($c, $birthRates, ($cfg['reproduction.birth'] ?? []), $happiness01, $popularity01, $ratios);
    if ($births > 0) {
      $c['baby'] = ($c['baby']??0) + $births;
      $detail['births']['total']=$births;
      $detail['births']['byGroup']['baby']=$births;
    }
    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "BIRTHS #$i: rawEff={$births}\n", FILE_APPEND);

    // 3) Immigration
    $imm = repro__compute_immigration($c, ($cfg['reproduction.immigration'] ?? []), $popularity01, $ratios, $unempRatio);
    $detail['immigration']['total'] = $imm;
    if ($imm > 0) {
      $distStr = (string)(($cfg['reproduction.immigration']['distribution'] ?? 'baby:0.10,kids:0.20,young:0.30,adultsUnemployed:0.38,old:0.02'));
      $parts = array_map('trim', explode(',', $distStr));
      $dist = ['baby'=>0.1,'kids'=>0.2,'young'=>0.3,'adultsUnemployed'=>0.38,'old'=>0.02];
      foreach ($parts as $p) { if ($p==='') continue; [$k,$v]=array_map('trim', explode(':',$p,2)+[null,null]); if ($k && is_numeric($v)) $dist[$k]=(float)$v; }
      $sumW = array_sum($dist) ?: 1.0;
      $left = $imm;
      foreach ($dist as $k=>$w) {
        $add = repro__stochastic_round($imm * ($w/$sumW));
        if ($add <= 0) continue;
        if ($k === 'kids') {
          $split = repro__distribute_to_subkeys($c, ['kidsStreet','kidsStudent'], $add);
          foreach ($split as $subk=>$amt) {
            if ($amt>0) { $c[$subk]=($c[$subk]??0)+$amt; $left-=$amt; $detail['immigration']['byGroup'][$subk]=($detail['immigration']['byGroup'][$subk]??0)+$amt; }
          }
        } elseif ($k === 'young') {
          $split = repro__distribute_to_subkeys($c, ['youngWorker','youngStudent'], $add);
          foreach ($split as $subk=>$amt) {
            if ($amt>0) { $c[$subk]=($c[$subk]??0)+$amt; $left-=$amt; $detail['immigration']['byGroup'][$subk]=($detail['immigration']['byGroup'][$subk]??0)+$amt; }
          }
        } else {
          // direct group (must be an existing DB column)
          $c[$k] = ($c[$k] ?? 0) + $add;
          $left -= $add;
          $detail['immigration']['byGroup'][$k] = ($detail['immigration']['byGroup'][$k] ?? 0) + $add;
        }
      }
      if ($left>0) { $c['adultsUnemployed']=($c['adultsUnemployed']??0)+$left; $detail['immigration']['byGroup']['adultsUnemployed']=($detail['immigration']['byGroup']['adultsUnemployed']??0)+$left; }
    }
    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "IMM #$i: imm={$imm}\n", FILE_APPEND);

    // 4) Re-housing slack
    $reh = repro__rehousing($c, $housingSlack);
    $detail['homeless']['rehoused'] = (int)($reh['rehoused'] ?? 0);

    // 5) Emigration
    $emi = repro__compute_emigration($c, ($cfg['reproduction.emigration'] ?? []), $happiness01, $popularity01, $ratios, $unempRatio, $crimeRatio);
    $detail['emigration']['total'] = $emi;
    if ($emi>0) {
      $weights=[]; foreach ($c as $k=>$v){ $w=(int)$v; if (in_array($k,['baby','kidsStreet','kidsStudent'],true)) $w=(int)floor($w*0.5); $weights[$k]=max(0,$w); }
      $sumW=array_sum($weights); $left=$emi;
      if ($sumW>0){
        foreach ($weights as $k=>$w){
          if ($left<=0) break;
          $take = repro__stochastic_round($emi*($w/$sumW));
          $take=min($take,(int)$c[$k],$left);
          if ($take>0){ $c[$k]-=$take; $left-=$take; $detail['emigration']['byGroup'][$k]=($detail['emigration']['byGroup'][$k]??0)+$take; }
        }
      }
      if ($left>0){
        // fallback: remove from largest pools
        foreach (array_keys($c) as $k){
          if ($left<=0) break;
          $can=min((int)$c[$k], $left);
          if ($can>0){ $c[$k]-=$can; $left-=$can; $detail['emigration']['byGroup'][$k]=($detail['emigration']['byGroup'][$k]??0)+$can; }
        }
      }
    }
    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "EMI #$i: emi={$emi}\n", FILE_APPEND);

    // 6) Deaths - compute per-subgroup deaths and apply directly to existing columns
    $deaths = repro__compute_deaths_by_group($c, ($cfg['reproduction.death'] ?? []), $ratios, $crimeRatio, $homelessRatio);
    $totalDeaths=0;
    foreach ($deaths as $k=>$d) {
      if ($d>0 && !empty($c[$k])) {
        $c[$k]=repro__clampi($c[$k]-$d);
        $detail['deaths']['byGroup'][$k]=$d;
        $totalDeaths+=$d;
      }
    }
    $detail['deaths']['total'] = $totalDeaths;
    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "DEATHS #$i: " . print_r($deaths, true) . "\n", FILE_APPEND);

    // 7) Push to homeless if housing deficit (post-changes)
    if ($ratios['housing'] > 1.0) {
      $excess = (int)ceil($use['housing'] - $caps['housing']);
      if ($excess > 0) {
        $fromU = min((int)($c['adultsUnemployed'] ?? 0), $excess);
        if ($fromU>0){ $c['adultsUnemployed']-=$fromU; $c['adultsHomeless']=($c['adultsHomeless']??0)+$fromU; $excess-=$fromU; $detail['homeless']['toHomeless'] += $fromU; }
        if ($excess>0){
          $fromW = min((int)($c['adultsWorker'] ?? 0), $excess);
          if ($fromW>0){ $c['adultsWorker']-=$fromW; $c['adultsHomeless']=($c['adultsHomeless']??0)+$fromW; $excess-=$fromW; $detail['homeless']['toHomeless'] += $fromW; }
        }
      }
    }

    // 8) Crime redistribution
    $crime = repro__redistribute_crime($c, ($cfg['reproduction.crime'] ?? []), max(0.0,$ratios['housing']-1.0), max(0.0,$ratios['provision']-1.0), max(0.0,$ratios['water']-1.0));
    foreach ($crime as $k=>$v) $c[$k]=$v;

    foreach ($c as $k=>$v) if ($c[$k]<0) $c[$k]=0;

    // Persist this cycle's changes
    repro__update_citizens_row($db, $userId, $c);

    $summary['byCycle'][] = $detail;

    file_put_contents(__DIR__ . '/repro_tick_debug.txt', "AFTER CHANGES #$i:\n" . print_r($c, true), FILE_APPEND);
  }

  return ['ok'=>true] + $summary;
}