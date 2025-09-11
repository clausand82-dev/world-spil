<?php
declare(strict_types=1);
/**
 * Returnér profil for den aktuelle session-bruger.
 * Output: { ok:true, data:{ userId, username, email, created_at, last_login, world_id, map_id, field_id, x, y } }
 */
header('Content-Type: application/json; charset=utf-8');
session_start();

function json_err(string $code, string $msg, int $http=400): never {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], JSON_UNESCAPED_UNICODE);
  exit;
}

function db(): PDO {
  $ini = __DIR__ . '/../data/config/db.ini';
  if (!is_file($ini)) {
    // fallback til den sti vi har brugt i auth
    $ini = __DIR__ . '/../../data/config/db.ini';
    if (!is_file($ini)) {
      json_err('E_CONFIG','Missing db.ini (backend/data/config/db.ini)', 500);
    }
  }
  $cfg = parse_ini_file($ini, true, INI_SCANNER_TYPED);
  $db  = $cfg['database'] ?? $cfg;

  $host = $db['host'] ?? '127.0.0.1';
  $user = $db['user'] ?? 'root';
  $pass = $db['password'] ?? ($db['pass'] ?? '');
  $name = $db['name'] ?? ($db['dbname'] ?? ($db['database'] ?? ''));
  $charset = $db['charset'] ?? 'utf8mb4';
  if ($name === '') json_err('E_CONFIG','DB name missing in db.ini', 500);

  return new PDO("mysql:host={$host};dbname={$name};charset={$charset}", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
}

try {
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) json_err('E_AUTH','Not logged in', 401);

  $pdo = db();
  // Vælg kun det vi har brug for i UI’et (tilpas felter hvis dine kolonnenavne afviger)
  $sql = "
    SELECT
      user_id        AS userId,
      username,
      email,
      created_at,
      last_login,
      world_id,
      map_id,
      field_id,
      x_coord        AS x,
      y_coord        AS y
    FROM users
    WHERE user_id = ?
    LIMIT 1
  ";
  $st = $pdo->prepare($sql);
  $st->execute([(int)$uid]);
  $row = $st->fetch();
  if (!$row) json_err('E_NOTFOUND','User not found', 404);

  echo json_encode(['ok'=>true, 'data'=>$row], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  json_err('E_SERVER', $e->getMessage(), 500);
}
