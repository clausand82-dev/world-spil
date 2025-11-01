<?php
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/purchase_helpers.php';
require_once __DIR__ . '/buffs.php'; // buff-motor (cost + speed)

// Robust buff-samling (defs + stats)
$yieldLibFile = __DIR__ . '/../lib/yield.php';
if (is_file($yieldLibFile)) require_once $yieldLibFile;

// Statsbuffs (regler) hvis vi vil evaluere på serveren
$statsBuffsFile = __DIR__ . '/statsbuffs.php';
if (is_file($statsBuffsFile)) require_once $statsBuffsFile;

header('Content-Type: application/json');

try {
    $input  = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = auth_require_user_id();
    $reqId  = (string)($input['id'] ?? '');
    $scopeIn= (string)($input['scope'] ?? 'building'); // building|addon|research|recipe
    if ($reqId === '') throw new Exception('Missing id');

    // Valgfrit: summary fra frontend (samme tal som alldata viser)
    $clientUserSummary = (isset($input['userSummary']) && is_array($input['userSummary'])) ? $input['userSummary'] : null;

    $db = db();
    $db->beginTransaction();

    // Hent defs (samme som alldata)
    if (!function_exists('load_all_defs')) require_once __DIR__ . '/../alldata.php';
    $defs = load_all_defs();

    // Minimal state til at udlede ejer/locking
    $loadState = function(PDO $db, int $uid): array {
        $state = ['bld'=>[], 'add'=>[], 'rsd'=>[], 'research'=>[]];
        try {
            $st = $db->prepare("SELECT bld_id FROM buildings WHERE user_id = ?");
            $st->execute([$uid]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) $state['bld'][(string)$id] = true;
        } catch (Throwable $e) {}
        try {
            $st = $db->prepare("SELECT add_id FROM addons WHERE user_id = ?");
            $st->execute([$uid]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $id) $state['add'][(string)$id] = true;
        } catch (Throwable $e) {}
        try {
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

    // Byg state til buffmotor: flet evt. userSummary (fra frontend eller egen serverside-genberegning)
    $stateForBuffs = $userState;
    if ($clientUserSummary && is_array($clientUserSummary)) {
        // Trusted server-side only for buff-evaluering; undgå at gemme direkte i DB
        $stateForBuffs['user'] = $clientUserSummary;
    } else {
        // Fallback: ingen user-summary; stats-buffs udebliver (bedre end forkerte tal fra DB).
        // Hvis du ønsker 100% serverside, flyt aldata’s statsberegning til en genbrugelig helper
        // og kald den her for at sætte $stateForBuffs['user'] = ['popularity_percentage'=>..., 'happiness_percentage'=>..., 'stage'=>...]
        $stateForBuffs['user'] = [];
    }

    // Saml aktive buffs (defs + stats) — robust helper hvis tilgængelig
    if (!function_exists('collect_active_buffs')) require_once __DIR__ . '/buffs.php';
    $activeBuffs = [];
    if (function_exists('yield__collect_active_buffs')) {
        $activeBuffs = yield__collect_active_buffs($defs, $stateForBuffs, time());
    } else {
        // fallback til defs (uden stats)
        $activeBuffs = collect_active_buffs($defs, $userState, time());
        // Hvis compute_stats_buffs findes og vi har summary, kan vi flette manuelt
        if (function_exists('compute_stats_buffs') && !empty($stateForBuffs['user'])) {
            try {
                $statBuffs = compute_stats_buffs($stateForBuffs['user']);
                if (is_array($statBuffs) && $statBuffs) $activeBuffs = array_merge($activeBuffs, $statBuffs);
            } catch (Throwable $e) {}
        }
    }

    // Helpers til pris
    $toAssoc = function(array $costRows): array {
        $assoc = [];
        foreach ($costRows as $row) {
            $rid = (string)($row['id'] ?? $row['res'] ?? $row['res_id'] ?? '');
            $amt = (float)($row['amount'] ?? 0);
            if ($rid === '' || $amt <= 0) continue;
            $rid = str_starts_with($rid, 'res.') || str_starts_with($rid, 'ani.') ? $rid : ('res.' . $rid);
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

    // Action mapping så buffs matcher dine regler
    $inferAction = function(string $id, string $scope) {
        if ($scope === 'research' || str_starts_with($id, 'rsd.')) return 'research';
        if ($scope === 'recipe'  || str_starts_with($id, 'rcp.')) return 'production';
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
        $animalCosts = [];
        $resourceCostsRows = [];
        foreach ($allCostsRows as $c) {
            $rid = (string)($c['res_id'] ?? '');
            if ($rid !== '' && str_starts_with($rid, 'ani.')) $animalCosts[] = $c;
            else $resourceCostsRows[] = $c;
        }

        if (!empty($animalCosts)) {
            spend_resources($db, $userId, $animalCosts);
            $insLock = $db->prepare("INSERT INTO resource_locks (user_id, scope, scope_id, res_id, amount, locked_at)
                                     VALUES (?, 'recipe', ?, ?, ?, UTC_TIMESTAMP())");
            foreach ($animalCosts as $a) {
                $insLock->execute([$userId, $reqId, (string)$a['res_id'], (float)$a['amount']]);
            }
        }

        $resourceAssoc = $toAssoc($resourceCostsRows);
        $buffedAssoc   = apply_cost_buffs($resourceAssoc, $reqId, $activeBuffs);
        $buffedRows    = $fromAssoc($buffedAssoc);
        if (!empty($buffedRows)) {
            lock_costs_or_throw($db, $userId, $buffedRows, 'recipe', $reqId);
        }

        $action = $inferAction($reqId, 'recipe'); // => 'production'
        $duration_s = apply_speed_buffs($baseDuration, $action, $reqId, $activeBuffs);

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
        } else {
            $key = preg_replace('~^bld\.~i', '', $reqId);
            $def = $defs['bld'][$key] ?? null;
            if(!$def) throw new Exception('Unknown building: ' . $reqId);
            if (!function_exists('canonical_bld_id')) require_once __DIR__ . '/../alldata.php';
            $itemId = canonical_bld_id($key);
        }

        // (durability checks uændret – udeladt her for korthed)

        $dupStmt = $db->prepare("SELECT id FROM build_jobs WHERE user_id = ? AND bld_id = ? AND state = 'running' LIMIT 1 FOR UPDATE");
        $dupStmt->execute([$userId, $itemId]);
        if ($dupStmt->fetchColumn()) throw new Exception('Job already running for ' . $itemId);

        $baseDuration = (int)($def['duration_s'] ?? 10);
        $baseCostRows = normalize_costs($def['cost'] ?? []);
        $baseAssoc    = $toAssoc($baseCostRows);
        $buffedAssoc  = apply_cost_buffs($baseAssoc, $itemId, $activeBuffs);
        $buffedRows   = $fromAssoc($buffedAssoc);
        if (!empty($buffedRows)) {
            lock_costs_or_throw($db, $userId, $buffedRows, $scopeIn, $itemId);
        }

        $action = $inferAction($itemId, $scopeIn); // 'build'|'upgrade'|'research'
        $duration_s = apply_speed_buffs($baseDuration, $action, $itemId, $activeBuffs);

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
        'locked_costs'  => $costsToReturn,
    ]);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}