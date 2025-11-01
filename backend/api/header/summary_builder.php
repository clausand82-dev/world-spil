<?php
declare(strict_types=1);

/**
 * summary_builder.php
 *
 * Reusable builder for user summary data (capacities, usages, happiness, citizens summary).
 * Mirrors the logic in backend/api/header/summary.php so consumers (fx alldata.php)
 * get the same happiness/usages/capacities that header/summary exposes to frontend.
 *
 * Usage:
 *   require_once __DIR__ . '/summary_builder.php';
 *   // you can pass precomputed defs as 4th arg to avoid reloading:
 *   $summary = build_user_summary($pdo, $uid, $cfg, $defs);
 *
 * Returns an array with keys:
 *   - capacities => assoc
 *   - usages     => assoc
 *   - parts      => assoc
 *   - partsList  => assoc
 *   - happiness  => result of happiness_calc_all(...) or adjusted result
 *   - citizens   => ['groupCounts'=>..., 'totals' => ...]
 *   - stage      => ['current' => $userStage]
 */

if (!function_exists('build_user_summary')) {
    /**
     * @param PDO $pdo
     * @param int $uid
     * @param array $cfg
     * @param array|null $providedDefs Optional; if you already have parsed $defs (res/bld/rsd/add/ani),
     *                                provide them here to avoid the builder attempting to load them itself.
     * @return array
     */
    function build_user_summary(PDO $pdo, int $uid, array $cfg = [], ?array $providedDefs = null): array {
        // Defensive: load config if not supplied
        if (empty($cfg)) {
            $path = realpath(__DIR__ . '/../data/config/config.ini') ?: (__DIR__ . '/../data/config/config.ini');
            if (is_file($path)) {
                $cfg = parse_ini_file($path, true, INI_SCANNER_TYPED) ?: [];
            } else {
                $cfg = [];
            }
        }

        // Try load helpers that header/summary.php uses (safe if absent)
        // Try multiple plausible locations so this builder works when called from alldata.php or header/
        $try_paths = [
            __DIR__,
            __DIR__ . '/../lib',
            __DIR__ . '/..',
            __DIR__ . '/header',
            __DIR__ . '/../../lib',    // <-- try backend/lib (common location)
            __DIR__ . '/../../../lib', // <-- try one level higher if necessary
            __DIR__ . '/../../../../lib',
        ];
        $require_once_safe = function(string $relPath) use ($try_paths) {
            foreach ($try_paths as $base) {
                $candidate = $base . '/' . ltrim($relPath, '/');
                if (is_file($candidate)) {
                    @require_once $candidate;
                    return true;
                }
            }
            return false;
        };

        if (!function_exists('cu_fetch_citizens_row')) {
            $require_once_safe('capacity_usage.php');
        }
        if (!function_exists('apply_effects')) {
            $require_once_safe('effects_rules.php');
        }
        if (!function_exists('apply_user_policies_to_summary')) {
            $require_once_safe('management_effects_integration.php');
        }
        if (!function_exists('happiness_calc_all')) {
            $require_once_safe('happiness.php');
        }
        if (!function_exists('metrics_registry')) {
            $require_once_safe('metrics_registry.php');
        }

        // Load defs if possible (reuse project's loader) — allow caller to provide defs as 4th arg
        $defs = ['res'=>[], 'bld'=>[], 'rsd'=>[], 'add'=>[], 'ani'=>[]];
        if (is_array($providedDefs) && !empty($providedDefs)) {
            $defs = $providedDefs;
        } elseif (function_exists('load_all_defs')) {
            try { $defs = load_all_defs(); } catch (Throwable $e) { /* ignore */ }
        } elseif (!empty($GLOBALS['defs']) && is_array($GLOBALS['defs'])) {
            // if caller placed parsed defs into $GLOBALS['defs'], use that
            $defs = $GLOBALS['defs'];
        } else {
            // last resort: try to locate backend/data/xml and do a minimal load (best-effort)
            $xmlDirCandidates = [
                realpath(__DIR__ . '/../data/xml'),
                realpath(__DIR__ . '/../../data/xml'),
                realpath(__DIR__ . '/data/xml'),
            ];
            foreach ($xmlDirCandidates as $cand) {
                if ($cand && is_dir($cand)) {
                    // attempt a small, cheap loader similar to load_resources_xml/load_buildings_xml if available
                    // but to keep this builder lightweight, skip heavy parsing here; consumer should pass $defs when possible
                    break;
                }
            }
        }

        // Load citizen defs helper (as header/summary does)
        $citDefs = [];
        if (function_exists('cu_load_defs_citizens')) {
            try { $citDefs = cu_load_defs_citizens($defs); } catch (Throwable $e) { $citDefs = []; }
        }

        $bldDefs = $defs['bld'] ?? [];
        $addDefs = $defs['add'] ?? [];
        $rsdDefs = $defs['rsd'] ?? [];
        $aniDefs = $defs['ani'] ?? [];
        $resDefs = $defs['res'] ?? [];

        // user stage
        $userStage = 0;
        try {
            $st = $pdo->prepare("SELECT currentstage FROM users WHERE user_id = ? LIMIT 1");
            $st->execute([$uid]);
            $userStage = (int)($st->fetchColumn() ?: 0);
        } catch (Throwable $e) {
            $userStage = 0;
        }

        // Citizens raw + counts if helpers available
        $rawCit = [];
        $counts = ['macro'=>[], 'fine'=>[]];
        if (function_exists('cu_fetch_citizens_row')) {
            try { $rawCit = cu_fetch_citizens_row($pdo, $uid); } catch (Throwable $e) { $rawCit = []; }
        }
        if (function_exists('cu_group_counts')) {
            try { $counts = cu_group_counts($rawCit); } catch (Throwable $e) { $counts = ['macro'=>[], 'fine'=>[]]; }
        }
        $macro = $counts['macro'] ?? [];
        $fine  = $counts['fine'] ?? [];
        $totalPersons = (int)($macro['baby'] ?? 0) + (int)($macro['kids'] ?? 0) + (int)($macro['young'] ?? 0) + (int)($macro['adultsTotal'] ?? 0) + (int)($macro['old'] ?? 0);

        // Build CAP_KEYS from registry if available
        $CAP_KEYS = [];
        if (function_exists('metrics_registry')) {
            try {
                $registry = metrics_registry();
                foreach ($registry as $id => $m) {
                    $capField = (string)($m['capacityField'] ?? '');
                    if ($capField === '') continue;
                    if (!isset($CAP_KEYS[$capField])) {
                        $keys = array_values(array_unique(array_filter((array)($m['capacityStatKeys'] ?? []))));
                        if ($keys) $CAP_KEYS[$capField] = $keys;
                    }
                }
            } catch (Throwable $e) {
                $CAP_KEYS = [];
            }
        }

        // Compute capacities (reuse cu_* helper functions if available)
        $capacities = [];
        $parts = [];
        $partsList = [];
        foreach ($CAP_KEYS as $capName => $keys) {
            $b = 0.0; $a = 0.0; $r = 0.0; $ani = 0.0; $inv = 0.0;
            try {
                if (function_exists('cu_table_exists') && cu_table_exists($pdo, 'buildings') && function_exists('cu_sum_capacity_from_table')) {
                    $b = cu_sum_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys);
                }
            } catch (Throwable $e) { $b = 0.0; }
            try {
                if (function_exists('cu_table_exists') && cu_table_exists($pdo, 'addon') && function_exists('cu_sum_capacity_from_table')) {
                    $a = cu_sum_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $keys);
                }
            } catch (Throwable $e) { $a = 0.0; }
            try {
                if (function_exists('cu_table_exists') && cu_table_exists($pdo, 'research') && function_exists('cu_sum_capacity_from_research')) {
                    $r = cu_sum_capacity_from_research($pdo, $uid, $rsdDefs, $keys);
                }
            } catch (Throwable $e) { $r = 0.0; }
            try {
                if (function_exists('cu_table_exists') && cu_table_exists($pdo, 'animals') && function_exists('cu_sum_capacity_from_animals')) {
                    $ani = cu_sum_capacity_from_animals($pdo, $uid, $aniDefs, $keys);
                }
            } catch (Throwable $e) { $ani = 0.0; }
            try {
                if (function_exists('cu_table_exists') && cu_table_exists($pdo, 'inventory') && function_exists('cu_sum_capacity_from_inventory')) {
                    $inv = cu_sum_capacity_from_inventory($pdo, $uid, $resDefs, $keys);
                }
            } catch (Throwable $e) { $inv = 0.0; }

            $capacities[$capName] = (float)($b + $a + $r + $ani + $inv);
            $parts[$capName] = ['buildings'=>(float)$b, 'addon'=>(float)$a, 'research'=>(float)$r, 'animals'=>(float)$ani, 'inventory'=>(float)$inv];

            // list parts if helper functions available
            try {
                $listB = (function_exists('cu_table_exists') && cu_table_exists($pdo,'buildings') && function_exists('cu_list_capacity_from_table')) ? cu_list_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys, 'cu_def_name') : [];
                $listA = (function_exists('cu_table_exists') && cu_table_exists($pdo,'addon') && function_exists('cu_list_capacity_from_table')) ? cu_list_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $keys, 'cu_def_name') : [];
                $listR = (function_exists('cu_table_exists') && cu_table_exists($pdo,'research') && function_exists('cu_list_capacity_from_research')) ? cu_list_capacity_from_research($pdo, $uid, $rsdDefs, $keys, 'cu_def_name') : [];
                $listAni = (function_exists('cu_table_exists') && cu_table_exists($pdo,'animals') && function_exists('cu_list_capacity_from_animals')) ? cu_list_capacity_from_animals($pdo, $uid, $aniDefs, $keys, 'cu_def_name') : [];
                $listInv = (function_exists('cu_table_exists') && cu_table_exists($pdo,'inventory') && function_exists('cu_list_capacity_from_inventory')) ? cu_list_capacity_from_inventory($pdo, $uid, $resDefs, $keys, 'cu_def_name') : [];
                $partsList[$capName] = ['buildings'=>$listB,'addon'=>$listA,'research'=>$listR,'animals'=>$listAni,'inventory'=>$listInv];
            } catch (Throwable $e) {
                $partsList[$capName] = [];
            }
        }

        // Build USAGE_FIELDS: start with static set if present in config (header keeps static list empty by default)
        $USAGE_FIELDS_STATIC = []; // keep empty to match header/summary.php default
        $USAGE_FIELDS = $USAGE_FIELDS_STATIC;
        if (function_exists('metrics_registry')) {
            try {
                $registry = metrics_registry();
                foreach ($registry as $id => $m) {
                    $usageField = (string)($m['usageField'] ?? '');
                    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
                    if ($usageField === '' || $userStage < $unlockAt) continue;
                    if (!in_array($usageField, $USAGE_FIELDS, true)) $USAGE_FIELDS[] = $usageField;
                }
            } catch (Throwable $e) {
                // ignore
            }
        }

        // Compute usages via cu_usage_breakdown if available
        $usages = [];
        foreach ($USAGE_FIELDS as $field) {
            try {
                if (function_exists('cu_usage_breakdown')) {
                    $usages[$field] = cu_usage_breakdown($rawCit, $citDefs ?: ($defs['citizens'] ?? []), $field, []);
                } else {
                    $usages[$field] = ['total'=>0.0,'breakdown'=>[],'infra'=>0.0];
                }
            } catch (Throwable $e) {
                $usages[$field] = ['total'=>0.0,'breakdown'=>[],'infra'=>0.0];
            }
        }

        // Add infra contributions from registry (same as header)
        if (function_exists('metrics_registry')) {
            try {
                $registry = metrics_registry();
                foreach ($registry as $id => $m) {
                    $usageField = (string)($m['usageField'] ?? '');
                    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
                    if ($usageField === '' || $userStage < $unlockAt) continue;
                    if (!empty($m['subs'])) continue;
                    $usageKeys = array_values(array_unique(array_filter((array)($m['usageStatKeys'] ?? []))));
                    if (empty($usageKeys)) continue;

                    $src = (array)($m['sources'] ?? []);
                    $infra = 0.0;
                    if (!empty($src['bld']) && function_exists('cu_table_exists') && cu_table_exists($pdo, 'buildings')) {
                        $infra += cu_sum_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $usageKeys);
                    }
                    if (!empty($src['add']) && function_exists('cu_table_exists') && cu_table_exists($pdo, 'addon')) {
                        $infra += cu_sum_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $usageKeys);
                    }
                    if (!empty($src['rsd']) && function_exists('cu_table_exists') && cu_table_exists($pdo, 'research')) {
                        $infra += cu_sum_capacity_from_research($pdo, $uid, $rsdDefs, $usageKeys);
                    }
                    if (!empty($src['ani']) && function_exists('cu_table_exists') && cu_table_exists($pdo, 'animals')) {
                        $infra += cu_sum_capacity_from_animals($pdo, $uid, $aniDefs, $usageKeys);
                    }
                    if (!empty($src['res']) && function_exists('cu_table_exists') && cu_table_exists($pdo, 'inventory')) {
                        $infra += cu_sum_capacity_from_inventory($pdo, $uid, $resDefs, $usageKeys);
                    }

                    if ($infra != 0.0) {
                        if (!isset($usages[$usageField])) $usages[$usageField] = ['total'=>0.0,'breakdown'=>[],'infra'=>0.0];
                        $usages[$usageField]['infra'] = (float)($usages[$usageField]['infra'] ?? 0) + (float)$infra;
                        $usages[$usageField]['total'] = (float)($usages[$usageField]['total'] ?? 0) + (float)$infra;
                    }
                }
            } catch (Throwable $e) {
                // ignore
            }
        }

        // Build initial $summary structure to allow policies to mutate it (header uses this)
        $summary = [
            'stage'      => ['current' => $userStage],
            'citizens'   => [
                'groupCounts' => $macro,
                'totals'      => ['totalPersons' => $totalPersons],
            ],
            'capacities' => $capacities,
            'usages'     => $usages,
            'statSources'=> [],
        ];

        // Apply user policies (if integration is available) so effects/policies can modify summary in same way header does
        if (function_exists('apply_user_policies_to_summary')) {
            try {
                apply_user_policies_to_summary($pdo, $uid, $summary);
                // After this, header also merges capChoice into parts; skip heavy merging here (consumer can inspect summary)
            } catch (Throwable $e) {
                // ignore policy failure
            }
        }

        // Reassign capacities/usages from possibly mutated summary
        $capacities = $summary['capacities'] ?? $capacities;
        $usages = $summary['usages'] ?? $usages;

        // === HAPPINESS: build metric pairs from cfg weights + registry (same algorithm as header) ===
        $happinessWeights  = $cfg['happiness'] ?? [];
        $happinessData = [];
        if (!empty($happinessWeights) && function_exists('happiness_calc_all')) {
            $happinessPairs = [];
            if (function_exists('metrics_registry')) {
                try {
                    $registry = metrics_registry();
                    foreach ($happinessWeights as $wKey => $_w) {
                        $base = preg_replace('/HappinessWeight$/', '', (string)$wKey);
                        if (!isset($registry[$base])) continue;
                        $m = $registry[$base];
                        if (isset($m['happiness']['enabled']) && !$m['happiness']['enabled']) continue;
                        $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
                        if ($userStage < $unlockAt) continue;
                        $uKey = $m['usageField'] ?? null;
                        $cKey = $m['capacityField'] ?? null;
                        $used = $uKey ? (float)($usages[$uKey]['total'] ?? 0) : 0.0;
                        $cap  = $cKey ? (float)($capacities[$cKey] ?? 0) : 0.0;
                        $happinessPairs[$base] = ['used'=>$used,'capacity'=>$cap];
                    }
                } catch (Throwable $e) {
                    $happinessPairs = [];
                }
            } else {
                // fallback: try mapping keys directly from summary.capacities
                foreach ($happinessWeights as $wKey => $_w) {
                    $base = preg_replace('/HappinessWeight$/', '', (string)$wKey);
                    $used = 0.0; $cap = 0.0;
                    if (isset($usages[$base]['total'])) $used = (float)$usages[$base]['total'];
                    if (isset($capacities[$base])) $cap = (float)$capacities[$base];
                    $happinessPairs[$base] = ['used'=>$used,'capacity'=>$cap];
                }
            }

            try {
                $hRes = happiness_calc_all($happinessPairs, $happinessWeights);
                $happinessData = $hRes;
            } catch (Throwable $e) {
                $happinessData = [];
            }
        }

        // === POPULARITY / DEMANDS / EFFECTS: compute effects and allow them to adjust happiness (same pattern as header) ===
        $popularityWeights = $cfg['popularity'] ?? [];
        $popularityData = [];
        if (!empty($popularityWeights) && function_exists('popularity_calc_all')) {
            // build pairs (similar to happiness) - omitted for brevity since not needed for happiness pipeline
            $popPairs = [];
            // ... could be filled if necessary
            try {
                $popularityData = popularity_calc_all($popPairs, $popularityWeights);
            } catch (Throwable $e) {
                $popularityData = [];
            }
        }

        $demandsData = [];
        if (function_exists('demands_evaluate_all')) {
            try {
                $registry = function_exists('metrics_registry') ? metrics_registry() : [];
                $demandsData = demands_evaluate_all($registry, $usages, $capacities, $counts, $cfg, $userStage);
            } catch (Throwable $e) {
                $demandsData = [];
            }
        }

        // Apply cross-cutting effects rules (header passes these into apply_effects)
        $effects = [];
        if (function_exists('apply_effects')) {
            try {
                $effects = apply_effects([
                    'demands'    => $demandsData,
                    'usages'     => $usages,
                    'capacities' => $capacities,
                    'happiness'  => $happinessData,
                    'popularity' => $popularityData,
                    'stage'      => $userStage,
                ]);
            } catch (Throwable $e) {
                $effects = [];
            }
        }

        // If effects include adjustments for happiness, apply them (same logic as header)
        if (!empty($effects['adjustments']['happiness'])) {
            $adj = $effects['adjustments']['happiness'];
            $mult = (float)($adj['mult'] ?? 1.0);
            $add  = (float)($adj['add'] ?? 0.0);

            // Best-effort hent baseline fra hRes
            $happyBaseline = 0.0;
            if (is_array($happinessData)) {
                foreach (['total','value','score','overall','happiness','mean'] as $k) {
                    if (isset($happinessData[$k]) && is_numeric($happinessData[$k])) {
                        $happyBaseline = (float)$happinessData[$k];
                        break;
                    }
                }
            } elseif (is_numeric($happinessData)) {
                $happyBaseline = (float)$happinessData;
            }

            $effective = $happyBaseline * $mult + $add;
            if (is_array($happinessData)) {
                $happinessData['effective'] = $effective;
                $happinessData['total'] = $effective;
            } else {
                $happinessData = ['total' => $effective, 'effective' => $effective];
            }
            if (!isset($effects['warnings'])) $effects['warnings'] = [];
            $effects['warnings'][] = sprintf('Applied happiness adjustment: mult=%.3f add=%.3f (baseline=%.3f -> effective=%.3f)', $mult, $add, $happyBaseline, $effective);
        }

        // Package and return
        $out = [
            'capacities' => $capacities,
            'usages'     => $usages,
            'parts'      => $parts,
            'partsList'  => $partsList,
            'happiness'  => $happinessData,
            'citizens'   => ['groupCounts' => $macro, 'totals' => ['totalPersons' => $totalPersons]],
            'stage'      => ['current' => $userStage],
            'effects'    => $effects,
        ];

        return $out;
    }
}
?>