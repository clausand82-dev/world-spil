<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/buffs.php'; // til collect_active_buffs/apply_cost_buffs

// =====================================================================
// SEKTION 1: ALLE NØDVENDIGE HJÆLPEFUNKTIONER (KOPIERET IND FOR AT VÆRE UAFHÆNGIG)
// =====================================================================

/**
 * Privat hjælpefunktion til at hente alle spil-definitioner.
 * Denne logik er en kopi af den fra alldata.php for at gøre dette script selvstændigt.
 */
function _animal_api_load_all_defs(): array {
    static $defs = null;
    if ($defs !== null) return $defs;
    
    // Antager at disse funktioner er tilgængelige via _init.php
    $cfg = load_config_ini();
    $xmlDir = resolve_dir((string)($cfg['dirs']['xml_dir'] ?? ''), 'data/xml');
    
    $defs = ['res' => [], 'bld' => [], 'rsd' => [], 'rcp' => [], 'add' => [], 'ani' => []];
    $xml_map = [
        'resource' => 'res', 'building' => 'bld', 'research' => 'rsd',
        'recipe' => 'rcp', 'addon' => 'add', 'animal' => 'ani',
    ];
    
    $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS));
    foreach ($rii as $fileInfo) {
        if (!$fileInfo->isFile() || strtolower($fileInfo->getExtension()) !== 'xml') continue;
        $xml = @simplexml_load_file($fileInfo->getPathname());
        if (!$xml) continue;
        foreach ($xml_map as $tag => $prefix) {
            if ($xml->xpath("//{$tag}")) {
                // Simpel inline parser for at undgå afhængigheder
                foreach ($xml->xpath("//{$tag}") as $node) {
                    $idRaw = (string)($node['id'] ?? '');
                    if ($idRaw === '') continue;
                    $id = preg_replace("/^{$prefix}\\./", '', $idRaw);
                    $item = ['id' => $id];
                    foreach ($node->attributes() as $k => $v) if ($k !== 'id') $item[(string)$k] = (string)$v;
                    if (isset($node->stats)) $item['stats'] = parse_stats_string((string)$node->stats);
                    $costs = [];
                    foreach($node->xpath('cost/*')?:[] as $c){$row=['type'=>$c->getName()];foreach($c->attributes() as $k=>$v)$row[(string)$k]=(string)$v;$costs[]=$row;}
                    if($costs)$item['cost']=$costs;
                    $defs[$prefix][$id] = $item;
                }
            }
        }
    }
    
    // Normaliser res-nøgler
    if (!empty($defs['res'])) {
        $norm = [];
        foreach ($defs['res'] as $id => $row) $norm[preg_replace('/^res\./','',$id)] = $row;
        $defs['res'] = $norm;
    }
    
    return $defs;
}

// Hjælpere til at læse ejer-state (for buff-kilder)
function _animal_api_load_owned_state(PDO $db, int $userId): array {
    // NB: tilpas kolonner/tabeller hvis dine schemas afviger
    $state = ['bld'=>[], 'add'=>[], 'rsd'=>[], 'ani'=>[]];

    // buildings
    try {
        $st = $db->prepare("SELECT bld_id FROM user_buildings WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st as $r) {
            $id = (string)($r['bld_id'] ?? '');
            if ($id !== '') $state['bld']["bld.$id"] = ['owned' => 1];
        }
    } catch (\Throwable $e) {}

    // addons
    try {
        $st = $db->prepare("SELECT addon_id FROM user_addons WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st as $r) {
            $id = (string)($r['addon_id'] ?? '');
            if ($id !== '') $state['add']["add.$id"] = ['owned' => 1];
        }
    } catch (\Throwable $e) {}

    // research
    try {
        $st = $db->prepare("SELECT rsd_id FROM user_research WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st as $r) {
            $id = (string)($r['rsd_id'] ?? '');
            if ($id !== '') $state['rsd']["rsd.$id"] = ['owned' => 1];
        }
    } catch (\Throwable $e) {}

    // owned animals (ikke nødv. for cost-buffs, men harmless)
    try {
        $st = $db->prepare("SELECT ani_id, quantity FROM animals WHERE user_id = ?");
        $st->execute([$userId]);
        foreach ($st as $r) {
            $id = (string)($r['ani_id'] ?? '');
            $qty = (int)($r['quantity'] ?? 0);
            if ($id !== '' && $qty > 0) $state['ani'][$id] = ['quantity' => $qty];
        }
    } catch (\Throwable $e) {}

    return $state;
}

/**
 * Privat hjælpefunktion til at normalisere en cost-liste.
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
            $out[] = ['res_id' => strtolower((string)$rid), 'amount' => (float)$amt];
        }
    }
    return $out;
}

/**
 * Privat hjælpefunktion til at tilføje ressourcer til inventory.
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
 * Privat hjælpefunktion til at fjerne ressourcer fra inventory.
 */
