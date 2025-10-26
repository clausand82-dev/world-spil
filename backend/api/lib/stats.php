<?php
declare(strict_types=1);

/**
 * compute_user_stats(PDO $db = null, int $userId = 0, ?array $defs = null, ?array $state = null)
 *
 * Returnerer:
 *  [
 *    'happiness' => float|null, // 0..100 (null hvis ikke kendt)
 *    'popularity' => float|null, // 0..100
 *    'meta' => array // debug info
 *  ]
 *
 * Denne funktion er defensiv og kan udbygges med din summary-logik senere.
 */
if (!function_exists('compute_user_stats')) {
  function compute_user_stats(PDO $db = null, int $userId = 0, ?array $defs = null, ?array $state = null): array {
    $out = ['happiness' => null, 'popularity' => null, 'meta' => []];

    try {
      // 1) Hvis summary-funktion findes, genbrug den
      if (function_exists('summary_compute_stats')) {
        try {
          $res = summary_compute_stats($defs, $state);
          if (is_array($res)) {
            $out['happiness'] = $res['happiness'] ?? $out['happiness'];
            $out['popularity'] = $res['popularity'] ?? $out['popularity'];
            $out['meta']['from'] = 'summary_compute_stats';
            return $out;
          }
        } catch (Throwable $e) {
          // ignore and continue to fallbacks
          $out['meta']['summary_error'] = $e->getMessage();
        }
      }

      // 2) Hvis caller gav state, brug relevante felter hvis de findes
      if (is_array($state)) {
        // Prioriter eksplcit felter hvis tilgængelige
        if (isset($state['user']['happiness'])) $out['happiness'] = (float)$state['user']['happiness'];
        if (isset($state['happiness']['effective'])) $out['happiness'] = (float)$state['happiness']['effective'];
        if (isset($state['user']['popularity'])) $out['popularity'] = (float)$state['user']['popularity'];
        if (isset($state['popularity']['popularity'])) $out['popularity'] = (float)$state['popularity']['popularity'];
        if (!empty($out['happiness']) || !empty($out['popularity'])) {
          $out['meta']['from'] = 'state';
          // Normalize 0..1 -> 0..100
          foreach (['happiness','popularity'] as $k) {
            if ($out[$k] !== null && $out[$k] <= 1.0) $out[$k] = $out[$k] * 100.0;
          }
          return $out;
        }
      }

      // 3) Hvis DB helper findes, prøv en letvægtig læsning fra en tænkelig table (ikke krævet)
      if ($db instanceof PDO && $userId > 0) {
        try {
          // Dette er konservativt: table/fields kan mangle i din DB. Derfor try/catch.
          $st = $db->prepare("SELECT happiness, popularity FROM user_stats WHERE user_id = ? LIMIT 1");
          $st->execute([$userId]);
          $r = $st->fetch(PDO::FETCH_ASSOC);
          if ($r) {
            if (isset($r['happiness'])) $out['happiness'] = (float)$r['happiness'];
            if (isset($r['popularity'])) $out['popularity'] = (float)$r['popularity'];
            $out['meta']['from'] = 'db.user_stats';
            // normalize 0..1 -> 0..100
            foreach (['happiness','popularity'] as $k) {
              if ($out[$k] !== null && $out[$k] <= 1.0) $out[$k] = $out[$k] * 100.0;
            }
            return $out;
          }
        } catch (Throwable $e) {
          $out['meta']['db_error'] = $e->getMessage();
          // fallthrough to heuristics
        }
      }

      // 4) Conservative heuristics fallback (very small, non-invasive)
      // Her kan du bygge en mere præcis beregning ved at kopiere summary-logik senere.
      $out['meta']['fallback'] = true;

      // Example proxies: hvis state har caps/usage, brug en simpel overload-proxy
      $caps = $state['cap'] ?? [];
      $usage = $state['usage'] ?? [];
      $proxyH = null;

      if (isset($usage['solid']) && isset($caps['solid']['total'])) {
        if ($usage['solid'] > $caps['solid']['total']) $proxyH = ($proxyH ?? 100) - 30;
      }
      if (isset($usage['liquid']) && isset($caps['liquid']['total'])) {
        if ($usage['liquid'] > $caps['liquid']['total']) $proxyH = ($proxyH ?? 100) - 20;
      }

      if ($proxyH !== null) $out['happiness'] = max(0, min(100, (float)$proxyH));
      if ($out['happiness'] === null) $out['happiness'] = 75.0; // default mild positive
      if ($out['popularity'] === null) $out['popularity'] = 60.0;

      return $out;
    } catch (Throwable $e) {
      $out['meta']['error'] = $e->getMessage();
      // safe defaults
      if ($out['happiness'] === null) $out['happiness'] = 75.0;
      if ($out['popularity'] === null) $out['popularity'] = 60.0;
      return $out;
    }
  }
}