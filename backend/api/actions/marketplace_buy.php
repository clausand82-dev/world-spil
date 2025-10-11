<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $buyerId = $_SESSION['uid'] ?? null;
  if (!$buyerId) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Not logged in']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $id = (int)($body['id'] ?? 0);
  $amount = (float)($body['amount'] ?? 0);
  if ($id <= 0 || $amount <= 0) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid input']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $pdo->beginTransaction();

  // Lock listing row
  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]);
  $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) { $pdo->rollBack(); http_response_code(404); echo json_encode(['ok'=>false,'error'=>['message'=>'Listing not found']], JSON_UNESCAPED_UNICODE); exit; }
  if ($m['status'] !== 'forsale') { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Not for sale']], JSON_UNESCAPED_UNICODE); exit; }
  $sellerId = (int)$m['user_id'];
  if ($sellerId === (int)$buyerId) { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Cannot buy own listing']], JSON_UNESCAPED_UNICODE); exit; }

  $resId = (string)$m['res_id'];
  $available = (float)$m['amount'];
  if ($amount > $available) { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Amount exceeds available']], JSON_UNESCAPED_UNICODE); exit; }

  $price = (float)$m['price'];
  $total = $price * $amount;

  // Lock buyer money row to check funds
  $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' FOR UPDATE");
  $selMoney->execute([$buyerId]);
  $haveMoney = (float)($selMoney->fetchColumn() ?? 0.0);
  if ($haveMoney < $total) { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Insufficient funds']], JSON_UNESCAPED_UNICODE); exit; }

  // Deduct buyer money (row exists or not - but we locked above; use UPDATE)
  $updMoney = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = 'res.money'");
  $updMoney->execute([$total, $buyerId]);

  // Credit seller money — use upsert to avoid race conditions (INSERT ... ON DUPLICATE KEY UPDATE)
  $insSellerMoney = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, 'res.money', ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insSellerMoney->execute([$sellerId, $total]);

  // Credit buyer resource — upsert
  $insBuyerRes = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insBuyerRes->execute([$buyerId, $resId, $amount]);

  // Reduce listing amount / finalize
  $left = $available - $amount;
  if ($left > 0) {
    $pdo->prepare("UPDATE marketplace SET amount = ? WHERE id = ?")->execute([$left, $id]);
  } else {
    $pdo->prepare("UPDATE marketplace SET amount = 0, status='sold', sold_at=NOW() WHERE id = ?")->execute([$id]);
  }

  $pdo->commit();
  echo json_encode(['ok'=>true,'data'=>['id'=>$id,'bought'=>$amount,'left'=>$left,'paid'=>$total]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}