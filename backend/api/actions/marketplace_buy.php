<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

function jout($ok, $payload){ echo json_encode($ok?['ok'=>true,'data'=>$payload]:['ok'=>false,'error'=>$payload], JSON_UNESCAPED_UNICODE); exit; }
function jerr(string $msg, int $http=400){ http_response_code($http); jout(false, ['message'=>$msg]); }

try {
  $pdo = db();
  $buyerId = $_SESSION['uid'] ?? null;
  if (!$buyerId) jerr('Not logged in', 401);

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $id = (int)($body['id'] ?? 0);
  $amount = (float)($body['amount'] ?? 0);
  if ($id <= 0 || $amount <= 0) jerr('Invalid input');

  $pdo->beginTransaction();

  // Lock listing
  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]);
  $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) { $pdo->rollBack(); jerr('Listing not found', 404); }
  if ($m['status'] !== 'forsale') { $pdo->rollBack(); jerr('Not for sale'); }
  $sellerId = (int)$m['user_id'];
  if ($sellerId === (int)$buyerId) { $pdo->rollBack(); jerr('Cannot buy own listing'); }

  $resId = (string)$m['res_id'];
  $available = (float)$m['amount'];
  if ($amount > $available) { $pdo->rollBack(); jerr('Amount exceeds available'); }

  $price = (float)$m['price'];
  $total = $price * $amount;

  // Check buyer money
  $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' FOR UPDATE");
  $selMoney->execute([$buyerId]);
  $haveMoney = (float)($selMoney->fetchColumn() ?? 0.0);
  if ($haveMoney < $total) { $pdo->rollBack(); jerr('Insufficient funds'); }

  // TODO: capacity check (kan laves i backend senere). For nu antager vi OK.

  // Deduct money
  $updMoney = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = 'res.money'");
  $updMoney->execute([$total, $buyerId]);

  // Credit seller money
  $updSeller = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = 'res.money'");
  $updSeller->execute([$total, $sellerId]);
  if ($updSeller->rowCount() === 0) {
    $insSeller = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, 'res.money', ?)");
    $insSeller->execute([$sellerId, $total]);
  }

  // Credit buyer resource
  $updRes = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
  $updRes->execute([$amount, $buyerId, $resId]);
  if ($updRes->rowCount() === 0) {
    $insRes = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
    $insRes->execute([$buyerId, $resId, $amount]);
  }

  // Reduce listing amount / finalize
  $left = $available - $amount;
  if ($left > 0) {
    $pdo->prepare("UPDATE marketplace SET amount = ? WHERE id = ?")->execute([$left, $id]);
  } else {
    $pdo->prepare("UPDATE marketplace SET amount = 0, status='sold', sold_at=NOW() WHERE id = ?")->execute([$id]);
  }

  $pdo->commit();
  jout(true, ['id'=>$id, 'bought'=>$amount, 'left'=>$left, 'paid'=>$total]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
  jerr($e->getMessage(), 500);
}