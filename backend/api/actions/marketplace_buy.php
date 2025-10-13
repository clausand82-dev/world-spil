<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/yield.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/**
 * marketplace_buy.php
 *
 * Handles BOTH:
 * - Global marketplace purchases (rows in DB table marketplace)
 * - Local marketplace purchases (synthetic rows with id like 'local:0' that do NOT exist in DB)
 *
 * For local purchases:
 * - We accept body.id like 'local:idx' + body.res_id (e.g. 'res.wood') + body.price + body.amount
 * - We do NOT read/modify marketplace table
 * - We ONLY: check storage capacity, check buyer funds, deduct money, and credit resource to buyer's inventory
 *
 * For global purchases:
 * - We keep existing behavior: lock listing row, check funds, transfer money to seller, credit buyer, update/sell listing
 */

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

  // Read input from JSON body or fallback to POST/GET
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
  $scope   = strtolower((string)($getIn('scope', '') ?? '')); // optional hint from client

  // Detect local vs global listing
  $isLocal = ($scope === 'local') || (str_starts_with($idStr, 'local:'));
  if ($isLocal) {
    // Lokal køb: læs listing fra session (skal være initialiseret af marketplace_list.php)
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $hourKey = date('YmdH'); // samme key som marketplace_list.php bruger

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

    // bestem pris (foretræk listing.price, ellers payload)
    $pricePayload = $getIn('price', null);
    $usePrice = isset($listing['price']) ? (float)$listing['price'] : (is_numeric($pricePayload) ? (float)$pricePayload : 0.0);
    $resId = (string)($listing['res_id'] ?? $getIn('res_id', ''));
    $total = $usePrice * $amount;

    // Begin DB-transaction for penge + inventory-opdatering (kapacitetscheck osv.)
    $pdo->beginTransaction();

    // capacity check helpers must eksistere
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

    // Lock buyer inventory rows to stabilize snapshot and prevent race
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

    // Check and deduct buyer funds if total > 0
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
    }

    // Credit buyer resource — upsert
    $upd = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
    $upd->execute([$amount, $buyerId, $resId]);
    if ($upd->rowCount() === 0) {
      $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
      $ins->execute([$buyerId, $resId, $amount]);
    }

    $pdo->commit();

    // Reducer mængden i session-listen EFTER succesfuld commit
    $remaining = $available - $amount;
    if ($remaining > 0) {
      $rows[$foundIndex]['amount'] = $remaining;
    } else {
      array_splice($rows, $foundIndex, 1);
    }

    echo json_encode(['ok'=>true,'data'=>[
      'scope'=>'local','id'=>$idStr,'bought'=>$amount,'paid'=>$total,'res_id'=>$resId,'remaining'=>$remaining
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // === GLOBAL marketplace purchase (existing behavior) ===

  // Validate input for global: numeric id and amount
  $id = (int)$idStr;
  if ($id <= 0 || $amount <= 0) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid input','debug'=>['id'=>$idStr,'amount'=>$amount]]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $pdo->beginTransaction();

  // 1) Lock listing row
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

  // 2) Storage capacity check BEFORE charging money
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

  // Determine unitSpace and bucket
  $unit = strtolower((string)($resDef['unit'] ?? $resDef['stats']['unit'] ?? ''));
  $isLiquid = ($unit === 'l');
  $unitSpace = 0.0;
  if (isset($resDef['unitSpace'])) $unitSpace = (float)$resDef['unitSpace'];
  elseif (isset($resDef['stats']['unitSpace'])) $unitSpace = (float)$resDef['stats']['unitSpace'];

  $needSpace = $amount * $unitSpace;
  $bucket = $isLiquid ? 'liquid' : 'solid';

  // Lock buyer inventory rows to stabilize snapshot and prevent race
  $pdo->prepare("SELECT res_id FROM inventory WHERE user_id = ? FOR UPDATE")->execute([$buyerId]);

  $state = yield__build_min_state($pdo, $buyerId);
  $caps  = yield__read_user_caps($pdo, $buyerId, $defs, $state);   // ['solid'=>..., 'liquid'=>...]
  $usage = yield__compute_bucket_usage($pdo, $buyerId, $defs);     // ['solid'=>..., 'liquid'=>...]

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

  // 3) Check and deduct buyer funds
  // Lock/peek buyer money row
  $selMoney = $pdo->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = 'res.money' FOR UPDATE");
  $selMoney->execute([$buyerId]);
  $haveMoney = (float)($selMoney->fetchColumn() ?? 0.0);
  if ($haveMoney < $total) {
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>['message'=>'Insufficient funds','need'=>$total,'have'=>$haveMoney]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Deduct buyer money (UPDATE is safe after row lock)
  $updMoney = $pdo->prepare("UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND res_id = 'res.money'");
  $updMoney->execute([$total, $buyerId]);

  // Credit seller money (upsert)
  $insSellerMoney = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, 'res.money', ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insSellerMoney->execute([$sellerId, $total]);

  // 4) Credit buyer resource — upsert
  $insBuyerRes = $pdo->prepare("
    INSERT INTO inventory (user_id, res_id, amount)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
  ");
  $insBuyerRes->execute([$buyerId, $resId, $amount]);

  // 5) Reduce listing amount / finalize
  $left = $available - $amount;
  if ($left > 0) {
    $pdo->prepare("UPDATE marketplace SET amount = ? WHERE id = ?")->execute([$left, $id]);
  } else {
    $pdo->prepare("UPDATE marketplace SET amount = 0, status='sold', sold_at=NOW() WHERE id = ?")->execute([$id]);
  }

  $pdo->commit();
  echo json_encode(['ok'=>true,'data'=>[
    'scope'      => 'global',
    'id'         => $id,
    'bought'     => $amount,
    'left'       => $left,
    'paid'       => $total,
    'res_id'     => $resId,
    'bucket'     => $bucket,
    'unit_space' => $unitSpace
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