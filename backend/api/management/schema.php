<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . '/../_init.php';

try {
  auth_require_user_id();

  $family = isset($_GET['family']) ? trim((string)$_GET['family']) : '';
  if ($family === '') {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['code'=>'E_INPUT','message'=>'Missing family']]);
    exit;
  }

  $path = realpath(__DIR__ . '/../../data/policies/' . basename($family) . '.json');
  if (!$path || !is_file($path)) {
    http_response_code(404);
    echo json_encode(['ok'=>false,'error'=>['code'=>'E_NOTFOUND','message'=>'Schema not found']]);
    exit;
  }

  $raw = file_get_contents($path);
  $json = json_decode($raw, true);
  if (!is_array($json)) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['code'=>'E_SCHEMA','message'=>'Invalid schema JSON']]);
    exit;
  }

  echo json_encode(['ok'=>true,'schema'=>$json], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_SERVER','message'=>$e->getMessage()]]);
}