<?php
declare(strict_types=1);

/**
 * popularity_calc_all:
 * Input: $pairs = [ key => ['used'=>float, 'capacity'=>float] ], $weights = [ keyWeightKey => number ] eller [key=>number]
 * Output-format matcher happiness.php-structuren: popularity (0..1), impacts, impactTotal, weightTotal
 *
 * Score-model (samme som i frontend-eksemplet for happiness):
 * - Basisscore = 1 - max(0, used/capacity - 1) for cap>0, ellers 0
 * - Impact = weight * score
 */
function popularity_calc_all(array $pairs, array $weights): array {
  $impacts = [];
  $weightTotal = 0.0;
  $impactTotal = 0.0;

  foreach ($weights as $k => $wRaw) {
    $w = (float)$wRaw;
    if ($w <= 0) continue;

    // Tillad både 'foodPopularityWeight' og bare 'food' som nøgle
    $base = preg_replace('/PopularityWeight$/', '', (string)$k);

    $used = (float)($pairs[$base]['used'] ?? 0.0);
    $cap  = (float)($pairs[$base]['capacity'] ?? 0.0);

    $score = 0.0;
    if ($cap > 0) {
      $overload = max(0.0, ($used / $cap) - 1.0);
      $score    = max(0.0, 1.0 - $overload);
    }
    $impact = $score * $w;

    $impacts[$base] = [
      'used'     => $used,
      'capacity' => $cap,
      'score'    => $score,
      'weight'   => $w,
      'impact'   => $impact,
    ];
    $weightTotal += $w;
    $impactTotal += $impact;
  }

  $popularity = ($weightTotal > 0) ? ($impactTotal / $weightTotal) : 0.0;
  return [
    'popularity'  => $popularity,
    'impactTotal' => $impactTotal,
    'weightTotal' => $weightTotal,
    'impacts'     => $impacts,
  ];
}