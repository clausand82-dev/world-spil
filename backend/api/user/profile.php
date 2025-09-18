<?php
declare(strict_types=1);

/**
 * GET /api/user/profile.php
 * Returnerer oplysninger om den aktuelle bruger (eller en valgt user_id hvis admin).
 * Output: { ok:true, data:{ userId, username, email, role, created_at, last_login } }
 */
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

define('WS_RUN_MODE', 'lib');
require_once __DIR__ . '/../alldata.php';

function respond(array $payload, int $http=200): never {
  http_response_code($http);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}
function bad(string $code, string $msg, int $http=400): never {
  respond(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], $http);
}

try {
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) bad('unauthorized','Log ind først.',401);
  $pdo = db();

  // role check
  $role = (string)($_SESSION['role'] ?? '');
  if ($role !== 'admin' && $role !== 'player') {
    try {
      $st = $pdo->prepare('SELECT role FROM users WHERE id = ?');
      $st->execute([$uid]);
      $r = $st->fetch();
      if (!$r) { $st = $pdo->prepare('SELECT role FROM users WHERE userId = ?'); $st->execute([$uid]); $r = $st->fetch(); }
      if ($r && !empty($r['role'])) $role = (string)$r['role'];
    } catch (Throwable $e) {
      $role = 'player';
    }
  }
  if ($role !== 'admin') $role = 'player';

  $reqUser = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
  $target  = ($role === 'admin' && $reqUser) ? $reqUser : (int)$uid;

  // prøv begge kolonnenavne-variationer
  $st = $pdo->prepare('SELECT user_id, username, email, role, created_at, last_login FROM users WHERE user_id = ? LIMIT 1');
  $st->execute([$target]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    $st = $pdo->prepare('SELECT userId as user_id, username, email, role, createdAt as created_at, last_login FROM users WHERE userId = ? LIMIT 1');
    $st->execute([$target]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
  }
  if (!$row) bad('not_found','Bruger ikke fundet',404);

  respond([
    'ok'=>true,
    'data'=>[
      'userId'    => (int)($row['user_id'] ?? $target),
      'username'  => (string)($row['username'] ?? ''),
      'email'     => (string)($row['email'] ?? ''),
      'role'      => (string)($row['role'] ?? ''),
      'created_at'=> (string)($row['created_at'] ?? ''),
      'last_login'=> (string)($row['last_login'] ?? ''),
    ]
  ]);
} catch (Throwable $e) {
  respond(['ok'=>false,'error'=>['code'=>'E_SERVER','message'=>$e->getMessage()]], 500);
}