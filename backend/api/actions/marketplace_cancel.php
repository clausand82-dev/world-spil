<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

function jout($ok, $payload){ echo json_encode($ok?['ok'=>true,'data'=>$payload]:['ok'=>false,'error'=>$payload], JSON_UNESCAPED_UNICODE); exit; }
function jerr(string $msg, int $http=400){ http_response_code($http); jout(false, ['message'=>$msg]); }

try {
  $pdo = db();
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) jerr('Not logged in', 401);

  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $id = (int)($body['id'] ?? 0);
  if ($id <= 0) jerr('Invalid id');

  $pdo->beginTransaction();
  $sel = $pdo->prepare("SELECT id, user_id, res_id, amount, status, created_at FROM marketplace WHERE id = ? FOR UPDATE");
  $sel->execute([$id]);
  $row = $sel->fetch(PDO::FETCH_ASSOC);
  if (!$row) { $pdo->rollBack(); jerr('Listing not found', 404); }
  if ((int)$row['user_id'] !== (int)$uid) { $pdo->rollBack(); jerr('Not your listing', 403); }
  if ($row['status'] !== 'forsale') { $pdo->rollBack(); jerr('Already finalized'); }

  // 1 hour min before cancel
  $createdTs = strtotime((string)$row['created_at']);
  if (time() - $createdTs < 3600) { $pdo->rollBack(); jerr('Kan fortrydes efter 1 time'); }

  $resId = (string)$row['res_id'];
  $amount = (float)$row['amount'];
  $return = floor($amount * 0.9); // minus 10%, afrundet ned
  // mark canceled
  $upd = $pdo->prepare("UPDATE marketplace SET status='canceled', canceled_at=NOW() WHERE id = ?");
  $upd->execute([$id]);
  // credit inventory
  // Upsert
  $u = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
  $u->execute([$return, $uid, $resId]);
  if ($u->rowCount() === 0) {
    $i = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?,?,?)");
    $i->execute([$uid, $resId, $return]);
  }

  $pdo->commit();
  jout(true, ['id'=>$id, 'returned'=>$return]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
  jerr($e->getMessage(), 500);
}