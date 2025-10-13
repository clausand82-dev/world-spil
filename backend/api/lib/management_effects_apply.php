<?php
declare(strict_types=1);

/**
 * Læg policy-effekter ind i $summary.
 * - Add/Sub: lægges i passende capacities/usages
 * - *Multiplier: multipliceres på capacities efter add/sub
 * - Kilder gemmes i $summary['statSources'][stat][]
 */
function management_apply_effects(array &$summary, array $effects): void {
  $stats   = (array)($effects['stats']   ?? []);
  $sources = (array)($effects['sources'] ?? []);

  if (!isset($summary['capacities']) || !is_array($summary['capacities'])) $summary['capacities'] = [];
  if (!isset($summary['usages'])     || !is_array($summary['usages']))     $summary['usages']     = [];
  if (!isset($summary['statSources'])|| !is_array($summary['statSources']))$summary['statSources']= [];

  $cap =& $summary['capacities'];
  $use =& $summary['usages'];
  $src =& $summary['statSources'];

  // 1) Først add/sub
  $multipliers = []; // baseStat => factor
  foreach ($stats as $key => $val) {
    if (preg_match('/Multiplier$/', (string)$key)) {
      $base = preg_replace('/Multiplier$/', '', (string)$key);
      $multipliers[$base] = (float)$val;
      foreach (($sources[$key] ?? []) as $s) {
        $src[$base][] = $s + ['as' => 'multiplier'];
      }
      continue;
    }

    if (preg_match('/Usage$/', (string)$key)) {
      $use[$key] = ($use[$key] ?? 0) + (float)$val;
      foreach (($sources[$key] ?? []) as $s) $src[$key][] = $s;
    } else {
      $cap[$key] = ($cap[$key] ?? 0) + (float)$val;
      foreach (($sources[$key] ?? []) as $s) $src[$key][] = $s;
    }
  }

  // 2) Anvend multiplikatorer på kendte kapacitetsfelter
  foreach ($multipliers as $base => $factor) {
    if (isset($cap[$base])) {
      $cap[$base] = (float)$cap[$base] * (float)$factor;
    } elseif (isset($summary['capacities'][$base])) {
      $summary['capacities'][$base] = (float)$summary['capacities'][$base] * (float)$factor;
    }
  }
}