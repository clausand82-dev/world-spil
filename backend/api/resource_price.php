<?php
declare(strict_types=1);
require_once __DIR__ . '/_init.php';
require_once __DIR__ . '/_price_helper.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

$resId = isset($_GET['res_id']) ? (string)$_GET['res_id'] : '';
if ($resId === '') {
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>['message'=>'res_id required']], JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  $pdo = db();
  $price = getEffectivePrice($pdo, $resId, ['context' => ($_GET['context'] ?? 'local'), 'volatility' => 0.0]);
  echo json_encode(['ok' => true, 'data' => ['res_id' => $resId, 'price' => $price]], JSON_UNESCAPED_UNICODE);
  exit;
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => ['message' => $e->getMessage()]], JSON_UNESCAPED_UNICODE);
  exit;
}