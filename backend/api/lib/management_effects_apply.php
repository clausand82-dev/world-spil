<?php
declare(strict_types=1);

/**
 * Læg policy-effekter ind i $summary.
 *
 * Usage-nøgler:
 *  - Slutter på 'Usage' (fx 'taxHealthUsage') → mappes til 'useTaxHealth'
 *  - Starter med 'use' (fx 'useHealth') → bruges direkte
 *  - Lægges i usages[<useKey>].total og usages[<useKey>].choice (+ breakdowns)
 *
 * Capacity-nøgler:
 *  - Lægges i capacities[<capKey>] (numeric, bagudkompatibelt)
 *  - Breakdown gemmes i summary.capChoice[<capKey>] (choice_total, choiceByPolicy, choiceDetails)
 *
 * Multiplikatorer:
 *  - <stat>Multiplier multipliceres på capacities efter add/sub
 *  - Kilder gemmes i statSources
 */

function me_camel_tokens(string $s): array {
  $tokens = preg_split('/(?=[A-Z])/', $s) ?: [];
  $out = [];
  foreach ($tokens as $t) { $t = trim($t); if ($t !== '') $out[] = $t; }
  return $out;
}
function me_base_name(string $key): string {
  $name = $key;
  if (str_ends_with($name, 'Usage')) $name = substr($name, 0, -5);
  if (str_starts_with($name, 'use'))  $name = substr($name, 3);
  return $name; // fx 'TaxHealth', 'HealthDentist'
}
function me_target_use_key(string $key): string {
  if (str_starts_with($key, 'use')) return $key;
  if (str_ends_with($key, 'Usage')) {
    $base = substr($key, 0, -5); // 'taxHealth'
    return 'use' . ucfirst($base); // 'useTaxHealth'
  }
  return $key;
}
function me_sub_id_from_key(string $key): string {
  $base = me_base_name($key);
  if ($base === '') return 'unknown';
  $tokens = me_camel_tokens($base);
  if ($tokens && strtolower($tokens[0]) === 'tax') {
    $rest = array_slice($tokens, 1);
    if (!$rest) return 'unknown';
    $first = strtolower($rest[0]);
    $tail = '';
    foreach (array_slice($rest, 1) as $t) $tail .= ucfirst(strtolower($t));
    return $first . $tail; // fx taxHealth -> health
  }
  $last = $tokens[count($tokens)-1] ?? '';
  return strtolower($last); // fx HealthDentist -> dentist
}

function me_record_choice_usage(array &$use, array &$src, string $useKey, float $amount, string $subId, array $sourcesForStat, string $origStatKey): void {
  if (!isset($use[$useKey]) || !is_array($use[$useKey])) $use[$useKey] = ['total' => 0.0];

  // Summer per policy fra kilder (så vi kan vise choiceByPolicy)
  $sumByPolicy = []; $sumPolicies = 0.0; $family = '';
  foreach ($sourcesForStat as $s) {
    $from = (string)($s['from'] ?? '');
    if (str_starts_with($from, 'policy:')) {
      $policyKey = substr($from, strlen('policy:'));
      $v = (float)($s['value'] ?? 0.0);
      $op = strtolower((string)($s['op'] ?? 'add'));
      if ($op === 'sub') $v = -$v;
      $sumByPolicy[$policyKey] = ($sumByPolicy[$policyKey] ?? 0.0) + $v;
      $sumPolicies += $v;
      if (!$family) $family = (string)($s['family'] ?? '');
    }
  }
  $effective = ($sumPolicies !== 0.0) ? $sumPolicies : $amount;

  $use[$useKey]['total']        = (float)($use[$useKey]['total'] ?? 0) + $effective;
  $use[$useKey]['choice_total'] = (float)($use[$useKey]['choice_total'] ?? 0) + $effective;
  $use[$useKey]['choice']       = (float)($use[$useKey]['choice'] ?? 0) + $effective;

  if ($subId !== '') {
    if (!isset($use[$useKey]['choiceBySub'])) $use[$useKey]['choiceBySub'] = [];
    $use[$useKey]['choiceBySub'][$subId] = (float)($use[$useKey]['choiceBySub'][$subId] ?? 0) + $effective;
  }
  if ($sumByPolicy) {
    if (!isset($use[$useKey]['choiceByPolicy'])) $use[$useKey]['choiceByPolicy'] = [];
    foreach ($sumByPolicy as $policyKey => $v) {
      $use[$useKey]['choiceByPolicy'][$policyKey] = (float)($use[$useKey]['choiceByPolicy'][$policyKey] ?? 0) + $v;
      $use[$useKey]['choiceDetails'][] = [
        'policy' => $policyKey, 'family' => $family, 'sub' => $subId,
        'amount' => $v, 'stat' => $origStatKey,
      ];
    }
  } else {
    $use[$useKey]['choiceDetails'][] = [
      'policy' => '', 'family' => $family, 'sub' => $subId,
      'amount' => $effective, 'stat' => $origStatKey,
    ];
  }

  foreach ($sourcesForStat as $s) { $src[$useKey][] = $s; }
}

