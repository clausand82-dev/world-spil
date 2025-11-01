<?php
/**
 * actions/statsbuffs.php
 *
 * Generic rule-driven stats -> buffs engine.
 *
 * Public API:
 *  - compute_stats_buffs(array $summary, ?array $rules = null): array
 *
 * Rule format (example):
 * [
 *   'id' => 'happy_under_25',
 *   'name' => 'Low happiness',
 *   'metric' => 'happiness_percentage',   // key to read from $summary
 *   'op' => 'lt',                         // lt|lte|gt|gte|eq|neq
 *   'value' => 25,                        // threshold
 *   'effect' => [
 *       'kind' => 'res',                  // 'res'|'speed'|'custom' ...
 *       'scope' => 'res.money',
 *       'mode' => 'yield',
 *       'op' => 'mult',                   // 'mult' => amount expressed in percent, negative = penalty
 *       'calc' => [                       // calculation strategy
 *           'type' => 'fixed_multiplier', // 'fixed_multiplier'|'percent_below'|'fixed_amount'
 *           // if fixed_multiplier: 'multiplier' => 0.5
 *           // if percent_below: 'multiplier' => 0.5, 'cap_pct' => 30
 *           // if fixed_amount: 'amount' => -10  (direct amount as used by 'op')
 *       ],
 *   ],
 *   'applies_to' => 'all' // optional
 * ]
 */

if (!function_exists('get_metric_value')) {
    function get_metric_value(array $summary, string $metric) {
        // basic direct lookup first
        if (array_key_exists($metric, $summary)) return $summary[$metric];

        // try normalized variants (strip suffixes/prefixes)
        $candidates = [
            $metric,
            $metric . '_percentage',
            $metric . '_percent',
            str_replace('.', '_', $metric),
            str_replace(['%',' '], ['', '_'], $metric),
        ];
        foreach ($candidates as $c) {
            if (array_key_exists($c, $summary)) return $summary[$c];
        }

        // Try some common synonyms
        $syn = [
            'happiness_percentage' => ['happiness','happiness_total','happiness_current','happiness_effective'],
            'popularity_percentage' => ['popularity','popularity_total','popularity_effective','popularity_value'],
        ];
        foreach ($syn as $key => $alts) {
            if ($metric === $key) {
                foreach ($alts as $a) if (array_key_exists($a, $summary)) return $summary[$a];
            }
        }

        // Not found
        return null;
    }
}

if (!function_exists('evaluate_condition')) {
    function evaluate_condition(float $left, string $op, float $right): bool {
        switch (strtolower($op)) {
            case 'lt':  return $left <  $right;
            case 'lte': return $left <= $right;
            case 'gt':  return $left >  $right;
            case 'gte': return $left >= $right;
            case 'eq':  return $left == $right;
            case 'neq': return $left != $right;
            default:    return false;
        }
    }
}

if (!function_exists('compute_effect_amount')) {
    /**
     * Compute the 'amount' field used by your buff schema (usually percent when op==='mult')
     * Returns numeric amount (signed) or null if cannot compute.
     *
     * $metricValue and $threshold are floats.
     */
    function compute_effect_amount(array $effectSpec, float $metricValue, float $threshold): ?float {
        $calc = $effectSpec['calc'] ?? null;
        $op = strtolower($effectSpec['op'] ?? 'mult');

        if (!$calc || !is_array($calc)) {
            // If no calc provided but an explicit amount exists, use it
            if (isset($effectSpec['amount'])) return (float)$effectSpec['amount'];
            return null;
        }

        $type = $calc['type'] ?? '';

        if ($type === 'fixed_multiplier') {
            // multiplier is direct (e.g. 0.5 => -50)
            $mult = (float)($calc['multiplier'] ?? ($calc['m'] ?? 1.0));
            if ($op === 'mult') {
                return ($mult - 1.0) * 100.0;
            }
            // if other ops, treat multiplier as passthrough value
            return $mult;
        }

        if ($type === 'percent_below') {
            // used for "each percent below threshold -> X% penalty"
            // multiplier = penalty per percent below (e.g. 0.5 => 1 pct under => 0.5% penalty)
            $multPerPct = (float)($calc['multiplier'] ?? 0.0);
            $capPct = isset($calc['cap_pct']) ? (float)$calc['cap_pct'] : null;
            $below = max(0.0, $threshold - $metricValue);
            $penalty = $below * $multPerPct; // in percentage-points
            if ($capPct !== null) $penalty = min($capPct, $penalty);
            // By convention, penalty should be negative if it's a slowdown / reduction
            // Caller effectSpec should indicate whether it's penalty (we return negative)
            // We return -penalty (so -5 => -5% amount for op='mult').
            return -1.0 * $penalty;
        }

        if ($type === 'fixed_amount') {
            return (float)($calc['amount'] ?? $effectSpec['amount'] ?? null);
        }

        return null;
    }
}

