<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

try {
  $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
  $lang = isset($body['lang']) ? strtolower(preg_replace('/[^a-z]/','', substr((string)$body['lang'], 0, 2))) : '';
  $allowed = ['da','en']; // udvid efter behov

  if ($lang === '' || !in_array($lang, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid lang']]);
    exit;
  }

  $_SESSION['lang'] = $lang;

  // Valgfrit: gem pr. bruger
  // if (function_exists('auth_get_user_id_if_any') && ($uid = auth_get_user_id_if_any())) {
  //   $pdo = db();
  //   $st = $pdo->prepare('UPDATE users SET preferred_lang = ? WHERE user_id = ?');
  //   $st->execute([$lang, $uid]);
  // }

  echo json_encode(['ok'=>true,'lang'=>$lang], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage()]]);
}