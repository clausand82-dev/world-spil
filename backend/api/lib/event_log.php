<?php
declare(strict_types=1);

/**
 * Indsætter en 'yield_paid' hændelse i user_event_log.
 *
 * @param PDO   $db
 * @param int   $userId
 * @param string $itemId      fx "bld.123", "add.5", "ani.cow"
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

    // Skriv event_time som UTC for fremtidige rækker
    $sql = "INSERT INTO user_event_log (user_id, event_type, subject_scope, subject_key, payload_json, event_time)
            VALUES (?, 'yield_paid', ?, ?, ?, UTC_TIMESTAMP())";
    $db->prepare($sql)->execute([$userId, $scope, $key ? $scope.'.'.$key : $itemId, $payload]);
}