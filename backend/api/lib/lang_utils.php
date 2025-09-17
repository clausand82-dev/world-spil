<?php
declare(strict_types=1);

/**
 * Domain-nøgler vi vil filtrere væk fra lang:
 *  - bld., add., rcp., ani., res., rsd.
 */
function is_domain_lang_key(string $key): bool {
  static $re = null;
  if ($re === null) {
    // Starter med et af domæne-præfikserne + punktum
    $re = '~^(?:bld|add|rcp|ani|res|rsd)\.~i';
  }
  return (bool)preg_match($re, $key);
}

/**
 * Behold kun:
 *  - ui.*  (UI-tekster)
 *  - alt der IKKE matcher domæne-præfikserne
 * Smid domæne-tekster ud (bld./add./rcp./ani./res./rsd.)
 */
function filter_lang_for_ui(array $lang): array {
  $out = [];
  foreach ($lang as $k => $v) {
    $k = (string)$k;
    if (str_starts_with($k, 'ui.')) { // altid behold UI
      $out[$k] = $v;
      continue;
    }
    if (!is_domain_lang_key($k)) { // behold "generelle" nøgler
      $out[$k] = $v;
    }
  }
  return $out;
}