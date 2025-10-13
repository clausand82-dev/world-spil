<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . '/../_init.php';            // giver db() + auth_require_user_id()
require_once __DIR__ . '/../lib/management_policies.php';

$method = $_SERVER['REQUEST_METHOD'];
$debug  = isset($_GET['debug']) && $_GET['debug'] == '1';

try {
  $userId = auth_require_user_id();  // sikrer login (eller 401)
  $pdo = db();                       // hent PDO fra alldata/_init

  if ($method === 'GET') {
    $family = isset($_GET['family']) ? trim((string)$_GET['family']) : '';
    $sql = 'SELECT family, field_key, value_json FROM user_management_choices WHERE user_id = ?';
    $args = [$userId];
    if ($family !== '') { $sql .= ' AND family = ?'; $args[] = $family; }

    $st = $pdo->prepare($sql);
    $st->execute($args);

    $data = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $fam = (string)$row['family'];
      $key = (string)$row['field_key'];
      $val = json_decode((string)$row['value_json'], true);
      if (!isset($data[$fam])) $data[$fam] = [];
      $data[$fam][$key] = $val;
    }

    $out = ['ok'=>true,'overrides'=>$data];
    if ($debug) {
      $dbName = $pdo->query('SELECT DATABASE()')->fetchColumn();
      $out['debug'] = [
        'userId'=>$userId,
        'db'=>$dbName,
        'family'=>$family,
        'rowCount'=>count($data, COUNT_RECURSIVE),
      ];
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
  }

  if ($method === 'PUT' || $method === 'POST') {
    $raw = file_get_contents('php://input') ?: '{}';
    $body = json_decode($raw, true) ?: [];
    $family = trim((string)($body['family'] ?? ''));
    $overrides = (array)($body['overrides'] ?? []);
    $replaceFamily = (bool)($body['replaceFamily'] ?? true);

    if ($family === '') {
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>['code'=>'E_INPUT','message'=>'Missing family']], JSON_UNESCAPED_UNICODE);
      exit;
    }

    foreach ($overrides as $k => $v) {
      management_normalize_kv($family, $k, $v);
    }

    $affected = 0;
    $pdo->beginTransaction();
    try {
      if ($replaceFamily) {
        $stDel = $pdo->prepare('DELETE FROM user_management_choices WHERE user_id = ? AND family = ?');
        $stDel->execute([$userId, $family]);
      }

      if (!empty($overrides)) {
        $st = $pdo->prepare('REPLACE INTO user_management_choices (user_id, family, field_key, value_json) VALUES (?,?,?,?)');
        foreach ($overrides as $k => $v) {
          $st->execute([$userId, $family, $k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
          $affected += $st->rowCount();
        }
      }

      $pdo->commit();

      $out = ['ok'=>true];
      if ($debug) {
        $dbName = $pdo->query('SELECT DATABASE()')->fetchColumn();
        $out['debug'] = [
          'userId'=>$userId,
          'db'=>$dbName,
          'family'=>$family,
          'overrides_keys'=>array_keys($overrides),
          'affected_rows'=>$affected,
          'replaceFamily'=>$replaceFamily,
          'rawBody'=>$body,
        ];
        $stChk = $pdo->prepare('SELECT field_key, value_json FROM user_management_choices WHERE user_id = ? AND family = ?');
        $stChk->execute([$userId, $family]);
        $out['debug']['current_rows'] = $stChk->fetchAll(PDO::FETCH_ASSOC);
      }
      echo json_encode($out, JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
      $pdo->rollBack();
      http_response_code(500);
      echo json_encode(['ok'=>false,'error'=>['code'=>'E_DB','message'=>$e->getMessage()]], JSON_UNESCAPED_UNICODE);
    }
    exit;
  }

  http_response_code(405);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_METHOD','message'=>'Use GET/PUT']]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_SERVER','message'=>$e->getMessage()]], JSON_UNESCAPED_UNICODE);
}