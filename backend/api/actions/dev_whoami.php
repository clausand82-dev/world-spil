<?php
require_once __DIR__ . '/../_init.php';
header('Content-Type: application/json');
echo json_encode([
  'ok' => true,
  'session_user_id' => $_SESSION['user_id'] ?? null,
  'has_session' => isset($_SESSION['user_id'])
]);
