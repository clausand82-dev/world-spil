<?php
declare(strict_types=1);

/**
 * Robust stat-driven buff generator.
 * - Rekursiv søgning efter 'happiness' / 'popularity' tal i payload
 * - Normaliserer 0..1 -> 0..100
 * - Returnerer buff-array kompatibelt med eksisterende format
 */

function _find_numeric_by_keys_recursive($arr, array $keys) {
  if ($arr === null) return null;
  if (is_numeric($arr)) return (float)$arr;
  if (!is_array($arr)) return null;

  // direkte kandidatnøgler i denne node
  foreach ($keys as $k) {
    if (isset($arr[$k]) && is_numeric($arr[$k])) return (float)$arr[$k];
  }
  // nogle felter bruger 'effective'/'total' etc.
  foreach (['effective','total','value','score'] as $cand) {
    if (isset($arr[$cand]) && is_numeric($arr[$cand])) return (float)$arr[$cand];
  }

  // dyk ned rekursivt
  foreach ($arr as $v) {
    if (is_array($v)) {
      $found = _find_numeric_by_keys_recursive($v, $keys);
      if ($found !== null) return $found;
    } else if (is_numeric($v)) {
      // fallback: et numerisk barn kan også være relevant
      return (float)$v;
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
  // Accept wrapper shapes: hvis caller utils sender ['ok'=>..., 'data'=>...] håndter det
  if (isset($summary['data']) && is_array($summary['data'])) {
    $summary = $summary['data'];
  }

  // Nøgler vi kigger efter
  $h_keys = ['happiness','happinessScore','happiness_pct'];
  $p_keys = ['popularity','popularityScore','popularity_pct'];

  $h_raw = $summary['happiness'] ?? null;
  $p_raw = $summary['popularity'] ?? null;

  // Først forsøg direkte extraction via helper (kaster et blik på node)
  $h = _find_numeric_by_keys_recursive($h_raw ?? $summary, $h_keys);
  $p = _find_numeric_by_keys_recursive($p_raw ?? $summary, $p_keys);

  // sidste fallback: scan hele summary efter passende nøgler
  if ($h === null) $h = _find_numeric_by_keys_recursive($summary, $h_keys);
  if ($p === null) $p = _find_numeric_by_keys_recursive($summary, $p_keys);

  $h = _normalize_pct($h);
  $p = _normalize_pct($p);

  $out = [];

  // Apply rules (tilpas som du ønsker)
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
    }
  }

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
    }
  }

  return $out;
}