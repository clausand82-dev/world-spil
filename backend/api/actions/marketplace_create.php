<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $userId = $_SESSION['uid'] ?? null;
  if (!$userId) { http_response_code(401); echo json_encode(['ok'=>false,'error'=>['message'=>'Not logged in']], JSON_UNESCAPED_UNICODE); exit; }

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $resId = isset($body['res_id']) ? (string)$body['res_id'] : '';
  $amount = isset($body['amount']) ? (float)$body['amount'] : 0.0;
  $price = isset($body['price']) ? (float)$body['price'] : 0.0;

  if ($resId === '' || $amount <= 0 || $price < 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid input']], JSON_UNESCAPED_UNICODE); exit; }

  $pdo->beginTransaction();

  $sel = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? FOR UPDATE");
  $sel->execute([$userId, $resId]);
  $have = (float)($sel->fetchColumn() ?? 0.0);
  if ($have < $amount) { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Not enough resource']], JSON_UNESCAPED_UNICODE); exit; }

  $upd = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = ?");
  $upd->execute([$amount, $userId, $resId]);

  $ins = $pdo->prepare("INSERT INTO marketplace (user_id, res_id, amount, price, status, created_at) VALUES (?, ?, ?, ?, 'forsale', NOW())");
  $ins->execute([$userId, $resId, $amount, $price]);
  $listingId = (int)$pdo->lastInsertId();

  $pdo->commit();
  echo json_encode(['ok'=>true,'data'=>['id'=>$listingId,'res_id'=>$resId,'amount'=>$amount,'price'=>$price]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}