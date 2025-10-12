<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/yield.php';
require_once __DIR__ . '/../lib/reproduction.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

const CANCEL_PENALTY_PCT = 0.10;

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) { http_response_code(401); echo json_encode(['ok'=>false,'error'=>['message'=>'Not logged in']], JSON_UNESCAPED_UNICODE); exit; }

  $id = (int)($_POST['id'] ?? ($_GET['id'] ?? 0));
  if ($id <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid id']], JSON_UNESCAPED_UNICODE); exit; }

  if (!function_exists('load_all_defs')) {
    http_response_code(500); echo json_encode(['ok'=>false,'error'=>['message'=>'alldata loaders not available (load_all_defs missing)']], JSON_UNESCAPED_UNICODE); exit;
  }

  $pdo->beginTransaction();
  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]); $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) { $pdo->rollBack(); http_response_code(404); echo json_encode(['ok'=>false,'error'=>['message'=>'Listing not found']], JSON_UNESCAPED_UNICODE); exit; }
  if ((int)$m['user_id'] !== (int)$uid) { $pdo->rollBack(); http_response_code(403); echo json_encode(['ok'=>false,'error'=>['message'=>'Not owner']], JSON_UNESCAPED_UNICODE); exit; }
  if ((string)$m['status'] !== 'forsale') { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Not cancellable']], JSON_UNESCAPED_UNICODE); exit; }

  $resId = (string)$m['res_id'];
  // amount stored on listing (use float to allow fractional resources if your schema supports it)
  $amount = (float)$m['amount'];
  // calculate penalty (rounded to sensible precision), subtract from returned amount
  $penaltyAmt = 0.0;
  if (CANCEL_PENALTY_PCT > 0.0) {
    $penaltyAmt = round($amount * (float)CANCEL_PENALTY_PCT, 6);
  }
  $returnAmount = max(0.0, round($amount - $penaltyAmt, 6));
  // note: penaltyAmt is NOT returned to inventory; keep it as system fee (no automatic crediting unless you have a ledger)

  // Load defs + authoritative state/caps
  $alldata_defs = load_all_defs();
  if (!function_exists('yield__build_min_state') || !function_exists('repro__read_core_caps_and_usage')) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'alldata state builders missing (yield__build_min_state or repro__read_core_caps_and_usage)']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  try {
    $state = yield__build_min_state($pdo, (int)$uid) ?: [];
  } catch (Throwable $e) {
    $pdo->rollBack(); http_response_code(500); echo json_encode(['ok'=>false,'error'=>['message'=>'yield__build_min_state failed','detail'=>$e->getMessage()]], JSON_UNESCAPED_UNICODE); exit;
  }

  if (!function_exists('yield__read_user_caps') || !function_exists('yield__compute_bucket_usage')) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Missing yield helper functions (yield__read_user_caps or yield__compute_bucket_usage)']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // total kapacitet per bucket (solid/liquid)
  try {
    $capsBuckets = yield__read_user_caps($pdo, (int)$uid, $alldata_defs, $state); // ['solid'=>..., 'liquid'=>...]
  } catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'yield__read_user_caps failed','detail'=>$e->getMessage()]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // brugt plads per bucket (yield helper)
  try {
    $usageBuckets = yield__compute_bucket_usage($pdo, (int)$uid, $alldata_defs); // ['solid'=>..., 'liquid'=>...]
  } catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'yield__compute_bucket_usage failed','detail'=>$e->getMessage()]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // DEBUG endpoint (single, tidy): ?debug=1 or debug=1 in POST
  if (isset($_GET['debug']) || isset($_POST['debug'])) {
    try {
      $defsRes = (array)($alldata_defs['res'] ?? []);
      $st = $pdo->prepare("SELECT res_id, SUM(amount) AS inv_amt FROM inventory WHERE user_id = ? GROUP BY res_id");
      $st->execute([$uid]); $inv = $st->fetchAll(PDO::FETCH_ASSOC);
      $st2 = $pdo->prepare("SELECT res_id, SUM(amount) AS mk_amt FROM marketplace WHERE user_id = ? AND status = 'forsale' GROUP BY res_id");
      $st2->execute([$uid]); $mk = $st2->fetchAll(PDO::FETCH_ASSOC);

      $byres = [];
      foreach ($inv as $r) { $k = (string)$r['res_id']; $byres[$k]['inv_amt'] = (float)$r['inv_amt']; }
      foreach ($mk  as $r) { $k = (string)$r['res_id']; $byres[$k]['mk_amt']  = (float)$r['mk_amt']; }

      $total_space = 0.0; $breakdown = [];
      foreach ($byres as $resId => $vals) {
        $key = preg_replace('/^res\./','',$resId);
        $rDef = $defsRes[$key] ?? $defsRes[$resId] ?? null;
        $uSpace = isset($rDef['unitSpace']) ? (float)$rDef['unitSpace'] : (isset($rDef['stats']['unitSpace']) ? (float)$rDef['stats']['unitSpace'] : 0.0);
        $inv_amt = $vals['inv_amt'] ?? 0.0; $mk_amt = $vals['mk_amt'] ?? 0.0;
        $inv_space = $inv_amt * $uSpace; $mk_space  = $mk_amt * $uSpace;
        $res_bucket = (strtolower((string)($rDef['unit'] ?? $rDef['stats']['unit'] ?? '')) === 'l') ? 'liquid' : 'solid';
        $breakdown[$resId] = [
          'res_key'=>$key,
          'unitSpace'=>$uSpace,
          'inv_amt'=>$inv_amt,'inv_space'=>$inv_space,
          'mk_amt'=>$mk_amt,'mk_space'=>$mk_space,
          'total_space'=>$inv_space,
          'bucket'=>$res_bucket
        ];
        // kun akkumuler inventory-space for den bucket vi fejler på
        if ($res_bucket === $bucket) $total_space += $inv_space;
      }

      echo json_encode([
        'ok'=>true,
        'debug'=>[
          'usageBuckets'=>$usageBuckets,
          'capsBuckets'=>$capsBuckets ?? null,
          'state_cap'=>$state['cap'] ?? null,
          'state_inv'=>$state['inv'] ?? null,
          'computed_total_space'=> $total_space,
          'computed_breakdown'=>$breakdown
        ]
      ], JSON_UNESCAPED_UNICODE);
      $pdo->rollBack();
      exit;
    } catch (Throwable $e) {
      $pdo->rollBack();
      echo json_encode(['ok'=>false,'error'=>['message'=>'debug failed','detail'=>$e->getMessage()]], JSON_UNESCAPED_UNICODE);
      exit;
    }
  }

  // Resolve resDef
  $defsRes = (array)($alldata_defs['res'] ?? []);
  $bare = (strpos($resId,'res.')===0) ? substr($resId,4) : $resId;
  $resDef = $defsRes[$bare] ?? $defsRes[$resId] ?? $defsRes["res.$bare"] ?? null;

  $unit = strtolower((string)($resDef['unit'] ?? $resDef['stats']['unit'] ?? ''));
  $isLiquid = ($unit === 'l');

  $unitSpace = 0.0;
  if (isset($resDef['unitSpace'])) $unitSpace = (float)$resDef['unitSpace'];
  elseif (isset($resDef['stats']['unitSpace'])) $unitSpace = (float)$resDef['stats']['unitSpace'];

  $returnAmount = $amount;
  $need = $returnAmount * $unitSpace;
  $bucket = $isLiquid ? 'liquid' : 'solid';

  // Robust cap lookup using yield helpers + prefer alldata state caps (frontend authoritative)
  $total = null; $used = null;

  // capsBuckets -> total/used
  if (isset($capsBuckets[$bucket])) {
    $cb = $capsBuckets[$bucket];
    if (is_array($cb)) {
      if (isset($cb['total'])) $total = (float)$cb['total'];
      if (isset($cb['used']))  $used  = (float)$cb['used'];
    } elseif (is_numeric($cb)) {
      $total = (float)$cb;
    }
  }

  // usageBuckets fallback
  if ($used === null && isset($usageBuckets[$bucket])) {
    $ub = $usageBuckets[$bucket];
    if (is_array($ub)) {
      if (isset($ub['used'])) $used = (float)$ub['used'];
      if (isset($ub['total']) && $total === null) $total = (float)$ub['total'];
    } elseif (is_numeric($ub)) {
      $used = (float)$ub;
    }
  }

  // legacy caps keys
  if ($total === null) {
    if ($bucket === 'liquid' && isset($capsBuckets['storageLiquidCap'])) $total = (float)$capsBuckets['storageLiquidCap'];
    if ($bucket === 'solid'  && isset($capsBuckets['storageSolidCap']))  $total = (float)$capsBuckets['storageSolidCap'];
  }
  if ($used === null) {
    if ($bucket === 'liquid' && isset($capsBuckets['storageLiquidUsed'])) $used = (float)$capsBuckets['storageLiquidUsed'];
    if ($bucket === 'solid'  && isset($capsBuckets['storageSolidUsed']))  $used = (float)$capsBuckets['storageSolidUsed'];
  }

  // prefer authoritative alldata state cap (matches frontend)
  if (isset($state['cap'][$bucket]['used'])) $used = (float)$state['cap'][$bucket]['used'];
  if ($total === null && isset($state['cap'][$bucket]['total'])) $total = (float)$state['cap'][$bucket]['total'];

  // other fallbacks
  if ($total === null && isset($state['inv'][$bucket]['total'])) $total = (float)$state['inv'][$bucket]['total'];

  // fallback: compute used from inventory + marketplace only if still missing
  $computed_breakdown = null;
  if ($used === null) {
    try {
      $computedUsed = 0.0;
      $computed_breakdown = [];

      $stInv = $pdo->prepare("SELECT res_id, SUM(amount) AS amt FROM inventory WHERE user_id = ? GROUP BY res_id");
      $stInv->execute([$uid]); $invRows = $stInv->fetchAll(PDO::FETCH_ASSOC);
      foreach ($invRows as $ir) {
        $rId = (string)$ir['res_id']; $amt = (float)$ir['amt'];
        $key = preg_replace('/^res\./', '', $rId);
        $rDef = $defsRes[$key] ?? $defsRes[$rId] ?? null;
        if (!$rDef) continue;
        $uSpace = isset($rDef['unitSpace']) ? (float)$rDef['unitSpace'] : (isset($rDef['stats']['unitSpace']) ? (float)$rDef['stats']['unitSpace'] : 0.0);
        $isL = strtolower((string)($rDef['unit'] ?? $rDef['stats']['unit'] ?? '')) === 'l';
        if (($bucket === 'liquid' && $isL) || ($bucket === 'solid' && !$isL)) {
          $space = $amt * $uSpace;
          if (!isset($computed_breakdown[$rId])) $computed_breakdown[$rId] = ['inv_amt'=>0,'inv_space'=>0,'mk_amt'=>0,'mk_space'=>0,'res_key'=>$key];
          $computed_breakdown[$rId]['inv_amt'] += $amt;
          $computed_breakdown[$rId]['inv_space'] += $space;
          $computedUsed += $space;
        }
      }

      $stMk = $pdo->prepare("SELECT res_id, SUM(amount) AS amt FROM marketplace WHERE user_id = ? AND status = 'forsale' GROUP BY res_id");
      $stMk->execute([$uid]); $mkRows = $stMk->fetchAll(PDO::FETCH_ASSOC);
      foreach ($mkRows as $mr) {
        $rId = (string)$mr['res_id']; $amt = (float)$mr['amt'];
        $key = preg_replace('/^res\./', '', $rId);
        $rDef = $defsRes[$key] ?? $defsRes[$rId] ?? null;
        if (!$rDef) continue;
        $uSpace = isset($rDef['unitSpace']) ? (float)$rDef['unitSpace'] : (isset($rDef['stats']['unitSpace']) ? (float)$rDef['stats']['unitSpace'] : 0.0);
        $isL = strtolower((string)($rDef['unit'] ?? $rDef['stats']['unit'] ?? '')) === 'l';
        if (($bucket === 'liquid' && $isL) || ($bucket === 'solid' && !$isL)) {
          $space = $amt * $uSpace;
          if (!isset($computed_breakdown[$rId])) $computed_breakdown[$rId] = ['inv_amt'=>0,'inv_space'=>0,'mk_amt'=>0,'mk_space'=>0,'res_key'=>$key];
          $computed_breakdown[$rId]['mk_amt'] += $amt;
          $computed_breakdown[$rId]['mk_space'] += $space;
          // NOTE: do NOT add $space to $computedUsed — marketplace items are considered out-of-storage
        }
      }

      // ignore marketplace listings when computing used fallback
      if ($computedUsed >= 0.0) $used = $computedUsed;
    } catch (Throwable $e) {
      $used = $used ?? null;
    }
  }

  if ($total === null || $used === null) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>[
      'message'=>'Authoritative cap fields missing in alldata state — refusing to recalculate.',
      'missing'=>[$total===null ? "caps.{$bucket}.total":null, $used===null ? "caps.{$bucket}.used":null],
      'debug'=>['capsBuckets'=>$capsBuckets,'usageBuckets'=>$usageBuckets,'state_cap'=>$state['cap'] ?? null,'state_inv'=>$state['inv'] ?? null,'computed_used'=>$used ?? null]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $avail = max(0.0, $total - $used);
  if ($need > $avail + 1e-9) {
    // diagnostic breakdown included in response
    try {
      $stInv = $pdo->prepare("SELECT res_id, SUM(amount) AS inv_amt FROM inventory WHERE user_id = ? GROUP BY res_id");
      $stInv->execute([$uid]); $invRows = $stInv->fetchAll(PDO::FETCH_ASSOC);
      $stMk  = $pdo->prepare("SELECT res_id, SUM(amount) AS mk_amt  FROM marketplace WHERE user_id = ? AND status = 'forsale' GROUP BY res_id");
      $stMk->execute([$uid]); $mkRows = $stMk->fetchAll(PDO::FETCH_ASSOC);

      $byres = [];
      foreach ($invRows as $r) { $k = (string)$r['res_id']; $byres[$k]['inv_amt'] = (float)$r['inv_amt']; }
      foreach ($mkRows  as $r) { $k = (string)$r['res_id']; $byres[$k]['mk_amt']  = (float)$r['mk_amt']; }

      $total_space = 0.0; $breakdown = [];
      foreach ($byres as $resId => $vals) {
        $key = preg_replace('/^res\./','',$resId);
        $rDef = $defsRes[$key] ?? $defsRes[$resId] ?? null;
        $uSpace = isset($rDef['unitSpace']) ? (float)$rDef['unitSpace'] : (isset($rDef['stats']['unitSpace']) ? (float)$rDef['stats']['unitSpace'] : 0.0);
        $inv_amt = $vals['inv_amt'] ?? 0.0; $mk_amt = $vals['mk_amt'] ?? 0.0;
        $inv_space = $inv_amt * $uSpace; $mk_space = $mk_amt * $uSpace;
        $breakdown[$resId] = ['res_key'=>$key,'unitSpace'=>$uSpace,'inv_amt'=>$inv_amt,'inv_space'=>$inv_space,'mk_amt'=>$mk_amt,'mk_space'=>$mk_space,'total_space'=>$inv_space];
        $total_space += $inv_space;
      }
    } catch (Throwable $e) {
      $breakdown = null; $total_space = null;
    }

    $pdo->rollBack(); http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>[
      'message'=>'Ikke nok lagerplads til at annullere. Fjern/forbrug noget først.',
      'details'=>['res_id'=>$resId,'return_amount'=>$returnAmount,'unit_space'=>$unitSpace,'need_space'=>$need,'available_space'=>$avail,'total_capacity'=>$total,'used_space'=>$used,'bucket'=>$bucket],
      'debug'=>['usageBuckets'=>$usageBuckets ?? null,'computed_total_space'=>$total_space,'computed_breakdown'=>$breakdown]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // perform inventory update + mark marketplace canceled
  $upd = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
  $upd->execute([$returnAmount, $uid, $resId]);
  if ($upd->rowCount() === 0) {
    $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
    $ins->execute([$uid, $resId, $returnAmount]);
  }
  $pdo->prepare("UPDATE marketplace SET status='canceled', canceled_at=NOW() WHERE id = ?")->execute([$id]);
  $pdo->commit();

  $resp = ['id'=>$id,'res_id'=>$resId,'listed_amount'=>$amount,'returned_amount'=>$returnAmount,
           'penalty_applied'=>(CANCEL_PENALTY_PCT>0.0),'penalty_amount'=>$penaltyAmt,'unit_space'=>$unitSpace,'bucket'=>$bucket];
  if (isset($computed_breakdown)) $resp['computed_breakdown'] = $computed_breakdown;
  echo json_encode(['ok'=>true,'data'=>$resp], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}
