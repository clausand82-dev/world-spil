<?php
declare(strict_types=1);

/**
 * GET /api/log/stats.php
 *
 * Samler statistik for en bruger over et tidsinterval (UTC).
 * - Bygcounts og tider fra build_jobs (scope: bld/add/rsd)
 * - Yield summer per ressource fra user_event_log.payload_json (event_type='yield_paid')
 * - Forbrugte ressourcer fra resource_locks (consumed_at)
 * - Tidsserier (pr. dag) for builds og yield
 *
 * Query:
 *  - date_from  (valgfri, ISO 'YYYY-MM-DD HH:MM:SS' i UTC; default: nu - 30 dage)
 *  - date_to    (valgfri, ISO UTC; default: nu)
 *  - user_id    (kun admin; ellers ignoreres og låses til session-bruger)
 *  - top_n      (valgfri, default 10) for "top"-lister
 *
 * Output: { ok:true, meta:{...}, totals:{...}, yields:{...}, consumed:{...}, net:{...}, series:{...} }
 */

header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

define('WS_RUN_MODE', 'lib');
require_once __DIR__ . '/../alldata.php';

function respond(array $payload, int $http=200): never {
  http_response_code($http);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}
function bad(string $code, string $msg, int $http=400): never {
  respond(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], $http);
}
function to_utc_or_null(?string $s): ?string {
  $s = trim((string)($s ?? ''));
  if ($s === '') return null;
  // Forventes allerede at være UTC "YYYY-MM-DD HH:MM:SS"
  // Simpel validering:
  if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $s)) return null;
  return $s;
}

