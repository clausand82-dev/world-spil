<?php
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';
header('Content-Type: application/json');

try {
    $input  = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = auth_require_user_id();
    $reqId   = trim((string)($input['id'] ?? ''));
    if ($reqId === '') throw new Exception('Missing id');

    $scopeIn = 'building'; // Default
    if (str_starts_with($reqId, 'rsd.')) $scopeIn = 'research';
    elseif (str_starts_with($reqId, 'add.')) $scopeIn = 'addon';
    elseif (str_starts_with($reqId, 'rcp.')) $scopeIn = 'recipe';

    $defs = load_all_defs();
    $db = db();
    $db->beginTransaction(); // Start transaktionen tidligt for alle typer

    if ($scopeIn === 'recipe') {
        // =====================================================================
        // START PÅ DEN ENESTE, KORREKTE RETTELSE
        // =====================================================================
        $rawKey = preg_replace('~^rcp\.~i', '', $reqId);
        $def = $defs['rcp'][$rawKey] ?? null;
        if (!$def) throw new Exception('Unknown recipe: ' . $reqId);

        $duration_s = (int)($def['duration_s'] ?? 10);
        $allCosts = normalize_costs($def['cost'] ?? []);
        
        $animalCosts = [];
        $resourceCosts = [];
        foreach ($allCosts as $cost) {
            if (str_starts_with($cost['res_id'], 'ani.')) {
                $animalCosts[] = $cost;
            } else {
                $resourceCosts[] = $cost;
            }
        }
        
        // Trin 1: Forbrug dyr med det samme. `spend_resources` validerer og trækker fra.
        if (!empty($animalCosts)) {
            spend_resources($db, $userId, $animalCosts);
        }

        // Trin 2: Lås de almindelige ressourcer som normalt.
        if (!empty($resourceCosts)) {
            lock_costs_or_throw($db, $userId, $resourceCosts, 'recipe', $reqId);
        }

        // Trin 3: Opret jobbet. Gem KUN de låste ressourcer i `locked_costs_json`.
        $stmt = $db->prepare("INSERT INTO build_jobs (user_id, bld_id, state, start_utc, duration_s, locked_costs_json) VALUES (?, ?, 'running', UTC_TIMESTAMP(), ?, ?)");
        $stmt->execute([$userId, $reqId, $duration_s, json_encode($resourceCosts)]);
        $jobId = (int)$db->lastInsertId();
        
        $costsToReturn = $resourceCosts; // Vi returnerer kun de låste omkostninger

    } else {
        // --- Eksisterende, uændret logik for building, addon, research ---
        $def = null; $itemId = $reqId; $duration_s = 10; $costs = [];
        if ($scopeIn === 'research') {
            $key = preg_replace('~^rsd\.~i', '', $reqId);
            $def = $defs['rsd'][$key] ?? null;
            if(!$def) throw new Exception('Unknown research: ' . $reqId);
        } elseif ($scopeIn === 'addon') {
            $key = preg_replace('~^add\.~i', '', $reqId);
            $def = $defs['add'][$key] ?? null;
            if(!$def) throw new Exception('Unknown addon: ' . $reqId);
        } else { // building
            $key = preg_replace('~^bld\.~i', '', $reqId);
            $def = $defs['bld'][$key] ?? null;
            if(!$def) throw new Exception('Unknown building: ' . $reqId);
            $itemId = canonical_bld_id($key);
        }

        $duration_s = (int)($def['duration_s'] ?? 10);
        $costs = normalize_costs($def['cost'] ?? []);
        
        lock_costs_or_throw($db, $userId, $costs, $scopeIn, $itemId);

        $stmt = $db->prepare("INSERT INTO build_jobs (user_id, bld_id, state, start_utc, duration_s, locked_costs_json) VALUES (?, ?, 'running', UTC_TIMESTAMP(), ?, ?)");
        $stmt->execute([$userId, $itemId, $duration_s, json_encode($costs)]);
        $jobId = (int)$db->lastInsertId();
        $costsToReturn = $costs;
    }

    // Fælles logik for alle jobtyper: Hent tid og send svar
    $stmt = $db->prepare("SELECT start_utc, duration_s FROM build_jobs WHERE id = ?");
    $stmt->execute([$jobId]);
    $jobDataFromDb = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $db->commit();

    $start = new DateTime($jobDataFromDb['start_utc'], new DateTimeZone('UTC'));
    $end = (clone $start)->modify("+" . (int)$jobDataFromDb['duration_s'] . " seconds");

    echo json_encode(['ok'=>true, 'job_id'=>$jobId, 'bld_id'=>($itemId ?? $reqId), 'start_utc'=>$start->format('Y-m-d H:i:s'), 'end_utc'=>$end->format('Y-m-d H:i:s'), 'duration_s'=>(int)$jobDataFromDb['duration_s'], 'locked_costs'=>$costsToReturn]);

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}