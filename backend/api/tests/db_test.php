<?php
// backend/api/tests/db_test.php — DEBUG script (kør direkte på din PHP‑server)
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
ini_set('display_errors',1);
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');

try {
  $pdo = db();
  echo "DB connected: " . $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) . PHP_EOL;
  $res = $pdo->query("SHOW TABLES LIKE 'users'")->fetchAll();
  echo "users table exists: " . (count($res) ? 'YES' : 'NO') . PHP_EOL;
  $cols = $pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_ASSOC);
  echo "users columns:" . PHP_EOL;
  foreach ($cols as $c) { echo "- " . $c['Field'] . " (" . $c['Type'] . ")" . PHP_EOL; }
} catch (Throwable $e) {
  echo "ERROR: " . $e->getMessage() . PHP_EOL;
}