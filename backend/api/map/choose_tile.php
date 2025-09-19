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
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') bad('E_METHOD', 'Use POST', 405);
  $uid = auth_require_user_id();
  $pdo = db();

  $raw = file_get_contents('php://input');
  $req = json_decode($raw, true) ?: [];

  $worldId = (int)($req['world_id'] ?? 1);
  $mapId   = (int)($req['map_id']   ?? 1);
  $x       = (int)($req['x'] ?? 0);
  $y       = (int)($req['y'] ?? 0);
  $field   = isset($req['field']) ? (int)$req['field'] : (($y > 0 && $x > 0) ? (($y - 1) * 50 + $x) : 0);

  // Multipliers fra frontend (float, fx 1.350)
  $mulForest = isset($req['mul_forest']) ? (float)$req['mul_forest'] : null;
  $mulField  = isset($req['mul_field'])  ? (float)$req['mul_field']  : null;
  $mulMining = isset($req['mul_mining']) ? (float)$req['mul_mining'] : null;
  $mulWater  = isset($req['mul_water'])  ? (float)$req['mul_water']  : null;

  if ($worldId <= 0 || $mapId <= 0) bad('E_INPUT', 'Invalid world/map.', 422);
  if ($field < 1 || $field > 2500)   bad('E_INPUT', 'Invalid field (1..2500).', 422);
  if ($x < 1 || $x > 50 || $y < 1 || $y > 50) {
    // Udled x/y fra field hvis ikke sendt
    if ($x === 0 && $y === 0 && $field >= 1 && $field <= 2500) {
      $x = (($field - 1) % 50) + 1;
      $y = intdiv($field - 1, 50) + 1;
    } else {
      bad('E_INPUT', 'Invalid coordinates (x,y must be 1..50).', 422);
    }
  }

  // Find skemaet
  $cols = $pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN, 0);
  $has = function(string $c) use ($cols) { return in_array($c, $cols, true); };

  // Kræv de relevante kolonner
  foreach (['world_id','map_id'] as $must) {
    if (!$has($must)) bad('E_SCHEMA', "Kolonne '{$must}' mangler i users-tabellen.", 500);
  }
  $pkCol    = $has('user_id') ? 'user_id' : ($has('id') ? 'id' : ($has('userId') ? 'userId' : null));
  if (!$pkCol) bad('E_SCHEMA', 'users mangler en kendt PK-kolonne (user_id/id/userId).', 500);

  $fieldCol = $has('field_id') ? 'field_id' : null;
  $xCol     = $has('x_coord')  ? 'x_coord'  : null;
  $yCol     = $has('y_coord')  ? 'y_coord'  : null;
  $activeCol= $has('is_active')? 'is_active': null;

  // Vi kræver mindst field_id ELLER x/y
  if (!$fieldCol && !($xCol && $yCol)) {
    bad('E_SCHEMA', "users mangler 'field_id' og også 'x_coord/y_coord' — kan ikke gemme feltvalg.", 500);
  }

  // Bloker, hvis andre allerede har feltet (i samme world/map)
  $pdo->beginTransaction();

  $whereOcc = "WHERE world_id = ? AND map_id = ? AND {$pkCol} <> ?";
  $paramsOcc = [$worldId, $mapId, $uid];
  if ($activeCol) { $whereOcc .= " AND {$activeCol} = 1"; }

  if ($fieldCol) {
    $whereOcc .= " AND {$fieldCol} = ?";
    $paramsOcc[] = $field;
  } elseif ($xCol && $yCol) {
    $whereOcc .= " AND {$xCol} = ? AND {$yCol} = ?";
    $paramsOcc[] = $x; $paramsOcc[] = $y;
  }

  $lockSql = "SELECT {$pkCol} FROM users {$whereOcc} FOR UPDATE";
  $stLock = $pdo->prepare($lockSql);
  $stLock->execute($paramsOcc);
  $taken = $stLock->fetch(PDO::FETCH_ASSOC);
  if ($taken) {
    $pdo->rollBack();
    bad('E_OCCUPIED', 'Feltet er allerede optaget af en anden bruger.', 409);
  }

  // Sæt felter på den aktuelle bruger
  $set = ["world_id = ?", "map_id = ?"];
  $params = [$worldId, $mapId];

  if ($fieldCol) { $set[] = "{$fieldCol} = ?"; $params[] = $field; }
  if ($xCol)     { $set[] = "{$xCol} = ?";     $params[] = $x; }
  if ($yCol)     { $set[] = "{$yCol} = ?";     $params[] = $y; }

  // Multipliers hvis kolonner findes (din tabel har dem)
  $mulCols = [
    'mul_forest' => $mulForest,
    'mul_field'  => $mulField,
    'mul_mining' => $mulMining,
    'mul_water'  => $mulWater,
  ];
  foreach ($mulCols as $col => $val) {
    if ($has($col) && $val !== null) { $set[] = "{$col} = ?"; $params[] = $val; }
  }

  $sqlUpd = "UPDATE users SET " . implode(', ', $set) . " WHERE {$pkCol} = ?";
  $params[] = $uid;

  $stUpd = $pdo->prepare($sqlUpd);
  $stUpd->execute($params);

  $pdo->commit();
  respond(['ok' => true, 'data' => ['saved' => true]], 200);

} catch (Throwable $e) {
  try {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
      $pdo->rollBack();
    }
  } catch (Throwable $ignore) {}
  bad('E_SERVER', $e->getMessage(), 500);
}