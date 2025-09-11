<?php
declare(strict_types=1);
/**
 * Returnér loginstatus.
 * Output: { ok:true, data:{ loggedIn:bool, userId:int|null, username:string|null } }
 */
header('Content-Type: application/json; charset=utf-8');
session_start();

$uid = $_SESSION['uid'] ?? null;
$username = $_SESSION['username'] ?? null;

echo json_encode([
  'ok'   => true,
  'data' => [
    'loggedIn' => (bool)$uid,
    'userId'   => $uid ? (int)$uid : null,
    'username' => $username ?: null,
  ]
]);
