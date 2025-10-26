<?php
declare(strict_types=1);

/**
 * Generate stat-driven buffs from a summary payload.
 * Returns an array of buff objects compatible with actions/buffs.php.
 *
 * Rules implemented (same som tidligere):
 *  - if happiness <= 50: all resource yields halved (amount = -50)
 *  - if happiness >= 75: all resource yields doubled (amount = 100)
 *  - if popularity <= 25: build/research/upgrade times increased by 50% (speed amount = -50)
 *
 * Extend this file to add more rules later.
 */

function collect_stat_buffs_from_summary(array $summary): array {
  $out = [];

  $extract_numeric = function($val) {
    if ($val === null) return null;
    if (is_array($val)) {
      if (isset($val['effective'])) return (float)$val['effective'];
      if (isset($val['total'])) return (float)$val['total'];
      if (isset($val['value'])) return (float)$val['value'];
      return null;
    }
    if (is_numeric($val)) return (float)$val;
    return null;
  };

  $happiness = null;
  if (isset($summary['happiness'])) $happiness = $extract_numeric($summary['happiness']);
  $popularity = null;
  if (isset($summary['popularity'])) $popularity = $extract_numeric($summary['popularity']);

  // Happiness rules
  if (is_numeric($happiness)) {
    if ($happiness <= 50.0) {
      $out[] = [
        'kind' => 'res',
        'scope' => 'all',
        'mode' => 'yield',
        'op' => 'mult',
        'amount' => -50.0,
        'applies_to' => 'all',
        'source_id' => 'stat:happiness',
      ];
    } elseif ($happiness >= 75.0) {
      $out[] = [
        'kind' => 'res',
        'scope' => 'all',
        'mode' => 'yield',
        'op' => 'mult',
        'amount' => 100.0,
        'applies_to' => 'all',
        'source_id' => 'stat:happiness',
      ];
    }
  }

  // Popularity rules
  if (is_numeric($popularity)) {
    if ($popularity <= 25.0) {
      $out[] = [
        'kind' => 'speed',
        'actions' => ['build','research','upgrade'],
        'op' => 'mult',
        'amount' => -50.0,
        'applies_to' => 'all',
        'source_id' => 'stat:popularity',
      ];
    }
  }

  return $out;
}