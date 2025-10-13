<?php
declare(strict_types=1);
/**
 * Marketplace cancel — authoritative checks using alldata state/caps.
 *
 * Improvements in this version:
 * - Fix penalty calculation so returned amount = amount - penalty (rounded safely).
 * - Try robust inventory upsert (handles res_id with/without 'res.' prefix).
 * - Persist penalty/returned fields into marketplace row if columns exist.
 * - Cleaner structure, better error messages and defensive checks.
 *
 * Requirements: include backend/api/_init.php (it loads alldata helpers).
 */

require_once __DIR__ . '/../_init.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/** Fraction to keep as penalty (0.10 = 10%). Set to 0.0 to disable. */
const CANCEL_PENALTY_PCT = 0.10;

/** Number of decimals used when storing/returning fractional resources (safe rounding) */
const RETURN_ROUND_DECIMALS = 8;

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

  // Lock listing and work in transaction
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
    // Nothing sensible to return — just cancel
    $pdo->prepare("UPDATE marketplace SET status='canceled', canceled_at = NOW() WHERE id = ?")->execute([$id]);
    $pdo->commit();
    echo json_encode(['ok'=>true,'data'=>['id'=>$id,'res_id'=>$resId,'listed_amount'=>$amount,'returned_amount'=>0.0,'penalty_applied'=>false]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // compute penalty and returned amount (defensive checks + rounding)
  $pct = max(0.0, min(1.0, (float)CANCEL_PENALTY_PCT));
  $penaltyAmt = round($amount * $pct, RETURN_ROUND_DECIMALS);
  // ensure we don't return negative due to rounding
  $returnAmount = max(0.0, round($amount - $penaltyAmt, RETURN_ROUND_DECIMALS));

  // Load defs (metadata)
  $defs = load_all_defs();
  $defsRes = (array)($defs['res'] ?? []);
  $bare = (strpos($resId, 'res.') === 0) ? substr($resId, 4) : $resId;
  $resDef = $defsRes[$bare] ?? $defsRes[$resId] ?? $defsRes["res.$bare"] ?? null;

  // determine unitSpace and bucket (liquid/solid)
  $unit = strtolower((string)($resDef['unit'] ?? $resDef['stats']['unit'] ?? ''));
  $isLiquid = ($unit === 'l');
  $unitSpace = 0.0;
  if (isset($resDef['unitSpace'])) $unitSpace = (float)$resDef['unitSpace'];
  elseif (isset($resDef['stats']['unitSpace'])) $unitSpace = (float)$resDef['stats']['unitSpace'];
  $needSpace = $returnAmount * $unitSpace;

  // Ensure we can read authoritative caps/usage via yield helpers.
  if (!function_exists('yield__read_user_caps') || !function_exists('yield__compute_bucket_usage') || !function_exists('yield__build_min_state')) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Required yield/repro helpers missing (yield__read_user_caps, yield__compute_bucket_usage, yield__build_min_state)']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Build minimal state (needed by some yield helpers)
  $state = yield__build_min_state($pdo, (int)$uid) ?? [];

  // Get total caps and usage per bucket (solid/liquid)
  $capsBuckets = yield__read_user_caps($pdo, (int)$uid, $defs, $state);
  $usageBuckets = yield__compute_bucket_usage($pdo, (int)$uid, $defs);

  $bucket = $isLiquid ? 'liquid' : 'solid';
  $total = isset($capsBuckets[$bucket]) ? (float)$capsBuckets[$bucket] : null;
  $used  = isset($usageBuckets[$bucket]) ? (float)$usageBuckets[$bucket] : null;

  if ($total === null || $used === null) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>[
      'message' => 'Authoritative storage caps/usage not available. Refusing to recalculate.',
      'missing' => [
        $total === null ? "caps.{$bucket}.total" : null,
        $used  === null ? "usage.{$bucket}" : null,
      ],
      'debug' => [
        'caps_buckets' => $capsBuckets,
        'usage_buckets'=> $usageBuckets,
        'state_cap'    => $state['cap'] ?? null,
        'state_inv'    => $state['inv'] ?? null,
      ]
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

  // Upsert inventory — try several res_id variants to match how inventory rows are stored
  $attempts = [];
  $resCandidates = [$resId];

  // add/unadd 'res.' prefix variants
  $plain = preg_replace('/^res\./', '', $resId);
  if ($plain !== $resId) {
    $resCandidates[] = $plain;
  } else {
    $resCandidates[] = 'res.' . $plain;
  }
  // ensure unique order
  $resCandidates = array_values(array_unique($resCandidates, SORT_REGULAR));

  $updated = false;
  foreach ($resCandidates as $candId) {
    // try update existing row first
    $upd = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
    $upd->execute([$returnAmount, $uid, $candId]);
    if ($upd->rowCount() > 0) {
      $attempts[] = ['action'=>'update','res_id'=>$candId,'amount_added'=>$returnAmount];
      $updated = true;
      break;
    }
  }

  if (!$updated) {
    // no existing row matched — insert with original listing res_id (first candidate)
    $insId = $resCandidates[0];
    $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
    $ins->execute([$uid, $insId, $returnAmount]);
    $attempts[] = ['action'=>'insert','res_id'=>$insId,'amount_added'=>$returnAmount];
  }

  // Mark listing canceled and persist penalty info if marketplace table has those columns
  // Detect columns
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
  ]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}