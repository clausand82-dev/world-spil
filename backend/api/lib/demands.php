<?php
declare(strict_types=1);

/**
 * demands_evaluate_all:
 * - Læser demands fra metrics_registry() (kun eksempler implementeret).
 * - Slår tærskler op i $cfg['demands'][config_key] (float).
 * - Beregner compliance pr. demand og returnerer samlet overblik.
 *
 * Støttede basis-typer (eksempler):
 * - 'usage_share_in_parent' (fx usePowerGreen / usePower)
 * - 'level' (placeholder til fx pollution/traffic indikatorer – du kan koble dine egne mål her)
 */
function demands_evaluate_all(array $registry, array $usages, array $capacities, array $citizens, array $cfg, int $userStage): array {
  $out = [];
  $cfgDem = $cfg['demands'] ?? [];

  foreach ($registry as $id => $m) {
    // Stage-gate: spring over hvis låst
    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
    if ($userStage < $unlockAt) continue;

    $demands = $m['demands'] ?? [];
    if (!$demands) continue;

    foreach ($demands as $d) {
      $dId   = (string)($d['id'] ?? '');
      $type  = (string)($d['type'] ?? '');
      $basis = (string)($d['basis'] ?? '');
      $confK = (string)($d['config_key'] ?? '');
      if ($dId === '' || $type === '' || $basis === '' || $confK === '') continue;

      $threshold = (float)($cfgDem[$confK] ?? 0.0);
      $value = 0.0;

      if ($basis === 'usage_share_in_parent') {
        $childUse = (float)($usages[$m['usageField']]['total'] ?? 0.0);
        $parentField = (string)($d['parent'] ?? '');
        $parentUse = (float)($usages[$parentField]['total'] ?? 0.0);
        $value = ($parentUse > 0.0) ? ($childUse / $parentUse) : 0.0;
      } elseif ($basis === 'level') {
        // Placeholder: lad værdi komme fra capacities eller et fremtidigt modul.
        // Eksempel: pollution-lvl kunne lægges i capacities['pollutionAirLevel'] eller i et separat felt.
        $levelKey = (string)($d['level_field'] ?? '');
        if ($levelKey !== '') {
          $value = (float)($capacities[$levelKey] ?? 0.0);
        } else {
          $value = 0.0;
        }
      } else {
        continue; // ukendt basis
      }

      $ok = true;
      if ($type === 'min' || $type === 'minShare') {
        $ok = ($value >= $threshold);
      } elseif ($type === 'max' || $type === 'maxShare') {
        $ok = ($value <= $threshold);
      }

      $out[$dId] = [
        'metric'    => $id,
        'type'      => $type,
        'basis'     => $basis,
        'value'     => $value,
        'threshold' => $threshold,
        'ok'        => $ok,
      ];
    }
  }

  return $out;
}