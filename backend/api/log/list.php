<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

/*
 * GET /api/log/list.php
 * Player: ser kun egne log-events.
 * Admin : kan filtrere på user_id, event_type, periode m.m.
 *
 * Query (alle valgfrie):
 *  - limit        (1..100, default 50)
 *  - offset       (>=0, default 0)
 *  - user_id      (kun admin; ellers ignoreres og sættes til session-bruger)
 *  - event_type   (fx BUILD_PURCHASE)
 *  - subject_type (fx building|addon|research)
 *  - subject_id   (fx bld.basecamp.l1)
 *  - date_from    (ISO UTC)
 *  - date_to      (ISO UTC)
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

  $pdo = db(); // fra alldata.php (PDO)

  // Rolleslag: brug session hvis sat; ellers prøv users.role.
  $role = (string)($_SESSION['role'] ?? '');
  if ($role !== 'admin' && $role !== 'player') {
    try {
      $st = $pdo->prepare('SELECT role FROM users WHERE id = ?');
      $st->execute([$uid]);
      $r = $st->fetch();
      if (!$r) {
        // fallback hvis din PK hedder userId
        $st = $pdo->prepare('SELECT role FROM users WHERE userId = ?');
        $st->execute([$uid]);
        $r = $st->fetch();
      }
      if ($r && !empty($r['role'])) $role = (string)$r['role'];
    } catch (Throwable $e) {
      // Hvis users-tabellen/kolonne heterogen, fail lukket (player)
      $role = 'player';
    }
  }
  if ($role !== 'admin') $role = 'player';

  // Params
  $limit       = max(1, min(100, (int)($_GET['limit']  ?? 50)));
  $offset      = max(0, (int)($_GET['offset'] ?? 0));
  $user_id     = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
  $event_type  = trim((string)($_GET['event_type']   ?? ''));
  $subject_type= trim((string)($_GET['subject_type'] ?? ''));
  $subject_id  = trim((string)($_GET['subject_id']   ?? ''));
  $date_from   = trim((string)($_GET['date_from']    ?? ''));
  $date_to     = trim((string)($_GET['date_to']      ?? ''));

  if ($role !== 'admin') {
    $user_id = $uid; // lås til mig selv
  }

  // WHERE
  $where = [];
  $args  = [];
  if ($user_id !== null && $user_id > 0) { $where[]='le.user_id=?';           $args[]=$user_id; }
  if ($event_type !== '')                { $where[]='le.event_type=?';        $args[]=$event_type; }
  if ($subject_type !== '')              { $where[]='le.subject_type=?';      $args[]=$subject_type; }
  if ($subject_id !== '')                { $where[]='le.subject_id=?';        $args[]=$subject_id; }
  if ($date_from !== '')                 { $where[]='le.created_at_utc>=?';   $args[]=$date_from; }
  if ($date_to !== '')                   { $where[]='le.created_at_utc<=?';   $args[]=$date_to; }

  $sql = 'SELECT
            le.id, le.user_id, le.created_at_utc, le.event_type,
            le.subject_type, le.subject_id, le.subject_name_cached,
            le.payload_json, le.costs_json,
            EXISTS(SELECT 1 FROM log_event_cost c WHERE c.log_id = le.id) AS has_cost_rows
          FROM log_event le';
  if ($where) $sql .= ' WHERE '.implode(' AND ', $where);
  // Overhenter én ekstra til has_more
  $sql .= ' ORDER BY le.created_at_utc DESC, le.id DESC
            LIMIT '.($limit+1).' OFFSET '.$offset;

  $st = $pdo->prepare($sql);
  $st->execute($args);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  $has_more = false;
  if (count($rows) > $limit) { $has_more = true; array_pop($rows); }

  $items = [];
  foreach ($rows as $r) {
    $items[] = [
      'id'             => (int)$r['id'],
      'user_id'        => (int)$r['user_id'],
      'created_at_utc' => (string)$r['created_at_utc'],
      'event_type'     => (string)$r['event_type'],
      'subject_type'   => (string)$r['subject_type'],
      'subject_id'     => (string)$r['subject_id'],
      'subject_name'   => (string)$r['subject_name_cached'],
      'payload'        => $r['payload_json'] ? json_decode($r['payload_json'], true) : null,
      'costs_json'     => $r['costs_json']   ? json_decode($r['costs_json'], true)   : [],
      'has_cost_rows'  => (bool)$r['has_cost_rows'],
    ];
  }

  respond([
    'ok'    => true,
    'items' => $items,
    'page'  => ['limit'=>$limit, 'offset'=>$offset, 'has_more'=>$has_more],
  ]);

} catch (Throwable $e) {
  // Returnér altid JSON ved fejl
  bad('server_error', $e->getMessage(), 500);
}
