<?php
declare(strict_types=1);

require_once __DIR__ . '/policy_engine.php';

/**
 * Minimal input-validering til choices.php
 * - Tillader bool/number/string/array af primitive værdier
 */
function management_normalize_kv(string $family, string $key, &$value): void {
  if (is_array($value)) {
    foreach ($value as $v) {
      if (!is_scalar($v) && $v !== null) {
        throw new \InvalidArgumentException('Array values must be scalar');
      }
    }
    return;
  }
  if (!is_scalar($value) && $value !== null) {
    throw new \InvalidArgumentException('Value must be scalar or array');
  }
}

/** Indlæser JSON-schema for given family (backend/data/policies/{family}.json) */
function management_load_schema(string $family): array {
  $path = realpath(__DIR__ . '/../../data/policies/' . basename($family) . '.json');
  if (!$path || !is_file($path)) return [];
  $raw = file_get_contents($path);
  $json = json_decode($raw, true);
  return is_array($json) ? $json : [];
}

/**
 * Saml dynamiske effekter for alle familier i $overridesByFamily.
 * Returnerer ['stats'=>[], 'sources'=>[]]
 */
function management_compute_effects(array $summary, array $overridesByFamily): array {
  $merged = ['stats'=>[], 'sources'=>[]];

  foreach ($overridesByFamily as $family => $_) {
    $schema = management_load_schema((string)$family);
    if (!$schema) continue;
    $eff = policy_compute_effects($summary, $schema, $overridesByFamily);

    // merge stats
    foreach (($eff['stats'] ?? []) as $k => $v) {
      if (!isset($merged['stats'][$k])) $merged['stats'][$k] = 0;
      $merged['stats'][$k] += $v;
    }
    // merge sources
    foreach (($eff['sources'] ?? []) as $k => $arr) {
      foreach ($arr as $s) $merged['sources'][$k][] = $s;
    }
  }
  return $merged;
}