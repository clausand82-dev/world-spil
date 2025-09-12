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

    $stmt = $db->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)");
    
    foreach ($list as $row) {
        $resId = $row['res_id'] ?? null;
        $amount = (float)($row['amount'] ?? 0);
        if ($resId && $amount > 0) {
            $stmt->execute([$userId, $resId, $amount]);
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
    // Build minimal defs for animals by scanning XML dir (self-contained to avoid heavy includes)
    $xmlDir = realpath(__DIR__ . '/../data/xml');
    if ($xmlDir === false || !is_dir($xmlDir)) {
        throw new RuntimeException('XML directory not found');
    }
    $defs = ['ani' => []];
    $stack = [$xmlDir];
    while ($stack) {
        $dir = array_pop($stack);
        $entries = @scandir($dir);
        if ($entries === false) continue;
        foreach ($entries as $name) {
            if ($name === '.' || $name === '..') continue;
            $path = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $name;
            if (is_dir($path)) { $stack[] = $path; continue; }
            if (is_file($path) && strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'xml') {
                $xml = @simplexml_load_file($path);
                if (!$xml) continue;
                foreach ($xml->xpath('//animal') ?: [] as $node) {
                    $idRaw = (string)($node['id'] ?? '');
                    if ($idRaw === '') continue;
                    $idKey = preg_replace('/^ani\./', '', $idRaw);
                    $item = [ 'id' => $idKey ];
                    // stats
                    $stats = [];
                    foreach ($node->xpath('./stats') ?: [] as $s) {
                        $val = trim((string)$s);
                        if ($val !== '') {
                            foreach (preg_split('/[;,\n]/', $val) as $pair) {
                                $pair = trim($pair);
                                if ($pair === '') continue;
                                [$k,$v] = array_pad(explode('=', $pair, 2), 2, '');
                                $k = trim($k); $v = trim($v);
                                if ($k !== '') $stats[$k] = is_numeric($v) ? $v + 0 : $v;
                            }
                        }
                    }
                    if ($stats) $item['stats'] = $stats;
                    // cost
                    $cost = [];
                    foreach ($node->xpath('./cost/res') ?: [] as $resNode) {
                        $rid = (string)($resNode['id'] ?? '');
                        $amt = (float)($resNode['amount'] ?? 0);
                        if ($rid && $amt > 0) $cost[] = ['res_id' => $rid, 'amount' => $amt];
                    }
                    if ($cost) $item['cost'] = $cost;
                    $defs['ani'][$idKey] = $item;
                }
            }
        }
    }

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

            // Stats store consumption as negative. Use absolute cost for validation/accounting if needed.
            $capCost = (int)abs((int)($def['stats']['animal_cap'] ?? 1)) ?: 1;
            $totalAnimalCap += $capCost * $quantity;
            
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
