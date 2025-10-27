<?php
declare(strict_types=1);
/**
 * Marketplace cancel — authoritative checks using alldata state/caps.
 *
 * Improvements:
 * - Returns a compact delta under data.delta.state (inv / market.offer) so frontend can patch cache.
 * - Builds delta as associative arrays, then converts empty arrays -> stdClass for JSON to encode {}.
 * - Keeps existing penalty/return logic and robust inventory upsert attempts.
 *
 * NOTE: This file closely follows existing logic but ensures the response includes a delta.
 */

require_once __DIR__ . '/../_init.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/** Fraction to keep as penalty (0.10 = 10%). Set to 0.0 to disable. */
const CANCEL_PENALTY_PCT = 0.10;

/** Number of decimals used when storing/returning fractional resources (safe rounding) */
const RETURN_ROUND_DECIMALS = 8;

function convertEmptyArraysToObjects($v) {
  if (is_array($v)) {
    if (count($v) === 0) return (object)[];
    foreach ($v as $k => $sub) $v[$k] = convertEmptyArraysToObjects($sub);
    return $v;
  }
  return $v;
}

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Not logged in']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $id = (int)($_POST['id'] ?? ($_GET['id'] ?? 0));
  if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid id']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if (!function_exists('load_all_defs')) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'alldata loaders not available (load_all_defs missing)']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // begin transaction and lock listing
  $pdo->beginTransaction();

  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]);
  $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) {
    $pdo->rollBack();
    http_response_code(404);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Listing not found']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if ((int)$m['user_id'] !== (int)$uid) {
    $pdo->rollBack();
    http_response_code(403);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Not owner']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if ((string)$m['status'] !== 'forsale') {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Not cancellable']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $resId = (string)$m['res_id'];
  $amount = (float)$m['amount'];
  if ($amount <= 0.0) {
    // mark canceled with no return and respond
    $pdo->prepare("UPDATE marketplace SET status='canceled', canceled_at = NOW() WHERE id = ?")->execute([$id]);
    $pdo->commit();

    // Build delta: no returned resource, but mark listing removed
    $deltaState = [
      'inv' => ['solid' => [], 'liquid' => []],
      'market' => ['offer' => ['id' => $id, 'amount' => 0]]
    ];
    $deltaState = convertEmptyArraysToObjects($deltaState);

    echo json_encode(['ok'=>true,'data'=>[
      'id'=>$id,
      'res_id'=>$resId,
      'listed_amount'=>$amount,
      'returned_amount'=>0.0,
      'penalty_applied'=>false,
      'delta' => ['state' => $deltaState]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // compute penalty & return amount
  $pct = max(0.0, min(1.0, (float)CANCEL_PENALTY_PCT));
  $penaltyAmt = round($amount * $pct, RETURN_ROUND_DECIMALS);
  $returnAmount = max(0.0, round($amount - $penaltyAmt, RETURN_ROUND_DECIMALS));

  // load defs and compute capacity for return
  $defs = load_all_defs();
  $defsRes = (array)($defs['res'] ?? []);
  $bare = (strpos($resId, 'res.') === 0) ? substr($resId, 4) : $resId;
  $resDef = $defsRes[$bare] ?? $defsRes[$resId] ?? $defsRes["res.$bare"] ?? null;

  $unit = strtolower((string)($resDef['unit'] ?? $resDef['stats']['unit'] ?? ''));
  $isLiquid = ($unit === 'l');
  $unitSpace = 0.0;
  if (isset($resDef['unitSpace'])) $unitSpace = (float)$resDef['unitSpace'];
  elseif (isset($resDef['stats']['unitSpace'])) $unitSpace = (float)$resDef['stats']['unitSpace'];

  $needSpace = $returnAmount * $unitSpace;
  $bucket = $isLiquid ? 'liquid' : 'solid';

  // authoritative caps/usage via yield helpers
  $state = yield__build_min_state($pdo, $uid);
  $capsBuckets = yield__read_user_caps($pdo, $uid, $defs, $state);
  $usageBuckets = yield__compute_bucket_usage($pdo, $uid, $defs);

  $total = isset($capsBuckets[$bucket]) ? (float)$capsBuckets[$bucket] : null;
  $used  = isset($usageBuckets[$bucket]) ? (float)$usageBuckets[$bucket] : null;

  if ($total === null || $used === null) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>[
      'message' => 'Authoritative storage caps/usage not available. Refusing to recalculate.',
      'debug' => ['caps'=>$capsBuckets,'usage'=>$usageBuckets]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $available = max(0.0, $total - $used);
  if ($needSpace > $available + 1e-9) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>[
      'message'=>'Ikke nok lagerplads til at annullere. Fjern/forbrug noget først.',
      'details'=>[
        'res_id'=>$resId,
        'return_amount'=>$returnAmount,
        'penalty_amount'=>$penaltyAmt,
        'unit_space'=>$unitSpace,
        'need_space'=>$needSpace,
        'available_space'=>$available,
        'total_capacity'=>$total,
        'used_space'=>$used,
        'bucket'=>$bucket,
      ]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Upsert inventory — try multiple res_id variants
  $attempts = [];
  $resCandidates = [$resId];
  $plain = preg_replace('/^res\./', '', $resId);
  if ($plain !== $resId) $resCandidates[] = $plain;
  else $resCandidates[] = 'res.' . $plain;

  $inserted = false;
  foreach ($resCandidates as $insId) {
    try {
      $ins = $pdo->prepare("
        INSERT INTO inventory (user_id, res_id, amount)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
      ");
      $ins->execute([$uid, $insId, $returnAmount]);
      $attempts[] = ['action'=>'insert','res_id'=>$insId,'amount_added'=>$returnAmount];
      $inserted = true;
      break;
    } catch (Throwable $e) {
      $attempts[] = ['action'=>'insert_failed','res_id'=>$insId,'error'=>$e->getMessage()];
      // try next candidate
    }
  }

  if (!$inserted) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Failed to upsert returned inventory','attempts'=>$attempts]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Mark listing canceled and persist penalty info if marketplace table supports those columns
  $marketCols = [];
  $colStmt = $pdo->query("SHOW COLUMNS FROM marketplace");
  foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $c) $marketCols[] = $c['Field'] ?? '';

  $updateFields = ["status = 'canceled'", "canceled_at = NOW()"];
  $params = [];
  if (in_array('returned_amount', $marketCols, true)) {
    $updateFields[] = "returned_amount = ?";
    $params[] = $returnAmount;
  }
  if (in_array('penalty_amount', $marketCols, true)) {
    $updateFields[] = "penalty_amount = ?";
    $params[] = $penaltyAmt;
  }
  $params[] = $id;
  $sql = "UPDATE marketplace SET " . implode(', ', $updateFields) . " WHERE id = ?";
  $pdo->prepare($sql)->execute($params);

  $pdo->commit();

  // Read new inventory snapshot for delta
  $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' LIMIT 1");
  $selMoney->execute([$uid]);
  $newMoney = (float)($selMoney->fetchColumn() ?? 0.0);

  $selNewRes = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? LIMIT 1");
  $selNewRes->execute([$uid, $resCandidates[0]]);
  $newResAmount = (float)($selNewRes->fetchColumn() ?? 0.0);

  // Build delta (associative arrays)
  $plainKey = preg_replace('/^res\\./', '', $resId);
  $deltaState = [
    'inv' => ['solid' => [], 'liquid' => []],
    'market' => ['offer' => ['id' => $id, 'amount' => 0]]
  ];

  // Money to solid bucket (frontend reads state.inv.solid.money)
  $deltaState['inv']['solid']['money'] = $newMoney;
  if ($bucket === 'liquid') {
    $deltaState['inv']['liquid'][$plainKey] = $newResAmount;
  } else {
    $deltaState['inv']['solid'][$plainKey] = $newResAmount;
  }

  // convert empty arrays -> objects for JSON only
  $deltaState = convertEmptyArraysToObjects($deltaState);

  echo json_encode(['ok'=>true,'data'=>[
    'id'=>$id,
    'res_id'=>$resId,
    'listed_amount'=>$amount,
    'returned_amount'=>$returnAmount,
    'penalty_applied'=>($pct > 0.0),
    'penalty_amount'=>$penaltyAmt,
    'unit_space'=>$unitSpace,
    'bucket'=>$bucket,
    'inventory_upsert_attempts'=>$attempts,
    'delta' => ['state' => $deltaState]
  ]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}