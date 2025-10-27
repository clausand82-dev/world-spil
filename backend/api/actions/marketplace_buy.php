<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/yield.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/**
 * marketplace_buy.php
 *
 * Supports:
 *  - Global marketplace purchases (rows in DB table marketplace)
 *  - Local purchases (synthetic session-based local rows)
 *
 * Important: backend returns compact delta in data.delta.state (with inv / market keys).
 * We build the delta as associative arrays and then convert empty arrays to stdClass
 * so JSON encodes {} for empty buckets without mixing arrays/objects during construction.
 */

function convertEmptyArraysToObjects($v) {
  if (is_array($v)) {
    if (count($v) === 0) {
      return (object)[];
    }
    foreach ($v as $k => $sub) {
      $v[$k] = convertEmptyArraysToObjects($sub);
    }
    return $v;
  }
  return $v;
}

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $buyerId = $_SESSION['uid'] ?? null;
  if (!$buyerId) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Not logged in']], JSON_UNESCAPED_UNICODE);
    exit;
  }
  $buyerId = (int)$buyerId;

  // Read input
  $raw = file_get_contents('php://input') ?: '';
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = [];
  $getIn = function(string $key, $default = null) use ($body) {
    if (array_key_exists($key, $body)) return $body[$key];
    if (isset($_POST[$key])) return $_POST[$key];
    if (isset($_GET[$key]))  return $_GET[$key];
    return $default;
  };

  $idStr   = (string)($getIn('id', $getIn('listingId', '')) ?? '');
  $amount  = (float)($getIn('amount', 0) ?? 0);
  $scope   = strtolower((string)($getIn('scope', '') ?? ''));

  // Local vs global
  $isLocal = ($scope === 'local') || (str_starts_with($idStr, 'local:'));
  if ($isLocal) {
    // LOCAL purchase (session-based listings)
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $hourKey = date('YmdH');

    if (empty($_SESSION['market_local'][$hourKey]['rows']) || !is_array($_SESSION['market_local'][$hourKey]['rows'])) {
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Lokalt marked ikke initialiseret - opdater listen først']], JSON_UNESCAPED_UNICODE);
      exit;
    }

    $rows = &$_SESSION['market_local'][$hourKey]['rows'];
    $foundIndex = null;
    for ($i = 0; $i < count($rows); $i++) {
      if ((string)$rows[$i]['id'] === (string)$idStr) { $foundIndex = $i; break; }
    }
    if ($foundIndex === null) {
      http_response_code(404);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Listing ikke fundet i det lokale marked - opdater listen']], JSON_UNESCAPED_UNICODE);
      exit;
    }

    $listing = $rows[$foundIndex];
    $available = (float)($listing['amount'] ?? 0);
    if ($amount <= 0) {
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Ugyldigt antal'] ], JSON_UNESCAPED_UNICODE);
      exit;
    }
    if ($amount > $available) {
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Ikke nok på lager','available'=>$available,'requested'=>$amount] ], JSON_UNESCAPED_UNICODE);
      exit;
    }

    // determine price
    $pricePayload = $getIn('price', null);
    $usePrice = isset($listing['price']) ? (float)$listing['price'] : (is_numeric($pricePayload) ? (float)$pricePayload : 0.0);
    $resId = (string)($listing['res_id'] ?? $getIn('res_id', ''));
    $total = $usePrice * $amount;

    $pdo->beginTransaction();

    // require yield helpers
    if (!function_exists('load_all_defs') || !function_exists('yield__build_min_state') || !function_exists('yield__read_user_caps') || !function_exists('yield__compute_bucket_usage')) {
      $pdo->rollBack();
      http_response_code(500);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Missing required alldata/yield helpers']], JSON_UNESCAPED_UNICODE);
      exit;
    }

    $defs = load_all_defs();
    $defsRes = (array)($defs['res'] ?? []);
    $plainKey = preg_replace('/^res\./','', $resId);
    $resDef = $defsRes[$plainKey] ?? $defsRes[$resId] ?? ($defsRes["res.$plainKey"] ?? null);

    $unit = strtolower((string)($resDef['unit'] ?? $resDef['stats']['unit'] ?? ''));
    $isLiquid = ($unit === 'l');
    $unitSpace = 0.0;
    if (isset($resDef['unitSpace'])) $unitSpace = (float)$resDef['unitSpace'];
    elseif (isset($resDef['stats']['unitSpace'])) $unitSpace = (float)$resDef['stats']['unitSpace'];

    $needSpace = $amount * $unitSpace;
    $bucket = $isLiquid ? 'liquid' : 'solid';

    // Lock buyer inventory
    $pdo->prepare("SELECT res_id FROM inventory WHERE user_id = ? FOR UPDATE")->execute([$buyerId]);

    $state = yield__build_min_state($pdo, $buyerId);
    $caps  = yield__read_user_caps($pdo, $buyerId, $defs, $state);
    $usage = yield__compute_bucket_usage($pdo, $buyerId, $defs);

    if (!array_key_exists($bucket, $caps) || !array_key_exists($bucket, $usage)) {
      $pdo->rollBack();
      http_response_code(500);
      echo json_encode(['ok'=>false,'error'=>['message'=>'Storage capability not available (local)']], JSON_UNESCAPED_UNICODE);
      exit;
    }

    $freeSpace = max(0.0, (float)$caps[$bucket] - (float)$usage[$bucket]);
    if ($needSpace > $freeSpace + 1e-9) {
      $pdo->rollBack();
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>[
        'message'=>'Not enough storage space for this purchase',
        'details'=>['res_id'=>$resId,'amount'=>$amount,'need_space'=>$needSpace,'free_space'=>$freeSpace,'bucket'=>$bucket]
      ]], JSON_UNESCAPED_UNICODE);
      exit;
    }

    // Check and deduct buyer funds
    if ($total > 0) {
      $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' FOR UPDATE");
      $selMoney->execute([$buyerId]);
      $haveMoney = (float)($selMoney->fetchColumn() ?? 0.0);
      if ($haveMoney < $total) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>['message'=>'Insufficient funds','need'=>$total,'have'=>$haveMoney]], JSON_UNESCAPED_UNICODE);
        exit;
      }
      $updMoney = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = 'res.money'");
      $updMoney->execute([$total, $buyerId]);
      $newBuyerMoney = $haveMoney - $total;
    } else {
      $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' FOR UPDATE");
      $selMoney->execute([$buyerId]);
      $newBuyerMoney = (float)($selMoney->fetchColumn() ?? 0.0);
    }

    // Credit buyer resource — upsert
    $upd = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
    $upd->execute([$amount, $buyerId, $resId]);
    if ($upd->rowCount() === 0) {
      $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
      $ins->execute([$buyerId, $resId, $amount]);
    }

    $pdo->commit();

    // Read back amounts for delta
    $selNewRes = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ?");
    $selNewRes->execute([$buyerId, $resId]);
    $newBuyerAmount = (float)($selNewRes->fetchColumn() ?? 0.0);

    // Reduce session list
    $remaining = $available - $amount;
    if ($remaining > 0) {
      $rows[$foundIndex]['amount'] = $remaining;
    } else {
      array_splice($rows, $foundIndex, 1);
    }

    // Build delta: associative arrays only
    $plainKey = preg_replace('/^res\./', '', $resId);
    $deltaState = [
      'inv' => [
        'solid' => [],
        'liquid' => []
      ],
      'market' => [
        'offer' => [
          'id' => $idStr,
          'amount' => $remaining
        ]
      ]
    ];

    $deltaState['inv']['solid']['money'] = $newBuyerMoney;
    if ($bucket === 'liquid') {
      $deltaState['inv']['liquid'][$plainKey] = $newBuyerAmount;
    } else {
      $deltaState['inv']['solid'][$plainKey] = $newBuyerAmount;
    }

    // ensure empty arrays are encoded as {} in JSON (convert only empty arrays to objects)
    $deltaState = convertEmptyArraysToObjects($deltaState);

    echo json_encode(['ok'=>true,'data'=>[
      'scope'=>'local','id'=>$idStr,'bought'=>$amount,'paid'=>$total,'res_id'=>$resId,'remaining'=>$remaining,
      'delta' => ['state' => $deltaState]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // === GLOBAL purchase ===

  $id = (int)$idStr;
  if ($id <= 0 || $amount <= 0) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid input','debug'=>['id'=>$idStr,'amount'=>$amount]]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $pdo->beginTransaction();

  // Lock listing
  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]);
  $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) {
    $pdo->rollBack();
    http_response_code(404);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Listing not found']], JSON_UNESCAPED_UNICODE);
    exit;
  }
  if ((string)$m['status'] !== 'forsale') {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Not for sale']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $sellerId = (int)$m['user_id'];
  if ($sellerId === $buyerId) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Cannot buy own listing']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $resId = (string)$m['res_id'];
  $available = (float)$m['amount'];
  if ($amount > $available) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Amount exceeds available','available'=>$available]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $price = (float)$m['price'];
  $total = $price * $amount;

  // capacity check
  if (!function_exists('load_all_defs') || !function_exists('yield__build_min_state') || !function_exists('yield__read_user_caps') || !function_exists('yield__compute_bucket_usage')) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Missing required alldata/yield helpers']], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $defs = load_all_defs();
  $defsRes = (array)($defs['res'] ?? []);
  $plainKey = preg_replace('/^res\./','', $resId);
  $resDef = $defsRes[$plainKey] ?? $defsRes[$resId] ?? ($defsRes["res.$plainKey"] ?? null);

  $unit = strtolower((string)($resDef['unit'] ?? $resDef['stats']['unit'] ?? ''));
  $isLiquid = ($unit === 'l');
  $unitSpace = 0.0;
  if (isset($resDef['unitSpace'])) $unitSpace = (float)$resDef['unitSpace'];
  elseif (isset($resDef['stats']['unitSpace'])) $unitSpace = (float)$resDef['stats']['unitSpace'];

  $needSpace = $amount * $unitSpace;
  $bucket = $isLiquid ? 'liquid' : 'solid';

  $pdo->prepare("SELECT res_id FROM inventory WHERE user_id = ? FOR UPDATE")->execute([$buyerId]);

  $state = yield__build_min_state($pdo, $buyerId);
  $caps  = yield__read_user_caps($pdo, $buyerId, $defs, $state);
  $usage = yield__compute_bucket_usage($pdo, $buyerId, $defs);

  if (!array_key_exists($bucket, $caps) || !array_key_exists($bucket, $usage)) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>[
      'message'=>'Storage capability not available',
      'debug'=>['caps'=>$caps, 'usage'=>$usage, 'bucket'=>$bucket]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $freeSpace = max(0.0, (float)$caps[$bucket] - (float)$usage[$bucket]);
  if ($needSpace > $freeSpace + 1e-9) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>[
      'message'=>'Not enough storage space for this purchase',
      'details'=>[
        'res_id'=>$resId,
        'amount'=>$amount,
        'unit_space'=>$unitSpace,
        'need_space'=>$needSpace,
        'free_space'=>$freeSpace,
        'cap_total'=>$caps[$bucket],
        'used_space'=>$usage[$bucket],
        'bucket'=>$bucket
      ]
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // buyer money
  $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' FOR UPDATE");
  $selMoney->execute([$buyerId]);
  $haveMoney = (float)($selMoney->fetchColumn() ?? 0.0);
  if ($haveMoney < $total) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Insufficient funds','need'=>$total,'have'=>$haveMoney]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $updMoney = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = 'res.money'");
  $updMoney->execute([$total, $buyerId]);

  $insSellerMoney = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, 'res.money', ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insSellerMoney->execute([$sellerId, $total]);

  // credit buyer resource
  $insBuyerRes = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insBuyerRes->execute([$buyerId, $resId, $amount]);

  // read new amounts for delta
  $selNewRes = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ?");
  $selNewRes->execute([$buyerId, $resId]);
  $newBuyerAmount = (float)($selNewRes->fetchColumn() ?? 0.0);

  $selNewMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money'");
  $selNewMoney->execute([$buyerId]);
  $newBuyerMoney = (float)($selNewMoney->fetchColumn() ?? 0.0);

  // finalize listing
  $left = $available - $amount;
  if ($left > 0) {
    $pdo->prepare("UPDATE marketplace SET amount = ? WHERE id = ?")->execute([$left, $id]);
  } else {
    $pdo->prepare("UPDATE marketplace SET amount = 0, status='sold', sold_at=NOW() WHERE id = ?")->execute([$id]);
  }

  $pdo->commit();

  // Build delta with associative arrays
  $plainKey = preg_replace('/^res\./', '', $resId);
  $deltaState = [
    'inv' => [
      'solid' => [],
      'liquid' => []
    ],
    'market' => [
      'offer' => [
        'id' => $id,
        'amount' => $left
      ]
    ]
  ];

  $deltaState['inv']['solid']['money'] = $newBuyerMoney;
  if ($bucket === 'liquid') {
    $deltaState['inv']['liquid'][$plainKey] = $newBuyerAmount;
  } else {
    $deltaState['inv']['solid'][$plainKey] = $newBuyerAmount;
  }

  // convert empty arrays -> objects for JSON only
  $deltaState = convertEmptyArraysToObjects($deltaState);

  echo json_encode(['ok'=>true,'data'=>[
    'scope'      => 'global',
    'id'         => $id,
    'bought'     => $amount,
    'left'       => $left,
    'paid'       => $total,
    'res_id'     => $resId,
    'bucket'     => $bucket,
    'unit_space' => $unitSpace,
    'delta'      => ['state' => $deltaState]
  ]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>[
    'message'=>$e->getMessage(),
    'file'=>$e->getFile(),
    'line'=>$e->getLine()
  ]], JSON_UNESCAPED_UNICODE);
  exit;
}