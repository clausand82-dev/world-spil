<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../alldata.php';   // load_all_defs()
require_once __DIR__ . '/buffs.php';        // collect_active_buffs(), apply_cost_buffs()
header('Content-Type: application/json');

/**
 * Normaliser en cost-liste til rækker af formen:
 *   [ ['res_id' => 'res.food', 'amount' => 12.0], ... ]
 * - Ressourcer får prefix 'res.' hvis det mangler (ani.* bevares som er)
 * - id feltet kan være 'res_id' | 'id' | 'res'
 */
function _animal_api_normalize_costs($raw): array {
    if (!$raw) return [];
    $out = [];
    if (is_array($raw)) {
        foreach ($raw as $row) {
            if (!is_array($row)) continue;
            $rid = $row['res_id'] ?? $row['id'] ?? $row['res'] ?? null;
            $amt = $row['amount'] ?? $row['qty'] ?? null;
            if ($rid === null || $amt === null) continue;
            $ridNorm = strtolower((string)$rid);
            if (strpos($ridNorm, 'ani.') !== 0 && strpos($ridNorm, 'res.') !== 0) {
                $ridNorm = 'res.' . $ridNorm;
            }
            $out[] = ['res_id' => $ridNorm, 'amount' => (float)$amt];
        }
    }
    return $out;
}

/**
 * Tilfør ressourcer (bruges ved refund ved salg)
 */
function _animal_api_credit_resources(PDO $db, int $userId, array $list): void {
    if (empty($list)) return;
    $stmt = $db->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?");
    foreach ($list as $row) {
        $resId = $row['res_id'] ?? null;
        $amount = (float)($row['amount'] ?? 0);
        if ($resId && $amount > 0) {
            $stmt->execute([$userId, $resId, $amount, $amount]);
        }
    }
}

/**
 * Forbrug ressourcer/dyr med validering
 */
function _animal_api_spend_resources(PDO $db, int $userId, array $costs): void {
    if (empty($costs)) return;

    // Valider
    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountNeeded = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountNeeded <= 0) continue;

        if (strpos($resId, 'ani.') === 0) {
            $stmtCheck = $db->prepare("SELECT quantity FROM animals WHERE user_id = ? AND ani_id = ?");
            $stmtCheck->execute([$userId, $resId]);
            $currentAmount = (float)($stmtCheck->fetchColumn() ?: 0.0);
        } else {
            // Ressourcer fra inventory
            $stmtCheck = $db->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ?");
            $stmtCheck->execute([$userId, $resId]);
            $currentAmount = (float)($stmtCheck->fetchColumn() ?: 0.0);
        }

        if ($currentAmount < $amountNeeded) {
            throw new Exception("Not enough of {$resId}. Required: {$amountNeeded}, Have: {$currentAmount}");
        }
    }

    // Træk
    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountToSpend = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountToSpend <= 0) continue;

        if (strpos($resId, 'ani.') === 0) {
            $stmtUpdate = $db->prepare("UPDATE animals SET quantity = GREATEST(0, quantity - ?) WHERE user_id = ? AND ani_id = ?");
            $stmtUpdate->execute([$amountToSpend, $userId, $resId]);
        } else {
            $stmtUpdate = $db->prepare("UPDATE inventory SET amount = GREATEST(0, amount - ?) WHERE user_id = ? AND res_id = ?");
            $stmtUpdate->execute([$amountToSpend, $userId, $resId]);
        }
    }
}

/**
 * Byg et minimalt "state" for at filtrere aktive buffs efter ejerskab.
 * Vi prøver almindelige tabeller (buildings, addon, research) og ignorerer fejl tolerante.
 */
function _animal_api_build_state_for_buffs(PDO $db, int $userId): array {
    $state = ['bld' => [], 'add' => [], 'rsd' => [], 'ani' => []];

    // Buildings
    try {
        $st = $db->prepare("SELECT bld_id FROM buildings WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) {
            $id = (string)$id;
            if ($id !== '') $state['bld'][$id] = ['owned' => 1];
        }
    } catch (\Throwable $e) {
        // fallback: user_buildings?
        try {
            $st = $db->prepare("SELECT bld_id FROM user_buildings WHERE user_id = ?");
            $st->execute([$userId]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) {
                $id = (string)$id;
                if ($id !== '') $state['bld'][$id] = ['owned' => 1];
            }
        } catch (\Throwable $e2) {}
    }

    // Addons
    try {
        $st = $db->prepare("SELECT add_id FROM addon WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) {
            $id = (string)$id;
            if ($id !== '') $state['add'][$id] = ['owned' => 1];
        }
    } catch (\Throwable $e) {
        try {
            $st = $db->prepare("SELECT add_id FROM addons WHERE user_id = ?");
            $st->execute([$userId]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) {
                $id = (string)$id;
                if ($id !== '') $state['add'][$id] = ['owned' => 1];
            }
        } catch (\Throwable $e2) {}
    }

    // Research (tolerant kolonnenavn/tabel)
    try {
        $st = $db->prepare("SELECT rsd_id FROM research WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $rid) {
            $rid = (string)$rid;
            $key = preg_match('~^rsd\.~i', $rid) ? $rid : ('rsd.' . $rid);
            $state['rsd'][$key] = ['owned' => 1];
        }
    } catch (\Throwable $e) {
        try {
            $st = $db->prepare("SELECT rsd_id FROM user_research WHERE user_id = ?");
            $st->execute([$userId]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $rid) {
                $rid = (string)$rid;
                $key = preg_match('~^rsd\.~i', $rid) ? $rid : ('rsd.' . $rid);
                $state['rsd'][$key] = ['owned' => 1];
            }
        } catch (\Throwable $e2) {}
    }

    // Owned animals kan tilføjes hvis relevant, men ikke påkrævet for cost-buffs på ress.
    return $state;
}

