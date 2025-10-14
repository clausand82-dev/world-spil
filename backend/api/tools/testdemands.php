<?php
require_once __DIR__ . '/../lib/management_effects_integration.php';
require_once __DIR__ . '/../lib/policy_engine.php'; // hvor pe_requires_met findes
// fetch summary same way as your header does, or include sample summary JSON. For quick test load summary:
$summary = json_decode(file_get_contents('curl -sS -X POST -d @summary.json /world-spil/backend/api/header/summary.php'), true);
if (!$summary) { echo "Send summary JSON via POST\n"; exit; }
$req = ['buildings' => ['bld.basecamp.l3']];
var_export(pe_requires_met($summary, $req));