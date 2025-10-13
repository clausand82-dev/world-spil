<?php
declare(strict_types=1);

/**
 * Læg policy-effekter ind i $summary.
 *
 * - Usage-nøgler:
 *    - Slutter med 'Usage' (fx 'taxHealthUsage') → mappes til 'useTaxHealth'
 *    - Starter med 'use' (fx 'useHealth') → bruges direkte
 *    - Lægges i usages[<useKey>] med breakdown:
 *        - total             += sum(policies)
 *        - choice_total      += sum(policies)
 *        - choice            += sum(policies)         (bagudkompatibel)
 *        - choiceBySub[sub]  += per-policy sum (grupperet efter subId afledt af statnavn)
 *        - choiceByPolicy[policyKey] += beløb
 *        - choiceDetails[]   append detaljer: policy, family, sub, amount, stat
 * - Kapacitetsnøgler: lægges i capacities[<key>] (+ kildesporing)
 * - *Multiplier-nøgler: <stat>Multiplier gemmes, og multipliceres på capacities efter add/sub (+ kildesporing)
 * - Kildesporing gemmes i $summary['statSources'][<mappedKey>][]
 */

function me_camel_tokens(string $s): array {
  // split ved store bogstaver, bevar akronymer som separate tokens
  $tokens = preg_split('/(?=[A-Z])/', $s) ?: [];
  $out = [];
  foreach ($tokens as $t) {
    $t = trim($t);
    if ($t !== '') $out[] = $t;
  }
  return $out;
}

/** Fjern 'Usage' suffix og 'use' prefix for basisnavn */
function me_base_name(string $key): string {
  $name = $key;
  if (str_ends_with($name, 'Usage')) $name = substr($name, 0, -5);
  if (str_starts_with($name, 'use')) $name = substr($name, 3);
  return $name; // fx 'TaxHealth', 'HealthDentist'
}

/** Map stat key → useKey (rigtigt use-felt) */
function me_target_use_key(string $key): string {
  if (str_starts_with($key, 'use')) return $key;
  if (str_ends_with($key, 'Usage')) {
    $base = substr($key, 0, -5);    // 'taxHealth'
    return 'use' . ucfirst($base);  // 'useTaxHealth'
  }
  return $key;
}

/** Udled subId (underkategori) fra statnavnets base-del; lowerCamel. */
function me_sub_id_from_key(string $key): string {
  $base = me_base_name($key); // fx 'TaxHealth' eller 'HealthDentist'
  if ($base === '') return 'unknown';
  $tokens = me_camel_tokens($base); // fx ['Tax','Health'] eller ['Health','Dentist']
  // Drop 'Tax' hvis første token er Tax → sub er resten; ellers brug sidste token
  if ($tokens && strtolower($tokens[0]) === 'tax') {
    $rest = array_slice($tokens, 1);
    if (!$rest) return 'unknown';
    // join resten som lowerCamel
    $first = strtolower($rest[0]);
    $others = array_slice($rest, 1);
    $tail = '';
    foreach ($others as $t) $tail .= ucfirst(strtolower($t));
    return $first . $tail;
  }
  // Ellers: brug sidste token
  $last = $tokens[count($tokens)-1] ?? '';
  return strtolower($last);
}

