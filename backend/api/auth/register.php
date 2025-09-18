<?php
declare(strict_types=1);
/**
 * Opret ny bruger (JSON POST) og tildel startpakke.
 * Input:  { "username": "...", "email": "...", "password": "..." }
 * Output: { ok:true, data:{ userId:int, username:string, loggedIn:true } }
 */
header('Content-Type: application/json; charset=utf-8');
session_start();

function json_err(string $code, string $msg, int $http = 400): never {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]]);
  exit;
}
function read_json(): array {
  $raw = file_get_contents('php://input') ?: '';
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
/** Minimal DB helper (samme stil som login.php) */
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
/** Læs startværdier fra config.ini */
function read_start_config(): array {
  $cfgPath = __DIR__ . '/../../data/config/config.ini';
  $cfg = is_file($cfgPath) ? parse_ini_file($cfgPath, true, INI_SCANNER_TYPED) : [];
  $start = $cfg['start'] ?? [];
  // Defaults hvis ikke sat
  return [
    'money' => (float)($start['userStartMoney'] ?? 100),
    'stone' => (float)($start['userStartStone'] ?? 5),
    'wood'  => (float)($start['userStartWood']  ?? 10),
    'water' => (float)($start['userStartWater'] ?? 25),
    'food'  => (float)($start['userStartFood']  ?? 10),
    'password_cost' => (int)($cfg['security']['password_cost'] ?? 12),
  ];
}

// Find XML-dir fra config
$ini = parse_ini_file(__DIR__ . '/../data/config/config.ini', true);
$xmlDir = $ini['dirs']['xml_dir'] ?? (__DIR__ . '/../data/xml');

// Hent durability fra defs (building.xml)
$buildingXml = @simplexml_load_file($xmlDir . '/building.xml');
$durabilityBasecamp = 0.0;
if ($buildingXml) {
    $node = $buildingXml->xpath("//building[@id='bld.basecamp.l1']/durability")[0] ?? null;
    if ($node !== null) {
        $durabilityBasecamp = (float)$node;
    }
}
// Fallback hvis ikke fundet
if ($durabilityBasecamp <= 0) {
    $durabilityBasecamp = 10.0; // sikkerhedsnet
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('E_METHOD', 'Use POST', 405);
  $req = read_json();
  $username = trim((string)($req['username'] ?? ''));
  $email    = trim((string)($req['email']    ?? ''));
  $password = (string)($req['password'] ?? '');

  if ($username === '' || $email === '' || $password === '') {
    json_err('E_INPUT', 'Missing username, email or password', 400);
  }
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('E_INPUT', 'Invalid email', 400);
  }

  $pdo = db();

  // Tjek om brugernavn eller email allerede findes
  $st = $pdo->prepare('SELECT 1 FROM users WHERE username = ? OR email = ? LIMIT 1');
  $st->execute([$username, $email]);
  if ($st->fetchColumn()) {
    json_err('E_EXISTS', 'Username or email already exists', 409);
  }

  $start = read_start_config();
  $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => max(4, $start['password_cost'])]);

  $pdo->beginTransaction();

  // Opret bruger
  $ins = $pdo->prepare('INSERT INTO users (username, email, password_hash, is_active, created_at) VALUES (?, ?, ?, 1, UTC_TIMESTAMP())');
  $ins->execute([$username, $email, $hash]);
  $userId = (int)$pdo->lastInsertId();

  // Start-ressourcer
  $startRes = [
    ['res.money', $start['money']],
    ['res.stone', $start['stone']],
    ['res.wood',  $start['wood']],
    ['res.water', $start['water']],
    ['res.food',  $start['food']],
  ];
  $insInv = $pdo->prepare('INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)');
  foreach ($startRes as [$rid, $amt]) {
    if ($amt > 0) $insInv->execute([$userId, $rid, $amt]);
  }

  // Start-bygning (basecamp l1)
  $insB = $pdo->prepare('INSERT INTO buildings (user_id, bld_id, level, durability) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE bld_id = bld_id');
  $insB->execute([$userId, 'bld.basecamp.l1', 1, $durabilityBasecamp]);

  $pdo->commit();

  // Auto-login i samme respons
  $_SESSION['uid'] = $userId;
  $_SESSION['username'] = $username;

  echo json_encode([
    'ok' => true,
    'data' => [
      'userId'   => $userId,
      'username' => $username,
      'loggedIn' => true,
    ]
  ]);
} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  json_err('E_SERVER', $e->getMessage(), 500);
}