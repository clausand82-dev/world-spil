<?php
/**
 * backend/lib/db.php
 * - Åbner en PDO-forbindelse ud fra db.ini
 * - Eneste offentlige API: db() som returnerer en shared PDO
 */

declare(strict_types=1);
require_once __DIR__ . '/config.php';

use PDO;

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $dbc = db_config();

    // Forventet db.ini struktur (tilpas hvis din er anderledes):
    // [database]
    // driver = "mysql"
    // host   = "localhost"
    // port   = 3306
    // name   = "world_spil"
    // user   = "..."
    // pass   = "..."
    // charset = "utf8mb4"
    if (!isset($dbc['database'])) {
        throw new RuntimeException("Missing [database] section in db.ini");
    }
    $d = $dbc['database'];
    foreach (['driver','host','port','name','user','pass'] as $k) {
        if (!isset($d[$k]) || $d[$k]==='') {
            throw new RuntimeException("Missing database.{$k} in db.ini");
        }
    }
    $charset = $d['charset'] ?? 'utf8mb4';

    if ($d['driver'] !== 'mysql') {
        throw new RuntimeException("Only mysql driver supported initially");
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $d['host'], (int)$d['port'], $d['name'], $charset
    );

    // Sikker PDO-konfiguration
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // kast exceptions
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,        // assoc arrays
        PDO::ATTR_EMULATE_PREPARES   => false,                   // native prepared
    ];

    try {
        $pdo = new PDO($dsn, $d['user'], $d['pass'], $options);
        // (valgfrit) sæt strammere SQL-mode hvis du vil:
        // $pdo->exec("SET sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE'");
        return $pdo;
    } catch (Throwable $e) {
        throw new RuntimeException("DB connection failed: " . $e->getMessage(), 0, $e);
    }
}
