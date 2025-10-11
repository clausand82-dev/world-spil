<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

function jout($ok, $payload){ echo json_encode($ok?['ok'=>true,'data'=>$payload]:['ok'=>false,'error'=>$payload], JSON_UNESCAPED_UNICODE); exit; }
function jerr(string $msg, int $http=400){ http_response_code($http); jout(false, ['message'=>$msg]); }

try {
  $pdo = db();
  $uid = $_SESSION['uid'] ?? null;
  $scope = strtolower((string)($_GET['scope'] ?? 'global'));
  $res   = trim((string)($_GET['res'] ?? ''));
  $own   = strtolower((string)($_GET['own'] ?? 'include')); // include|exclude|only
  $sort  = strtolower((string)($_GET['sort'] ?? 'price_asc'));
  $q     = trim((string)($_GET['q'] ?? ''));

  if ($scope === 'local') {
    // Generér fiktiv lokal liste
    $samples = [
      ['res.wood', 50, 2.2], ['res.stone', 40, 3.1], ['res.iron', 12, 6.0], ['res.water', 100, 1.0], ['res.food', 24, 4.2],
    ];
    $rows=[];
    $names=['Olav','Mia','Kira','Liam','Noah','Ida','Otto','Asta','Elin'];
    for ($i=0;$i<count($samples);$i++){
      [$rid,$amt,$price] = $samples[$i];
      $rows[]=[
        'id'=>"local:$i",'res_id'=>$rid,'amount'=>$amt,'price'=>$price,'created_at'=>date('Y-m-d H:i:s', time()-rand(60,3600)),
        'seller'=>['username'=>$names[array_rand($names)],'world_id'=>'Local','map_id'=>rand(1,9),'x'=>rand(1,100),'y'=>rand(1,100)],
      ];
    }
    jout(true, ['rows'=>$rows]);
  }

  // GLOBAL
  $conds = ["status='forsale'"];
  $args = [];
  if ($res !== '') { $conds[] = "res_id = ?"; $args[] = $res; }
  if ($own === 'only' && $uid) { $conds[] = "user_id = ?"; $args[] = $uid; }
  if ($own === 'exclude' && $uid) { $conds[] = "user_id <> ?"; $args[] = $uid; }
  // q kan matches på res_id (frontend kan matche navn via defs)
  if ($q !== '') { $conds[] = "res_id LIKE ?"; $args[] = "%$q%"; }

  $order = "price ASC";
  if ($sort === 'price_desc') $order = "price DESC";
  if ($sort === 'date_desc')  $order = "created_at DESC";
  if ($sort === 'date_asc')   $order = "created_at ASC";

  $where = $conds ? ("WHERE ".implode(" AND ", $conds)) : "";
  $sql = "SELECT m.id, m.user_id, m.res_id, m.amount, m.price, m.created_at
            FROM marketplace m
            $where
            ORDER BY $order
            LIMIT 200";
  $st = $pdo->prepare($sql); $st->execute($args);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  // join basic seller info
  if ($rows) {
    $userIds = array_values(array_unique(array_map(fn($r)=> (int)$r['user_id'], $rows)));
    if ($userIds) {
      $in = implode(',', array_fill(0, count($userIds), '?'));
      $su = $pdo->prepare("SELECT user_id, username, world_id, map_id, x_coord AS x, y_coord AS y FROM users WHERE user_id IN ($in)");
      $su->execute($userIds);
      $map=[]; foreach($su as $u){ $map[(int)$u['user_id']]=$u; }
      foreach ($rows as &$r) { $r['seller'] = $map[(int)$r['user_id']] ?? null; }
      unset($r);
    }
  }

  jout(true, ['rows'=>$rows]);

} catch (Throwable $e) {
  jerr($e->getMessage(), 500);
}