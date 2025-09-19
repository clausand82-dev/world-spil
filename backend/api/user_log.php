<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_init.php';

try {
    $uid = auth_require_user_id();
    $pdo = db();

    $from   = $_GET['from']  ?? null;      // 'YYYY-MM-DD HH:MM:SS' (UTC)
    $to     = $_GET['to']    ?? null;
    $type   = $_GET['type']  ?? null;      // resource_used|resource_locked|resource_released|build_completed|build_canceled|yield_paid|yield_lost
    $limit  = max(1, (int)($_GET['limit']  ?? 500));
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    $pdo->query("SET SESSION group_concat_max_len = 1048576");

    $sql = "
SELECT * FROM (
  /* Resource events */
  SELECT
    t.user_id,
    t.event_time,
    t.event_type,
    t.subject_scope,
    t.subject_key,
    t.mode,
    CONCAT('[', GROUP_CONCAT(t.line ORDER BY t.res_id SEPARATOR ','), ']') AS payload_json
  FROM (
    SELECT
      j.user_id,
      COALESCE(rl.consumed_at, rl.released_at, rl.locked_at) AS event_time,
      CASE
        WHEN rl.consumed_at IS NOT NULL THEN 'resource_used'
        WHEN rl.released_at IS NOT NULL AND rl.consumed_at IS NULL THEN 'resource_released'
        ELSE 'resource_locked'
      END AS event_type,
      j.bj_scope AS subject_scope,
      CONCAT(j.bj_scope, '.', j.bj_fullkey) AS subject_key,
      j.mode,
      rl.res_id,
      ROUND(SUM(rl.amount), 6) AS total_amount,
      CONCAT(
        '{',
          '\"res_id\":\"', REPLACE(REPLACE(CAST(rl.res_id AS CHAR) COLLATE utf8mb4_unicode_ci, '\\\\', '\\\\\\\\'), '\"', '\\\\\"'), '\"',
          ',\"amount\":', ROUND(SUM(rl.amount), 6),
        '}'
      ) AS line
    FROM resource_locks rl
    JOIN (
      SELECT
        id,
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
      ON j.user_id = rl.user_id
     AND j.bj_scope COLLATE utf8mb4_unicode_ci = rl.scope COLLATE utf8mb4_unicode_ci
     AND j.bj_key   COLLATE utf8mb4_unicode_ci = CAST(rl.scope_id AS CHAR) COLLATE utf8mb4_unicode_ci
     AND COALESCE(rl.consumed_at, rl.released_at, rl.locked_at)
         BETWEEN (j.start_utc - INTERVAL 15 MINUTE)
             AND (COALESCE(j.end_utc, j.updated_at_utc) + INTERVAL 1 HOUR)
    WHERE rl.user_id = :uid
    GROUP BY
      j.user_id,
      event_time,
      event_type,
      subject_scope,
      subject_key,
      j.mode,
      rl.res_id
  ) AS t
  GROUP BY
    t.user_id, t.event_time, t.event_type, t.subject_scope, t.subject_key, t.mode

  UNION ALL

  /* Build job status events (færdig/annulleret) */
  SELECT
    j.user_id,
    COALESCE(j.end_utc, j.updated_at_utc, j.start_utc) AS event_time,
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
) AS all_events
WHERE 1=1
" . ($from ? " AND all_events.event_time >= :from" : "") . "
" . ($to   ? " AND all_events.event_time <= :to"   : "") . "
" . ($type ? " AND all_events.event_type COLLATE utf8mb4_unicode_ci = :type"  : "") . "
ORDER BY all_events.event_time ASC
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

    // Pars payload_json til array
    foreach ($rows as &$r) {
        $r['payload'] = $r['payload_json'] ? json_decode((string)$r['payload_json'], true) : null;
        unset($r['payload_json']);
    }
    unset($r);

    echo json_encode(['ok' => true, 'items' => $rows], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => ['code' => 'E_SERVER', 'message' => $e->getMessage()]], JSON_UNESCAPED_UNICODE);
}