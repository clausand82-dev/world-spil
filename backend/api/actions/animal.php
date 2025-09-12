<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';

header('Content-Type: application/json');

// =========================================================
// SECTION: MANGLENDE HJÆLPEFUNKTIONER (nu inkluderet)
// =========================================================

/**
 * Tilføjer ressourcer til spillerens beholdning.
 */
function credit_resources(PDO $db, int $userId, array $list): void {
    if (empty($list)) return;

    $stmt = $db->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(?)");
    
    foreach ($list as $row) {
        $resId = $row['res_id'] ?? null;
        $amount = (float)($row['amount'] ?? 0);
        if ($resId && $amount > 0) {
            $stmt->execute([$userId, $resId, $amount, $amount]);
        }
    }
}

/**
 * Fjerner ressourcer fra spillerens beholdning.
 */
function spend_resources(PDO $db, int $userId, array $costs): void {
    if (empty($costs)) return;

    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amount = (float)($cost['amount'] ?? 0);
        if (!$resId || $amount <= 0) continue;
        
        // Valider at spilleren har nok
        $stmtCheck = $db->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ?");
        $stmtCheck->execute([$userId, $resId]);
        $currentAmount = (float)($stmtCheck->fetchColumn() ?: 0.0);
        if ($currentAmount < $amount) {
            throw new Exception("Not enough resources for {$resId}.");
        }
        
        $stmt = $db->prepare("UPDATE inventory SET amount = GREATEST(0, amount - ?) WHERE user_id = ? AND res_id = ?");
        $stmt->execute([$amount, $userId, $resId]);
    }
}


// =========================================================
// SECTION: HOVEDLOGIK
// =========================================================

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = auth_require_user_id();
    $action = strtolower($input['action'] ?? '');
    
    $db = db();
    if (!function_exists('load_all_defs')) {
        require_once __DIR__ . '/../api/alldata.php';
    }
    $defs = load_all_defs();

    if ($action === 'buy') {
        $animalsToBuy = $input['animals'] ?? [];
        if (empty($animalsToBuy)) throw new Exception('No animals selected.');

        $db->beginTransaction();

        $totalCost = [];
        $totalAnimalCap = 0;

        foreach ($animalsToBuy as $aniId => $quantity) {
            $quantity = (int)$quantity;
            if ($quantity <= 0) continue;
            
            $key = preg_replace('/^ani\./', '', $aniId);
            $def = $defs['ani'][$key] ?? null;
            if (!$def) throw new Exception("Unknown animal: {$aniId}");

            $totalAnimalCap += (int)($def['stats']['animal_cap'] ?? 1) * $quantity;
            
            $costs = normalize_costs($def['cost'] ?? []);
            foreach ($costs as $cost) {
                $totalCost[$cost['res_id']] = ($totalCost[$cost['res_id']] ?? 0) + ($cost['amount'] * $quantity);
            }
        }
        
        // Her bør du have en mere avanceret cap-validering, men for nu stoler vi på frontenden.
        
        $totalCostArray = [];
        foreach($totalCost as $rid => $amt) $totalCostArray[] = ['res_id' => $rid, 'amount' => $amt];
        spend_resources($db, $userId, $totalCostArray);

        $stmt = $db->prepare("INSERT INTO animals (user_id, ani_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)");
        foreach ($animalsToBuy as $aniId => $quantity) {
            if ((int)$quantity > 0) {
                $stmt->execute([$userId, $aniId, (int)$quantity]);
            }
        }
        
        $db->commit();
        jout(true, ['message' => 'Animals purchased.']);

    } elseif ($action === 'sell') {
        $aniId = $input['animal_id'] ?? null;
        $quantity = (int)($input['quantity'] ?? 1);
        if (!$aniId || $quantity <= 0) throw new Exception('Invalid sell request.');

        $db->beginTransaction();

        $stmt = $db->prepare("SELECT quantity FROM animals WHERE user_id = ? AND ani_id = ? FOR UPDATE");
        $stmt->execute([$userId, $aniId]);
        $ownedQuantity = (int)($stmt->fetchColumn() ?: 0);
        if ($ownedQuantity < $quantity) {
            throw new Exception("Not enough of this animal to sell.");
        }

        $key = preg_replace('/^ani\./', '', $aniId);
        $def = $defs['ani'][$key] ?? null;
        $refund = [];
        if ($def && isset($def['cost'])) {
            $costs = normalize_costs($def['cost']);
            foreach ($costs as $cost) {
                $refund[] = ['res_id' => $cost['res_id'], 'amount' => ($cost['amount'] * $quantity) * 0.50];
            }
        }
        
        credit_resources($db, $userId, $refund);

        if ($ownedQuantity <= $quantity) { // Brug <= for en sikkerheds skyld
            $stmt = $db->prepare("DELETE FROM animals WHERE user_id = ? AND ani_id = ?");
            $stmt->execute([$userId, $aniId]);
        } else {
            $stmt = $db->prepare("UPDATE animals SET quantity = quantity - ? WHERE user_id = ? AND ani_id = ?");
            $stmt->execute([$quantity, $userId, $aniId]);
        }

        $db->commit();
        jout(true, ['message' => 'Animal sold.']);
    } else {
        throw new Exception('Invalid action.');
    }

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    jout(false, ['message' => $e->getMessage()]);
}