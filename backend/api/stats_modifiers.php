<?php
declare(strict_types=1);

// Minimal endpoint that returns small modifiers derived from server stats.
// Defensive: will not throw fatal errors if helpers are missing.

header('Content-Type: application/json');

try {
    // include the shared stats helper if present (use the expected lib path)
    if (is_file(__DIR__ . '/lib/stats.php')) {
        require_once __DIR__ . '/lib/stats.php';
    } elseif (is_file(__DIR__ . '/../api/lib/stats.php')) {
        // alternative path if repo layout differs
        require_once __DIR__ . '/../api/lib/stats.php';
    }

    // resolve user id safely
    $userId = 0;
    if (function_exists('auth_get_user_id_if_any')) {
        // FIX: call the same function we checked for (was calling auth_require_user_id() erroneously)
        $userId = (int)auth_get_user_id_if_any();
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
        // expose raw stats for debug as well
        $mods['_debug_stats'] = $stats;
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
        $mods['_error'] = $e->getMessage();
      }
    } else {
      $mods['_note'] = 'compute_user_stats not defined';
    }

    echo json_encode(['ok' => true, 'data' => ['statsModifiers' => $mods]], JSON_THROW_ON_ERROR);
    exit(0);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => ['message' => $e->getMessage()]]);
    exit(1);
}