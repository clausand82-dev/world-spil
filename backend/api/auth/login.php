<?php
declare(strict_types=1);
/**
 * Log ind med brugernavn + kodeord (JSON POST).
 * Input:  { "username": "...", "password": "..." }
 * Output: { ok:true, data:{ userId:int, username:string, loggedIn:true } }
 */
header('Content-Type: application/json; charset=utf-8');
session_start();

function json_err(string $code, string $msg, int $http = 400) {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]]);
  exit;
}
function read_json(): array {
  $raw = file_get_contents('php://input') ?: '';
  $data = json_decode($raw, true);
  if (!is_array($data)) $data = [];
  return $data;
}
function db(): PDO {
  $ini = __DIR__ . '/../../data/config/db.ini';
  if (!is_file($ini)) {
    throw new RuntimeException('Missing db.ini at backend/data/config/db.ini');
  }
  $cfg = parse_ini_file($ini, true, INI_SCANNER_TYPED);
  $h = $cfg['database']['host']     ?? '127.0.0.1';
  $u = $cfg['database']['user']     ?? 'root';
  $p = $cfg['database']['password'] ?? '';
  $n = $cfg['database']['name']     ?? '';
  $c = new PDO("mysql:host=$h;dbname=$n;charset=utf8mb4", $u, $p, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $c;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('E_METHOD', 'Use POST', 405);
  $req = read_json();
  $username = trim((string)($req['username'] ?? ''));
  $password = (string)($req['password'] ?? '');
  if ($username === '' || $password === '') json_err('E_INPUT', 'Missing username or password', 400);

  $pdo = db();
  $stmt = $pdo->prepare('SELECT user_id, username, password_hash, is_active FROM users WHERE (username = ? OR email = ?) LIMIT 1');
  $stmt->execute([$username, $username]);
  $row = $stmt->fetch();

  if (!$row || (int)$row['is_active'] !== 1 || !password_verify($password, (string)$row['password_hash'])) {
    json_err('E_LOGIN', 'Invalid username or password', 401);
  }

  $pdo->prepare('UPDATE users SET failed_logins=0, last_login=NOW() WHERE user_id=?')->execute([(int)$row['user_id']]);

  // VIGTIGT: beskyt mod session fixation
  session_regenerate_id(true);

  // Standardiser – sæt begge nøgler for kompatibilitet
  $_SESSION['uid'] = (int)$row['user_id'];
  $_SESSION['user_id'] = (int)$row['user_id'];
  $_SESSION['username'] = (string)$row['username'];

  echo json_encode([
    'ok' => true,
    'data' => [
      'userId'   => (int)$row['user_id'],
      'username' => (string)$row['username'],
      'loggedIn' => true
    ]
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_SERVER','message'=>$e->getMessage()]]);  
}