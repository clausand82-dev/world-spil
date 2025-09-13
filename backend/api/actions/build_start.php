<?php
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';

header('Content-Type: application/json');

try {
  $input  = json_decode(file_get_contents('php://input'), true) ?? [];
  $userId = auth_require_user_id();

  $reqId   = trim((string)($input['id'] ?? ''));
  $scopeIn = strtolower(trim((string)($input['scope'] ?? '')));
  if ($reqId === '') throw new Exception('Missing id');

// Udled scope robust (denne linje er uændret)
if (str_starts_with($reqId, 'rsd.')) $scopeIn = 'research';
elseif (str_starts_with($reqId, 'add.')) $scopeIn = 'addon';
elseif (str_starts_with($reqId, 'rcp.')) $scopeIn = 'recipe';
else $scopeIn = 'building';

$defs = load_all_defs();
$db = db();

   require_once __DIR__ . '/../lib/yield.php';
$yres = apply_passive_yields_for_user($userId);


  // Find defs, duration og costs baseret på scope
  if ($scopeIn === 'research') {
    $rawKey = preg_replace('~^rsd\.~i', '', $reqId);
    $def = $defs['rsd'][$rawKey] ?? null;
    if (!$def) throw new Exception('Unknown research: ' . $reqId);
    $itemId = $reqId;
    $duration_s = (int)($def['duration_s'] ?? $def['time_s'] ?? 10);
    $costs = normalize_costs($def['cost'] ?? $def['price'] ?? []);
  } elseif ($scopeIn === 'addon') {
    $rawKey = preg_replace('/^add\./i', '', $reqId);
    if (!isset($defs['add'][$rawKey])) throw new Exception('Unknown addon id');
    $def = $defs['add'][$rawKey];
    $itemId = 'add.' . $rawKey;
    $duration_s = (int)($def['duration_s'] ?? $def['time_s'] ?? 10);
    $costs = normalize_costs($def['cost'] ?? []);
  } elseif ($scopeIn === 'recipe') { // <-- NY, SIMPEL BLOK
  $rawKey = preg_replace('~^rcp\.~i', '', $reqId);
  $def = $defs['rcp'][$rawKey] ?? null;
  if (!$def) throw new Exception('Unknown recipe: ' . $reqId);
  $itemId = $reqId;
  $duration_s = (int)($def['duration_s'] ?? 10);
  $costs = normalize_costs($def['cost'] ?? []);
  } else { // building
    $rawKey = preg_replace('/^bld\./i', '', $reqId);
    if (!isset($defs['bld'][$rawKey])) throw new Exception('Unknown building id');
    $def = $defs['bld'][$rawKey];
    $itemId = canonical_bld_id($rawKey);
    $duration_s = (int)($def['duration_s'] ?? $def['time_s'] ?? 10);
    $costs = normalize_costs($def['cost'] ?? []);
  }

  // Ensartet transaktion for alle typer
  $db->beginTransaction();

  lock_costs_or_throw($db, $userId, $costs, $scopeIn, $itemId);

  // Indsæt job med UTC_TIMESTAMP for alle typer
  $stmt = $db->prepare(
    "INSERT INTO build_jobs (user_id, bld_id, state, start_utc, duration_s, locked_costs_json)
     VALUES (?, ?, 'running', UTC_TIMESTAMP(), ?, ?)"
  );
  $stmt->execute([$userId, $itemId, $duration_s, json_encode($costs, JSON_UNESCAPED_UNICODE)]);
  $jobId = (int)$db->lastInsertId();

  // Hent den faktiske, gemte tid tilbage fra databasen - GÆLDER FOR ALLE TYPER
  $stmt = $db->prepare("SELECT start_utc, duration_s FROM build_jobs WHERE id = ?");
  $stmt->execute([$jobId]);
  $jobDataFromDb = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$jobDataFromDb) {
      $db->rollBack();
      throw new Exception("Could not retrieve the newly created job.");
  }

  $db->commit();

  // Byg svaret baseret på den ENE sandhed: databasens data
  $start_utc_string = $jobDataFromDb['start_utc'];
  $duration_s_int = (int)$jobDataFromDb['duration_s'];

  $start = new DateTime($start_utc_string, new DateTimeZone('UTC'));
  $end   = (clone $start)->modify("+{$duration_s_int} seconds");

  echo json_encode([
    'ok'           => true,
    'job_id'       => $jobId,
    'bld_id'       => $itemId,
    'start_utc'    => $start->format('Y-m-d H:i:s'),
    'duration_s'   => $duration_s_int,
    'end_utc'      => $end->format('Y-m-d H:i:s'),
    'locked_costs' => $costs,
    'yield' => $yres,
  ]);

} catch (Throwable $e) {
  if (isset($db) && $db->inTransaction()) $db->rollBack();
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}