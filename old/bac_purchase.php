<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

/*
 * purchase.php
 * INPUT : { type:"building"|"addon"|"research", id:"bld.xxx.lN|add.xxx.lN|rsd.xxx.lN", request_id?:string }
 * OUTPUT: { ok, delta?, server_version?, error_code?, message? }
 *
 * Denne version GENBRUGER din alldata.php (db-helper, config, XML-parsers).
 * Krav: alldata.php har WS_RUN_MODE-guard, så main ikke kører ved include.
 */

define('WS_RUN_MODE', 'lib'); // kør alldata.php som bibliotek, ikke endpoint
require_once __DIR__ . '/../alldata.php'; // giver db(), load_config_ini(), resolve_dir(), load_*_xml()

/* -------- utilities -------- */
function respond(array $payload, int $http = 200): never {
  http_response_code($http);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}
function bad(string $code, string $msg, int $http = 400): never {
  respond(["ok"=>false, "error_code"=>$code, "message"=>$msg], $http);
}
function parse_time_to_seconds(string $s): int {
  $s = trim($s);
  if ($s === '') return 0;
  if (preg_match('~^\s*(\d+)\s*([smhd])\s*$~i', $s, $m)) {
    $n = (int)$m[1];
    return match(strtolower($m[2])){ 's'=>$n, 'm'=>$n*60, 'h'=>$n*3600, 'd'=>$n*86400, default=>0 };
  }
  return ctype_digit($s) ? (int)$s : 0;
}

/* -------- request -------- */
$raw  = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data))                          bad('bad_request', 'Body skal være JSON.');
$type = trim((string)($data['type'] ?? ''));
$id   = trim((string)($data['id']   ?? ''));
$id   = trim($id, " \t\n\r'\"()"); // rens evt. utilsigtede tegn

if ($type === '' || $id === '')               bad('bad_request', 'Manglende type eller id.');
$uid = $_SESSION['uid'] ?? null;
if (!$uid)                                     bad('unauthorized', 'Log ind først.', 401);
$uid = (int)$uid;

/* -------- defs via alldata’s helpers -------- */
$cfg    = load_config_ini();                                   // fra alldata.php
$xmlDir = resolve_dir((string)($cfg['dirs']['xml_dir'] ?? ''), // fra alldata.php
                      'data/xml'); // fallback relativ til backend/

$defs = ['bld'=>[], 'add'=>[], 'rsd'=>[]];
$rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS));
foreach ($rii as $fi) {
  /** @var SplFileInfo $fi */
  if (!$fi->isFile()) continue;
  $path = $fi->getPathname();
  if (!preg_match('~\.xml$~i', $path)) continue;

  // Brug dine eksisterende parsere fra alldata.php:
  foreach (load_buildings_xml($path) as $k=>$v) { $defs['bld'][$k] = $v; }
  foreach (load_addons_xml($path)    as $k=>$v) { $defs['add'][$k] = $v; }
  foreach (load_research_xml($path)  as $k=>$v) { $defs['rsd'][$k] = $v; }
}

/* -------- opslag (tolerant ift. prefix) -------- */
$bucket = match($type){
  'building' => $defs['bld'],
  'addon'    => $defs['add'],
  'research' => $defs['rsd'],
  default    => bad('invalid_type', "Ukendt type '$type'")
};

$def = $bucket[$id] ?? null;
if (!$def) {
  $nop = preg_replace('~^(bld\.|add\.|rsd\.)~', '', $id);
  $def = $bucket[$nop] ?? null;
}
if (!$def) bad('not_found', "Id '$id' findes ikke i $type-defs.");

/* -------- udpak relevante felter fra def --------
 * Forventet format fra dine load_*_xml:
 *  - $def['id'] = "bld.basecamp.l2" (eller uden prefix, derfor tolerant lookup)
 *  - $def['cost'] = [ ['id'=>'res.money','amount'=>100], ... ]  (kan mangle)
 *  - $def['require'] = "rsd.xxx.l1" (kan mangle)
 *  - building: $def['durability'] (kan mangle)
 *  - research: evt. $def['time']  (sekunder el. “15m” i original)
 */
$costList = [];
if (!empty($def['cost']) && is_array($def['cost'])) {
  foreach ($def['cost'] as $row) {
    $rid = (string)($row['id'] ?? '');
    $amt = (float)($row['amount'] ?? 0);
    if ($rid !== '' && $amt > 0) $costList[] = ['id'=>$rid, 'amount'=>$amt];
  }
}
$require = (string)($def['require'] ?? '');

/* -------- DB & validation -------- */
$pdo = db(); // GENBRUG fra alldata.php

