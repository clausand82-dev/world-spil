<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';
require_once __DIR__ . '/../lib/durability.php';
require_once __DIR__ . '/../lib/yield.php';     // for yield__db_has_columns (kolonne-tjek)
require_once __DIR__ . '/../alldata.php';       // for load_all_defs() og load_config_ini()

header('Content-Type: application/json');

try {
  $input  = json_decode(file_get_contents('php://input'), true) ?? [];
  $userId = auth_require_user_id();

  $rawBldId = (string)($input['bld_id'] ?? '');
  if ($rawBldId === '') throw new Exception('Missing bld_id');

  // Canonical og parse family/level
  $bldId   = canonical_bld_id($rawBldId);   // "bld.family.lN" eller "bld.family" (vi accepterer begge, men kræver family)
  [$family, $lvlIn] = parse_bld_id($bldId);
  if ($family === '') throw new Exception('Invalid building id');

  $db   = db();
  $defs = load_all_defs();
  $cfg  = load_config_ini();

  $db->beginTransaction();

  // Find den seneste (højeste level) række for samme serie
  $likeSeries = 'bld.' . $family . '.l%';

  // Vælg fleksibelt kolonner (skån for manglende migrationer)
  $cols = ['id','bld_id','level','durability'];
  if (yield__db_has_columns($db, 'buildings', ['created_at']))           $cols[] = 'created_at';
  if (yield__db_has_columns($db, 'buildings', ['last_repair_ts_utc']))   $cols[] = 'last_repair_ts_utc';

  $sql = "SELECT " . implode(',', $cols) . " FROM buildings WHERE user_id=? AND bld_id LIKE ? ORDER BY level DESC LIMIT 1 FOR UPDATE";
  $st  = $db->prepare($sql);
  $st->execute([$userId, $likeSeries]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) throw new Exception('You do not own this building series');

  $curBldId  = (string)$row['bld_id'];
  $curLevel  = (int)$row['level'];
  $rowDurAbs = (float)($row['durability'] ?? 0.0);
  $createdAt = $row['created_at'] ?? null;
  $lastRep   = $row['last_repair_ts_utc'] ?? null;

  // Læs def for det aktuelle level
  $defKey = preg_replace('~^bld\.~', '', $curBldId);
  $def    = $defs['bld'][$defKey] ?? null;
  if (!$def) throw new Exception('Unknown building definition: ' . $curBldId);

  $defMax = (float)($def['durability'] ?? 0.0);
  if ($defMax <= 0.0) throw new Exception('This building has no durability configured');

  // Effektiv absolut durability lige nu
  $effAbs = dur__effective_abs($defMax, $rowDurAbs, $createdAt, $lastRep, time(), $cfg);
  $pct    = dur__pct($defMax, $effAbs);

  // Intet at reparere
  if ($pct >= 100) {
    $db->rollBack();
    echo json_encode([
      'ok'   => true,
      'bld_id' => $curBldId,
      'message' => 'Already at 100%',
      'durability' => [
        'eff_abs' => $effAbs,
        'pct'     => $pct,
        'max'     => $defMax,
      ],
      'spent' => [],
    ]);
    return;
  }

  $missingPct = max(0.0, 1.0 - ($effAbs / max(1e-9, $defMax))); // 0..1
  $factorPct  = (float)($cfg['durability']['repairCostFactor'] ?? 75.0);
  $factorMul  = max(0.0, $factorPct) / 100.0;

  // Basepris for det aktuelle level
  $baseCosts = normalize_costs($def['cost'] ?? []);
  // Skaleret pris
  $wantCosts = [];
  foreach ($baseCosts as $c) {
    $rid = (string)($c['res_id'] ?? '');
    $amt = (float)($c['amount'] ?? 0);
    if ($rid === '' || $amt <= 0) continue;
    $scaled = $amt * $missingPct * $factorMul;
    if ($scaled <= 0) continue;
    $wantCosts[] = ['res_id' => $rid, 'amount' => $scaled];
  }

  if (empty($wantCosts)) {
    // Intet at betale — men sæt til 100% alligevel?
    // For nu: undlad at skrive, returner no-op for klarhed.
    $db->rollBack();
    echo json_encode([
      'ok'   => true,
      'bld_id' => $curBldId,
      'message' => 'Nothing to repair',
      'durability' => [
        'eff_abs' => $effAbs,
        'pct'     => $pct,
        'max'     => $defMax,
      ],
      'spent' => [],
    ]);
    return;
  }

  // Valider og træk betaling
  spend_resources($db, $userId, $wantCosts);

  // Opdater durability til defMax og sæt last_repair_ts_utc = nu (UTC)
  $updateSql = "UPDATE buildings SET durability = :max, last_repair_ts_utc = UTC_TIMESTAMP() WHERE id = :id";
  $up = $db->prepare($updateSql);
  $up->execute([':max' => $defMax, ':id' => (int)$row['id']]);

  $db->commit();

  echo json_encode([
    'ok'     => true,
    'bld_id' => $curBldId,
    'spent'  => $wantCosts,
    'durability' => [
      'eff_abs' => $defMax,
      'pct'     => 100,
      'max'     => $defMax,
    ],
  ]);

} catch (Throwable $e) {
  if (isset($db) && $db->inTransaction()) $db->rollBack();
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}