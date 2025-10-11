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

  // BRUGES - HVIS POPULARITY ER OVER 75% SÅ GIVES +5% HAPPINESS
      // Simplified popularity extraction + rule: popularity > 50% => happiness * 1.05
      $raw = $ctx['popularity'] ?? null;

      // ensure warnings array exists
      if (!isset($effects['warnings'])) $effects['warnings'] = [];

      // Resolve a single numeric popularity value (prefer named keys, no averaging)
      $popVal = null;
      if (is_numeric($raw)) {
        $popVal = (float)$raw;
      } elseif (is_array($raw)) {
        foreach (['popularity','total','value','score','overall','percent','pct'] as $k) {
          if (isset($raw[$k]) && is_numeric($raw[$k])) { $popVal = (float)$raw[$k]; break; }
        }
        // fallback: first numeric child (avoid averaging, less surprising)
        if ($popVal === null) {
          foreach ($raw as $v) {
            if (is_numeric($v)) { $popVal = (float)$v; break; }
          }
        }
      }
      $popVal = $popVal ?? 0.0;

      // normalize 0..100 -> 0..1 (only if value plausibly percentage)
      if ($popVal > 1.0 && $popVal <= 1000.0) $popVal = $popVal / 100.0;

      // ensure adjustments slot
      if (!isset($effects['adjustments'])) $effects['adjustments'] = [];
      if (!isset($effects['adjustments']['happiness'])) $effects['adjustments']['happiness'] = ['mult' => 1.0, 'add' => 0.0];

      // rule parameters
      $popThreshold = 0.70;   // 70%
      $multiplier = 1.05;    // +5%

      // concise logging of resolved value
      $effects['warnings'][] = sprintf('DBG: popularity resolved=%.4f (threshold=%.2f)', $popVal, $popThreshold);

      // apply rule
      if ($popVal > $popThreshold) {
        $effects['adjustments']['happiness']['mult'] *= $multiplier;
        $effects['warnings'][] = sprintf('Effect applied: popularity=%.4f -> happiness * %.3f', $popVal, $multiplier);
      }
 

  return $effects;
}