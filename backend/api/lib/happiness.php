<?php
declare(strict_types=1);

/**
 * Happiness system helpers.
 * - Læs weights fra config (array: config['happiness'][...])
 * - Udregn overload: MAX(0, (usage/capacity)-1)
 * - Udregn score: MAX(0, 1-overload)
 * - Udregn impact: score * weight
 * - Beregn samlet happiness.
 */

function happiness_calc_overload(float $usage, float $capacity): float {
    if ($capacity <= 0) return 1.0; // overload hvis ingen kapacitet
    return max(0.0, ($usage / $capacity) - 1.0);
}

function happiness_calc_score(float $overload): float {
    return max(0.0, 1.0 - $overload);
}

function happiness_calc_impact(float $score, float $weight): float {
    return $score * $weight;
}

/**
 * Beregn happiness for alle parametre med weight > 0.
 * $usages: assoc array, fx ['health'=>['used'=>...,'capacity'=>...], ...]
 * $config: assoc array, fx ['healthHappinessWeight'=>2, ...]
 * Return: [
 *   'impacts'=>['health'=>..., ...],
 *   'weightTotal'=>...,
 *   'impactTotal'=>...,
 *   'happiness'=>..., // [0-1]
 * ]
 */
function happiness_calc_all(array $usages, array $config): array {
    $impacts = [];
    $weightTotal = 0.0;
    $impactTotal = 0.0;

    foreach ($config as $key => $rawWeight) {
        // Cast til float for at undgå type-fejl (INI kan give strings)
        $w = (float)$rawWeight;
        if ($w <= 0.0) continue;

        // Kun brug keys som matcher *HappinessWeight (ellers kan andre keys i sektionen snige sig ind)
        $usageKey = preg_match('/HappinessWeight$/', (string)$key)
            ? preg_replace('/HappinessWeight$/', '', (string)$key)
            : (string)$key;

        $used     = (float)($usages[$usageKey]['used'] ?? 0.0);
        $capacity = (float)($usages[$usageKey]['capacity'] ?? 0.0);

        $overload = happiness_calc_overload($used, $capacity);
        $score    = happiness_calc_score($overload);
        $impact   = happiness_calc_impact($score, $w);

        $impacts[$usageKey] = [
            'weight'   => $w,
            'used'     => $used,
            'capacity' => $capacity,
            'overload' => $overload,
            'score'    => $score,
            'impact'   => $impact,
        ];
        $weightTotal += $w;
        $impactTotal += $impact;
    }

    $happiness = $weightTotal > 0 ? ($impactTotal / $weightTotal) : 0.0;

    return [
        'impacts'      => $impacts,
        'weightTotal'  => $weightTotal,
        'impactTotal'  => $impactTotal,
        'happiness'    => $happiness,
    ];
}