function me_record_choice_capacity(array &$capChoice, array &$src, string $capKey, float $amount, array $sourcesForStat, string $origStatKey): void {
  if (!isset($capChoice[$capKey]) || !is_array($capChoice[$capKey])) {
    $capChoice[$capKey] = ['choice_total' => 0.0];
  }
  // Summer per policy
  $sumByPolicy = []; $sumPolicies = 0.0; $family = '';
  foreach ($sourcesForStat as $s) {
    $from = (string)($s['from'] ?? '');
    if (str_starts_with($from, 'policy:')) {
      $policyKey = substr($from, strlen('policy:'));
      $v = (float)($s['value'] ?? 0.0);
      $op = strtolower((string)($s['op'] ?? 'add'));
      if ($op === 'sub') $v = -$v;
      $sumByPolicy[$policyKey] = ($sumByPolicy[$policyKey] ?? 0.0) + $v;
      $sumPolicies += $v;
      if (!$family) $family = (string)($s['family'] ?? '');
    }
  }
  $effective = ($sumPolicies !== 0.0) ? $sumPolicies : $amount;

  $capChoice[$capKey]['choice_total'] = (float)($capChoice[$capKey]['choice_total'] ?? 0) + $effective;
  if ($sumByPolicy) {
    if (!isset($capChoice[$capKey]['choiceByPolicy'])) $capChoice[$capKey]['choiceByPolicy'] = [];
    foreach ($sumByPolicy as $policyKey => $v) {
      $capChoice[$capKey]['choiceByPolicy'][$policyKey] = (float)($capChoice[$capKey]['choiceByPolicy'][$policyKey] ?? 0) + $v;
      $capChoice[$capKey]['choiceDetails'][] = [
        'policy' => $policyKey, 'family' => $family, 'amount' => $v, 'stat' => $origStatKey,
      ];
    }
  } else {
    $capChoice[$capKey]['choiceDetails'][] = [
      'policy' => '', 'family' => $family, 'amount' => $effective, 'stat' => $origStatKey,
    ];
  }

  foreach ($sourcesForStat as $s) { $src[$capKey][] = $s; }
}

function management_apply_effects(array &$summary, array $effects): void {
  $stats   = (array)($effects['stats']   ?? []);
  $sources = (array)($effects['sources'] ?? []);

  if (!isset($summary['capacities']) || !is_array($summary['capacities'])) $summary['capacities'] = [];
  if (!isset($summary['usages'])     || !is_array($summary['usages']))     $summary['usages']     = [];
  if (!isset($summary['statSources'])|| !is_array($summary['statSources']))$summary['statSources']= [];
  if (!isset($summary['capChoice'])  || !is_array($summary['capChoice']))  $summary['capChoice']  = []; // NYT

  $cap       =& $summary['capacities'];
  $use       =& $summary['usages'];
  $src       =& $summary['statSources'];
  $capChoice =& $summary['capChoice'];

  // 1) Add/Sub + indsamling af multipliers
  $multipliers = []; // baseStat => factor
  foreach ($stats as $key => $val) {
    if (preg_match('/Multiplier$/', (string)$key)) {
      $base = preg_replace('/Multiplier$/', '', (string)$key);
      $multipliers[$base] = (float)$val;
      foreach (($sources[$key] ?? []) as $s) { $src[$base][] = $s + ['as' => 'multiplier']; }
      continue;
    }

    $isUsageSuffix = (bool)preg_match('/Usage$/', (string)$key);
    $isUsePrefix   = (bool)preg_match('/^use[A-Z_]/', (string)$key);

    if ($isUsageSuffix || $isUsePrefix) {
      $targetKey = me_target_use_key($key);
      $subId     = me_sub_id_from_key($key);
      $amt       = (float)$val;
      $srcForKey = (array)($sources[$key] ?? []);
      me_record_choice_usage($use, $src, $targetKey, $amt, $subId, $srcForKey, $key);
      continue;
    }

    // Capacity add/sub
    $cap[$key] = (float)($cap[$key] ?? 0) + (float)$val;
    $srcForKey = (array)($sources[$key] ?? []);
    me_record_choice_capacity($capChoice, $src, $key, (float)$val, $srcForKey, $key);
  }

  // 2) Multiplicer på capacities efter add/sub
  foreach ($multipliers as $base => $factor) {
    if (isset($cap[$base])) {
      $cap[$base] = (float)$cap[$base] * (float)$factor;
    } elseif (isset($summary['capacities'][$base])) {
      $summary['capacities'][$base] = (float)$summary['capacities'][$base] * (float)$factor;
    }
  }
}