/** Registrér choice-usage i $use[$useKey] med detaljer og kildesporing */
function me_record_choice_usage(array &$use, array &$src, string $useKey, float $amount, string $subId, array $sourcesForStat, string $origStatKey): void {
  if (!isset($use[$useKey]) || !is_array($use[$useKey])) {
    $use[$useKey] = ['total' => 0.0];
  }

  // Summér per-policy fra sources – så vi ikke dobbeltbogfører ved flere kilder
  $sumByPolicy = [];
  $sumPolicies = 0.0;
  foreach ($sourcesForStat as $s) {
    $from = (string)($s['from'] ?? '');
    if (!str_starts_with($from, 'policy:')) continue;
    $policyKey = substr($from, strlen('policy:'));
    $v = (float)($s['value'] ?? 0.0);
    $op = strtolower((string)($s['op'] ?? 'add'));
    if ($op === 'sub') $v = -$v;
    // ignorer 'mul'/'div' for usage (giver sjældent mening på usage)
    if ($v === 0.0) continue;
    $sumByPolicy[$policyKey] = ($sumByPolicy[$policyKey] ?? 0.0) + $v;
    $sumPolicies += $v;
  }

  // Hvis ingen policy-kilder fundet, brug aggregatet (amount) som fallback
  $effective = ($sumPolicies !== 0.0) ? $sumPolicies : $amount;

  // Skriv totals
  $use[$useKey]['total']       = (float)($use[$useKey]['total']       ?? 0) + $effective;
  $use[$useKey]['choice_total'] = (float)($use[$useKey]['choice_total'] ?? 0) + $effective;
  // Bagudkompatibel sum
  $use[$useKey]['choice']      = (float)($use[$useKey]['choice']      ?? 0) + $effective;

  // Sub‑breakdown
  if ($subId !== '') {
    if (!isset($use[$useKey]['choiceBySub'])) $use[$useKey]['choiceBySub'] = [];
    $use[$useKey]['choiceBySub'][$subId] = (float)($use[$useKey]['choiceBySub'][$subId] ?? 0) + $effective;
  }

  // Policy‑breakdown og detaljer
  if ($sumByPolicy) {
    if (!isset($use[$useKey]['choiceByPolicy'])) $use[$useKey]['choiceByPolicy'] = [];
    foreach ($sumByPolicy as $policyKey => $v) {
      $use[$useKey]['choiceByPolicy'][$policyKey] = (float)($use[$useKey]['choiceByPolicy'][$policyKey] ?? 0) + $v;
      $use[$useKey]['choiceDetails'][] = [
        'policy' => $policyKey,
        'family' => (string)($sourcesForStat[0]['family'] ?? ''), // typisk samme i alle entries
        'sub'    => $subId,
        'amount' => $v,
        'stat'   => $origStatKey,
      ];
    }
  } else {
    // Fallback – vi ved ikke hvilken policy, men gem en detalje for sporbarhed
    $use[$useKey]['choiceDetails'][] = [
      'policy' => '',
      'family' => (string)($sourcesForStat[0]['family'] ?? ''),
      'sub'    => $subId,
      'amount' => $effective,
      'stat'   => $origStatKey,
    ];
  }

  // Kildesporing under det mappede useKey
  foreach ($sourcesForStat as $s) {
    $src[$useKey][] = $s;
  }
}

function management_apply_effects(array &$summary, array $effects): void {
  $stats   = (array)($effects['stats']   ?? []);
  $sources = (array)($effects['sources'] ?? []);

  if (!isset($summary['capacities']) || !is_array($summary['capacities'])) $summary['capacities'] = [];
  if (!isset($summary['usages'])     || !is_array($summary['usages']))     $summary['usages']     = [];
  if (!isset($summary['statSources'])|| !is_array($summary['statSources']))$summary['statSources']= [];

  $cap =& $summary['capacities'];
  $use =& $summary['usages'];
  $src =& $summary['statSources'];

  // 1) Add/Sub + indsamling af multipliers
  $multipliers = []; // baseStat => factor
  foreach ($stats as $key => $val) {
    // Multiplikatorer: <stat>Multiplier
    if (preg_match('/Multiplier$/', (string)$key)) {
      $base = preg_replace('/Multiplier$/', '', (string)$key);
      $multipliers[$base] = (float)$val;
      foreach (($sources[$key] ?? []) as $s) {
        $src[$base][] = $s + ['as' => 'multiplier'];
      }
      continue;
    }

    $isUsageSuffix = (bool)preg_match('/Usage$/', (string)$key);   // fx taxHealthUsage
    $isUsePrefix   = (bool)preg_match('/^use[A-Z_]/', (string)$key); // fx useHealth

    if ($isUsageSuffix || $isUsePrefix) {
      $targetKey = me_target_use_key($key);     // fx useTaxHealth
      $subId     = me_sub_id_from_key($key);    // fx health / dentist / socialCare
      $amt       = (float)$val;
      $srcForKey = (array)($sources[$key] ?? []);
      me_record_choice_usage($use, $src, $targetKey, $amt, $subId, $srcForKey, $key);
      continue;
    }

    // Ellers kapacitets-tilpasning
    $cap[$key] = (float)($cap[$key] ?? 0) + (float)$val;
    foreach (($sources[$key] ?? []) as $s) $src[$key][] = $s;
  }

  // 2) Anvend multipliers på kapaciteter efter add/sub
  foreach ($multipliers as $base => $factor) {
    if (isset($cap[$base])) {
      $cap[$base] = (float)$cap[$base] * (float)$factor;
    } elseif (isset($summary['capacities'][$base])) {
      $summary['capacities'][$base] = (float)$summary['capacities'][$base] * (float)$factor;
    }
  }
}