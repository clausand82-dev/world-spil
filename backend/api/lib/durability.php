<?php
declare(strict_types=1);

/**
 * Durability helper – beregner effektiv (on-read) durability for bygninger.
 *
 * Forudsætninger:
 * - defs.bld.<id>.durability = "max" (bygningens 100%)
 * - DB buildings.durability = aktuel absolut værdi (samme skala som defs.durability)
 * - buildings.last_repair_ts_utc = DATETIME NULL
 * - durability.buildingDecayStartDelay bruges KUN hvis last_repair_ts_utc er NULL
 * - durability.decayPerHour = absolut tab pr. time
 */

/**
 * Durability helper – beregner effektiv (on-read) durability for bygninger.
 *
 * Forudsætninger:
 * - defs.bld.<id>.durability = "max" (bygningens 100%)
 * - DB buildings.durability = aktuel absolut værdi (samme skala som defs.durability)
 * - buildings.last_repair_ts_utc = DATETIME NULL
 * - durability.buildingDecayStartDelay bruges KUN hvis last_repair_ts_utc er NULL
 * - durability.decayPerHour = absolut tab pr. time
 */

if (!function_exists('dur__parse_duration_to_hours')) {
  function dur__parse_duration_to_hours($v): float {
    if ($v === null) return 0.0;
    if (is_numeric($v)) return max(0.0, (float)$v); // antag timer
    $s = strtolower(trim((string)$v));
    if ($s === '') return 0.0;
    if (preg_match('~^(\d+(?:\.\d+)?)([smhd])$~', $s, $m)) {
      $num = (float)$m[1];
      $unit = $m[2];
      switch ($unit) {
        case 's': return $num / 3600.0;
        case 'm': return $num / 60.0;
        case 'h': return $num;
        case 'd': return $num * 24.0;
      }
    }
    if (is_numeric($s)) return max(0.0, (float)$s);
    return 0.0;
  }
}

if (!function_exists('dur__cfg')) {
  function dur__cfg(array $cfg): array {
    $raw = $cfg['durability'] ?? [];
    $startDelayH = dur__parse_duration_to_hours($raw['buildingDecayStartDelay'] ?? '48h');
    $decayPerHour = (float)($raw['decayPerHour'] ?? 0.0);
    return [
      'start_delay_h'   => max(0.0, $startDelayH),
      'decay_per_hour'  => max(0.0, $decayPerHour),
    ];
  }
}

if (!function_exists('dur__ts_to_unix')) {
  function dur__ts_to_unix(?string $ts): ?int {
    if (!$ts) return null;
    $ts = trim($ts);
    if ($ts === '') return null;
    $u = strtotime(str_replace(' ', 'T', $ts));
    return $u === false ? null : $u;
  }
}

if (!function_exists('dur__effective_abs')) {
  function dur__effective_abs(float $defMax, float $rowDur, ?string $createdAt, ?string $lastRepairTsUtc, ?int $nowTs, array $cfg): float {
    $defMax = max(0.0, $defMax);
    $rowDur = max(0.0, $rowDur);
    if ($defMax <= 0.0) return 0.0;

    $now = $nowTs ?? time();
    $c   = dur__cfg($cfg);
    $decayPerHour = $c['decay_per_hour'];

    if ($decayPerHour <= 0.0) return min($rowDur, $defMax);

    $createdTs = dur__ts_to_unix($createdAt) ?? $now;
    $repairTs  = dur__ts_to_unix($lastRepairTsUtc);

    if ($repairTs !== null) {
      $decayStart = $repairTs;
    } else {
      $decayStart = $createdTs + (int)round(($c['start_delay_h'] ?? 0.0) * 3600.0);
    }

    $seconds = max(0, $now - $decayStart);
    if ($seconds <= 0) return min($rowDur, $defMax);

    $hours = $seconds / 3600.0;
    $decay = $hours * $decayPerHour;

    $eff = max(0.0, $rowDur - $decay);
    return min($eff, $defMax);
  }
}

if (!function_exists('dur__pct')) {
  function dur__pct(float $defMax, float $effAbs): int {
    if ($defMax <= 0) return 0;
    $pct = ($effAbs / $defMax) * 100.0;
    $pct = max(0.0, min(100.0, $pct));
    return (int)round($pct);
  }
}

/**
 * Repair preview: beregn pris (skaleret) for at gå til 100%
 * - Fra def: brug def['cost'] som basepris for AKTUELT level
 * - Skaler med missingPct * (repairCostFactor/100)
 * Returnerer assoc:
 *   ['missing_pct'=>float 0..1, 'factor_pct'=>float, 'cost'=>[{res_id,amount}, ...]]
 */
if (!function_exists('dur__repair_preview_for_def')) {
  function dur__repair_preview_for_def(array $def, float $effAbs, float $defMax, array $cfg): array {
    if (!function_exists('normalize_costs')) require_once __DIR__ . '/purchase_helpers.php';
    $baseCosts = normalize_costs($def['cost'] ?? []);
    $factorPct = (float)($cfg['durability']['repairCostFactor'] ?? 75.0);
    $factorMul = max(0.0, $factorPct) / 100.0;

    $missingPct = 0.0;
    if ($defMax > 0) {
      $missingPct = max(0.0, 1.0 - ($effAbs / $defMax));
    }
    $scaled = [];
    foreach ($baseCosts as $c) {
      $rid = (string)($c['res_id'] ?? '');
      $amt = (float)($c['amount'] ?? 0);
      if ($rid === '' || $amt <= 0) continue;
      $val = $amt * $missingPct * $factorMul;
      if ($val <= 0) continue;
      $scaled[] = ['res_id' => $rid, 'amount' => $val];
    }
    return [
      'missing_pct' => $missingPct,
      'factor_pct'  => $factorPct,
      'cost'        => $scaled,
    ];
  }
}

