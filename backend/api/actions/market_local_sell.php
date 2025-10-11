<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

function jout($ok, $payload){ echo json_encode($ok?['ok'=>true,'data'=>$payload]:['ok'=>false,'error'=>$payload], JSON_UNESCAPED_UNICODE); exit; }
function jerr(string $msg, int $http=400){ http_response_code($http); jout(false, ['message'=>$msg]); }

function local_unit_price(string $resId): float {
  // Simple fast pris – kan udvides fra DB/config
  $base = [
    'res.wood'=>2.0,'res.stone'=>3.0,'res.iron'=>5.0,'res.water'=>1.0,'res.food'=>4.0,
  ];
  $b = $base[$resId] ?? 1.0;
  return max(0.1, round($b * 0.85, 2));
}

try {
  $pdo = db();
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) jerr('Not logged in', 401);

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $resId = (string)($body['res_id'] ?? '');
  $amount = (float)($body['amount'] ?? 0);
  if ($resId === '' || $amount <= 0) jerr('Invalid input');
  if (str_starts_with($resId, 'ani.')) jerr('Units/dyr kan ikke sælges lokalt');

  $price = local_unit_price($resId);
  $total = $price * $amount;

  $pdo->beginTransaction();
  // lock res
  $sel = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? FOR UPDATE");
  $sel->execute([$uid, $resId]);
  $have = (float)($sel->fetchColumn() ?? 0.0);
  if ($have < $amount) { $pdo->rollBack(); jerr('For få varer i inventory'); }

  // Deduct resource
  $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = ?")->execute([$amount, $uid, $resId]);
  // Credit money
  $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = 'res.money'")->execute([$total, $uid]);
  if ($pdo->lastInsertId() === '0' && $pdo->query("SELECT ROW_COUNT()")->fetchColumn() == 0) {
    // fallback insert hvis ingen row fandtes
    $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, 'res.money', ?)");
    $ins->execute([$uid, $total]);
  }

  $pdo->commit();
  jout(true, ['res_id'=>$resId, 'sold'=>$amount, 'unit_price'=>$price, 'total'=>$total]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
  jerr($e->getMessage(), 500);
}