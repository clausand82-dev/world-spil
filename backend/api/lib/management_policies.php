<?php
declare(strict_types=1);

/** Basic value validation/normalization */
function management_normalize_kv(string $family, string $key, &$value): void {
  if (is_array($value)) {
    foreach ($value as $v) {
      if (!is_scalar($v) && $v !== null) {
        throw new \InvalidArgumentException('Array values must be scalar');
      }
    }
  } elseif (!is_scalar($value) && $value !== null) {
    throw new \InvalidArgumentException('Value must be scalar or array');
  }
}

/** Requirements checker for buildings/addons/research ownership */
function management_requirements_met(array $state, array $req): bool {
  $ok = true;
  if (!empty($req['buildings'])) {
    $ok = $ok && array_reduce($req['buildings'], fn($c,$id)=>$c && !empty($state['bld'][$id]), true);
  }
  if (!empty($req['addons'])) {
    $ok = $ok && array_reduce($req['addons'], fn($c,$id)=>$c && !empty($state['add'][$id]), true);
  }
  if (!empty($req['research'])) {
    $ok = $ok && array_reduce($req['research'], fn($c,$id)=>$c && !empty($state['rsd'][$id]), true);
  }
  return $ok;
}

/**
 * Translate overrides into stat deltas and source annotations.
 * Return shape:
 * [
 *   'stats'   => ['healthDentistCapacity'=>+100, 'taxHealthUsage'=>+1234.56, ...],
 *   'sources' => ['healthDentistCapacity' => [ ['from'=>'policy:key','family'=>'health','value'=>100], ... ] ]
 * ]
 */
function management_compute_effects(array $summary, array $overridesByFamily): array {
  $out = ['stats'=>[], 'sources'=>[]];

  $state = [
    'bld' => $summary['state']['bld'] ?? [],
    'add' => $summary['state']['add'] ?? [],
    'rsd' => $summary['state']['rsd'] ?? [],
  ];

  // demographics
  $kids   = (int)(($summary['citizens']['groupCounts']['kids'] ?? 0) + ($summary['citizens']['groupCounts']['baby'] ?? 0));
  $young  = (int)($summary['citizens']['groupCounts']['young'] ?? 0);
  $adults = (int)(($summary['citizens']['groupCounts']['adultsTotal'] ?? 0) + ($summary['citizens']['groupCounts']['old'] ?? 0));
  $persons = (int)($summary['citizens']['totals']['totalPersons'] ?? 0);

  $health = $overridesByFamily['health'] ?? [];

  // Free dentist – kids
  if (!empty($health['health_free_dentist_kids'])) {
    $cap = 100; $cost = $kids * 100.0;
    $out['stats']['healthDentistCapacity'] = ($out['stats']['healthDentistCapacity'] ?? 0) + $cap;
    $out['sources']['healthDentistCapacity'][] = ['from'=>'policy:health_free_dentist_kids','family'=>'health','value'=>$cap];

    $out['stats']['taxHealthUsage'] = ($out['stats']['taxHealthUsage'] ?? 0) + $cost;
    $out['sources']['taxHealthUsage'][] = ['from'=>'policy:health_free_dentist_kids','family'=>'health','value'=>$cost];
  }

  // Free dentist – young
  if (!empty($health['health_free_dentist_young'])) {
    $cap = 80; $cost = $young * 125.0;
    $out['stats']['healthDentistCapacity'] = ($out['stats']['healthDentistCapacity'] ?? 0) + $cap;
    $out['sources']['healthDentistCapacity'][] = ['from'=>'policy:health_free_dentist_young','family'=>'health','value'=>$cap];

    $out['stats']['taxHealthUsage'] = ($out['stats']['taxHealthUsage'] ?? 0) + $cost;
    $out['sources']['taxHealthUsage'][] = ['from'=>'policy:health_free_dentist_young','family'=>'health','value'=>$cost];
  }

  // Free dentist – adults
  if (!empty($health['health_free_dentist_adults'])) {
    $cap = 50; $cost = $adults * 175.0;
    $out['stats']['healthDentistCapacity'] = ($out['stats']['healthDentistCapacity'] ?? 0) + $cap;
    $out['sources']['healthDentistCapacity'][] = ['from'=>'policy:health_free_dentist_adults','family'=>'health','value'=>$cap];

    $out['stats']['taxHealthUsage'] = ($out['stats']['taxHealthUsage'] ?? 0) + $cost;
    $out['sources']['taxHealthUsage'][] = ['from'=>'policy:health_free_dentist_adults','family'=>'health','value'=>$cost];
  }

  // Subsidy %
  if (isset($health['health_subsidy_pct'])) {
    $pct = max(0.0, (float)$health['health_subsidy_pct']);
    $deltaCapacityPct = 0.5 * $pct; // UI assumption
    $out['stats']['healthCapacityMultiplier'] = ($out['stats']['healthCapacityMultiplier'] ?? 1.0) * (1.0 + $deltaCapacityPct/100.0);
    $out['sources']['healthCapacityMultiplier'][] = ['from'=>'policy:health_subsidy_pct','family'=>'health','value'=>$deltaCapacityPct];

    $estCost = $persons * $pct * 0.01;
    $out['stats']['taxHealthUsage'] = ($out['stats']['taxHealthUsage'] ?? 0) + $estCost;
    $out['sources']['taxHealthUsage'][] = ['from'=>'policy:health_subsidy_pct','family'=>'health','value'=>$estCost];
  }

  // Wait target (days)
  if (isset($health['health_wait_target_days'])) {
    $days = (int)$health['health_wait_target_days'];
    $default = 60;
    if ($days !== $default) {
      $hp = (float)($summary['capacities']['healthCapacity'] ?? 0);
      $rate = $hp / $default;
      $delta = $rate * $days;
      $out['stats']['healthCapacityFromTarget'] = ($out['stats']['healthCapacityFromTarget'] ?? 0) + $delta;
      $out['sources']['healthCapacityFromTarget'][] = ['from'=>'policy:health_wait_target_days','family'=>'health','value'=>$delta];
    }
  }

  return $out;
}