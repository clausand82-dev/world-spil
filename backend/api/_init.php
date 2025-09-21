<?php
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

/* -------------------- Fælles utils -------------------- */
function _path_join(string ...$parts): string {
  return preg_replace('#[\\\\/]+#', '/', join('/', $parts));
}

/** Find en fil ved at prøve flere kandidater og at gå opad i mappestrukturen */
function find_file_upwards(string $startDir, array $candidates, int $maxDepth = 6): ?string {
  $dir = realpath($startDir);
  for ($i = 0; $i <= $maxDepth && $dir; $i++) {
    foreach ($candidates as $rel) {
      $p = _path_join($dir, $rel);
      if (is_file($p)) return realpath($p);
    }
    $parent = dirname($dir);
    if ($parent === $dir) break;
    $dir = $parent;
  }
  return null;
}

/** Læs db.ini (samme format som alldata.php bruger) */
function load_db_ini(?string $hintDir = null): array {
  $start = $hintDir ?? __DIR__;
  // Udvidet kandidat-liste inkl. backend/data/config/db.ini (bruges andre steder i repoet)
  $iniPath = find_file_upwards($start, [
    'db.ini',
    '../db.ini',
    '../../db.ini',
    '../../../db.ini',
    'backend/db.ini',
    '../backend/db.ini',
    '../../backend/db.ini',
    // Nye kandidater – mest sandsynlige i dette repo
    'backend/data/config/db.ini',
    '../backend/data/config/db.ini',
    '../../backend/data/config/db.ini',
    'data/config/db.ini',
    '../data/config/db.ini',
    '../../data/config/db.ini',
  ]);
  if (!$iniPath) return [];
  $ini = parse_ini_file($iniPath, true, INI_SCANNER_TYPED) ?: [];
  return $ini['database'] ?? $ini;
}

/* -------------------- Forsøg at inkludere alldata.php -------------------- */
if (!defined('WS_RUN_MODE')) define('WS_RUN_MODE', 'lib');
$alldataPath = __DIR__ . '/alldata.php';
if (!is_file($alldataPath)) {
  http_response_code(500);
  header('Content-Type: application/json');
  echo json_encode(['ok' => false, 'message' => 'alldata.php not found at ' . $alldataPath]);
  exit;
}
require_once $alldataPath;

/* -------------------- DB-forbindelse (fallback) -------------------- */
/**
 * Hvis alldata.php definerede db(), bruger vi den.
 * Ellers bygger vi en PDO baseret på db.ini (samme data som alldata bruger).
 */
if (!function_exists('db')) {
  function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
      return $pdo;
    }

    $cfg = load_db_ini(__DIR__);
    if (!$cfg) {
      // Intelephense accepterer throw som “exit path” => ingen P1075
      throw new RuntimeException('Missing db.ini (could not resolve database configuration).');
    }

    $driver  = (string)($cfg['driver']   ?? 'mysql');
    $host    = (string)($cfg['host']     ?? '127.0.0.1');
    $port    = (int)   ($cfg['port']     ?? 3306);
    $dbname  = (string)($cfg['name']     ?? $cfg['database'] ?? '');
    $user    = (string)($cfg['user']     ?? $cfg['username'] ?? 'root');
    $pass    = (string)($cfg['password'] ?? '');
    $charset = (string)($cfg['charset']  ?? 'utf8mb4');

    if ($dbname === '') {
      throw new RuntimeException('Database name is empty in db.ini.');
    }

    $dsn = sprintf('%s:host=%s;port=%d;dbname=%s;charset=%s', $driver, $host, $port, $dbname, $charset);

    $opts = [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    $pdo = new PDO($dsn, $user, $pass, $opts);
    return $pdo; // Sikrer return på alle succes-paths
  }
}

/* -------------------- AUTH -------------------- */
function auth_require_user_id(): int {
  // Dev-bagdør (valgfri under udvikling): ?dev_user=1
  if (isset($_GET['dev_user'])) {
    $_SESSION['uid'] = (int)$_GET['dev_user'];
  }

  // Din login flow bruger 'uid' + 'username'
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'message' => 'Not authenticated']);
    exit;
  }
  return (int)$uid;
}

/* -------------------- DEFS loader -------------------- */
/**
 * Denne kræver alldata.php, fordi vi vil genbruge dens XML-loaders.
 * Hvis ikke alldata.php blev fundet, giver vi en tydelig fejl,
 * men resten af API’et (fx dev_whoami) kan stadig køre.
 */
function load_all_defs(): array {
  $requiredFns = [
    'load_config_ini',
    'resolve_dir',
    'load_resources_xml',
    'load_buildings_xml',
    'load_research_xml',
    'load_recipes_xml',
    'load_addons_xml',
  ];
  foreach ($requiredFns as $fn) {
    if (!function_exists($fn)) {
      throw new RuntimeException("alldata.php not loaded or missing function: {$fn}");
    }
  }

  // 1) config + dirs
  $cfg      = call_user_func('load_config_ini');
  $xmlDir   = call_user_func('resolve_dir', (string)($cfg['dirs']['xml_dir']  ?? ''), 'data/xml');

  $defs = ['res'=>[], 'bld'=>[], 'rsd'=>[], 'rcp'=>[], 'add'=>[]];

  $rii = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS)
  );
  foreach ($rii as $fileInfo) {
    /** @var SplFileInfo $fileInfo */
    if (!$fileInfo->isFile()) continue;
    $path = $fileInfo->getPathname();
    if (strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'xml') continue;

    $xml = @simplexml_load_file($path);
    if (!$xml) continue;

    if ($xml->xpath('//resource')) {
      foreach (call_user_func('load_resources_xml', $path) as $id=>$obj) $defs['res'][$id] = $obj;
    }
    if ($xml->xpath('//building')) {
      foreach (call_user_func('load_buildings_xml', $path) as $id=>$obj) $defs['bld'][$id] = $obj;
    }
    if ($xml->xpath('//research')) {
      foreach (call_user_func('load_research_xml', $path) as $id=>$obj) $defs['rsd'][$id] = $obj;
    }
    if ($xml->xpath('//recipe')) {
      foreach (call_user_func('load_recipes_xml', $path) as $id=>$obj) $defs['rcp'][$id] = $obj;
    }
    if ($xml->xpath('//addon')) {
      foreach (call_user_func('load_addons_xml', $path) as $id=>$obj) $defs['add'][$id] = $obj;
    }
  }
  return $defs;
}
