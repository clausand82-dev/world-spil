<?php
declare(strict_types=1);

/**
 * Generate stat-driven buffs from a summary payload.
 * - Robust extraction (nested shapes)
 * - Normalize 0..1 -> 0..100
 * - Returns array of buff objects compatible with existing buffs format
 */

function _extract_numeric_from_mixed($val): ?float {
  if ($val === null) return null;
  if (is_numeric($val)) return (float)$val;
  if (!is_array($val)) return null;
  $candidates = ['effective','total','value','happiness','popularity','score'];
  foreach ($candidates as $k) {
    if (isset($val[$k]) && is_numeric($val[$k])) return (float)$val[$k];
  }
  foreach ($val as $child) {
    if (is_numeric($child)) return (float)$child;
    if (is_array($child)) {
      foreach (['effective','total','value','happiness','popularity','score'] as $k) {
        if (isset($child[$k]) && is_numeric($child[$k])) return (float)$child[$k];
      }
    }
  }
  return null;
}

function _normalize_pct(?float $v): ?float {
  if ($v === null) return null;
  if ($v > 0 && $v <= 1.0) return $v * 100.0;
  return $v;
}

function collect_stat_buffs_from_summary(array $summary): array {
  $out = [];

  $h_raw = $summary['happiness'] ?? null;
  $p_raw = $summary['popularity'] ?? null;

  $h = _extract_numeric_from_mixed($h_raw);
  $p = _extract_numeric_from_mixed($p_raw);

  $h = _normalize_pct($h);
  $p = _normalize_pct($p);

  // Debug-log (fjern senere hvis det bliver for støjende)
  error_log(sprintf('STAT_BUFFS: extracted happiness=%s popularity=%s', var_export($h, true), var_export($p, true)));

  // Happiness rules
  if (is_numeric($h)) {
    if ($h <= 50.0) {
      $out[] = [
        'kind' => 'res',
        'scope' => 'all',
        'mode' => 'yield',
        'op' => 'mult',
        'amount' => -50.0,
        'applies_to' => 'all',
        'source_id' => 'stat:happiness',
      ];
      error_log('STAT_BUFFS: applied rule -> happiness <= 50 -> halved yields');
    } elseif ($h >= 75.0) {
      $out[] = [
        'kind' => 'res',
        'scope' => 'all',
        'mode' => 'yield',
        'op' => 'mult',
        'amount' => 100.0,
        'applies_to' => 'all',
        'source_id' => 'stat:happiness',
      ];
      error_log('STAT_BUFFS: applied rule -> happiness >= 75 -> double yields');
    }
  }

  // Popularity rules
  if (is_numeric($p)) {
    if ($p <= 25.0) {
      $out[] = [
        'kind' => 'speed',
        'actions' => ['build','research','upgrade'],
        'op' => 'mult',
        'amount' => -50.0,
        'applies_to' => 'all',
        'source_id' => 'stat:popularity',
      ];
      error_log('STAT_BUFFS: applied rule -> popularity <= 25 -> +50% duration');
    }
  }

  error_log(sprintf('STAT_BUFFS: produced %d buff(s)', count($out)));
  return $out;
}