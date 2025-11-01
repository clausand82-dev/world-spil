<?php
/**
 * statsbuffs.php
 * Beregner dynamiske buffs baseret på summary-data (fx happiness).
 * Placér filen fx i api/actions/.
 *
 * Eksporteret funktion:
 * - compute_stats_buffs(array $summary): array  -- returnerer liste af buff-arrays
 *
 * Buff-format (eksempel):
 * [
 *   'id'       => 'string_unique_id',
 *   'target'   => 'res.money' | 'yield' | '... (tilpas efter eget schema)',
 *   'operator' => 'multiply' | 'add' | 'percent', // hvordan value skal anvendes
 *   'value'    => 0.5, // for multiply => multiplier (0.5 = halver), for add => flat tal, for percent => ± procent som -50
 *   'reason'   => 'Forklaring',
 *   'priority' => 100
 * ]
 */

if (!function_exists('get_happiness_percentage')) {
    /**
     * Forsøger at finde og returnere happiness i procent (0..100).
     * Acceptér flere mulige feltnavne i $summary for kompatibilitet.
     *
     * Normaliserer også fraction-formater (0..1) til procent (ganger med 100).
     */
    function get_happiness_percentage(array $summary): ?float {
        $val = null;

        // Hvis summary allerede indeholder procentværdi
        if (isset($summary['happiness_percentage'])) {
            $val = (float)$summary['happiness_percentage'];
        }

        // Hvis summary indeholder total og max
        if ($val === null && isset($summary['happiness_total']) && isset($summary['happiness_max']) && $summary['happiness_max'] > 0) {
            $val = ((float)$summary['happiness_total'] / (float)$summary['happiness_max']) * 100.0;
        }

        // Hvis summary indeholder et enkelt tal "happiness" antaget 0..100 eller 0..1
        if ($val === null && isset($summary['happiness'])) {
            $val = (float)$summary['happiness'];
        }

        // Hvis summary indeholder breakdown: current / max
        if ($val === null && isset($summary['happiness_current']) && isset($summary['happiness_max']) && $summary['happiness_max'] > 0) {
            $val = ((float)$summary['happiness_current'] / (float)$summary['happiness_max']) * 100.0;
        }

        if ($val === null) return null;

        // Hvis værdien ser ud til at være en fraction i 0..1 (fx 0.19), konvertér til procent
        if ($val >= 0.0 && $val <= 1.0) {
            $val = $val * 100.0;
        }

        // Clamp til 0..100 for sikkerhed
        if ($val < 0.0) $val = 0.0;
        if ($val > 100.0) $val = 100.0;

        return $val;
    }
}

if (!function_exists('compute_stats_buffs')) {
    /**
     * Beregn buffs baseret på summary-data.
     *
     * I første omgang: hvis happiness < 25% så reducér res.money yield,
     * og hvis happiness < 10% så påfør en ekstra (mere alvorlig) reduktion.
     * Returnerer array af buff-arrays (kan være tom).
     *
     * Outputformat matches eksisterende buff-schema:
     * ['kind'=>'res','scope'=>'res.money','mode'=>'yield','op'=>'mult','amount'=>-50,'applies_to'=>'all','source_id'=>'stat.happy_low']
     */
    function compute_stats_buffs(array $summary): array {
        $buffs = [];

        $hPerc = get_happiness_percentage($summary);

        if ($hPerc === null) return $buffs;

        // Tærskel (25%)
        if ($hPerc < 25.0) {
            // Vi udtrykker mult som procent for frontend: pct = (multiplier - 1) * 100
            // Eksempel: multiplier = 0.5 => pct = -50 (halvering)
            $multiplier = 0.5;
            $pct = ($multiplier - 1.0) * 100.0;

            $buffs[] = [
                // match eksisterende "res"-schema
                'kind'       => 'res',
                'scope'      => 'res.money',
                'mode'       => 'yield',
                'op'         => 'mult',
                'amount'     => $pct,
                'applies_to' => 'all',
                'source_id'  => 'stat.happiness_low_half_money_yield',
            ];
        }

        // Meget lav happiness (10%)
        if ($hPerc < 10.0) {
            // Her bruges en mindre reduktion (fx 0.7 -> -30%)
            $multiplier = 0.7;
            $pct = ($multiplier - 1.0) * 100.0;

            $buffs[] = [
                'kind'       => 'res',
                'scope'      => 'res.money',
                'mode'       => 'yield',
                'op'         => 'mult',
                'amount'     => $pct,
                'applies_to' => 'all',
                'source_id'  => 'stat.happiness_verylow_half_money_yield',
            ];
        }

        return $buffs;
    }
}
?>