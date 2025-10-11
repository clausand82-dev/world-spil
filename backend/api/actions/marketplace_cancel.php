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

  $id = (int)($_POST['id'] ?? ($_GET['id'] ?? 0));
  if ($id <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid id']], JSON_UNESCAPED_UNICODE); exit; }

  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]);
  $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) { http_response_code(404); echo json_encode(['ok'=>false,'error'=>['message'=>'Listing not found']], JSON_UNESCAPED_UNICODE); exit; }
  if ((int)$m['user_id'] !== (int)$userId) { http_response_code(403); echo json_encode(['ok'=>false,'error'=>['message'=>'Not owner']], JSON_UNESCAPED_UNICODE); exit; }

  // return resource to inventory
  $pdo->beginTransaction();
  $upd = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
  $upd->execute([(float)$m['amount'], $userId, $m['res_id']]);
  if ($upd->rowCount() === 0) {
    $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
    $ins->execute([$userId, $m['res_id'], (float)$m['amount']]);
  }

  $pdo->prepare("UPDATE marketplace SET status='canceled', canceled_at=NOW() WHERE id = ?")->execute([$id]);
  $pdo->commit();

  echo json_encode(['ok'=>true,'data'=>['id'=>$id]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}