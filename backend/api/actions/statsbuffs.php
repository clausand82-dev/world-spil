<?php
/**
 * statsbuffs.php
 * Beregner dynamiske buffs baseret på summary-data (fx happiness, popularity).
 *
 * Eksporteret funktion:
 * - compute_stats_buffs(array $summary): array  -- returnerer liste af buff-arrays
 *
 * Outputformat matches eksisterende buff-schema:
 * ['kind'=>'res','scope'=>'res.money','mode'=>'yield','op'=>'mult','amount'=>-50,'applies_to'=>'all','source_id'=>'stat.happy_low']
 */

if (!function_exists('get_stat_percentage')) {
    /**
     * Prøv at finde procentværdi for en stat i $summary.
     * Acceptér flere feltnavne for kompatibilitet.
     * $key er basal-navn fx 'happiness' eller 'popularity'
     *
     * Normaliseringsregler:
     * - Hvis værdien er en fraction i intervallet [0,1] antages det at være 0..1 → multiplicér med 100.
     * - Hvis værdien er >1 og <=100 antages det at være procent allerede.
     * - Hvis total/max findes, returnér (total/max)*100.
     * - Returnerer null hvis ikke tilgængeligt.
     */
    function get_stat_percentage(array $summary, string $key): ?float {
        // Kandidatnøgler (prioriter direkte procentfelter)
        $directPctKeys = [
            "{$key}_percentage",
            "{$key}_pct",
            "{$key}.percentage",
            $key,
        ];

        foreach ($directPctKeys as $k) {
            if (array_key_exists($k, $summary) && is_numeric($summary[$k])) {
                $raw = (float)$summary[$k];
                // Hvis råværdi er en fraction (0..1), antag 0..1 skala og konverter til pct
                if ($raw >= 0.0 && $raw <= 1.0) {
                    return $raw * 100.0;
                }
                // Hvis råværdi er rimelig procent (0..100), returnér som pct (men clamp mellem 0 og 100)
                if ($raw > 1.0 && $raw <= 10000.0) { // tillad større tal men clamp
                    return max(0.0, min(100.0, $raw));
                }
                // hvis negative eller mærkeligt stort, ignorer og fortsæt
            }
        }

        // Total/max par: total og max findes i summary (fx popularity_total / popularity_max)
        if (isset($summary["{$key}_total"]) && isset($summary["{$key}_max"]) && is_numeric($summary["{$key}_max"]) && (float)$summary["{$key}_max"] > 0.0) {
            $total = (float)$summary["{$key}_total"];
            $max = (float)$summary["{$key}_max"];
            $pct = ($total / $max) * 100.0;
            return max(0.0, min(100.0, $pct));
        }
        if (isset($summary["{$key}_current"]) && isset($summary["{$key}_max"]) && is_numeric($summary["{$key}_max"]) && (float)$summary["{$key}_max"] > 0.0) {
            $cur = (float)$summary["{$key}_current"];
            $max = (float)$summary["{$key}_max"];
            $pct = ($cur / $max) * 100.0;
            return max(0.0, min(100.0, $pct));
        }

        return null;
    }
}

/**
 * Backwards-compatible helper som nogle ældre steder forventer.
 * Hvis du før brugte get_happiness_percentage($summaryOrUser), så virker det stadig.
 * Acceptér enten hele $summary fra alldata eller direkte $state['user'] array.
 */
if (!function_exists('get_happiness_percentage')) {
    function get_happiness_percentage($summaryOrUser): ?float {
        if (!is_array($summaryOrUser)) return null;
        $maybe = get_stat_percentage($summaryOrUser, 'happiness');
        if ($maybe !== null) return $maybe;
        if (isset($summaryOrUser['happiness']) && is_numeric($summaryOrUser['happiness'])) {
            $raw = (float)$summaryOrUser['happiness'];
            return ($raw >= 0.0 && $raw <= 1.0) ? $raw * 100.0 : max(0.0, min(100.0, $raw));
        }
        return null;
    }
}

if (!function_exists('compute_stats_buffs')) {
    function compute_stats_buffs(array $summary): array {
        $buffs = [];

        // --- HAPPINESS ---
        $hPerc = get_stat_percentage($summary, 'happiness');
        if ($hPerc !== null) {
            if ($hPerc < 25.0) {
                $multiplier = 0.5; $pct = ($multiplier - 1.0) * 100.0;
                $buffs[] = [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'amount' => $pct,
                    'applies_to' => 'all',
                    'source_id' => 'stat.happiness_low_half_money_yield',
                ];
            }
            if ($hPerc < 10.0) {
                $multiplier = 0.7; $pct = ($multiplier - 1.0) * 100.0;
                $buffs[] = [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'amount' => $pct,
                    'applies_to' => 'all',
                    'source_id' => 'stat.happiness_verylow_money_yield',
                ];
            }
        }

        // --- POPULARITY: eksempler på thresholds/effekter ---
        $pPerc = get_stat_percentage($summary, 'popularity');
        if ($pPerc !== null) {
            // Høj popularitet => bonus til penge-udbytte
            if ($pPerc >= 70.0) {
                $pct = 10.0; // +10%
                $buffs[] = [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'amount' => $pct,
                    'applies_to' => 'all',
                    'source_id' => 'stat.popularity_high_money_bonus',
                ];
            }

            // Lav popularitet => straf på penge-udbytte
            if ($pPerc < 30.0) {
                $pct = -20.0; // -20%
                $buffs[] = [
                    'kind' => 'res',
                    'scope' => 'res.money',
                    'mode' => 'yield',
                    'op' => 'mult',
                    'amount' => $pct,
                    'applies_to' => 'all',
                    'source_id' => 'stat.popularity_low_money_penalty',
                ];
            }

            // defensiv speed-tilføjelse: kun hvis vi har en klar popularity_pct værdi i summary
            $pPerc = get_stat_percentage($summary, 'popularity');
            // kun acceptér hvis get_stat_percentage returnerede en værdi indenfor 0..100
            if ($pPerc !== null && is_numeric($pPerc)) {
                $pPerc = (float)$pPerc;
                // klamp 0..100 for sikkerhed
                if ($pPerc < 0.0) $pPerc = 0.0;
                if ($pPerc > 100.0) $pPerc = 100.0;

                if ($pPerc < 10.0) {
                    $buffs[] = [
                        'kind' => 'speed',
                        'actions' => 'all',
                        'op' => 'mult',
                        'amount' => -15.0,
                        'applies_to' => 'all',
                        'source_id' => 'stat.popularity_verylow_speed_penalty',
                    ];
                }
            }
        }

        // --- ANDRE STATS: mønster for tilføjelse ---
        // Du kan gentage mønsteret for fx 'pollution', 'traffic', 'power' etc.

        return $buffs;
    }
}
?>