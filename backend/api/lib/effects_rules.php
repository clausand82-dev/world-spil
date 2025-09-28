<?php
declare(strict_types=1);

/**
 * apply_effects:
 * - Et tværgående “rules/effects”-lag der altid kan køres efter metrics + demands.
 * - Eksempler: hvis green-andel under minimum → giv en advarsel og foreslå en penalty til happiness/popularity.
 * - Som default ændrer vi ikke data – vi returnerer blot anbefalede effekter (du kan vælge at anvende dem).
 *
 * Input $ctx:
 * - ['demands'=>..., 'usages'=>..., 'capacities'=>..., 'happiness'=>..., 'popularity'=>..., 'stage'=>int]
 */
function apply_effects(array $ctx): array {
  $effects = [
    'warnings' => [],
    // 'happinessPenalty' => 0.0,
    // 'popularityPenalty'=> 0.0,
    // 'usageAdjustments' => [ 'useInternet' => ['mul'=>0.9] ],
  ];

  $dem = $ctx['demands'] ?? [];

  // Eksempel 1: Power Green min-krav ikke opfyldt → advarsel
  if (isset($dem['demandsPowerGreenMin']) && !$dem['demandsPowerGreenMin']['ok']) {
    $effects['warnings'][] = 'Power (Green) share is below minimum requirement.';
    // $effects['happinessPenalty'] = ($effects['happinessPenalty'] ?? 0) - 0.02;
  }

  // Eksempel 2: Hvis Heat Fossil max-krav overskrides → foreslå penalty
  if (isset($dem['demandsHeatFossilMax']) && !$dem['demandsHeatFossilMax']['ok']) {
    $effects['warnings'][] = 'Heat (Fossil) share exceeds maximum threshold.';
    // $effects['popularityPenalty'] = ($effects['popularityPenalty'] ?? 0) - 0.03;
  }

  // Eksempel 3: Power shortage → beskær useInternet (kun forslag)
  $usages = $ctx['usages'] ?? [];
  $caps   = $ctx['capacities'] ?? [];
  $useP   = (float)($usages['usePower']['total'] ?? 0.0);
  $capP   = (float)($caps['powerCapacity'] ?? 0.0);
  if ($capP > 0 && $useP > $capP) {
    $effects['warnings'][] = 'Power shortage detected; consider throttling Internet usage.';
    // $effects['usageAdjustments']['useInternet'] = ['mul' => $capP / max($useP, 1e-9)];
  }

  

  return $effects;
}