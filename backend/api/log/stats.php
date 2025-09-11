<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

/*
 * GET /api/log/stats.php
 * Aggregeret forbrug for en ressource fra log_event_cost.
 *
 * Query:
 *  - res_id     (påkrævet, fx res.wood)
 *  - group_by   (day|week|month|total; default month)
 *  - date_from  (valgfri, ISO UTC)
 *  - date_to    (valgfri, ISO UTC)
 *  - event_type (valgfri; fx BUILD_PURCHASE)
 *  - user_id    (kun admin; ellers ignoreres og sættes til session-bruger)
 */

define('WS_RUN_MODE', 'lib');
require_once __DIR__ . '/../alldata.php';

function respond(array $payload, int $http=200): never {
  http_response_code($http);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}
function bad(string $code, string $msg, int $http=400): never {
  respond(['ok'=>false,'error_code'=>$code,'message'=>$msg], $http);
}

try {
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) bad('unauthorized', 'Log ind først.', 401);
  $uid = (int)$uid;

  $pdo = db();

  // Rolleslag: som i list.php (tolerant for id/userId)
  $role = (string)($_SESSION['role'] ?? '');
  if ($role !== 'admin' && $role !== 'player') {
    try {
      $st = $pdo->prepare('SELECT role FROM users WHERE id = ?');
      $st->execute([$uid]);
      $r = $st->fetch();
      if (!$r) {
        $st = $pdo->prepare('SELECT role FROM users WHERE userId = ?');
        $st->execute([$uid]);
        $r = $st->fetch();
      }
      if ($r && !empty($r['role'])) $role = (string)$r['role'];
    } catch (Throwable $e) {
      $role = 'player';
    }
  }
  if ($role !== 'admin') $role = 'player';

  // Params
  $res_id    = trim((string)($_GET['res_id'] ?? ''));
  $group_by  = strtolower(trim((string)($_GET['group_by'] ?? 'month')));
  $date_from = trim((string)($_GET['date_from'] ?? ''));
  $date_to   = trim((string)($_GET['date_to']   ?? ''));
  $event_type= trim((string)($_GET['event_type'] ?? ''));
  $user_id   = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;

  if ($res_id === '') bad('bad_request', 'res_id er påkrævet.');

  if ($role !== 'admin') {
    $user_id = $uid; // lås til mig selv
  }

  $valid_groups = ['day','week','month','total'];
  if (!in_array($group_by, $valid_groups, true)) $group_by = 'month';

  // WHERE
  $where = ['c.res_id = ?'];
  $args  = [$res_id];
  if ($user_id !== null && $user_id > 0) { $where[]='le.user_id=?';        $args[]=$user_id; }
  if ($event_type !== '')                { $where[]='le.event_type=?';     $args[]=$event_type; }
  if ($date_from !== '')                 { $where[]='le.created_at_utc>=?';$args[]=$date_from; }
  if ($date_to !== '')                   { $where[]='le.created_at_utc<=?';$args[]=$date_to; }

  // Grouping
  $select_period = ''; $group_sql=''; $order_by='';
  switch ($group_by) {
    case 'day':
      $select_period = "DATE(le.created_at_utc) AS period_key, DATE_FORMAT(le.created_at_utc,'%Y-%m-%d') AS period_lbl";
      $group_sql     = "GROUP BY DATE(le.created_at_utc)";
      $order_by      = "ORDER BY DATE(le.created_at_utc)";
      break;
    case 'week':
      // ISO-uge: YYYY-Www
      $select_period = "DATE_FORMAT(le.created_at_utc,'%x-W%v') AS period_key, DATE_FORMAT(le.created_at_utc,'%x-W%v') AS period_lbl";
      $group_sql     = "GROUP BY DATE_FORMAT(le.created_at_utc,'%x-%v')";
      $order_by      = "ORDER BY MIN(le.created_at_utc)";
      break;
    case 'month':
      $select_period = "DATE_FORMAT(le.created_at_utc,'%Y-%m') AS period_key, DATE_FORMAT(le.created_at_utc,'%Y-%m') AS period_lbl";
      $group_sql     = "GROUP BY DATE_FORMAT(le.created_at_utc,'%Y-%m')";
      $order_by      = "ORDER BY DATE_FORMAT(le.created_at_utc,'%Y-%m')";
      break;
    case 'total':
    default:
      $select_period = "'total' AS period_key, 'total' AS period_lbl";
      $group_sql     = "";
      $order_by      = "";
      break;
  }

  $sql = "
    SELECT
      $select_period,
      SUM(c.amount_final) AS amount_final,
      SUM(c.amount_base)  AS amount_base
    FROM log_event_cost c
    JOIN log_event le ON le.id = c.log_id
    WHERE ".implode(' AND ', $where)."
    $group_sql
    $order_by
  ";

  $st = $pdo->prepare($sql);
  $st->execute($args);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  $buckets = [];
  $tot_final = 0.0; $tot_base = 0.0;
  foreach ($rows as $r) {
    $af = (float)($r['amount_final'] ?? 0);
    $ab = (float)($r['amount_base']  ?? 0);
    $buckets[] = [
      'period'       => (string)($r['period_lbl'] ?? 'total'),
      'amount_final' => $af,
      'amount_base'  => $ab,
    ];
    $tot_final += $af; $tot_base += $ab;
  }

  respond([
    'ok' => true,
    'meta' => [
      'res_id'     => $res_id,
      'group_by'   => $group_by,
      'date_from'  => $date_from ?: null,
      'date_to'    => $date_to   ?: null,
      'user_scope' => ($role==='admin' ? ($user_id ? "user:$user_id" : 'all') : 'me'),
    ],
    'buckets' => $buckets,
    'totals'  => [ 'amount_final'=>$tot_final, 'amount_base'=>$tot_base ],
  ]);

} catch (Throwable $e) {
  bad('server_error', $e->getMessage(), 500);
}