if (!function_exists('dur__parse_duration_to_hours')) {
  /**
   * Parser en varighedsværdi til timer. Understøtter tal eller "48h", "30m", "2d", "3600s".
   * Returnerer float timer.
   */
  function dur__parse_duration_to_hours($v): float {
    if ($v === null) return 0.0;
    if (is_numeric($v)) return max(0.0, (float)$v); // antag timer
    $s = strtolower(trim((string)$v));
    if ($s === '') return 0.0;
    if (preg_match('~^(\d+(?:\.\d+)?)([smhd])$~', $s, $m)) {
      $num = (float)$m[1];
      $unit = $m[2];
      switch ($unit) {
        case 's': return $num / 3600.0;
        case 'm': return $num / 60.0;
        case 'h': return $num;
        case 'd': return $num * 24.0;
      }
    }
    // Fallback: prøv som tal i timer uden suffix
    if (is_numeric($s)) return max(0.0, (float)$s);
    return 0.0;
  }
}

if (!function_exists('dur__cfg')) {
  /**
   * Udtræk relevante durability-parametre fra config.ini arrayet.
   * Returnerer assoc: ['start_delay_h'=>float, 'decay_per_hour'=>float]
   */
  function dur__cfg(array $cfg): array {
    $raw = $cfg['durability'] ?? [];
    $startDelayH = dur__parse_duration_to_hours($raw['buildingDecayStartDelay'] ?? '48h');
    $decayPerHour = (float)($raw['decayPerHour'] ?? 0.0);
    return [
      'start_delay_h'   => max(0.0, $startDelayH),
      'decay_per_hour'  => max(0.0, $decayPerHour),
      // repairCostFactor ikke nødvendig i trin 1
    ];
  }
}

if (!function_exists('dur__ts_to_unix')) {
  function dur__ts_to_unix(?string $ts): ?int {
    if (!$ts) return null;
    $ts = trim($ts);
    if ($ts === '') return null;
    // Antag "YYYY-MM-DD HH:MM:SS" (server-tid eller UTC – vi bruger bare differensen)
    $u = strtotime(str_replace(' ', 'T', $ts));
    return $u === false ? null : $u;
  }
}

if (!function_exists('dur__effective_abs')) {
  /**
   * Beregn effektiv absolut durability lige nu baseret på DB-værdien og decay-reglerne.
   *
   * @param float $defMax         Max durability fra defs (bygningens "100%")
   * @param float $rowDur         Aktuel DB durability (absolut)
   * @param string|null $createdAt           buildings.created_at
   * @param string|null $lastRepairTsUtc     buildings.last_repair_ts_utc
   * @param int|null $nowTs       UNIX now (valgfri; time())
   * @param array $cfg            Hele config-ini array (for at læse durability.*)
   * @return float                Effektiv absolut durability (ikke clamped til defMax, men aldrig < 0)
   */
  function dur__effective_abs(float $defMax, float $rowDur, ?string $createdAt, ?string $lastRepairTsUtc, ?int $nowTs, array $cfg): float {
    $defMax = max(0.0, $defMax);
    $rowDur = max(0.0, $rowDur);
    if ($defMax <= 0.0) return 0.0;

    $now = $nowTs ?? time();
    $c   = dur__cfg($cfg);
    $decayPerHour = $c['decay_per_hour'];

    // Hvis decay = 0, returnér rowDur direkte
    if ($decayPerHour <= 0.0) return min($rowDur, $defMax);

    $createdTs = dur__ts_to_unix($createdAt) ?? $now;
    $repairTs  = dur__ts_to_unix($lastRepairTsUtc);

    // Start-tid for decay:
    // - hvis last_repair_ts_utc er sat -> decay starter straks efter dette tidspunkt (INGEN delay)
    // - ellers: decay starter created_at + buildingDecayStartDelay (h)
    if ($repairTs !== null) {
      $decayStart = $repairTs; // ingen ekstra delay efter repair
    } else {
      $decayStart = $createdTs + (int)round(($c['start_delay_h'] ?? 0.0) * 3600.0);
    }

    // Timer siden decayStart
    $seconds = max(0, $now - $decayStart);
    if ($seconds <= 0) return min($rowDur, $defMax);

    $hours = $seconds / 3600.0;
    $decay = $hours * $decayPerHour;

    $eff = max(0.0, $rowDur - $decay);
    // clamp til defMax for visning
    return min($eff, $defMax);
  }
}

if (!function_exists('dur__pct')) {
  /**
   * Returnerer 0..100 (afrundet heltal) for effAbs/defMax.
   */
  function dur__pct(float $defMax, float $effAbs): int {
    if ($defMax <= 0) return 0;
    $pct = ($effAbs / $defMax) * 100.0;
    $pct = max(0.0, min(100.0, $pct));
    return (int)round($pct);
  }
}
