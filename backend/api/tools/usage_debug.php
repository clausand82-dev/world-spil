<?php
declare(strict_types=1);
/*
  One‑off debug: compare usage computed from DB+defs vs yield helpers/state.
  Call: http://localhost/world-spil/backend/api/tools/usage_debug.php?uid=9
*/
require_once __DIR__ . '/../_init.php';

header('Content-Type: application/json; charset=utf-8');

$uid = isset($_GET['uid']) ? (int)$_GET['uid'] : ($_SESSION['uid'] ?? 0);
if ($uid <= 0) {
  echo json_encode(['ok'=>false,'error'=>'missing uid; call ?uid=YOUR_USER_ID'], JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  if (!function_exists('load_all_defs')) {
    echo json_encode(['ok'=>false,'error'=>'load_all_defs missing'], JSON_UNESCAPED_UNICODE);
    exit;
  }
  $defs = load_all_defs();
  $defsRes = (array)($defs['res'] ?? []);

  // fetch inventory + marketplace (forsale) aggregates
  $stInv = $pdo->prepare("SELECT res_id, SUM(amount) AS inv_amt FROM inventory WHERE user_id = ? GROUP BY res_id");
  $stInv->execute([$uid]); $invRows = $stInv->fetchAll(PDO::FETCH_ASSOC);

  $stMk = $pdo->prepare("SELECT res_id, SUM(amount) AS mk_amt FROM marketplace WHERE user_id = ? AND status = 'forsale' GROUP BY res_id");
  $stMk->execute([$uid]); $mkRows = $stMk->fetchAll(PDO::FETCH_ASSOC);

  $byres = [];
  foreach ($invRows as $r) { $k = (string)$r['res_id']; $byres[$k]['inv_amt'] = (float)$r['inv_amt']; }
  foreach ($mkRows  as $r) { $k = (string)$r['res_id']; $byres[$k]['mk_amt']  = (float)$r['mk_amt']; }

  $totals = ['solid'=>0.0,'liquid'=>0.0];
  $detail = [];

  foreach ($byres as $resId => $vals) {
    $key = preg_replace('/^res\./','',$resId);
    $rDef = $defsRes[$key] ?? $defsRes[$resId] ?? null;
    $uSpace = isset($rDef['unitSpace']) ? (float)$rDef['unitSpace'] : (isset($rDef['stats']['unitSpace']) ? (float)$rDef['stats']['unitSpace'] : 0.0);
    $unit = strtolower((string)($rDef['unit'] ?? $rDef['stats']['unit'] ?? ''));
    $isL = ($unit === 'l') ? true : false;
    $inv_amt = $vals['inv_amt'] ?? 0.0;
    $mk_amt  = $vals['mk_amt']  ?? 0.0;
    $inv_space = $inv_amt * $uSpace;
    $mk_space  = $mk_amt * $uSpace;
    $bucket = $isL ? 'liquid' : 'solid';
    $detail[$resId] = [
      'res_key'=>$key,
      'unit'=>$unit,
      'unitSpace'=>$uSpace,
      'inv_amt'=>$inv_amt,'inv_space'=>$inv_space,
      'mk_amt'=>$mk_amt,'mk_space'=>$mk_space,
      'total_space'=>($inv_space+$mk_space),
      'bucket'=>$bucket
    ];
    $totals[$bucket] += ($inv_space + $mk_space);
  }

  // optionally call yield helpers for comparison if available
  $usageBuckets = null; $state = null; $caps = null;
  if (function_exists('yield__compute_bucket_usage')) {
    try { $usageBuckets = yield__compute_bucket_usage($pdo, $uid, $defs); } catch (Throwable $e) { $usageBuckets = ['error'=>$e->getMessage()]; }
  }
  if (function_exists('yield__build_min_state')) {
    try { $state = yield__build_min_state($pdo, $uid); } catch (Throwable $e) { $state = ['error'=>$e->getMessage()]; }
  }
  if (function_exists('yield__read_user_caps')) {
    try { $caps = yield__read_user_caps($pdo, $uid, $defs, $state); } catch (Throwable $e) { $caps = ['error'=>$e->getMessage()]; }
  }

  echo json_encode([
    'ok'=>true,
    'uid'=>$uid,
    'totals'=>$totals,
    'usageBuckets'=>$usageBuckets,
    'state_cap'=> $state['cap'] ?? null,
    'capsBuckets'=>$caps,
    'detail'=>$detail
  ], JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);

} catch (Throwable $e) {
  echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()], JSON_UNESCAPED_UNICODE);
  exit;
}