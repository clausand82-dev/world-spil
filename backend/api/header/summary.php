<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php'; // db(), auth_require_user_id(), load_all_defs()

function respond($p, int $http=200): never {
  http_response_code($http);
  echo json_encode(['ok'=>true,'data'=>$p], JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $code, string $msg, int $http=500): never {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], JSON_UNESCAPED_UNICODE);
  exit;
}

function table_exists(PDO $pdo, string $name): bool {
  $db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
  $st = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
  $st->execute([$db, $name]);
  return (bool)$st->fetchColumn();
}

function get_user_citizens(PDO $pdo, int $uid): array {
  $st = $pdo->prepare('SELECT * FROM citizens WHERE user_id=? LIMIT 1');
  $st->execute([$uid]);
  $r = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  // Default alle felter til 0 hvis ikke fundet
  $defaults = [
    'baby','kidsStreet','kidsStudent','youngStudent','youngWorker','old',
    'adultsPolice','adultsFire','adultsHealth','adultsSoldier','adultsGovernment','adultsPolitician','adultsUnemployed','adultsWorker','adultsHomeless',
    'crimePolice','crimeFire','crimeHealth','crimeSoldier','crimeGovernment','crimePolitician','crimeUnemployed','crimeWorker','crimeHomeless',
  ];
  $out = [];
  foreach ($defaults as $k) $out[$k] = (int)($r[$k] ?? 0);
  return $out;
}

function group_citizens(array $raw): array {
  $baby  = (int)($raw['baby'] ?? 0);
  $kids  = (int)($raw['kidsStreet'] ?? 0) + (int)($raw['kidsStudent'] ?? 0);
  $young = (int)($raw['youngStudent'] ?? 0) + (int)($raw['youngWorker'] ?? 0);
  $old   = (int)($raw['old'] ?? 0);

  $adults = 0;
  foreach (['adultsPolice','adultsFire','adultsHealth','adultsSoldier','adultsGovernment','adultsPolitician','adultsUnemployed','adultsWorker','adultsHomeless'] as $k) {
    $adults += (int)($raw[$k] ?? 0);
  }
  $crime = 0;
  foreach (['crimePolice','crimeFire','crimeHealth','crimeSoldier','crimeGovernment','crimePolitician','crimeUnemployed','crimeWorker','crimeHomeless'] as $k) {
    $crime += (int)($raw[$k] ?? 0);
  }

  // “Forbrug” (used) = alt pånær crime (crime regnes som del af tilhørende adults)
  $usedExCrime = $baby + $kids + $young + $adults + $old;
  $totalAll    = $usedExCrime + $crime;

  return [
    'baby' => $baby,
    'kids' => $kids,
    'young'=> $young,
    'adults'=>$adults,
    'old'  => $old,
    'crime'=> $crime,
    'usedExCrime' => $usedExCrime,
    'totalAll'    => $totalAll,
  ];
}

// Fjern niveau-suffix som ".l3" => base key
function base_key(string $id): string {
  return preg_replace('/\\.l\\d+$/', '', $id) ?? $id;
}

// Slår stats.housing op i defs for et id
function housing_of(array $defsType, string $fullId): int {
  $node = $defsType[$fullId] ?? null;
  if (!$node) return 0;
  $stats = $node['stats'] ?? [];
  $h = $stats['housing'] ?? 0;
  return (int)round((float)$h);
}

try {
  $uid = auth_require_user_id();
  $pdo = db();

  // 1) Citizens
  $rawCit = table_exists($pdo, 'citizens') ? get_user_citizens($pdo, $uid) : [];
  $groups = group_citizens($rawCit);

  // 2) Defs (for housing)
  if (!function_exists('load_all_defs')) {
    // _init.php kræver alldata.php og definerer load_all_defs()
    throw new RuntimeException('load_all_defs() not available');
  }
  $defs = load_all_defs();
  $bldDefs = $defs['bld'] ?? [];
  $addDefs = $defs['add'] ?? [];
  $rsdDefs = $defs['rsd'] ?? [];

  // 3) Owned buildings – tag højeste level pr. base key
  $bldCapacity = 0;
  if (table_exists($pdo, 'buildings')) {
    $st = $pdo->prepare('SELECT bld_id, level FROM buildings WHERE user_id=?');
    $st->execute([$uid]);
    $maxByBase = []; // base => ['level'=>N, 'fullId'=>'bld.x.lN']
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $full = (string)$row['bld_id'];
      $lvl  = (int)$row['level'];
      $base = base_key($full);
      if (!isset($maxByBase[$base]) || $lvl > $maxByBase[$base]['level']) {
        $maxByBase[$base] = ['level'=>$lvl, 'fullId'=>$full];
      }
    }
    foreach ($maxByBase as $info) {
      $bldCapacity += housing_of($bldDefs, $info['fullId']);
    }
  }

  // 4) Owned addons – samme strategi (hvis tabel findes)
  $addCapacity = 0;
  if (table_exists($pdo, 'addon')) {
    $st = $pdo->prepare('SELECT add_id, level FROM addon WHERE user_id=?');
    $st->execute([$uid]);
    $maxByBase = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $full = (string)$row['add_id'];
      $lvl  = (int)$row['level'];
      $base = base_key($full);
      if (!isset($maxByBase[$base]) || $lvl > $maxByBase[$base]['level']) {
        $maxByBase[$base] = ['level'=>$lvl, 'fullId'=>$full];
      }
    }
    foreach ($maxByBase as $info) {
      $addCapacity += housing_of($addDefs, $info['fullId']);
    }
  }

  // 5) Research – completed giver evt. housing
  $rsdCapacity = 0;
  if (table_exists($pdo, 'research')) {
    $st = $pdo->prepare('SELECT rsd_id FROM research WHERE user_id=?');
    $st->execute([$uid]);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $rid = (string)$row['rsd_id'];
      $rsdCapacity += housing_of($rsdDefs, $rid);
    }
  }

  $housingCapacity = $bldCapacity + $addCapacity + $rsdCapacity;

  // 6) Response
  respond([
    'citizens' => [
      'raw'    => $rawCit,
      'groups' => $groups,
    ],
    'capacities' => [
      'housing' => [
        'capacity'  => $housingCapacity,
        'used'      => $groups['usedExCrime'],
        'breakdown' => [
          'baby'   => $groups['baby'],
          'kids'   => $groups['kids'],
          'young'  => $groups['young'],
          'adults' => $groups['adults'],
          'old'    => $groups['old'],
          'crime'  => $groups['crime'], // vises kun i hover
        ],
        'parts' => [
          'buildings' => $bldCapacity,
          'addons'    => $addCapacity,
          'research'  => $rsdCapacity,
        ],
      ],
    ],
  ]);
} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}