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

    if ($job['state'] !== 'running') {
        $db->rollBack();
        echo json_encode(['ok' => true, 'message' => 'Job already completed.']);
        return;
    }

    $stmt = $db->prepare("SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, start_utc, UTC_TIMESTAMP()) - duration_s) AS secs_over FROM build_jobs WHERE id=?");
    $stmt->execute([$jobId]);
    if ((int)$stmt->fetchColumn() <= 0) {
        $db->rollBack();
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Not finished yet']);
        return;
    }

    $jobItemId = (string)$job['bld_id'];
    $lockedCosts = json_decode((string)$job['locked_costs_json'], true) ?? [];
    $delta = null;

    // =====================================================================
    // START PÅ DEN KORREKTE LOGIK-GREN
    // =====================================================================
    if (str_starts_with($jobItemId, 'rcp.')) {
        // --- Håndtering af RECIPES ---
        if (!function_exists('load_all_defs')) require_once __DIR__ . '/../api/alldata.php';
        $defs = load_all_defs();
        
        // 1. Forbrug ALLE låste omkostninger (både ressourcer og dyr) med det korrekte scope
        spend_locked_costs($db, $userId, $lockedCosts, 'recipe', $jobItemId);
        
        // 2. Krediter udbyttet til spillerens inventory
        $delta = backend_complete_recipe($db, $userId, $jobItemId, $defs);

        // 3. Opdater jobbet til den nye 'produced' state
        $upd = $db->prepare("UPDATE build_jobs SET state='produced', end_utc=UTC_TIMESTAMP() WHERE id=?");
        $upd->execute([$jobId]);

    } else {
        // --- Eksisterende, fungerende logik for andre typer ---
        if (str_starts_with($jobItemId, 'rsd.')) {
            spend_locked_costs($db, $userId, $lockedCosts, 'research', $jobItemId);
            $delta = backend_purchase_research($db, $userId, $jobItemId);
        } elseif (str_starts_with($jobItemId, 'add.')) {
            spend_locked_costs($db, $userId, $lockedCosts, 'addon', $jobItemId);
            $delta = backend_purchase_addon($db, $userId, $jobItemId);
        } else { // Antager bygning
            spend_locked_costs($db, $userId, $lockedCosts, 'building', $jobItemId);
            $delta = backend_purchase_building($db, $userId, $jobItemId);
        }
        
        // Opdater jobbet til 'done' for disse typer
        $upd = $db->prepare("UPDATE build_jobs SET state='done', end_utc=UTC_TIMESTAMP() WHERE id=?");
        $upd->execute([$jobId]);
    }
    // =====================================================================
    // SLUT PÅ DEN KORREKTE LOGIK-GREN
    // =====================================================================

    $db->commit();
    echo json_encode(['ok' => true, 'delta' => $delta, 'yield' => $yres]);

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}