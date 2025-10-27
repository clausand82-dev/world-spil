<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../_price_helper.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/*
  Local sell: create a local listing (session). Return compact delta with state.
*/

function convertEmptyArraysToObjects($v) {
  if (is_array($v)) {
    if (count($v) === 0) return (object)[];
    foreach ($v as $k => $sub) $v[$k] = convertEmptyArraysToObjects($sub);
    return $v;
  }
  return $v;
}

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $userId = $_SESSION['uid'] ?? null;
  if (!$userId) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => ['message' => 'Not logged']], JSON_UNESCAPED_UNICODE);
    exit;
  }
  $userId = (int)$userId;

  $raw = file_get_contents('php://input') ?: '';
  $body = json_decode($raw, true) ?: [];
  $get = function($k, $d=null) use ($body) { if(array_key_exists($k,$body)) return $body[$k]; if(isset($_POST[$k])) return $_POST[$k]; return $d; };

  $resId = isset($body['res_id']) ? (string)$body['res_id'] : (string)$get('res_id', '');
  $amount = isset($body['amount']) ? (float)$body['amount'] : (float)$get('amount', 0);
  if ($resId === '' || $amount <= 0) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid input']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // server price
  $price = null;
  if (function_exists('getEffectivePrice')) {
    $price = getEffectivePrice($pdo, $resId, ['context' => 'local', 'volatility' => 0.0]);
  }
  if (!is_numeric($price)) {
    $price = is_numeric($get('price', null)) ? (float)$get('price') : 0.0;
  }
  $totalFloat = $amount * (float)$price;
  $total = (int)ceil($totalFloat);

  $pdo->beginTransaction();
  try {
    $pdo->prepare("SELECT res_id FROM inventory WHERE user_id = ? FOR UPDATE")->execute([$userId]);

    $sel = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? LIMIT 1");
    $sel->execute([$userId, $resId]);
    $have = (float)($sel->fetchColumn() ?? 0.0);
    if ($have < $amount - 1e-9) {
      $pdo->rollBack();
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Not enough resource','have'=>$have,'need'=>$amount]], JSON_UNESCAPED_UNICODE);
      exit;
    }

    $upd = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = ?");
    $upd->execute([$amount, $userId, $resId]);
    if ($upd->rowCount() === 0) {
      $pdo->rollBack();
      http_response_code(500);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Inventory update failed']], JSON_UNESCAPED_UNICODE);
      exit;
    }

    if ($total > 0) {
      $insMoney = $pdo->prepare("
        INSERT INTO inventory (user_id, res_id, amount)
        VALUES (?, 'res.money', ?)
        ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
      ");
      $insMoney->execute([$userId, $total]);
    }

    // add listing to session
    $hourKey = date('YmdH');
    if (!isset($_SESSION['market_local'])) $_SESSION['market_local'] = [];
    if (!isset($_SESSION['market_local'][$hourKey])) $_SESSION['market_local'][$hourKey] = ['rows' => []];
    $rows =& $_SESSION['market_local'][$hourKey]['rows'];

    $localIdx = count($rows);
    $localId = 'local:' . time() . ':' . $localIdx;
    $sellerInfo = [
      'user_id' => $userId,
      'username' => $_SESSION['username'] ?? ('u'.$userId),
      'world_id' => $_SESSION['world_id'] ?? null,
      'map_id' => $_SESSION['map_id'] ?? null,
    ];
    $entry = [
      'id' => $localId,
      'res_id' => $resId,
      'amount' => $amount,
      'price' => $price,
      'seller' => $sellerInfo,
      'created_at' => date('Y-m-d H:i:s')
    ];
    $rows[] = $entry;

    $pdo->commit();

    // read back new state
    $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' LIMIT 1");
    $selMoney->execute([$userId]);
    $newMoney = (float)($selMoney->fetchColumn() ?? 0.0);

    $selNewRes = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? LIMIT 1");
    $selNewRes->execute([$userId, $resId]);
    $newResAmount = (float)($selNewRes->fetchColumn() ?? 0.0);

    $plainKey = preg_replace('/^res\\./', '', $resId);
    $deltaState = [
      'inv' => [
        'solid' => [],
        'liquid' => []
      ],
      'market' => [
        'offer' => [
          'id' => $localId,
          'amount' => $amount
        ]
      ]
    ];
    $deltaState['inv']['solid']['money'] = $newMoney;
    $deltaState['inv']['solid'][$plainKey] = $newResAmount;

    // convert empties to objects for JSON
    $deltaState = convertEmptyArraysToObjects($deltaState);

    echo json_encode(['ok'=>true,'data'=>[
      'message'=>'Local sell created',
      'listing' => $entry,
      'delta' => ['state' => $deltaState]
    ]], JSON_UNESCAPED_UNICODE);
    exit;

  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
    exit;
  }

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}