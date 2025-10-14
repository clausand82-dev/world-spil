<?php
// test_require.php — put this in webroot and create summary.json next to it (copy response from /api/header/summary.php)
require_once __DIR__ . '/lib/policy_engine.php';

$summaryFile = __DIR__ . '/summary.json';
if (!file_exists($summaryFile)) {
  echo "Fejl: opret summary.json ved at kopiere JSON fra /api/header/summary.php til denne fil.\n";
  exit;
}
$summary = json_decode(file_get_contents($summaryFile), true);

// Ændr token til det krav der fejler (eksakt string fra dit schema)
$token = 'rsd.tools.l2';

// Brug pe_parse_req_token og pe_get_owned_level direkte
$spec = pe_parse_req_token($token);

// Hvis parse ikke returnerer domain, prøv fallback-domæner i rækkefølge rsd, bld, add
$domainsTried = [];
$have = 0;
if ($spec && isset($spec['domain']) && $spec['domain'] !== null) {
  $have = pe_get_owned_level($summary['state'] ?? [], $spec['domain'], $spec['id']);
  $domainsTried[] = $spec['domain'];
} else {
  foreach (['rsd','bld','add'] as $d) {
    $domainsTried[] = $d;
    $h = pe_get_owned_level($summary['state'] ?? [], $d, $spec['id'] ?? $token);
    if ($h > 0) { $have = $h; break; }
  }
}

// Check pe_requires_met for the same requirement (array form)
$req_met = pe_requires_met($summary, ['research' => [$token]]);

// Prepare output
$out = [
  'token' => $token,
  'parsed_spec' => $spec,
  'domains_tried' => $domainsTried,
  'owned_level_found' => $have,
  'pe_requires_met' => $req_met,
  'state_rsd_keys_sample' => array_slice(array_keys($summary['state']['rsd'] ?? []), 0, 40),
  'state_rsd_full' => $summary['state']['rsd'] ?? null,
];

header('Content-Type: application/json; charset=utf-8');
echo json_encode($out, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE);