<?php
declare(strict_types=1);

/**
 * POST { "lang": "en", "scope": "user"|"global" }
 *
 * - scope=user: saves to $_SESSION['lang'] and (if logged in) users.preferred_lang
 * - scope=global: writes backend/data/config/config.ini lang = lang.xx (admin only)
 *
 * Response: { ok:true, lang:'en' } eller { ok:false, error:{ message: '...' } }
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php';

// allowed languages (udvid efter behov)
$ALLOWED = ['da','en'];

$raw = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
$lang = isset($raw['lang']) ? preg_replace('/[^a-z]/','', substr((string)$raw['lang'],0,2)) : null;
$scope = isset($raw['scope']) ? (string)$raw['scope'] : 'user';
if (!$lang || !in_array($lang, $ALLOWED, true)) {
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid lang']]);
  exit;
}

session_start();

// Helper response
function resp_ok($lang) {
  echo json_encode(['ok'=>true,'lang'=>$lang], JSON_UNESCAPED_UNICODE);
  exit;
}
function resp_fail($msg, $code = 400) {
  http_response_code($code);
  echo json_encode(['ok'=>false,'error'=>['message'=>$msg]], JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  if ($scope === 'user') {
    // Gem i session
    $_SESSION['lang'] = $lang;

    // Hvis logged in, gem i users.preferred_lang (valgfrit)
    try {
      $uid = null;
      if (function_exists('auth_get_user_id_if_any')) {
        $uid = auth_require_user_id();
      } elseif (function_exists('auth_require_user_id')) {
        // auth_require_user_id kaster hvis ikke logged in, så brug kun hvis try/catch
        try { $uid = auth_require_user_id(); } catch (Throwable $e) { $uid = null; }
      }

      if ($uid) {
        $pdo = db();
        $st = $pdo->prepare('UPDATE users SET preferred_lang = ? WHERE user_id = ?');
        $st->execute([$lang, $uid]);
      }
    } catch (Throwable $e) {
      // Ignore DB save failure — session is enough
      error_log('set-language: could not save preferred_lang: ' . $e->getMessage());
    }

    resp_ok($lang);

  } elseif ($scope === 'global') {
    // Admin check: kun superuser / admin må ændre global config
    $isAdmin = false;
    try {
      $uid = auth_require_user_id() ?? null;
      if ($uid) {
        // simpleste check: user_id === 1 eller rolle check hvis du har det
        if ($uid === 1) $isAdmin = true;
        // Hvis I har roles/permissions, kontroller her i stedet
      }
    } catch (Throwable $e) {
      $isAdmin = false;
    }
    if (!$isAdmin) resp_fail('Not allowed', 403);

    // Find config.ini
    $cfgPath = __DIR__ . '/../../data/config/config.ini';
    if (!is_file($cfgPath) || !is_writable($cfgPath)) {
      resp_fail('Config file not writable or not found', 500);
    }

    // Backup current file
    $bak = $cfgPath . '.bak.' . date('Ymd-His');
    if (!copy($cfgPath, $bak)) {
      error_log("set-language: could not create backup {$bak}");
      // continue anyway
    }

    // Read file and replace lang entry. The config line looks like: lang = lang.da
    $text = file_get_contents($cfgPath);
    if ($text === false) resp_fail('Could not read config', 500);

    // New RHS should be like "lang = lang.en" if you prefer to keep the 'lang.' prefix
    // We detect existing format and replace accordingly.
    // Try to replace a line starting with "lang" in the [game_data] section if present.
    $newLine = "lang = lang.{$lang}";

    // Strategy: if there is a line 'lang =' anywhere, replace it; otherwise, add to [game_data] top.
    if (preg_match('/^\s*lang\s*=/m', $text)) {
      $text2 = preg_replace('/^\s*lang\s*=.*$/m', $newLine, $text, 1);
    } else {
      // Try to find [game_data] section and insert after it
      if (preg_match('/^\s*\[game_data\]\s*$/mi', $text, $m, PREG_OFFSET_CAPTURE)) {
        // find position after section header
        $pos = $m[0][1] + strlen($m[0][0]);
        // insert newline + newLine
        $text2 = substr($text, 0, $pos) . PHP_EOL . $newLine . substr($text, $pos);
      } else {
        // append at top
        $text2 = "[game_data]" . PHP_EOL . $newLine . PHP_EOL . $text;
      }
    }

    // Write back safely (atomic-ish)
    $tmp = $cfgPath . '.tmp.' . uniqid();
    if (file_put_contents($tmp, $text2) === false) {
      resp_fail('Could not write temp config', 500);
    }
    if (!rename($tmp, $cfgPath)) {
      // attempt to restore backup
      @unlink($tmp);
      resp_fail('Could not replace config file', 500);
    }

    // Optionally clear opcache if PHP-FPM/OPcache is enabled
    if (function_exists('opcache_invalidate')) {
      @opcache_invalidate($cfgPath, true);
    }

    resp_ok($lang);

  } else {
    resp_fail('Invalid scope', 400);
  }
} catch (Throwable $e) {
  error_log('set-language exception: ' . $e->getMessage());
  resp_fail('Server error', 500);
}