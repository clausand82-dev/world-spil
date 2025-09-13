<?php
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';
header('Content-Type: application/json');

try {
  $input  = json_decode(file_get_contents('php://input'), true) ?? [];
  $userId = auth_require_user_id();
  $jobId  = (int)($input['job_id'] ?? 0);
  if ($jobId <= 0) throw new Exception('Missing job_id');

 

  $db = db();
  $db->beginTransaction();

   require_once __DIR__ . '/../lib/yield.php';
$yres = apply_passive_yields_for_user($userId);

  $stmt = $db->prepare("SELECT * FROM build_jobs WHERE id=? AND user_id=? FOR UPDATE");
  $stmt->execute([$jobId, $userId]);
  $job = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$job) throw new Exception('Job not found');
  if (($job['state'] ?? '') !== 'running') throw new Exception('Job not running');

  $jobItemId = (string)$job['bld_id'];
 $scope = str_starts_with($jobItemId, 'rsd.') ? 'research'
      : (str_starts_with($jobItemId, 'add.') ? 'addon'
      : (str_starts_with($jobItemId, 'rcp.') ? 'recipe' : 'building'));

          
  release_locked_costs($db, $userId, $scope, $jobItemId);

  // =====================================================================
  // RETTELSE: Brug UTC_TIMESTAMP() for konsistens.
  // =====================================================================
  $upd = $db->prepare("UPDATE build_jobs SET state='canceled', end_utc=UTC_TIMESTAMP() WHERE id=?");
  $upd->execute([$jobId]);

  $locked = json_decode((string)$job['locked_costs_json'], true) ?? [];
  

  $db->commit();

  echo json_encode([
    'ok'           => true,
    'bld_id'       => $jobItemId, // bld_id er bibeholdt for bagudkompatibilitet
    'locked_costs' => $locked,
    'yield' => $yres,
  ]);
} catch (Throwable $e) {
  if (isset($db) && $db->inTransaction()) $db->rollBack();
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}