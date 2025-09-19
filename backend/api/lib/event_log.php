<?php
declare(strict_types=1);

/**
 * Indsætter en 'yield_paid' hændelse i user_event_log.
 *
 * @param PDO   $db
 * @param int   $userId
 * @param string $itemId      fx "bld.basecamp.l1", "add.xxx.l1", "ani.cow"
 * @param array $creditedRows array af ['res_id' => 'res.money', 'amount' => 120.0]
 */
function log_yield_paid(PDO $db, int $userId, string $itemId, array $creditedRows): void {
    if (empty($creditedRows)) return;

    // Udled scope og key fra itemId
    $parts = explode('.', $itemId, 2);
    $scope = $parts[0] ?? null;
    $key   = $parts[1] ?? null;

    // Tillad kun kendte scopes
    $scope = in_array($scope, ['bld','add','rcp','rsd','ani','buildings','addon','animals'], true) ? $scope : null;

    // Normaliser animals/buildings/addon scopes til 'ani','bld','add'
    if ($scope === 'buildings') $scope = 'bld';
    if ($scope === 'addon') $scope = 'add';
    if ($scope === 'animals') $scope = 'ani';

    $payload = json_encode(array_values($creditedRows), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $sql = "INSERT INTO user_event_log (user_id, event_type, subject_scope, subject_key, payload_json, event_time)
            VALUES (?, 'yield_paid', ?, ?, ?, UTC_TIMESTAMP())";
    $db->prepare($sql)->execute([$userId, $scope, $key ? $scope.'.'.$key : $itemId, $payload]);
}

/**
 * Indsætter en 'yield_lost' hændelse i user_event_log.
 *
 * @param PDO   $db
 * @param int   $userId
 * @param string $itemId    fx "bld.basecamp.l1"
 * @param array $lostRows   array af ['res_id'=>'res.water','amount'=>3.0,'reason'=>'Yield tabt pga. ingen plads (liquid)']
 * @param string $reason    Default reason hvis 'reason' mangler på rækkerne
 */
function log_yield_lost(PDO $db, int $userId, string $itemId, array $lostRows, string $reason = ''): void {
    if (empty($lostRows)) return;

    // Normalisér rows og tilføj reason hvis mangler
    $rows = [];
    foreach ($lostRows as $r) {
        $rid = (string)($r['res_id'] ?? '');
        $amt = (float)($r['amount'] ?? 0);
        if ($rid === '' || $amt <= 0) continue;
        $rows[] = [
            'res_id' => $rid,
            'amount' => $amt,
            'reason' => (string)($r['reason'] ?? $reason ?? ''),
        ];
    }
    if (empty($rows)) return;

    // Udled scope/key
    $parts = explode('.', $itemId, 2);
    $scope = $parts[0] ?? null;
    $key   = $parts[1] ?? null;
    $scope = in_array($scope, ['bld','add','rcp','rsd','ani','buildings','addon','animals'], true) ? $scope : null;
    if ($scope === 'buildings') $scope = 'bld';
    if ($scope === 'addon') $scope = 'add';
    if ($scope === 'animals') $scope = 'ani';

    $payload = json_encode(array_values($rows), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $sql = "INSERT INTO user_event_log (user_id, event_type, subject_scope, subject_key, payload_json, event_time)
            VALUES (?, 'yield_lost', ?, ?, ?, UTC_TIMESTAMP())";
    $db->prepare($sql)->execute([$userId, $scope, $key ? $scope.'.'.$key : $itemId, $payload]);
}