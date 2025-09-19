<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php';

function respond(array $payload, int $http = 200): never {
  http_response_code($http);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function bad(string $code, string $msg, int $http = 400): never {
  respond(['ok' => false, 'error' => ['code' => $code, 'message' => $msg]], $http);
}

try {
  // Kræv login (så vi holder samme sikkerhedsmodel)
  auth_require_user_id();
  $pdo = db();

  $worldId = isset($_GET['world_id']) ? (int)$_GET['world_id'] : 1;
  $mapId   = isset($_GET['map_id'])   ? (int)$_GET['map_id']   : 1;

  // Find kolonnenavne (vi bruger de navne du viste: user_id, world_id, map_id, field_id, x_coord, y_coord, is_active)
  $cols = $pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN, 0);
  $has = function(string $c) use ($cols) { return in_array($c, $cols, true); };

  foreach (['user_id','world_id','map_id'] as $must) {
    if (!$has($must)) bad('E_SCHEMA', "Kolonne '{$must}' mangler i users-tabellen.", 500);
  }

  $pkCol     = 'user_id';
  $worldCol  = 'world_id';
  $mapCol    = 'map_id';
  $fieldCol  = $has('field_id') ? 'field_id' : null;
  $xCol      = $has('x_coord')  ? 'x_coord'  : null;
  $yCol      = $has('y_coord')  ? 'y_coord'  : null;
  $activeCol = $has('is_active') ? 'is_active' : null;

  // Byg WHERE: kun rækker i denne world/map + (har field_id eller x/y)
  $where = "WHERE {$worldCol} = ? AND {$mapCol} = ?";
  $params = [$worldId, $mapId];

  if ($activeCol) { $where .= " AND {$activeCol} = 1"; }

  if ($fieldCol && $xCol && $yCol) {
    $where .= " AND ( {$fieldCol} IS NOT NULL OR ({$xCol} IS NOT NULL AND {$yCol} IS NOT NULL) )";
  } elseif ($fieldCol) {
    $where .= " AND {$fieldCol} IS NOT NULL";
  } elseif ($xCol && $yCol) {
    $where .= " AND {$xCol} IS NOT NULL AND {$yCol} IS NOT NULL";
  } else {
    bad('E_SCHEMA', "users mangler 'field_id' og også 'x_coord/y_coord' — kan ikke afgøre optagede felter.", 500);
  }

  $selectCols = "{$pkCol} AS user_id, username, {$worldCol} AS world_id, {$mapCol} AS map_id";
  if ($fieldCol) $selectCols .= ", {$fieldCol} AS field_id";
  if ($xCol)     $selectCols .= ", {$xCol} AS x_coord";
  if ($yCol)     $selectCols .= ", {$yCol} AS y_coord";

  $sql = "SELECT {$selectCols} FROM users {$where}";
  $st = $pdo->prepare($sql);
  $st->execute($params);

  $rows = [];
  while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
    $field = isset($r['field_id']) && $r['field_id'] !== null ? (int)$r['field_id'] : null;
    $x = isset($r['x_coord']) ? (int)$r['x_coord'] : null;
    $y = isset($r['y_coord']) ? (int)$r['y_coord'] : null;

    // Udled manglende felt/x/y hvis muligt
    if ($field === null && $x !== null && $y !== null) {
      $field = ($y - 1) * 50 + $x;
    } elseif (($x === null || $y === null) && $field !== null) {
      $idx = max(1, min(2500, (int)$field));
      $x = (($idx - 1) % 50) + 1;
      $y = intdiv($idx - 1, 50) + 1;
    }

    $rows[] = [
      'user_id'  => (int)$r['user_id'],
      'username' => (string)($r['username'] ?? ''),
      'world_id' => (int)$r['world_id'],
      'map_id'   => (int)$r['map_id'],
      'x'        => $x,
      'y'        => $y,
      'field'    => $field,
    ];
  }

  respond(['ok' => true, 'data' => ['occupied' => $rows]], 200);

} catch (Throwable $e) {
  bad('E_SERVER', $e->getMessage(), 500);
}