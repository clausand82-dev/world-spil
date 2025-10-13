<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
session_start();

// IMPORTANT: use files that actually exist in your repo to set up $pdo and auth
require_once __DIR__ . '/../alldata.php';         // provides $pdo and shared bootstrapping
require_once __DIR__ . '/../lib/___auth.php';     // must define auth_current_user_id()
require_once __DIR__ . '/../lib/management_policies.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = (int) auth_current_user_id();

if (!$userId) {
  http_response_code(401);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_AUTH','message'=>'Not authenticated']]);
  exit;
}

if ($method === 'GET') {
  $family = isset($_GET['family']) ? trim((string)$_GET['family']) : '';
  $sql = 'SELECT family, field_key, value_json FROM user_management_choices WHERE user_id = ?';
  $args = [$userId];
  if ($family !== '') { $sql .= ' AND family = ?'; $args[] = $family; }

  $st = $pdo->prepare($sql);
  $st->execute($args);

  $data = [];
  while ($row = $st->fetch(\PDO::FETCH_ASSOC)) {
    $fam = $row['family'];
    $key = $row['field_key'];
    $val = json_decode($row['value_json'], true);
    if (!isset($data[$fam])) $data[$fam] = [];
    $data[$fam][$key] = $val;
  }

  echo json_encode(['ok'=>true,'overrides'=>$data]); // overrides[family][key] = value
  exit;
}

if ($method === 'PUT' || $method === 'POST') {
  $raw = file_get_contents('php://input') ?: '{}';
  $body = json_decode($raw, true) ?: [];
  $family = trim((string)($body['family'] ?? ''));
  $overrides = (array)($body['overrides'] ?? []);
  $replaceFamily = (bool)($body['replaceFamily'] ?? true); // default: replace all for family

  if ($family === '') {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['code'=>'E_INPUT','message'=>'Missing family']]);
    exit;
  }

  foreach ($overrides as $k => $v) {
    management_normalize_kv($family, $k, $v); // throws on invalid input
  }

  $pdo->beginTransaction();
  try {
    if ($replaceFamily) {
      $st = $pdo->prepare('DELETE FROM user_management_choices WHERE user_id = ? AND family = ?');
      $st->execute([$userId, $family]);
    }

    if (!empty($overrides)) {
      $st = $pdo->prepare('REPLACE INTO user_management_choices (user_id, family, field_key, value_json) VALUES (?,?,?,?)');
      foreach ($overrides as $k => $v) {
        $st->execute([$userId, $family, $k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
      }
    }

    $pdo->commit();
    echo json_encode(['ok'=>true]);
  } catch (\Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['code'=>'E_DB','message'=>$e->getMessage()]]);
  }
  exit;
}

http_response_code(405);
echo json_encode(['ok'=>false,'error'=>['code'=>'E_METHOD','message'=>'Use GET/PUT']]);