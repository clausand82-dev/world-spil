<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../_price_helper.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $userId = $_SESSION['uid'] ?? null;
  if (!$userId) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => ['message' => 'Not logged in']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $resId = isset($body['res_id']) ? (string)$body['res_id'] : '';
  $amount = isset($body['amount']) ? (float)$body['amount'] : 0.0;

  if ($resId === '' || $amount <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => ['message' => 'Invalid input']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Backend determines price (source of truth)
  $price = getEffectivePrice($pdo, $resId, ['context' => 'local', 'volatility' => 0.0]);
  $total = $amount * $price;

  $pdo->beginTransaction();

  // 1) Lock seller's resource and verify
  $sel = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? FOR UPDATE");
  $sel->execute([$userId, $resId]);
  $have = (float)($sel->fetchColumn() ?? 0.0);
  if ($have < $amount) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => ['message' => 'Not enough resource']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // 2) Deduct resource
  $upd = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = ?");
  $upd->execute([$amount, $userId, $resId]);

  // 3) Credit money to seller (upsert — requires UNIQUE(user_id, res_id))
  $insMoney = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, 'res.money', ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insMoney->execute([$userId, $total]);

  // 4) Update price stats / maybe recompute last_price (rate-limited inside)
  updatePriceAfterSale($pdo, $resId, $amount, false);

  // 5) Read new money balance to return
  $check = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money'");
  $check->execute([$userId]);
  $newMoney = (float)($check->fetchColumn() ?? 0.0);

  $pdo->commit();

  echo json_encode(['ok' => true, 'data' => [
    'res_id' => $resId,
    'sold' => $amount,
    'price' => $price,
    'paid' => $total,
    'money_balance' => $newMoney
  ]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  error_log("market_local_sell ERROR: " . $e->getMessage());
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => ['message' => $e->getMessage()]], JSON_UNESCAPED_UNICODE);
  exit;
}