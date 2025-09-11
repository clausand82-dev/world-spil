<?php
/**
 * backend/lib/auth.php
 * - Start sikker session
 * - Login/Logout
 * - Tjek/kræv login
 * - Dev override (setup.dev_force_user i config.ini)
 */

declare(strict_types=1);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';

/** Start en stram PHP-session (skal kaldes i starten af endpoints). */
function start_session_secure(): void {
    // Undgå at starte to gange
    if (session_status() === PHP_SESSION_ACTIVE) return;

    // Sæt sikre cookie-parametre før session_start()
    $cookie = session_get_cookie_params();
    session_set_cookie_params([
        'lifetime' => 0,                          // session-cookie
        'path'     => $cookie['path'] ?? '/',
        'domain'   => $cookie['domain'] ?? '',
        'secure'   => !empty($_SERVER['HTTPS']),  // kun over HTTPS i prod
        'httponly' => true,
        'samesite' => 'Lax',                      // Lax er fint for klassisk web
    ]);
    session_name('worldsid'); // fast navn til din app
    session_start();
}

/** Returnér nuværende bruger-id eller null. Respekter dev_force_user. */
function current_user_id(): ?int {
    $cfg = app_config();
    $dev = (int)($cfg['setup']['dev_force_user'] ?? 0);
    if ($dev > 0) return $dev; // udvikler override
    return isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : null;
}

/** Kræv at en bruger er logget ind – ellers 401. */
function require_login(): int {
    start_session_secure();
    $uid = current_user_id();
    if (!$uid) json_err('E_AUTH', 'Login required', 401);
    return $uid;
}

/** Log brugeren ind (sæt uid i session). */
function login_user(int $userId): void {
    start_session_secure();
    $_SESSION['uid'] = $userId;
}

/** Log ud (ryd session). */
function logout_user(): void {
    start_session_secure();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time()-42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}