if (!function_exists('compute_stats_buffs')) {
    /**
     * Main entrypoint.
     * - $summary: normalized summary array (should contain happiness_percentage / popularity_percentage etc.)
     * - $rules: optional array of rule definitions. If null, default rules are used.
     *
     * Returns array of buff-arrays ready to be merged into activeBuffs.
     */
    function compute_stats_buffs(array $summary, ?array $rules = null): array {
        $out = [];

        // Default rules (covers the ones you asked for)
        $defaultRules = [
            // happiness < 25% => reduce money yield (multiplier 0.7 => -30%)
            [
                'id' => 'happy_under_35',
                'name' => 'Low happiness',
                'metric' => 'happiness_percentage',
                'op' => 'lt',
                'value' => 35,
                'effect' => [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'calc' => ['type' => 'percent_below', 'multiplier' => 2],
                ],
                'applies_to' => 'all',
            ],
            // happiness < 10% => stronger penalty
            [
                'id' => 'happy_under_10',
                'name' => 'Very low happiness',
                'metric' => 'happiness_percentage',
                'op' => 'lt',
                'value' => 10,
                'effect' => [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'calc' => ['type' => 'fixed_multiplier', 'multiplier' => 0.5],
                ],
                'applies_to' => 'all',
            ],
            // popularity > 70% => bonus (faster speed)
            [
                'id' => 'pop_over_70',
                'name' => 'High popularity bonus',
                'metric' => 'popularity_percentage',
                'op' => 'gt',
                'value' => 70,
                'effect' => [
                    'kind' => 'speed',
                    'actions' => ['build','production','research'],
                    'op' => 'mult',
                    'calc' => ['type' => 'fixed_multiplier', 'multiplier' => 1.10], // 10% faster
                ],
                'applies_to' => 'all',
            ],
            // popularity < 50 => progressive slowdown (0.5% per pct under 50, capped at 30%)
            [
                'id' => 'pop_under_50',
                'name' => 'Low popularity slowdown',
                'metric' => 'popularity_percentage',
                'op' => 'lt',
                'value' => 50,
                'effect' => [
                    'kind' => 'speed',
                    'actions' => 'all',
                    'op' => 'mult',
                    'calc' => ['type' => 'percent_below', 'multiplier' => 1, 'cap_pct' => 30],
                ],
                'applies_to' => 'all',
            ],
            // popularity < 20 => hard penalty (fixed multiplier)
            [
                'id' => 'pop_under_10',
                'name' => 'Very low popularity penalty',
                'metric' => 'popularity_percentage',
                'op' => 'lt',
                'value' => 10,
                'effect' => [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'calc' => ['type' => 'fixed_multiplier', 'multiplier' => 0.6],
                ],
                'applies_to' => 'all',
            ],
        ];

        $rulesToUse = is_array($rules) ? $rules : $defaultRules;

        foreach ($rulesToUse as $rule) {
            if (!is_array($rule)) continue;
            $metric = $rule['metric'] ?? null;
            $op = $rule['op'] ?? 'lt';
            $threshold = isset($rule['value']) ? (float)$rule['value'] : null;
            if ($metric === null || $threshold === null) continue;

            $rawVal = get_metric_value($summary, $metric);
            if ($rawVal === null) continue;
            $val = (float)$rawVal;

            if (!evaluate_condition($val, $op, $threshold)) {
                continue;
            }

            $effect = $rule['effect'] ?? null;
            if (!is_array($effect)) continue;

            $amount = compute_effect_amount($effect, $val, $threshold);
            // If compute_effect_amount returned null but effect has explicit 'amount', use it
            if ($amount === null && isset($effect['amount'])) $amount = (float)$effect['amount'];

            // If still null, skip
            if ($amount === null) continue;

            // Compose buff object
            $buff = [
                'kind' => $effect['kind'] ?? 'res',
                'op' => $effect['op'] ?? 'mult',
                'amount' => $amount,
                'applies_to' => $rule['applies_to'] ?? ($effect['applies_to'] ?? 'all'),
                'source_id' => 'stat.' . ($rule['id'] ?? uniqid('rule_')),
                'name' => $rule['name'] ?? ($rule['id'] ?? 'stat_rule'),
            ];

            // add optional fields if present
            if (isset($effect['scope'])) $buff['scope'] = $effect['scope'];
            if (isset($effect['mode']))  $buff['mode']  = $effect['mode'];
            if (isset($effect['actions'])) $buff['actions'] = $effect['actions'];

            $out[] = $buff;
        }

        return $out;
    }
}
?>