try {
    $input  = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = auth_require_user_id();
    $action = strtolower((string)($input['action'] ?? ''));

    $db   = db();
    $defs = load_all_defs();

    if ($action === 'buy') {
        $animalsToBuy = $input['animals'] ?? [];
        if (empty($animalsToBuy) || !is_array($animalsToBuy)) {
            throw new Exception('No animals selected for purchase.');
        }

        $db->beginTransaction();

        // Saml base-total pr. res_id (assoc) fra valgte dyr
        $totalCost = []; // ['res.food' => 12.0, ...]
        foreach ($animalsToBuy as $aniId => $quantity) {
            $quantity = (int)$quantity;
            if ($quantity <= 0) continue;

            $key = preg_replace('/^ani\./', '', (string)$aniId);
            $def = $defs['ani'][$key] ?? null;
            if (!$def) throw new Exception("Unknown animal: {$aniId}");

            $costRows = _animal_api_normalize_costs($def['cost'] ?? []);
            foreach ($costRows as $c) {
                $rid = (string)($c['res_id'] ?? '');
                $amt = (float)($c['amount'] ?? 0);
                if ($rid === '' || $amt <= 0) continue;
                $totalCost[$rid] = ($totalCost[$rid] ?? 0.0) + ($amt * $quantity);
            }
        }

        // Del op i dyr vs ressourcer (dyr har typisk ikke costs, men vi understøtter det)
        $resourceAssoc = [];
        foreach ($totalCost as $rid => $sum) {
            if (strpos($rid, 'ani.') === 0) continue;
            $resourceAssoc[$rid] = (float)$sum;
        }

        // Indsamling af aktive buffs for denne bruger
        $userState   = _animal_api_build_state_for_buffs($db, $userId);
        $activeBuffs = collect_active_buffs($defs, $userState, time());

        // Anvend rabatter på RESSOURCER (dyr-mængder påvirkes ikke af rabatter)
        // applies_to context: 'all' virker fint; brug evt. 'ani.buy' hvis dine buffs er målrettet
        $buffedAssoc = apply_cost_buffs($resourceAssoc, 'all', $activeBuffs);

        // Byg endelige rækker til spending: dyr (ani.*) + buffet ressourcer (res.*)
        $totalCostArray = [];
        foreach ($totalCost as $rid => $sum) {
            if (strpos($rid, 'ani.') === 0) {
                $totalCostArray[] = ['res_id' => $rid, 'amount' => (float)$sum];
            }
        }
        foreach ($buffedAssoc as $rid => $amt) {
            $totalCostArray[] = ['res_id' => $rid, 'amount' => (float)$amt];
        }

        // Træk (valider + spend)
        _animal_api_spend_resources($db, $userId, $totalCostArray);

        // Tilføj/øge dyrene
        $stmt = $db->prepare("INSERT INTO animals (user_id, ani_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)");
        foreach ($animalsToBuy as $aniId => $quantity) {
            $quantity = (int)$quantity;
            if ($quantity > 0) {
                $stmt->execute([$userId, (string)$aniId, $quantity]);
            }
        }

        $db->commit();
        jout(true, ['message' => 'Animals purchased successfully.']);
        return;
    }

    if ($action === 'sell') {
        $aniId    = (string)($input['animal_id'] ?? '');
        $quantity = (int)($input['quantity'] ?? 1);
        if ($aniId === '' || $quantity <= 0) {
            throw new Exception('Invalid sell request.');
        }

        $db->beginTransaction();

        // Tjek ejerskab
        $stmt = $db->prepare("SELECT quantity FROM animals WHERE user_id = ? AND ani_id = ? FOR UPDATE");
        $stmt->execute([$userId, $aniId]);
        $ownedQuantity = (int)($stmt->fetchColumn() ?: 0);
        if ($ownedQuantity < $quantity) {
            $db->rollBack();
            throw new Exception("You don't have enough of this animal to sell.");
        }

        // Refund 50% af basepris (samme som eksisterende logik)
        $key = preg_replace('/^ani\./', '', $aniId);
        $def = $defs['ani'][$key] ?? null;
        $refund = [];
        if ($def && isset($def['cost'])) {
            $costs = _animal_api_normalize_costs($def['cost']);
            foreach ($costs as $c) {
                $rid = (string)($c['res_id'] ?? '');
                $amt = (float)($c['amount'] ?? 0);
                if ($rid === '' || $amt <= 0) continue;
                // 50% refund af BASE (ikke buffede) costs
                $refund[] = ['res_id' => $rid, 'amount' => ($amt * $quantity * 0.5)];
            }
        }

        // Nedskriv antal
        $stmt = $db->prepare("UPDATE animals SET quantity = GREATEST(0, quantity - ?) WHERE user_id = ? AND ani_id = ?");
        $stmt->execute([$quantity, $userId, $aniId]);

        // Kreditér refund
        _animal_api_credit_resources($db, $userId, $refund);

        $db->commit();
        jout(true, ['message' => 'Animals sold successfully.']);
        return;
    }

    throw new Exception('Unknown action.');
} catch (Throwable $e) {
    if (isset($db) && $db instanceof PDO) {
        try { if ($db->inTransaction()) $db->rollBack(); } catch (Throwable $e2) {}
    }
    jout(false, ['message' => $e->getMessage()]);
}