// require (enkel rsd.*)
if ($require !== '') {
  $st = $pdo->prepare("SELECT 1 FROM research WHERE user_id=? AND rsd_id=? LIMIT 1");
  $st->execute([$uid, $require]);
  if (!$st->fetch()) bad('requirements_not_met', "Kræver forskning: {$require}");
}

// helpers til inventory – res_id kan være "res.money" eller "money" i DB
$variantsOf = function(string $resId): array {
  return str_starts_with($resId, 'res.') ? [$resId, substr($resId,4)]
                                         : [$resId, 'res.'.$resId];
};
$getAmount = function(string $resId) use($pdo, $variantsOf): float {
  $sum = 0.0;
  foreach ($variantsOf($resId) as $rid) {
    foreach (['inventory_liquid','inventory_solid'] as $tbl) {
      $q = $pdo->prepare("SELECT amount FROM {$tbl} WHERE user_id=? AND res_id=?");
      $q->execute([$_SESSION['uid'], $rid]);
      if ($row = $q->fetch()) $sum += (float)$row['amount'];
    }
  }
  return $sum;
};

// afford
foreach ($costList as $c) {
  if ($getAmount($c['id']) + 1e-9 < (float)$c['amount']) {
    bad('insufficient_resources', "Du mangler {$c['id']}.");
  }
}

/* -------- udfør køb i transaktion -------- */
$pdo->beginTransaction();
try {
  // træk ressourcer (liquid -> solid)
  foreach ($costList as $c) {
    $amt = (float)$c['amount'];
    if ($amt <= 0) continue;
    $left = $amt;

    foreach (['inventory_liquid','inventory_solid'] as $tbl) {
      if ($left <= 0) break;
      // prøv begge varianter af res_id
      foreach ($variantsOf($c['id']) as $rid) {
        if ($left <= 0) break;
        $sel = $pdo->prepare("SELECT amount FROM {$tbl} WHERE user_id=? AND res_id=? FOR UPDATE");
        $upd = $pdo->prepare("UPDATE {$tbl} SET amount=? WHERE user_id=? AND res_id=?");
        $sel->execute([$uid, $rid]);
        if ($row = $sel->fetch()) {
          $cur = (float)$row['amount'];
          if ($cur <= 0) continue;
          $take = min($cur, $left);
          $upd->execute([$cur - $take, $uid, $rid]);
          $left -= $take;
        }
      }
    }
    if ($left > 1e-9) throw new RuntimeException("Insufficient after re-check: {$c['id']}");
  }

  // build delta.resources
  $delta = ['resources'=>[]];
  foreach ($costList as $c) {
    $delta['resources'][(string)$c['id']] = -1 * (int)round((float)$c['amount']);
  }

  // indsæt i relevante tabeller (tilpas kolonnenavne/skema)
  if ($type === 'building') {
    $lvl = 1;
    if (preg_match('~\.l(\d+)~', $id, $m)) $lvl = (int)$m[1];
    $dur = isset($def['durability']) ? (float)$def['durability'] : 0.0;

    $ins = $pdo->prepare("INSERT INTO buildings (user_id, bld_id, level, durability, created_at) VALUES (?, ?, ?, ?, NOW())");
    $ins->execute([$uid, $id, $lvl, $dur]);

    $delta['buildings'] = [[ 'id'=>$id, 'level'=>$lvl, 'durability'=>$dur ]];
  }
  elseif ($type === 'addon') {
    $lvl = 1;
    if (preg_match('~\.l(\d+)~', $id, $m)) $lvl = (int)$m[1];

    $ins = $pdo->prepare("INSERT INTO addon (user_id, add_id, level, created_at) VALUES (?, ?, ?, NOW())");
    $ins->execute([$uid, $id, $lvl]);

    $delta['addons'] = [[ 'id'=>$id, 'level'=>$lvl ]];
  }
  else /* research */ {
    $lvl = 1;
    if (preg_match('~\.l(\d+)~', $id, $m)) $lvl = (int)$m[1];

    // Instant-complete. Hvis du vil have timer: lav jobs-tabel og returnér started.
    $ins = $pdo->prepare("INSERT INTO research (user_id, rsd_id, level, completed_at) VALUES (?, ?, ?, NOW())");
    $ins->execute([$uid, $id, $lvl]);

    $delta['research'] = [ 'completed' => [$id] ];
  }

  $pdo->commit();

  respond([
    'ok' => true,
    'server_version' => [
      'state' => time(),
      'defs'  => date('c'),
    ],
    'delta' => $delta,
  ]);

} catch (Throwable $e) {
  $pdo->rollBack();
  bad('server_error', $e->getMessage(), 500);
}