function _animal_api_spend_resources(PDO $db, int $userId, array $costs): void {
    if (empty($costs)) return;
    
    // Valider først
    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountNeeded = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountNeeded <= 0) continue;
        
        $stmtCheck = $db->prepare("SELECT amount FROM inventory WHERE user_id = ? AND res_id = ? FOR UPDATE");
        $stmtCheck->execute([$userId, $resId]);
        $currentAmount = (float)($stmtCheck->fetchColumn() ?: 0.0);
        
        if ($currentAmount < $amountNeeded) {
            throw new Exception("Not enough resources for {$resId}. Required: {$amountNeeded}, Have: {$currentAmount}");
        }
    }

    // Træk ressourcer fra bagefter
    $stmtUpdate = $db->prepare("UPDATE inventory SET amount = GREATEST(0, amount - ?) WHERE user_id = ? AND res_id = ?");
    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountToSpend = (float)($cost['amount'] ?? 0);
        if ($resId && $amountToSpend > 0) {
            $stmtUpdate->execute([$amountToSpend, $userId, $resId]);
        }
    }
}

// =========================================================
// SECTION: HOVEDLOGIK FOR animal.php
// =========================================================

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = auth_require_user_id();
    $action = strtolower($input['action'] ?? '');
    
    $db = db();
    $defs = _animal_api_load_all_defs();

    if ($action === 'buy') {
        $animalsToBuy = $input['animals'] ?? [];
        if (empty($animalsToBuy)) throw new Exception('No animals selected for purchase.');

        $db->beginTransaction();

        $totalCost = [];
        // Her bør du tilføje validering for staldplads...

        foreach ($animalsToBuy as $aniId => $quantity) {
            $quantity = (int)$quantity;
            if ($quantity <= 0) continue;
            
            $key = preg_replace('/^ani\./', '', $aniId);
            $def = $defs['ani'][$key] ?? null;
            if (!$def) throw new Exception("Unknown animal: {$aniId}");

            $costs = _animal_api_normalize_costs($def['cost'] ?? []);
            foreach ($costs as $cost) {
                $totalCost[$cost['res_id']] = ($totalCost[$cost['res_id']] ?? 0) + ($cost['amount'] * $quantity);
            }
        }
        
        $stateForBuffs = _animal_api_load_owned_state($db, $userId);
$activeBuffs   = collect_active_buffs($defs, $stateForBuffs, time());

// $totalCost er assoc map: res_id => sum
// Konverter til assoc, filtrér kun res.* (buffs er kun for ressourcer)
$resourceAssoc = [];
foreach ($totalCost as $rid => $amt) {
    $ridStr = (string)$rid;
    if ($ridStr === '' || (strpos($ridStr, 'ani.') === 0)) continue;
    $resourceAssoc[$ridStr] = (float)$amt;
}

// Anvend rabatter (ctx: 'all' er fint her; hvis du har specifik applies_to for dyr-køb, brug fx 'ani.buy')
$buffedAssoc = apply_cost_buffs($resourceAssoc, 'all', $activeBuffs);

// Byg rækker til spending: dyr ubuffet (kvantitet), ressourcer buffede
$totalCostArray = [];
// dyr (ani.*)
foreach ($totalCost as $rid => $amt) {
    if (strpos($rid, 'ani.') === 0) {
        $totalCostArray[] = ['res_id' => $rid, 'amount' => (float)$amt];
    }
}
// ressourcer (res.*) – brug buffede tal
foreach ($buffedAssoc as $rid => $amt) {
    $totalCostArray[] = ['res_id' => $rid, 'amount' => (float)$amt];
}

// Brug rabatterede rækker i validering/spending
_animal_api_spend_resources($db, $userId, $totalCostArray);

        $stmt = $db->prepare("INSERT INTO animals (user_id, ani_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)");
        foreach ($animalsToBuy as $aniId => $quantity) {
            if ((int)$quantity > 0) {
                $stmt->execute([$userId, $aniId, (int)$quantity]);
            }
        }
        
        $db->commit();
        jout(true, ['message' => 'Animals purchased successfully.']);

    } elseif ($action === 'sell') {
        $aniId = $input['animal_id'] ?? null;
        $quantity = (int)($input['quantity'] ?? 1);
        if (!$aniId || $quantity <= 0) throw new Exception('Invalid sell request.');

        $db->beginTransaction();

        $stmt = $db->prepare("SELECT quantity FROM animals WHERE user_id = ? AND ani_id = ? FOR UPDATE");
        $stmt->execute([$userId, $aniId]);
        $ownedQuantity = (int)($stmt->fetchColumn() ?: 0);
        if ($ownedQuantity < $quantity) {
            throw new Exception("You don't have enough of this animal to sell.");
        }

        $key = preg_replace('/^ani\./', '', $aniId);
        $def = $defs['ani'][$key] ?? null;
        $refund = [];
        if ($def && isset($def['cost'])) {
            $costs = _animal_api_normalize_costs($def['cost']);
            foreach ($costs as $cost) {
                $refund[] = ['res_id' => $cost['res_id'], 'amount' => ($cost['amount'] * $quantity) * 0.50];
            }
        }
        
        _animal_api_credit_resources($db, $userId, $refund);

        if ($ownedQuantity <= $quantity) {
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
