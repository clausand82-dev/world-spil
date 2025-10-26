<?php
declare(strict_types=1);

// Minimal endpoint that returns small modifiers derived from server stats.
// Defensive: will not throw fatal errors if helpers are missing.

header('Content-Type: application/json');

try {
    // attempt to include shared helpers (if they exist)
    if (is_file(__DIR__ . '/lib/stats.php')) {
        require_once __DIR__ . '/lib/stats.php';
    } else {
        // try parent lib path (if layout different)
        if (is_file(__DIR__ . '/lib/stats.php')) require_once __DIR__ . '/lib/stats.php';
    }

    // resolve user id safely
    $userId = 0;
    if (function_exists('auth_get_user_id_if_any')) {
        $userId = (int)auth_require_user_id();
    } else {
        try {
            if (session_status() !== PHP_SESSION_ACTIVE) @session_start();
            if (!empty($_SESSION['uid'])) $userId = (int)$_SESSION['uid'];
        } catch (Throwable $e) {}
    }

    // default neutral modifiers
    $mods = [
      'global' => [
        'yield_mult' => 1.0,
        'speed_mult' => 1.0,
        'cost_mult'  => 1.0,
      ],
      'per_resource' => new stdClass(),
      'per_action'   => new stdClass(),
    ];

    // prepare $db if available
    $db = null;
    if (function_exists('db')) {
      try { $db = db(); } catch (Throwable $e) { $db = null; }
    }

    // compute stats if helper exists
    if (function_exists('compute_user_stats')) {
      try {
        $stats = compute_user_stats($db, $userId, null, null);
        if (is_array($stats)) {
          $h = isset($stats['happiness']) ? (float)$stats['happiness'] : null;
          $p = isset($stats['popularity']) ? (float)$stats['popularity'] : null;

          // map simple thresholds -> multipliers (tune to taste)
          if ($h !== null) {
            if ($h < 40.0) $mods['global']['yield_mult'] = 0.5;
            elseif ($h < 60.0) $mods['global']['yield_mult'] = 0.85;
            else $mods['global']['yield_mult'] = 1.0;
          }
          if ($p !== null) {
            if ($p < 40.0) $mods['global']['speed_mult'] = 0.6;
            elseif ($p < 60.0) $mods['global']['speed_mult'] = 0.9;
            else $mods['global']['speed_mult'] = 1.0;
          }
        }
      } catch (Throwable $e) {
        // keep defaults
      }
    }

    echo json_encode(['ok' => true, 'data' => ['statsModifiers' => $mods]], JSON_THROW_ON_ERROR);
    exit(0);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => ['message' => $e->getMessage()]]);
    exit(1);
}