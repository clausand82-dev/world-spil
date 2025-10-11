<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

function jout($ok, $payload){ echo json_encode($ok?['ok'=>true,'data'=>$payload]:['ok'=>false,'error'=>$payload], JSON_UNESCAPED_UNICODE); exit; }
function jerr(string $msg, int $http=400){ http_response_code($http); jout(false, ['message'=>$msg]); }

const GLOBAL_MIN_STAGE = 2;

try {
  $pdo = db();
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) jerr('Not logged in', 401);

  // Stage gate
  $st = $pdo->prepare("SELECT currentstage FROM users WHERE user_id = ?");
  $st->execute([$uid]);
  $stage = (int)($st->fetchColumn() ?: 0);
  if ($stage < GLOBAL_MIN_STAGE) jerr('Global market locked for your stage', 403);

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $resId = (string)($body['res_id'] ?? '');
  $amount = (float)($body['amount'] ?? 0);
  $price  = (float)($body['price'] ?? 0);
  if ($resId === '' || $amount <= 0 || $price <= 0) jerr('Invalid input');

  if (str_starts_with($resId, 'ani.')) jerr('Units/dyr kan ikke sættes til salg');

  // atomic: træk ressourcen og opret listing
  $pdo->beginTransaction();

  // Check inventory
  $sel = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? FOR UPDATE");
  $sel->execute([$uid, $resId]);
  $row = $sel->fetch(PDO::FETCH_ASSOC);
  $have = (float)($row['amount'] ?? 0.0);
  if ($have < $amount) { $pdo->rollBack(); jerr('For få varer i inventory'); }

  // Deduct
  $upd = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = ?");
  $upd->execute([$amount, $uid, $resId]);

  // Create listing
  $pdo->exec("CREATE TABLE IF NOT EXISTS marketplace (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    res_id VARCHAR(64) NOT NULL,
    amount DECIMAL(20,3) NOT NULL,
    price DECIMAL(20,3) NOT NULL,
    status ENUM('forsale','sold','canceled') NOT NULL DEFAULT 'forsale',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sold_at DATETIME NULL,
    canceled_at DATETIME NULL,
    INDEX (user_id), INDEX (res_id), INDEX (status), INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  $ins = $pdo->prepare("INSERT INTO marketplace (user_id, res_id, amount, price, status) VALUES (?,?,?,?, 'forsale')");
  $ins->execute([$uid, $resId, $amount, $price]);

  $id = (int)$pdo->lastInsertId();
  $pdo->commit();

  jout(true, ['id'=>$id, 'res_id'=>$resId, 'amount'=>$amount, 'price'=>$price]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
  jerr($e->getMessage(), 500);
}