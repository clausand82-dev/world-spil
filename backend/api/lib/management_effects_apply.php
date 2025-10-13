<?php
declare(strict_types=1);

/**
 * Læg policy-effekter ind i $summary.
 * - Add/Sub: lægges i passende capacities/usages felter
 * - Mul/Div: håndteres som multiplikatorer (ganges på slut-kapacitet)
 * - sources: annoteres i $summary['statSources'][stat][]
 */
function management_apply_effects(array &$summary, array $effects): void {
  $stats   = (array)($effects['stats']   ?? []);
  $sources = (array)($effects['sources'] ?? []);

  $cap   =& $summary['capacities']; if (!is_array($cap))   $cap   = [];
  $usage =& $summary['usages'];     if (!is_array($usage)) $usage = [];
  $src   =& $summary['statSources'];if (!is_array($src))   $src   = [];

  // Splít simple pattern: *_Capacity, *_Usage; eller specielle nøgler
  $multipliers = []; // stat => factor

  foreach ($stats as $stat => $val) {
    // Hvis engine allerede kombinerer add/mul til én værdi, kan du her
    // skelne ved stat-navn. Alternativ: udvid engine til at outputte både add og mul separat.
    // Simpel taktik: hvis navnet ender på 'Multiplier' → multiplikator
    if (preg_match('/Multiplier$/', (string)$stat)) {
      $base = preg_replace('/Multiplier$/', '', (string)$stat);
      $multipliers[$base] = (float)$val;
      // registrér kilde som multiplier på base
      foreach (($sources[$stat] ?? []) as $s) $src[$base][] = $s + ['as' => 'multiplier'];
      continue;
    }

    if (preg_match('/Usage$/', (string)$stat)) {
      $usage[$stat] = ($usage[$stat] ?? 0) + (float)$val;
      foreach (($sources[$stat] ?? []) as $s) $src[$stat][] = $s;
    } else {
      // alt andet som capacity‑add
      $cap[$stat] = ($cap[$stat] ?? 0) + (float)$val;
      foreach (($sources[$stat] ?? []) as $s) $src[$stat][] = $s;
    }
  }

  // Anvend multiplikatorer til kendte kapacitetsfelter (efter add/sub)
  foreach ($multipliers as $base => $mul) {
    // typisk 'healthCapacity', 'healthDentistCapacity', etc.
    if (isset($cap[$base])) {
      $cap[$base] = (float)$cap[$base] * (float)$mul;
    } elseif (isset($summary['capacities'][$base])) {
      $summary['capacities'][$base] = (float)$summary['capacities'][$base] * (float)$mul;
    }
  }
}