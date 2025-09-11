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

    // Trin 1: Hent og LÅS jobrækken.
    $stmt = $db->prepare("SELECT * FROM build_jobs WHERE id=? AND user_id=? FOR UPDATE");
    $stmt->execute([$jobId, $userId]);
    $job = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$job) {
        throw new Exception('Job not found');
    }

    // =====================================================================
    // START PÅ DEN VIGTIGSTE RETTELSE: Tjek job-status ALLERFØRST.
    // Hvis en anden anmodning allerede har fuldført jobbet, vil statussen
    // være 'done', og denne anmodning vil blive stoppet her.
    // =====================================================================
    if ($job['state'] !== 'running') {
        // Dette er ikke en fejl, men en forventet situation ved race conditions.
        // Vi returnerer 'ok', fordi jobbet ER fuldført. Frontend rydder op.
        $db->rollBack(); // Annuller transaktionen, da der ikke skal gøres noget.
        echo json_encode(['ok' => true, 'message' => 'Job already completed by another request.']);
        return;
    }

    // Trin 2: Tjek om tiden er gået (med UTC-tid).
    $stmt = $db->prepare("
        SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, start_utc, UTC_TIMESTAMP()) - duration_s) AS secs_over
        FROM build_jobs WHERE id=?
    ");
    $stmt->execute([$jobId]);
    $over = (int)($stmt->fetchColumn() ?: -1);

    if ($over <= 0) {
        $db->rollBack();
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Not finished yet']);
        return;
    }

    // Trin 3: Jobbet er 'running' og tiden er gået. Udfør handlingen.
    $jobItemId = (string)$job['bld_id'];
    $locked = json_decode((string)$job['locked_costs_json'], true) ?? [];
    $delta = [];

    if (str_starts_with($jobItemId, 'rsd.')) {
        spend_locked_costs($db, $userId, $locked, 'research', $jobItemId);
        $delta = backend_purchase_research($db, $userId, $jobItemId);
    } elseif (str_starts_with($jobItemId, 'add.')) {
        spend_locked_costs($db, $userId, $locked, 'addon', $jobItemId);
        $delta = backend_purchase_addon($db, $userId, $jobItemId);
    } else {
        spend_locked_costs($db, $userId, $locked, 'building', $jobItemId);
        $delta = backend_purchase_building($db, $userId, $jobItemId);
    }

    // Trin 4: Opdater job-status til 'done'.
    $upd = $db->prepare("UPDATE build_jobs SET state='done', end_utc=UTC_TIMESTAMP() WHERE id=?");
    $upd->execute([$jobId]);

    $db->commit();
    echo json_encode(['ok' => true, 'delta' => $delta, 'yield' => $yres,]);

// Start/align passiv timer for denne producent
$upd = $db->prepare("
  UPDATE buildings
     SET yield_enabled = 1,
         last_yield_ts_utc = UTC_TIMESTAMP()
   WHERE user_id = ? AND bld_id = ?
");
$upd->execute([$userId, $jobItemId]); // $jobItemId skal være "bld.<family>.lN"

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}