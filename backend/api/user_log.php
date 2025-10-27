<?php
require_once __DIR__ . '../_init.php';
header('Content-Type: application/json');

try {
  $uid = auth_require_user_id();
  $pdo = db();

  $from   = isset($_GET['from']) ? (string)$_GET['from'] : '';
  $to     = isset($_GET['to'])   ? (string)$_GET['to']   : '';
  $type   = isset($_GET['type']) ? (string)$_GET['type'] : '';
  $limit  = min(500, max(1, (int)($_GET['limit']  ?? 500)));
  $offset = max(0, (int)($_GET['offset'] ?? 0));

  $sql = "
WITH all_events AS (
  /* Build jobs done/canceled */
  SELECT
    j.user_id,
    j.updated_at_utc AS event_time,
    CASE
      WHEN LOWER(j.state) = 'canceled' THEN 'build_canceled'
      WHEN LOWER(j.state) IN ('done','produced') THEN 'build_completed'
      ELSE NULL
    END AS event_type,
    j.bj_scope AS subject_scope,
    CONCAT(j.bj_scope, '.', j.bj_fullkey) AS subject_key,
    j.mode,
    '{}' COLLATE utf8mb4_unicode_ci AS payload_json
  FROM (
    SELECT
      user_id,
      bld_id,
      SUBSTRING_INDEX(bld_id, '.', 1)  AS bj_scope,
      SUBSTRING_INDEX(bld_id, '.', -1) AS bj_key,
      SUBSTRING(bld_id, LOCATE('.', bld_id) + 1) AS bj_fullkey,
      mode,
      state,
      start_utc,
      end_utc,
      updated_at_utc
    FROM build_jobs
    WHERE user_id = :uid
  ) j
  WHERE
    (j.end_utc IS NOT NULL OR LOWER(j.state) IN ('done','produced','canceled'))
    AND (LOWER(j.state) IN ('done','produced','canceled'))

  UNION ALL

  /* Yield events: paid */
  SELECT
    uel.user_id,
    uel.event_time,
    'yield_paid' COLLATE utf8mb4_unicode_ci AS event_type,
    uel.subject_scope COLLATE utf8mb4_unicode_ci AS subject_scope,
    uel.subject_key   COLLATE utf8mb4_unicode_ci AS subject_key,
    NULL AS mode,
    uel.payload_json  COLLATE utf8mb4_unicode_ci AS payload_json
  FROM user_event_log uel
  WHERE uel.user_id = :uid
    AND uel.event_type = 'yield_paid'

  UNION ALL

  /* Yield events: lost */
  SELECT
    uel.user_id,
    uel.event_time,
    'yield_lost' COLLATE utf8mb4_unicode_ci AS event_type,
    uel.subject_scope COLLATE utf8mb4_unicode_ci AS subject_scope,
    uel.subject_key   COLLATE utf8mb4_unicode_ci AS subject_key,
    NULL AS mode,
    uel.payload_json  COLLATE utf8mb4_unicode_ci AS payload_json
  FROM user_event_log uel
  WHERE uel.user_id = :uid
    AND uel.event_type = 'yield_lost'
)
SELECT * FROM all_events
WHERE 1=1
" . ($from ? " AND all_events.event_time >= :from" : "") . "
" . ($to   ? " AND all_events.event_time <= :to"   : "") . "
" . ($type ? " AND all_events.event_type COLLATE utf8mb4_unicode_ci = :type"  : "") . "
ORDER BY all_events.event_time DESC
LIMIT :limit OFFSET :offset
";

  $stmt = $pdo->prepare($sql);
  $stmt->bindValue(':uid', $uid, PDO::PARAM_INT);
  if ($from) $stmt->bindValue(':from', $from, PDO::PARAM_STR);
  if ($to)   $stmt->bindValue(':to',   $to,   PDO::PARAM_STR);
  if ($type) $stmt->bindValue(':type', $type, PDO::PARAM_STR);
  $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
  $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);

  $stmt->execute();
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // --- ETag / conditional response support (tilføj efter fetchAll) ---
$rawForEtag = json_encode($rows); // eller vælg en mindre nøgle (fx kun timestamps) for billigere hashing
$etag = '"' . md5($rawForEtag) . '"';

// Accept både client-sent etag med eller uden quotes:
$ifNone = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
if ($ifNone !== '') {
  // normaliser: sørg for match med/uden quotes
  if ($ifNone === $etag || trim($ifNone, '"') === trim($etag, '"')) {
    // Ingen ændringer siden klientens version -> 304 uden body
    http_response_code(304);
    exit;
  }
}

// send etag til klienten så næste request kan revalidere
header('ETag: ' . $etag);
// valgfrit: kontrolleret caching-politik
header('Cache-Control: private, max-age=0, must-revalidate');
// --- end ETag support ---

  // Parse payload_json og eksponér som array
  foreach ($rows as &$r) {
    $raw = $r['payload_json'] ?? '{}';
    $parsed = json_decode($raw, true);
    $r['payload'] = is_array($parsed) ? $parsed : [];
    unset($r['payload_json']);
  }

  echo json_encode(['ok'=>true, 'items'=>$rows], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['code'=>'E_SERVER','message'=>$e->getMessage()]]);
}