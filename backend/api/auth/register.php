<?php
declare(strict_types=1);
/**
 * Opret bruger (robust input)
 * Accepterer:
 *  1) JSON-objekt: { "username":"...", "email":"...", "password":"..." }
 *  2) JSON-array i vilkårlig rækkefølge: ["username","password","email"] ELLER ["username","email","password"]
 *  3) Fallback til $_POST (form)
 *
 * Output: { ok:true, data:{ userId:int, username:string, loggedIn:true } }
 */

header('Content-Type: application/json; charset=utf-8');
session_start();

function json_err(string $code, string $msg, int $http = 400): never {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], JSON_UNESCAPED_UNICODE);
  exit;
}

function read_input(): array {
  $raw = file_get_contents('php://input') ?: '';
  $data = json_decode($raw, true);
  if (is_array($data)) return $data;

  // Fallback til almindelig form POST
  if (!empty($_POST)) return $_POST;

  return [];
}

function db(): PDO {
  $ini = __DIR__ . '/../../data/config/db.ini';
  if (!is_file($ini)) throw new RuntimeException('Missing db.ini at backend/data/config/db.ini');

  $cfg = parse_ini_file($ini, true, INI_SCANNER_TYPED);
  $root = is_array($cfg) ? $cfg : [];
  $db   = $root['database'] ?? $root; // tillad både sektion og "rodløst"

  $host    = $db['host']     ?? '127.0.0.1';
  $user    = $db['user']     ?? 'root';
  $pass    = $db['password'] ?? ($db['pass'] ?? '');
  $name    = $db['name']     ?? ($db['dbname'] ?? ($db['database'] ?? ''));
  $charset = $db['charset']  ?? 'utf8mb4';

  if ($name === '') throw new RuntimeException('DB name missing in db.ini ([database] name=...)');

  $dsn = "mysql:host={$host};dbname={$name};charset={$charset}";
  return new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
}

/** Normalisér input til ['username'=>..., 'email'=>..., 'password'=>...] */
function normalize_register_payload(array $in): array {
  // 1) Assoc JSON-objekt
  if (isset($in['username']) || isset($in['email']) || isset($in['password'])) {
    return [
      'username' => trim((string)($in['username'] ?? '')),
      'email'    => trim((string)($in['email'] ?? '')),
      'password' => (string)($in['password'] ?? ''),
    ];
  }

  // 2) Array (positions-baseret)
  // Vi prøver at gætte positioner. E-mail har et '@'.
  if (array_is_list($in)) {
    $a = array_values($in);
    $a = array_map(fn($v)=>is_string($v)?trim($v):'', $a);

    $emailIdx = null;
    foreach ($a as $i=>$v) if (strpos($v, '@') !== false) { $emailIdx = $i; break; }

    if ($emailIdx !== null) {
      $email = $a[$emailIdx];
      $rest  = $a;
      unset($rest[$emailIdx]);
      $rest = array_values($rest);

      // Tilbage er [username,password] i ukendt rækkefølge.
      // Heuristik: det længste (eller “mest komplekse”) ord er ofte password.
      $u = $rest[0] ?? '';
      $p = $rest[1] ?? '';

      // Hvis vi tidligere har brugt [username,password,email], så passer dette direkte.
      // Hvis vi har [username,email,password], så har vi byttet rundt ovenfor – men vi tager højde:
      // Hvis 'p' ser meget “kodeords-agtig” ud (>=6 og blandet), så antag p=password.
      $looksLikePassword = fn($s)=>strlen($s) >= 6 && (bool)preg_match('/[A-Za-z]/',$s) && (bool)preg_match('/[0-9]/',$s);

      if (!$looksLikePassword($p) && $looksLikePassword($u)) {
        // bytte
        [$u,$p] = [$p,$u];
      }

      return ['username'=>$u,'email'=>$email,'password'=>$p];
    }

    // Ingen '@' → antag [username,password,email] som vi dokumenterede tidligere,
    // men vi kan ikke udlede en e-mail. Fail tydeligt:
    return ['username'=>$a[0]??'','email'=>$a[2]??'','password'=>$a[1]??''];
  }

  // 3) Ukendt format
  return ['username'=>'','email'=>'','password'=>''];
}

try {
  $raw = read_input();
  $p   = normalize_register_payload($raw);

  $username = $p['username'];
  $email    = $p['email'];
  $password = $p['password'];

  if ($username === '' || $email === '' || $password === '') {
    json_err('E_INPUT','Missing username, email or password', 400);
  }
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('E_INPUT','Invalid email format', 400);
  }

  $pdo = db();

  // Unik tjek
  $exists = $pdo->prepare('SELECT 1 FROM users WHERE username = ? OR email = ? LIMIT 1');
  $exists->execute([$username, $email]);
  if ($exists->fetch()) {
    json_err('E_EXISTS','Username or email already in use', 409);
  }

  $hash = password_hash($password, PASSWORD_DEFAULT);

  $ins = $pdo->prepare('
    INSERT INTO users (username, email, password_hash, is_active, created_at)
    VALUES (?, ?, ?, 1, NOW())
  ');
  $ins->execute([$username, $email, $hash]);

  $uid = (int)$pdo->lastInsertId();

  // Auto-login
  $_SESSION['uid'] = $uid;
  $_SESSION['username'] = $username;

  echo json_encode([
    'ok'   => true,
    'data' => [
      'userId'   => $uid,
      'username' => $username,
      'loggedIn' => true
    ]
  ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
  // Dublet-sikkerhed (hvis unik indeks på username/email)
  if ((int)$e->errorInfo[1] === 1062) {
    json_err('E_EXISTS','Username or email already in use', 409);
  }
  json_err('E_SERVER', $e->getMessage(), 500);
} catch (Throwable $e) {
  json_err('E_SERVER', $e->getMessage(), 500);
}
