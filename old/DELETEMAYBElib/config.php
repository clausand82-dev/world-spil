<?php
/**
 * backend/lib/config.php
 * - Læser config.ini og db.ini fra backend/data/config/
 * - Validerer påkrævede nøgler
 * - Gør stier absolutte
 */

declare(strict_types=1);

/** Projektrod = mappen "backend" */
const BACKEND_DIR = __DIR__ . '/..';
/** Hvor config-filerne ligger (din placering) */
const CONFIG_DIR  = BACKEND_DIR . '/data/config';

/**
 * Indlæser en INI-fil med sektioner, uden “smarte” konverteringer.
 * Kaster Exception ved fejl.
 */
function load_ini(string $absPath): array {
    if (!is_file($absPath)) {
        throw new RuntimeException("Config file not found: {$absPath}");
    }
    $arr = parse_ini_file($absPath, true, INI_SCANNER_TYPED);
    if ($arr === false) {
        throw new RuntimeException("Failed to parse INI: {$absPath}");
    }
    return $arr;
}

/**
 * Returnér hele app-configen (cachet statisk i memory).
 * - $cfg['game_data']['version'] osv.
 */
function app_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $app  = load_ini(CONFIG_DIR . '/config.ini'); // din fil
    $db   = load_ini(CONFIG_DIR . '/db.ini');     // DB-login

    // Minimal validering af nøgler vi bruger med det samme:
    foreach (['game_data','dirs','start','start_limitations_cap','setup'] as $sec) {
        if (!isset($app[$sec])) {
            throw new RuntimeException("Missing [{$sec}] section in config.ini");
        }
    }
    foreach (['xml_dir','lang_dir'] as $k) {
        if (empty($app['dirs'][$k])) {
            throw new RuntimeException("Missing dirs.{$k} in config.ini");
        }
    }

    // Gør stier absolutte (ud fra backend/)
    $app['dirs']['xml_dir']  = realpath(BACKEND_DIR . '/../' . $app['dirs']['xml_dir']) ?: $app['dirs']['xml_dir'];
    $app['dirs']['lang_dir'] = realpath(BACKEND_DIR . '/../' . $app['dirs']['lang_dir']) ?: $app['dirs']['lang_dir'];

    // Pak db.ini ind under nøgle
    $app['_db'] = $db;

    // Evt. defaults for sikker opførsel (ingen fallback til drift)
    if (!isset($app['setup']['constDecimals'])) $app['setup']['constDecimals'] = 2;
    if (!isset($app['setup']['dev_force_user'])) $app['setup']['dev_force_user'] = 0;

    return $cfg = $app;
}

/** Hjælper til at hente en enkelt værdi (kaster fejl hvis ikke sat). */
function cfg(string $section, string $key) {
    $cfg = app_config();
    if (!array_key_exists($section, $cfg) || !array_key_exists($key, $cfg[$section])) {
        throw new RuntimeException("Missing config value: [{$section}].{$key}");
    }
    return $cfg[$section][$key];
}

/** Absolutte datasti-helpers */
function xml_dir(): string  { return app_config()['dirs']['xml_dir'];  }
function lang_dir(): string { return app_config()['dirs']['lang_dir']; }

/** DB-konfiguration (hele db.ini som array) */
function db_config(): array { return app_config()['_db']; }
