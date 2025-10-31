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
     */
    function get_stat_percentage(array $summary, string $key): ?float {
        $pctKeys = [
            "{$key}_percentage",
            "{$key}_pct",
            "{$key}.percentage",
            "{$key}_total", "{$key}_max", "{$key}", "{$key}_current",
        ];

        // direkte procentfelter først (hurtigcheck)
        foreach ($pctKeys as $k) {
            if (isset($summary[$k]) && is_numeric($summary[$k])) {
                // Hvis total/max format returneres nedenfor; hvis det allerede er procent, returnér direkte
                if (stripos($k, '_percentage') !== false || stripos($k, '_pct') !== false || $k === $key) {
                    return (float)$summary[$k];
                }
            }
        }

        // generisk søgning: hvis der findes *_percentage eller nøgle == key returnér det
        if (isset($summary["{$key}_percentage"])) return (float)$summary["{$key}_percentage"];
        if (isset($summary["{$key}_pct"])) return (float)$summary["{$key}_pct"];
        if (isset($summary[$key]) && is_numeric($summary[$key])) return (float)$summary[$key];

        // total/max par
        if (isset($summary["{$key}_total"]) && isset($summary["{$key}_max"]) && $summary["{$key}_max"] > 0) {
            return ((float)$summary["{$key}_total"] / (float)$summary["{$key}_max"]) * 100.0;
        }
        if (isset($summary["{$key}_current"]) && isset($summary["{$key}_max"]) && $summary["{$key}_max"] > 0) {
            return ((float)$summary["{$key}_current"] / (float)$summary["{$key}_max"]) * 100.0;
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
        // Hvis caller gav et array med summary-agtige keys (happiness_percentage el. happiness_total)
        if (is_array($summaryOrUser)) {
            $maybe = get_stat_percentage($summaryOrUser, 'happiness');
            if ($maybe !== null) return $maybe;
            // fallback: prøv at tolke som state['user'] struktur (har måske 'happiness' felt)
            if (isset($summaryOrUser['happiness']) && is_numeric($summaryOrUser['happiness'])) {
                return (float)$summaryOrUser['happiness'];
            }
        }
        return null;
    }
}

if (!function_exists('compute_stats_buffs')) {
    function compute_stats_buffs(array $summary): array {
        $buffs = [];

        // --- HAPPINESS (som før) ---
        $hPerc = get_stat_percentage($summary, 'happiness');
        if ($hPerc !== null) {
            if ($hPerc < 25.0) {
                $multiplier = 0.6; $pct = ($multiplier - 1.0) * 100.0;
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
                $multiplier = 0.5; $pct = ($multiplier - 1.0) * 100.0;
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

            // Meget lav => reducer bygningers speed
            if ($pPerc < 10.0) {
                $buffs[] = [
                    'kind' => 'speed',
                    'actions' => 'all',
                    'op' => 'mult',
                    'amount' => 15, // øg varighed med 15%
                    'applies_to' => 'all',
                    'source_id' => 'stat.popularity_verylow_speed_penalty',
                ];
            }
        }

        // --- ANDRE STATS: mønster for tilføjelse ---
        // Du kan gentage mønsteret for fx 'pollution', 'traffic', 'power' etc.

        return $buffs;
    }
}
?>