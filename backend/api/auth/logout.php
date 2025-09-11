<?php
declare(strict_types=1);
/**
 * Log ud (POST).
 * Output: { ok:true }
 */
header('Content-Type: application/json; charset=utf-8');
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_METHOD','message'=>'Use POST']]);
  exit;
}

// drop session
$_SESSION = [];
if (ini_get('session.use_cookies')) {
  $params = session_get_cookie_params();
  setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}
session_destroy();

echo json_encode(['ok' => true]);
