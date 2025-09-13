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

    // Hent og lås jobbet
    $stmt = $db->prepare("SELECT * FROM build_jobs WHERE id=? AND user_id=? FOR UPDATE");
    $stmt->execute([$jobId, $userId]);
    $job = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$job) throw new Exception('Job not found');
    if ($job['state'] !== 'running') {
        $db->rollBack();
        echo json_encode(['ok' => true, 'message' => 'Job already processed.']);
        return;
    }
    
    // Tjek om tiden er gået
    $stmt = $db->prepare("SELECT TIMESTAMPDIFF(SECOND, start_utc, UTC_TIMESTAMP()) - duration_s AS secs_over FROM build_jobs WHERE id=?");
    $stmt->execute([$jobId]);
    if ((int)$stmt->fetchColumn() < 0) {
        $db->rollBack();
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Not finished yet']);
        return;
    }

    $jobItemId = (string)$job['bld_id'];
    $lockedCosts = json_decode((string)$job['locked_costs_json'], true) ?? [];
    $delta = null;

    // =====================================================================
    // KORREKT LOGIK-GREN: Håndter `recipe` FØRST og separat.
    // =====================================================================
    if (str_starts_with($jobItemId, 'rcp.')) {
        
        // Hent defs, da vi skal bruge dem
        if (!function_exists('load_all_defs')) require_once __DIR__ . '/../api/alldata.php';
        $defs = load_all_defs();

        // 1. Forbrug de låste input-ressourcer
        spend_locked_costs($db, $userId, $lockedCosts, 'recipe', $jobItemId);
        
        // 2. Krediter output-ressourcerne
        $delta = backend_complete_recipe($db, $userId, $jobItemId, $defs);

        // 3. Opdater jobbet til 'produced'
        $upd = $db->prepare("UPDATE build_jobs SET state='produced', end_utc=UTC_TIMESTAMP() WHERE id=?");
        $upd->execute([$jobId]);

    } else {
        // --- Din eksisterende, fungerende logik for bygninger, addons og research ---
        if (str_starts_with($jobItemId, 'rsd.')) {
            spend_locked_costs($db, $userId, $lockedCosts, 'research', $jobItemId);
            $delta = backend_purchase_research($db, $userId, $jobItemId);
        } elseif (str_starts_with($jobItemId, 'add.')) {
            spend_locked_costs($db, $userId, $lockedCosts, 'addon', $jobItemId);
            $delta = backend_purchase_addon($db, $userId, $jobItemId);
        } else {
            spend_locked_costs($db, $userId, $lockedCosts, 'building', $jobItemId);
            $delta = backend_purchase_building($db, $userId, $jobItemId);
        }
        
        // Opdater jobbet til 'done' for disse typer
        $upd = $db->prepare("UPDATE build_jobs SET state='done', end_utc=UTC_TIMESTAMP() WHERE id=?");
        $upd->execute([$jobId]);
    }

    $db->commit();
    echo json_encode(['ok' => true, 'delta' => $delta]);

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}