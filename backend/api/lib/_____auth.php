<?php
declare(strict_types=1);

/**
 * Central session/auth helpers.
 * - auth_current_user_id(): ?int    // læs bruger-id tolerant (uid/user_id)
 * - auth_require_user_id(): int     // smid 401 JSON hvis ikke logget ind
 */

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

/** Læs bruger-id fra session på en tolerant måde (uid foretrækkes) */
function auth_current_user_id(): ?int {
  $raw = $_SESSION['uid'] ?? $_SESSION['user_id'] ?? null;
  if ($raw === null) return null;
  $n = filter_var($raw, FILTER_VALIDATE_INT);
  return ($n === false) ? null : (int)$n;
}

/** Kræv login – svarer med 401 JSON hvis ingen bruger-id findes */
function auth_require_user_id(): int {
  $uid = auth_current_user_id();
  if ($uid !== null) return $uid;

  http_response_code(401);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode([
    'ok' => false,
    'error' => [
      'code' => 'unauthorized',
      'message' => 'Log ind først.',
    ]
  ], JSON_UNESCAPED_UNICODE);
  exit;
}