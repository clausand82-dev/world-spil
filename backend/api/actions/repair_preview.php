<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../alldata.php';         // load_all_defs, load_config_ini
require_once __DIR__ . '/../lib/durability.php';  // helpers (eff, pct, preview)
require_once __DIR__ . '/../lib/yield.php';       // yield__db_has_columns

header('Content-Type: application/json');

try {
  $input  = json_decode(file_get_contents('php://input'), true) ?? [];
  $userId = auth_require_user_id();

  $rawBldId = (string)($input['bld_id'] ?? '');
  if ($rawBldId === '') throw new Exception('Missing bld_id');

  // Find serie: accepter både "bld.family.lN" og "family.lN" og evt. kun "family"
  $s = trim($rawBldId);
  if (!str_starts_with($s, 'bld.')) $s = 'bld.' . $s;

  $family = '';
  if (preg_match('~^bld\.([^.]+)(?:\.l\d+)?$~i', $s, $m)) {
    $family = $m[1];
  } else {
    throw new Exception('Invalid building id');
  }

  $db   = db();
  $defs = load_all_defs();
  $cfg  = load_config_ini();

  // Find højeste level for serien
  $cols = ['id','bld_id','level','durability'];
  if (yield__db_has_columns($db, 'buildings', ['created_at']))         $cols[] = 'created_at';
  if (yield__db_has_columns($db, 'buildings', ['last_repair_ts_utc'])) $cols[] = 'last_repair_ts_utc';

  $sql = "SELECT " . implode(',', $cols) . " FROM buildings WHERE user_id=? AND bld_id LIKE ? ORDER BY level DESC LIMIT 1";
  $st  = $db->prepare($sql);
  $st->execute([$userId, 'bld.' . $family . '.l%']);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) throw new Exception('You do not own this building series');

  $curBldId = (string)$row['bld_id'];
  $defKey   = preg_replace('~^bld\.~', '', $curBldId);
  $def      = $defs['bld'][$defKey] ?? null;
  if (!$def) throw new Exception('Unknown building definition: ' . $curBldId);

  $defMax = (float)($def['durability'] ?? 0.0);
  if ($defMax <= 0) throw new Exception('This building has no durability configured');

  $effAbs = dur__effective_abs(
    $defMax,
    (float)($row['durability'] ?? 0.0),
    $row['created_at'] ?? null,
    $row['last_repair_ts_utc'] ?? null,
    time(),
    $cfg
  );
  $pct  = dur__pct($defMax, $effAbs);
  $prev = dur__repair_preview_for_def($def, $effAbs, $defMax, $cfg);

  echo json_encode([
    'ok'     => true,
    'bld_id' => $curBldId,
    'durability' => [
      'eff_abs' => $effAbs,
      'pct'     => $pct,
      'max'     => $defMax,
    ],
    'preview' => $prev,
  ]);
} catch (Throwable $e) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}