<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $uid   = isset($_SESSION['uid']) ? $_SESSION['uid'] : null;
  $scope = strtolower((string)($_GET['scope'] ?? 'global'));
  $res   = trim((string)($_GET['res'] ?? ''));
  $own   = strtolower((string)($_GET['own'] ?? 'include')); // include|exclude|only
  $sort  = strtolower((string)($_GET['sort'] ?? 'price_asc'));
  $q     = trim((string)($_GET['q'] ?? ''));

  if ($scope === 'local') {
    // --- NYT: deterministic "random" per time-slot + session-baseret mængde (hourly reset) ---
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $hourKey = date('YmdH'); // ændr til date('YmdHi') for per-minute reset osv.
    if (!isset($_SESSION['market_local']) || !is_array($_SESSION['market_local'])) $_SESSION['market_local'] = [];

    // base samples (kan udvides)
    // Måske nogle resource ikke skal være tilgængelige før et vist stage
    $baseSamples = array(
      array('res.wood', 50, 12.2),
      array('res.stone', 40, 13.1),
      array('res.ironbar', 4, 16.0),
      array('res.water', 100, 11.0),
      array('res.food', 24, 14.2),
      array('res.hide', 30, 15.5),
      array('res.wool', 50, 17.5),
      array('res.bronzebar', 4, 17.5),
      array('res.stonebrick', 50, 17.5),
      array('res.basictools', 10, 17.5),
      array('res.bread', 10, 17.5),
    );

    // deterministic seed så samme time giver samme liste
    $seed = crc32($hourKey . (isset($_SESSION['uid']) ? $_SESSION['uid'] : 'guest'));
    mt_srand((int)$seed);

    // hvis vi ikke har en state for denne time, opret den
    if (empty($_SESSION['market_local'][$hourKey])) {
      $rows = [];
      $names = array('Olav','Mia','Kira','Liam','Noah','Ida','Otto','Asta','Elin','Sven','Nora','Morten');

      // lav en small variation i priser baseret på time (fx svingning)
      $hour = (int)date('G');
      $priceFactor = 1 + sin($hour / 24 * 2 * M_PI) * 0.12; // +-12% dags-svingning

      // vælg et subset og generer rækker
      $sampleCount = min(10, count($baseSamples));
      $keys = range(0, count($baseSamples)-1);
      shuffle($keys); // shuffle er seedet af mt_srand
      for ($i = 0; $i < $sampleCount; $i++) {
        $k = $keys[$i];
        list($rid, $amt, $price) = $baseSamples[$k];

        // lille tilfældig variation per time
        $varAmt = max(1, (int)round($amt * (0.75 + mt_rand(0,50)/100))); // 75%-125%
        $varPrice = round($price * $priceFactor * (0.92 + mt_rand(0,16)/100), 2); // +-8%

        $sellerName = $names[array_rand($names)];
        $rows[] = array(
          'id' => "local:$i",
          'res_id' => $rid,
          'amount' => $varAmt,
          'initial_amount' => $varAmt,
          'price' => $varPrice,
          'created_at' => date('Y-m-d H:i:s', strtotime("-" . mt_rand(60,3600) . " seconds")),
          'seller' => array(
            'username' => $sellerName,
            'world_id' => 'Local',
            'map_id' => mt_rand(1,9),
            'x' => mt_rand(1,100),
            'y' => mt_rand(1,100),
          ),
        );
      }

      // gem initial state i session så køb kan reducere mængde
      $_SESSION['market_local'][$hourKey] = [
        'rows' => $rows,
        'created_at' => time(),
      ];
    }

    // returner rækkerne fra session (reduceret hvis køb er foretaget)
    $rows = $_SESSION['market_local'][$hourKey]['rows'];
    echo json_encode(['ok' => true, 'data' => ['rows' => $rows]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // GLOBAL
  $conds = array("`status`='forsale'");
  $args = array();
  if ($res !== '') { $conds[] = "`res_id` = ?"; $args[] = $res; }
  if ($own === 'only' && $uid) { $conds[] = "`user_id` = ?"; $args[] = $uid; }
  if ($own === 'exclude' && $uid) { $conds[] = "`user_id` <> ?"; $args[] = $uid; }
  if ($q !== '') { $conds[] = "`res_id` LIKE ?"; $args[] = "%$q%"; }

  $order = "`price` ASC";
  if ($sort === 'price_desc') $order = "`price` DESC";
  if ($sort === 'date_desc')  $order = "`created_at` DESC";
  if ($sort === 'date_asc')   $order = "`created_at` ASC";

  $where = $conds ? ("WHERE " . implode(" AND ", $conds)) : "";
  $sql = "SELECT `id`, `user_id`, `res_id`, `amount`, `price`, `created_at` FROM `marketplace` $where ORDER BY $order LIMIT 200";

  $st = $pdo->prepare($sql);
  $ok = $st->execute($args);
  if (!$ok) {
    $info = $st->errorInfo();
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => ['message' => 'Query failed','info' => $info]], JSON_UNESCAPED_UNICODE);
    exit;
  }
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);
  if (!$rows) $rows = array();

  // Attach seller info if users table exists
  $meta = null;
  $stt = $pdo->prepare("SHOW TABLES LIKE 'users'");
  $stt->execute();
  $usersExist = (bool)$stt->fetchColumn();
  if (!empty($rows) && $usersExist) {
    $userIds = array();
    foreach ($rows as $r) $userIds[] = (int)$r['user_id'];
    $userIds = array_values(array_unique($userIds));
    if (!empty($userIds)) {
      $placeholders = implode(',', array_fill(0, count($userIds), '?'));
      try {
        $su = $pdo->prepare("SELECT `user_id`, `username`, `world_id`, `map_id`, `x_coord` AS `x`, `y_coord` AS `y` FROM `users` WHERE `user_id` IN ($placeholders)");
        $su->execute($userIds);
        $map = array();
        foreach ($su->fetchAll(PDO::FETCH_ASSOC) as $u) $map[(int)$u['user_id']] = $u;
        for ($i=0;$i<count($rows);$i++) {
          $uidk = (int)$rows[$i]['user_id'];
          $rows[$i]['seller'] = isset($map[$uidk]) ? $map[$uidk] : null;
        }
      } catch (Throwable $e) {
        // fallback minimal
        try {
          $su = $pdo->prepare("SELECT `user_id`, `username` FROM `users` WHERE `user_id` IN ($placeholders)");
          $su->execute($userIds);
          $map = array();
          foreach ($su->fetchAll(PDO::FETCH_ASSOC) as $u) $map[(int)$u['user_id']] = $u;
          for ($i=0;$i<count($rows);$i++) {
            $uidk = (int)$rows[$i]['user_id'];
            $rows[$i]['seller'] = isset($map[$uidk]) ? $map[$uidk] : null;
          }
          $meta = ['join_fallback' => 'minimal_user_select_used'];
        } catch (Throwable $e2) {
          for ($i=0;$i<count($rows);$i++) $rows[$i]['seller'] = null;
          $meta = ['join_error' => $e->getMessage(), 'fallback_error' => $e2->getMessage()];
        }
      }
    }
  }

  echo json_encode(['ok' => true, 'data' => ['rows' => $rows, 'meta' => $meta]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => ['message' => $e->getMessage(), 'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}