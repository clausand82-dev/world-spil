<?php
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';
require_once __DIR__ . '/buffs.php'; // NY: buff-motor (cost + speed)
header('Content-Type: application/json');

try {
    $input  = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = auth_require_user_id();
    $reqId  = (string)($input['id'] ?? '');
    $scopeIn= (string)($input['scope'] ?? 'building'); // building|addon|research|recipe
    if ($reqId === '') throw new Exception('Missing id');

    $db = db();
    $db->beginTransaction();

    // Hjælp: hent defs og et minimalt state til “ejer”-check af buffs
    if (!function_exists('load_all_defs')) require_once __DIR__ . '/../alldata.php';
    $defs = load_all_defs();

    $loadState = function(PDO $db, int $uid): array {
        $state = ['bld'=>[], 'add'=>[], 'rsd'=>[], 'research'=>[]];
        try {
            // buildings
            $st = $db->prepare("SELECT bld_id FROM buildings WHERE user_id = ?");
            $st->execute([$uid]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) $state['bld'][(string)$id] = true;
        } catch (Throwable $e) {}
        try {
            // addons
            $st = $db->prepare("SELECT add_id FROM addons WHERE user_id = ?");
            $st->execute([$uid]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) $state['add'][(string)$id] = true;
        } catch (Throwable $e) {}
        try {
            // research (tolerant kolonnenavn)
            $st = $db->prepare("SELECT COALESCE(rsd_id, rsdId, id) AS rid FROM research WHERE user_id = ?");
            $st->execute([$uid]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $rid) {
                $rid = (string)$rid;
                $key = preg_match('~^rsd\.~i', $rid) ? substr($rid, 4) : $rid;
                $state['rsd']["rsd.".$key] = true;
                $state['research'][$key] = true;
            }
        } catch (Throwable $e) {}
        return $state;
    };
    $userState = $loadState($db, $userId);
    $activeBuffs = collect_active_buffs($defs, $userState, time());

    // Små helpers
    $toAssoc = function(array $costRows): array {
        $assoc = [];
        foreach ($costRows as $row) {
            $rid = (string)($row['id'] ?? $row['res'] ?? $row['res_id'] ?? '');
            $amt = (float)($row['amount'] ?? 0);
            if ($rid === '' || $amt <= 0) continue;
            $rid = str_starts_with($rid, 'res.') || str_starts_with($rid, 'ani.') ? $rid : ('res.' . $rid);
            // Saml pr res_id
            $assoc[$rid] = ($assoc[$rid] ?? 0) + $amt;
        }
        return $assoc;
    };
    $fromAssoc = function(array $assoc): array {
        $out = [];
        foreach ($assoc as $rid => $amt) {
            if ((float)$amt <= 0) continue;
            $out[] = ['res_id' => (string)$rid, 'amount' => (float)$amt];
        }
        return $out;
    };
    $inferAction = function(string $id, string $scope) {
        if ($scope === 'research' || str_starts_with($id, 'rsd.')) return 'produce';
        if ($scope === 'recipe'  || str_starts_with($id, 'rcp.')) return 'produce';
        // byggelvl > 1 => upgrade, ellers build
        if (preg_match('~\.l(\d+)$~', $id, $m)) {
            $lvl = (int)$m[1];
            return $lvl > 1 ? 'upgrade' : 'build';
        }
        return 'build';
    };

    $costsToReturn = [];
    $jobId = 0;
    $duration_s = 10;

    if ($scopeIn === 'recipe') {
        // --- RECIPES ---
        $dupStmt = $db->prepare("SELECT id FROM build_jobs WHERE user_id = ? AND bld_id = ? AND state = 'running' LIMIT 1 FOR UPDATE");
        $dupStmt->execute([$userId, $reqId]);
        if ($dupStmt->fetchColumn()) throw new Exception('Job already running for ' . $reqId);

        $key = preg_replace('~^rcp\.~i', '', $reqId);
        $def = $defs['rcp'][$key] ?? null;
        if (!$def) throw new Exception('Unknown recipe: ' . $reqId);

        $baseDuration = (int)($def['duration_s'] ?? 10);
        $allCostsRows = normalize_costs($def['cost'] ?? []);
        // Split dyr og ressource
        $animalCosts = [];
        $resourceCostsRows = [];
        foreach ($allCostsRows as $c) {
            $rid = (string)($c['res_id'] ?? '');
            if ($rid !== '' && str_starts_with($rid, 'ani.')) $animalCosts[] = $c;
            else $resourceCostsRows[] = $c;
        }

        // Lås/spend DYR med det samme (uændret)
        if (!empty($animalCosts)) {
            spend_resources($db, $userId, $animalCosts);
            // log i resource_locks (som eksisterende kode gør)
            $insLock = $db->prepare("INSERT INTO resource_locks (user_id, scope, scope_id, res_id, amount, locked_at)
                                     VALUES (?, 'recipe', ?, ?, ?, UTC_TIMESTAMP())");
            foreach ($animalCosts as $a) {
                $insLock->execute([$userId, $reqId, (string)$a['res_id'], (float)$a['amount']]);
            }
        }

        // Rabatter for ressource-priser
        $resourceAssoc = $toAssoc($resourceCostsRows);
        $buffedAssoc   = apply_cost_buffs($resourceAssoc, $reqId, $activeBuffs);
        $buffedRows    = $fromAssoc($buffedAssoc);

        if (!empty($buffedRows)) {
            lock_costs_or_throw($db, $userId, $buffedRows, 'recipe', $reqId);
        }

        // Speed buffs på varighed
        $action = $inferAction($reqId, 'recipe');
        $duration_s = apply_speed_buffs($baseDuration, $action, $reqId, $activeBuffs);

        // Opret job – gem KUN de låste ressource-omkostninger (rabatterede)
        $stmt = $db->prepare("INSERT INTO build_jobs (user_id, bld_id, state, start_utc, duration_s, locked_costs_json)
                              VALUES (?, ?, 'running', UTC_TIMESTAMP(), ?, ?)");
        $stmt->execute([$userId, $reqId, $duration_s, json_encode($buffedRows)]);
        $jobId = (int)$db->lastInsertId();
        $costsToReturn = $buffedRows;

    } else {
        // --- BUILDING / ADDON / RESEARCH ---
        $def = null; $itemId = $reqId;
        if ($scopeIn === 'research') {
            $key = preg_replace('~^rsd\.~i', '', $reqId);
            $def = $defs['rsd'][$key] ?? null;
            if(!$def) throw new Exception('Unknown research: ' . $reqId);
        } elseif ($scopeIn === 'addon') {
            $key = preg_replace('~^add\.~i', '', $reqId);
            $def = $defs['add'][$key] ?? null;
            if(!$def) throw new Exception('Unknown addon: ' . $reqId);
        } else { // building
             $key = preg_replace('~^bld\\.~i', '', $reqId);
             $def = $defs['bld'][$key] ?? null;
             if(!$def) throw new Exception('Unknown building: ' . $reqId);
             // i rest af backend bruges canonical id i jobs
             if (!function_exists('canonical_bld_id')) require_once __DIR__ . '/../alldata.php';
             $itemId = canonical_bld_id($key);
         }

            // --------------------------------------------
            // Durability-gating: kræv >= 50% for upgrades og addons
            // --------------------------------------------
            if (!function_exists('dur__effective_abs')) require_once __DIR__ . '/../lib/durability.php';
            if (!function_exists('load_config_ini')) require_once __DIR__ . '/../alldata.php';
            $cfg = load_config_ini();

            // Hjælper: find ejerens nyeste bygning for en given building-family
            $findBuildingRowForFamily = function(PDO $db, int $uid, string $family): ?array {
                // Find højeste level-række for samme serie: bld.<family>.l%
                $like = 'bld.' . $family . '.l%';
                // Forsøg at hente også created_at og last_repair_ts_utc, hvis de findes
                $cols = ['id','bld_id','level','durability'];
                try {
                $st = $db->prepare("SHOW COLUMNS FROM buildings LIKE 'created_at'"); $st->execute(); if ($st->fetch()) $cols[]='created_at';
                } catch (Throwable $e) {}
                try {
                $st = $db->prepare("SHOW COLUMNS FROM buildings LIKE 'last_repair_ts_utc'"); $st->execute(); if ($st->fetch()) $cols[]='last_repair_ts_utc';
                } catch (Throwable $e) {}
                $sql = "SELECT ".implode(',', $cols)." FROM buildings WHERE user_id=? AND bld_id LIKE ? ORDER BY level DESC LIMIT 1";
                $s = $db->prepare($sql);
                $s->execute([$uid, $like]);
                $row = $s->fetch(PDO::FETCH_ASSOC);
                return $row ?: null;
            };

            $needsRepairBlock = function(array $row, array $defs, array $cfg): bool {
                if (empty($row['bld_id'])) return false;
                $bldKey = preg_replace('~^bld\.~', '', (string)$row['bld_id']);
                $defMax = (float)($defs['bld'][$bldKey]['durability'] ?? 0.0);
                if ($defMax <= 0) return false;
                $cur    = (float)($row['durability'] ?? 0.0);
                $created= $row['created_at'] ?? null;
                $lastRp = $row['last_repair_ts_utc'] ?? null;
                $effAbs = dur__effective_abs($defMax, $cur, $created, $lastRp, time(), $cfg);
                $pct    = dur__pct($defMax, $effAbs);
                return ($pct < 50);
            };

            // A) Bloker ADDON-køb ved < 50% på relateret bygning
            if ($scopeIn === 'addon') {
                $addKey = preg_replace('~^add\.~i', '', $reqId);
                $addDef = $defs['add'][$addKey] ?? null;
                $famRaw = (string)($addDef['family'] ?? '');
                $families = array_filter(array_map('trim', explode(',', $famRaw)));
                // Tag første family (typisk én)
                $family = $families[0] ?? '';
                if ($family !== '') {
                $row = $findBuildingRowForFamily($db, $userId, $family);
                if ($row && $needsRepairBlock($row, $defs, $cfg)) {
                    throw new Exception('Reparer bygning først');
                }
                }
            }

            // B) Bloker BUILDING upgrade ved < 50% på eksisterende instans
            if ($scopeIn === 'building') {
                // inferAction eksisterer allerede i filen (defineret som $inferAction ovenfor)
                $action = $inferAction($itemId, $scopeIn);
                if ($action === 'upgrade') {
                // Udled family fra $itemId: bld.<family>.lN
                if (preg_match('~^bld\.([^.]+)\.l\d+$~', $itemId, $m)) {
                    $family = $m[1];
                    $row = $findBuildingRowForFamily($db, $userId, $family);
                    if ($row && $needsRepairBlock($row, $defs, $cfg)) {
                    throw new Exception('Reparer bygning først');
                    }
                }
                }
            }

 
        // Duplikat-kørsel for samme mål
        $dupStmt = $db->prepare("SELECT id FROM build_jobs WHERE user_id = ? AND bld_id = ? AND state = 'running' LIMIT 1 FOR UPDATE");
        $dupStmt->execute([$userId, $itemId]);
        if ($dupStmt->fetchColumn()) throw new Exception('Job already running for ' . $itemId);

        $baseDuration = (int)($def['duration_s'] ?? 10);
        $baseCostRows = normalize_costs($def['cost'] ?? []);
        // Anvend cost-buffs
        $baseAssoc  = $toAssoc($baseCostRows);
        $buffedAssoc= apply_cost_buffs($baseAssoc, $itemId, $activeBuffs);
        $buffedRows = $fromAssoc($buffedAssoc);

        // Lås rabatterede priser
        if (!empty($buffedRows)) {
            lock_costs_or_throw($db, $userId, $buffedRows, $scopeIn, $itemId);
        }

        // Speed-buffs
        $action = $inferAction($itemId, $scopeIn);
        $duration_s = apply_speed_buffs($baseDuration, $action, $itemId, $activeBuffs);

        // Opret job
        $stmt = $db->prepare("INSERT INTO build_jobs (user_id, bld_id, state, start_utc, duration_s, locked_costs_json)
                              VALUES (?, ?, 'running', UTC_TIMESTAMP(), ?, ?)");
        $stmt->execute([$userId, $itemId, $duration_s, json_encode($buffedRows)]);
        $jobId = (int)$db->lastInsertId();
        $costsToReturn = $buffedRows;
    }

    // Svar: start/end og locked_costs
    $stmt = $db->prepare("SELECT start_utc, duration_s FROM build_jobs WHERE id = ?");
    $stmt->execute([$jobId]);
    $jobDataFromDb = $stmt->fetch(PDO::FETCH_ASSOC);

    $db->commit();

    $start = new DateTime($jobDataFromDb['start_utc'], new DateTimeZone('UTC'));
    $end   = (clone $start)->modify("+" . (int)$jobDataFromDb['duration_s'] . " seconds");

    echo json_encode([
        'ok'            => true,
        'job_id'        => $jobId,
        'id'            => $reqId,
        'start_utc'     => $start->format('Y-m-d H:i:s'),
        'end_utc'       => $end->format('Y-m-d H:i:s'),
        'duration_s'    => (int)$jobDataFromDb['duration_s'],
        'locked_costs'  => $costsToReturn, // rabatteret
    ]);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}