try {
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) bad('unauthorized', 'Log ind først.', 401);
  $uid = (int)$uid;

  $pdo = db();

  // Rolleslag (admin/player) – robust mod users-tabellens navngivning
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
  $date_from = to_utc_or_null($_GET['date_from'] ?? null);
  $date_to   = to_utc_or_null($_GET['date_to']   ?? null);
  $top_n     = (int)($_GET['top_n'] ?? 10);
  $top_n     = max(1, min(100, $top_n));
  $req_user  = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;

  if (!$date_to)   $date_to   = gmdate('Y-m-d H:i:s'); // nu i UTC
  if (!$date_from) {
    // default: sidste 30 dage
    $date_from = gmdate('Y-m-d H:i:s', time() - 30*24*3600);
  }

  $target_uid = $uid;
  if ($role === 'admin' && $req_user) $target_uid = $req_user;

  // tolerante state-lister
  $completedStates = ['done','produced','completed','complete','finished','built'];
  $canceledStates  = ['canceled','cancelled'];

  // -------------------------------------------------------
  // Build-aggregater pr scope
  // -------------------------------------------------------
  $sqlBuildAgg = "
    SELECT
      SUBSTRING_INDEX(bld_id, '.', 1) AS scope,
      SUM(CASE WHEN LOWER(state) IN ('done','produced','completed','complete','finished','built') THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN LOWER(state) IN ('canceled','cancelled') THEN 1 ELSE 0 END) AS canceled_count,
      SUM(CASE WHEN LOWER(state) IN ('done','produced','completed','complete','finished','built')
               THEN GREATEST(0, TIMESTAMPDIFF(SECOND, start_utc, COALESCE(end_utc, updated_at_utc))) ELSE 0 END) AS time_spent_completed_s,
      SUM(CASE WHEN LOWER(state) IN ('canceled','cancelled')
               THEN GREATEST(0, TIMESTAMPDIFF(SECOND, start_utc, COALESCE(end_utc, updated_at_utc))) ELSE 0 END) AS time_spent_canceled_s
    FROM build_jobs
    WHERE user_id = :uid
      AND COALESCE(end_utc, updated_at_utc, start_utc) BETWEEN :from AND :to
    GROUP BY scope
  ";
  $st = $pdo->prepare($sqlBuildAgg);
  $st->execute([':uid'=>$target_uid, ':from'=>$date_from, ':to'=>$date_to]);
  $buildAgg = $st->fetchAll(PDO::FETCH_ASSOC);

  $totals = [
    'builds_completed' => 0,
    'builds_canceled'  => 0,
    'by_scope' => [
      'bld' => ['completed'=>0,'canceled'=>0,'time_spent_completed_s'=>0,'time_spent_canceled_s'=>0],
      'add' => ['completed'=>0,'canceled'=>0,'time_spent_completed_s'=>0,'time_spent_canceled_s'=>0],
      'rsd' => ['completed'=>0,'canceled'=>0,'time_spent_completed_s'=>0,'time_spent_canceled_s'=>0],
    ],
  ];
  foreach ($buildAgg as $row) {
    $scope = (string)$row['scope'];
    $comp  = (int)$row['completed_count'];
    $canc  = (int)$row['canceled_count'];
    $tcomp = (int)$row['time_spent_completed_s'];
    $tcanc = (int)$row['time_spent_canceled_s'];

    $totals['builds_completed'] += $comp;
    $totals['builds_canceled']  += $canc;

    if (!isset($totals['by_scope'][$scope])) {
      $totals['by_scope'][$scope] = ['completed'=>0,'canceled'=>0,'time_spent_completed_s'=>0,'time_spent_canceled_s'=>0];
    }
    $totals['by_scope'][$scope]['completed'] += $comp;
    $totals['by_scope'][$scope]['canceled']  += $canc;
    $totals['by_scope'][$scope]['time_spent_completed_s'] += $tcomp;
    $totals['by_scope'][$scope]['time_spent_canceled_s']  += $tcanc;
  }

  // Aliaser for bekvemmelighed
  $totals['buildings_completed'] = $totals['by_scope']['bld']['completed'] ?? 0;
  $totals['addons_completed']    = $totals['by_scope']['add']['completed'] ?? 0;
  $totals['research_completed']  = $totals['by_scope']['rsd']['completed'] ?? 0;

  $totals['time_spent_seconds'] = [
    'building' => $totals['by_scope']['bld']['time_spent_completed_s'] ?? 0,
    'addons'   => $totals['by_scope']['add']['time_spent_completed_s'] ?? 0,
    'research' => $totals['by_scope']['rsd']['time_spent_completed_s'] ?? 0,
    'total'    => ($totals['by_scope']['bld']['time_spent_completed_s'] ?? 0)
                + ($totals['by_scope']['add']['time_spent_completed_s'] ?? 0)
                + ($totals['by_scope']['rsd']['time_spent_completed_s'] ?? 0),
  ];

  // -------------------------------------------------------
  // Resource consumption (used) fra resource_locks
  // NB: consumed_at antages at være server-local; vi konverterer til UTC for sammenligning.
  // -------------------------------------------------------
  $sqlConsumed = "
    SELECT
      rl.res_id,
      ROUND(SUM(rl.amount), 6) AS total_amount
    FROM resource_locks rl
    WHERE rl.user_id = :uid
      AND rl.consumed_at IS NOT NULL
      AND CONVERT_TZ(rl.consumed_at, 'SYSTEM', '+00:00') BETWEEN :from AND :to
    GROUP BY rl.res_id
  ";
  $st = $pdo->prepare($sqlConsumed);
  $st->execute([':uid'=>$target_uid, ':from'=>$date_from, ':to'=>$date_to]);
  $consumedRows = $st->fetchAll(PDO::FETCH_ASSOC);
  $consumedByRes = [];
  foreach ($consumedRows as $r) {
    $rid = (string)$r['res_id'];
    $amt = (float)$r['total_amount'];
    $consumedByRes[$rid] = ($consumedByRes[$rid] ?? 0.0) + $amt;
  }

  // -------------------------------------------------------
  // Yield events fra user_event_log (payload_json er en array af {res_id, amount})
  // Konverter event_time til UTC i SELECT til tidsserie.
  // -------------------------------------------------------
  $sqlYields = "
    SELECT
      CONVERT_TZ(uel.event_time, 'SYSTEM', '+00:00') AS event_time_utc,
      uel.payload_json
    FROM user_event_log uel
    WHERE uel.user_id = :uid
      AND uel.event_type = 'yield_paid'
      AND CONVERT_TZ(uel.event_time, 'SYSTEM', '+00:00') BETWEEN :from AND :to
    ORDER BY uel.event_time ASC
  ";
  $st = $pdo->prepare($sqlYields);
  $st->execute([':uid'=>$target_uid, ':from'=>$date_from, ':to'=>$date_to]);

  $yieldByRes = [];
  $yieldSeriesByDay = []; // date => total yield amount (sum af alle res)
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $payload = [];
    if (!empty($row['payload_json'])) {
      $payload = json_decode((string)$row['payload_json'], true);
      if (!is_array($payload)) $payload = [];
    }
    $day = substr((string)$row['event_time_utc'], 0, 10); // 'YYYY-MM-DD'
    $sumThisEvent = 0.0;
    foreach ($payload as $ln) {
      $rid = (string)($ln['res_id'] ?? '');
      $amt = (float)($ln['amount'] ?? 0);
      if ($rid === '' || $amt == 0.0) continue;
      $yieldByRes[$rid] = ($yieldByRes[$rid] ?? 0.0) + $amt;
      $sumThisEvent += $amt;
    }
    $yieldSeriesByDay[$day] = ($yieldSeriesByDay[$day] ?? 0.0) + $sumThisEvent;
  }

  // -------------------------------------------------------
  // Build tidsserie pr dag (completed/canceled)
  // -------------------------------------------------------
  $sqlBuildSeries = "
    SELECT
      DATE_FORMAT(COALESCE(end_utc, updated_at_utc, start_utc), '%Y-%m-%d') AS ymd,
      SUM(CASE WHEN LOWER(state) IN ('done','produced','completed','complete','finished','built') THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN LOWER(state) IN ('canceled','cancelled') THEN 1 ELSE 0 END) AS canceled
    FROM build_jobs
    WHERE user_id = :uid
      AND COALESCE(end_utc, updated_at_utc, start_utc) BETWEEN :from AND :to
    GROUP BY ymd
    ORDER BY ymd ASC
  ";
  $st = $pdo->prepare($sqlBuildSeries);
  $st->execute([':uid'=>$target_uid, ':from'=>$date_from, ':to'=>$date_to]);
  $buildSeries = $st->fetchAll(PDO::FETCH_ASSOC);

  // -------------------------------------------------------
  // Saml output
  // -------------------------------------------------------
  // Sortér yield/consumed og beregn net
  $yieldList = [];
  foreach ($yieldByRes as $rid => $amt) $yieldList[] = ['res_id'=>$rid, 'amount'=>$amt];
  usort($yieldList, fn($a,$b)=> $b['amount']<=>$a['amount']);

  $consumedList = [];
  foreach ($consumedByRes as $rid => $amt) $consumedList[] = ['res_id'=>$rid, 'amount'=>$amt];
  usort($consumedList, fn($a,$b)=> $b['amount']<=>$a['amount']);

  $netByRes = [];
  $allRes = array_unique(array_merge(array_keys($yieldByRes), array_keys($consumedByRes)));
  foreach ($allRes as $rid) {
    $netByRes[] = [
      'res_id' => $rid,
      'yielded' => (float)($yieldByRes[$rid] ?? 0.0),
      'consumed' => (float)($consumedByRes[$rid] ?? 0.0),
      'net' => (float)($yieldByRes[$rid] ?? 0.0) - (float)($consumedByRes[$rid] ?? 0.0),
    ];
  }
  usort($netByRes, fn($a,$b)=> $b['net']<=>$a['net']);

  // tidsserier konverteret til arrays
  $yieldSeries = [];
  foreach ($yieldSeriesByDay as $day => $amt) $yieldSeries[] = ['date'=>$day, 'total_yield'=>$amt];
  usort($yieldSeries, fn($a,$b)=> strcmp($a['date'],$b['date']));

  // top N
  $yieldTop = array_slice($yieldList, 0, $top_n);
  $consumedTop = array_slice($consumedList, 0, $top_n);
  $netTop = array_slice($netByRes, 0, $top_n);

  respond([
    'ok' => true,
    'meta' => [
      'user_id'   => $target_uid,
      'date_from' => $date_from,
      'date_to'   => $date_to,
      'tz'        => 'UTC',
      'notes'     => 'resource_locks.user timestamps antages lokale; CONVERT_TZ bruges til UTC i query. Sørg for at MySQL timezone tables er indlæst for præcis konvertering.',
    ],
    'totals' => $totals,
    'yields' => [
      'by_res' => $yieldList,
      'top'    => $yieldTop,
    ],
    'consumed' => [
      'by_res' => $consumedList,
      'top'    => $consumedTop,
    ],
    'net' => [
      'by_res' => $netByRes,
      'top'    => $netTop,
    ],
    'series' => [
      'builds_per_day' => $buildSeries,   // [{ymd, completed, canceled}]
      'yield_per_day'  => $yieldSeries,   // [{date, total_yield}]
    ],
  ]);
} catch (Throwable $e) {
  respond(['ok'=>false,'error'=>['code'=>'E_SERVER','message'=>$e->getMessage()]], 500);
}