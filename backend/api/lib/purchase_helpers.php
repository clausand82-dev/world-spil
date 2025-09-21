<?php
declare(strict_types=1);

/**
 * purchase_helpers.php
 * - Canonical id-hjælpere for res- og building-id'er
 * - Inventory/locks helpers
 * - Købs-flow helpers
 *
 * VIGTIGT:
 *  - Bygninger skal konsekvent bruge id-formatet "bld.<family>.lN" i DB og i deltas/state.
 *  - Hvis noget indkommende id er uden "bld." (fx "tent.l1"), canonicaliserer vi det med det samme.
 */

/* ================================
   ID-kanonisering (ressourcer)
================================= */

/**
 * Canonical res-id: "res.wood" (tilføjer "res." hvis mangler)
 */
function canonical_res_id(string $rid): string {
  $rid = trim($rid);
  if ($rid === '') return '';
  return str_starts_with($rid, 'res.') ? $rid : ('res.' . $rid);
}

/** Alternativ res-id (modsatte variant) — bruges ved læsning fra gamle rækker */
function alt_res_id(string $rid): string {
  return str_starts_with($rid, 'res.') ? substr($rid, 4) : ('res.' . $rid);
}

/** Valgfrit, men nyttigt andre steder i koden */
function is_liquid_res(string $resId): bool {
  $rid = strtolower(canonical_res_id($resId));
  return str_starts_with($rid, 'res.water') || str_starts_with($rid, 'res.oil');
}

/* ================================
   ID-kanonisering (buildings)
================================= */

/** Canonical building-id: "bld.<family>.lN"
 *  - Hvis input er "tent.l1" → "bld.tent.l1"
 *  - Hvis input allerede er "bld.tent.l1" → samme retur
 */
function canonical_bld_id(string $id): string {
  $id = trim($id);
  if ($id === '') return '';
  return str_starts_with($id, 'bld.') ? $id : ('bld.' . $id);
}

/** Parse building-id til [family, level] — accepterer med/uden "bld." */
function parse_bld_id(string $id): array {
  $s = trim($id);
  if (preg_match('/^(?:bld\.)?(.+)\.l(\d+)$/i', $s, $m)) {
    return [$m[1], (int)$m[2]]; // family, level
  }
  return ['', 0];
}

/* ================================
   Inventory / resource locks
================================= */

/**
 * Læser en spillers beholdning fra den korrekte tabel (inventory eller animals).
 */
function read_inventory_amount(PDO $db, int $userId, string $resId): float {
  // Dyr håndteres i separat tabel
  if (str_starts_with($resId, 'ani.')) {
    $stmt = $db->prepare("SELECT quantity FROM animals WHERE user_id = ? AND ani_id = ?");
    $stmt->execute([$userId, $resId]);
    return (float)($stmt->fetchColumn() ?: 0.0);
  }

  // Ressourcer: læs fra den samlede 'inventory'-tabel
  $ridWith  = canonical_res_id($resId); // fx 'res.wood'
  $ridPlain = alt_res_id($resId);       // fx 'wood'

  // Brug SUM for robusthed, hvis begge varianter findes
  $stmt = $db->prepare("
    SELECT COALESCE(SUM(amount), 0)
    FROM inventory
    WHERE user_id = ?
      AND res_id IN (?, ?)
    LIMIT 1
  ");
  $stmt->execute([$userId, $ridWith, $ridPlain]);
  return (float)($stmt->fetchColumn() ?: 0.0);
}

/** Summér låst mængde for et res-id (aktiv lås = hverken released eller consumed) */
function sum_locked(PDO $db, int $userId, string $resId): float {
  $rid1 = canonical_res_id($resId);
  $rid2 = alt_res_id($resId);

  $stmt = $db->prepare(
    "SELECT COALESCE(SUM(amount),0) AS s
       FROM resource_locks
      WHERE user_id = ?
        AND res_id IN (?, ?)
        AND released_at IS NULL
        AND consumed_at IS NULL"
  );
  $stmt->execute([$userId, $rid1, $rid2]);
  return (float)$stmt->fetchColumn();
}

/**
 * Låser ressourcer/dyr. Bruger nu den opdaterede `read_inventory_amount`.
 */
function lock_costs_or_throw(PDO $db, int $userId, array $costs, string $scope, string $scopeId): void {
    if (empty($costs)) return;

    // Trin 1: Valider alle omkostninger FØR vi indsætter noget.
    foreach ($costs as $c) {
        $rawId = (string)($c['res_id'] ?? '');
        $amt   = (float)($c['amount'] ?? 0);
        if ($rawId === '' || $amt <= 0) continue;

        // Denne funktion kan håndtere både `res.*` og `ani.*` korrekt.
        $have   = read_inventory_amount($db, $userId, $rawId);
        
        // Dyr kan ikke være låst af ANDRE jobs, men vi tjekker for en sikkerheds skyld.
        // `sum_locked` virker kun for `res.*`, hvilket er OK, da dyr ikke bør være låst.
        $locked = sum_locked($db, $userId, $rawId);

        if (($have - $locked) < $amt) {
            throw new Exception("Not enough of {$rawId}. Required: {$amt}, Have: {$have}");
        }
    }

    // Trin 2: Opret låse for ALLE omkostningstyper (både res.* og ani.*)
    $ins = $db->prepare(
        "INSERT INTO resource_locks (user_id, scope, scope_id, res_id, amount, locked_at)
         VALUES (?,?,?,?,?,UTC_TIMESTAMP())"
    );
    foreach ($costs as $c) {
        $rawId = (string)($c['res_id'] ?? '');
        $amt   = (float)($c['amount'] ?? 0);
        
        if ($rawId !== '' && $amt > 0) {
            // Vi bruger $rawId direkte (f.eks. "ani.cow"), da det er det, vi validerer mod.
            $ins->execute([$userId, $scope, $scopeId, $rawId, $amt]);
        }
    }
}

/** Frigør alle aktive låse for dette scope/scopeId (100% refund ved cancel) */
function release_locked_costs(PDO $db, int $userId, string $scope, string $scopeId): void {

  $stmt = $db->prepare(
    "UPDATE resource_locks
        SET released_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND scope = ?
        AND scope_id = ?
        AND released_at IS NULL
        AND consumed_at IS NULL"
  );


  $stmt->execute([$userId, $scope, $scopeId]);
}

/**
 * Forbrug de låste ressourcer endeligt:
 *  1) Markér låsene som "consumed"
 *  2) Bogfør et varigt minus i inventory-tabellerne
 *
 * @param array $lockedCosts  Liste i stil med [{res_id:"res.wood", amount:10}, ...]
 *                            (typisk json_decoded fra build_jobs.locked_costs_json)
 */
function spend_locked_costs(PDO $db, int $userId, array $lockedCosts, string $scope, string $scopeId): void {
    if (empty($lockedCosts)) return;

    // Trin 1: Træk de forbrugte items fra de korrekte tabeller
    $stmtInventory = $db->prepare("UPDATE inventory SET amount = GREATEST(0, amount - ?) WHERE user_id = ? AND res_id = ?");
    $stmtAnimals = $db->prepare("UPDATE animals SET quantity = GREATEST(0, quantity - ?) WHERE user_id = ? AND ani_id = ?");

    foreach ($lockedCosts as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountToSpend = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountToSpend <= 0) continue;

        if (str_starts_with($resId, 'ani.')) {
            $stmtAnimals->execute([$amountToSpend, $userId, $resId]);
        } else {
            // Sørg for at ID'et er kanonisk for inventory-tabellen
            $canonicalId = str_starts_with($resId, 'res.') ? $resId : 'res.' . $resId;
            $stmtInventory->execute([$amountToSpend, $userId, $canonicalId]);
        }
    }

    // Trin 2: Marker låsene som 'consumed'
    $stmtLocks = $db->prepare(
        "UPDATE resource_locks
         SET consumed_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND scope = ? AND scope_id = ? AND consumed_at IS NULL"
    );
    $stmtLocks->execute([$userId, $scope, $scopeId]);
}




/* ================================
   Defs/price normalisering
================================= */

/** Normaliser en pris-liste til [{res_id, amount}, ...] */
function normalize_costs($raw): array {
    if (!$raw) return [];
    $out = [];
    if (is_array($raw)) {
        foreach ($raw as $row) {
            if (!is_array($row)) continue;
            
            $rid = $row['res_id'] ?? $row['id'] ?? $row['res'] ?? null;
            $amt = $row['amount'] ?? $row['qty'] ?? null;
            if ($rid === null || $amt === null) continue;
            
            $idStr = strtolower((string)$rid);

            // Her er den vigtige logik:
            // Hvis ID'et allerede starter med 'ani.', lad det være.
            // Ellers, sørg for at det starter med 'res.'.
            if (str_starts_with($idStr, 'ani.')) {
                // Gør ingenting, det er allerede korrekt
            } else if (!str_starts_with($idStr, 'res.')) {
                $idStr = 'res.' . $idStr;
            }

            $out[] = ['res_id' => $idStr, 'amount' => (float)$amt];
        }
    }
    return $out;
}

/* ================================
   Købs-funktion (building)
================================= */

/**
 * backend_purchase_building
 * - Modtager evt. "løst" id (fx "tent.l1"), canonicaliserer til "bld.tent.l1"
 * - Sikrer at brugeren ikke allerede ejer det target
 * - Skriv i din egen "user owns buildings"-struktur (afhænger af dit schema)
 * - Returnerer delta med det canonical id, så frontend sætter state.bld korrekt
 */
function backend_purchase_building(PDO $db, int $userId, string $rawBldId): array {
  // Canonical id og parse (family + level)
  $bldId = canonical_bld_id($rawBldId);            // "bld.family.lN"
  [$family, $lvl] = parse_bld_id($bldId);
  if ($family === '' || $lvl <= 0) {
    throw new Exception("Invalid building id: " . $rawBldId);
  }

  // Mønster for "samme serie" (alle levels for samme family)
  $likeSeries = 'bld.' . $family . '.l%';

  // Find evt. eksisterende række for samme serie (én instans-politik)
  $sel = $db->prepare("SELECT id, bld_id, level FROM buildings WHERE user_id=? AND bld_id LIKE ? ORDER BY level DESC LIMIT 1");
  $sel->execute([$userId, $likeSeries]);
  $row = $sel->fetch(PDO::FETCH_ASSOC);

  if ($row) {
    // Der findes allerede en instans for serien → OPDATER den eksisterende række
    $idExisting = (int)$row['id'];

    // (Defensivt) ryd evt. andre dubletter i samme serie (hvis data historisk har flere rækker)
    $del = $db->prepare("DELETE FROM buildings WHERE user_id=? AND bld_id LIKE ? AND id <> ?");
    $del->execute([$userId, $likeSeries, $idExisting]);

    // Opdater til nyt level + id
    $upd = $db->prepare("UPDATE buildings SET bld_id=?, level=? WHERE id=?");
    $upd->execute([$bldId, $lvl, $idExisting]);

  } else {
    // Ingen instans endnu for serien → Opret første række
    $ins = $db->prepare("INSERT INTO buildings (user_id, bld_id, level, created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)");
    $ins->execute([$userId, $bldId, $lvl]);
  }

  // Returnér delta i canonical format — frontend opdaterer state.bld med det nye id
  return [
    'resources' => null, // ingen ekstra minus ved complete (låsen blev forbrugt allerede)
    'buildings' => [
      [
        'id'     => $bldId,     // ← "bld.family.lN" matcher nu også rækken i DB
        'bld_id' => $bldId,
        'level'  => $lvl
      ]
    ]
  ];
}

function backend_purchase_addon(PDO $db, int $userId, string $addIdFull): array
{
    $s = trim($addIdFull);
    if ($s === '' || !preg_match('~^add\.(.+)\.l(\d+)$~i', $s, $m)) {
        throw new InvalidArgumentException('Bad addon id: ' . $addIdFull);
    }
    $series = $m[1];         // fx "bedding"
    $lvl    = max(1, (int)$m[2]);

    // Forsøg at finde eksisterende række for samme serie (uanset level)
    $likeSeries = 'add.' . $series . '.l%';
    $sel = $db->prepare("SELECT id, add_id, level, active FROM addon WHERE user_id=? AND add_id LIKE ? LIMIT 1");
    $sel->execute([$userId, $likeSeries]);
    $row = $sel->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        // Opgrader eksisterende række (samme serie)
        $idExisting = (int)$row['id'];
        $curLevel   = (int)$row['level'];
        $newLevel   = max($curLevel, $lvl);
        $newId      = 'add.' . $series . '.l' . $newLevel;

        $upd = $db->prepare("UPDATE addon SET add_id=?, level=?, active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?");
        $upd->execute([$newId, $newLevel, $idExisting]);

        $resultId = $newId;
        $resultLv = $newLevel;
    } else {
        // Første level i serien → indsæt

        $ins = $db->prepare("INSERT INTO addon (user_id, add_id, level, active, last_yield_at, created_at) VALUES (?, ?, ?, 1, NULL, CURRENT_TIMESTAMP)");
        $ins->execute([$userId, $addIdFull, $lvl]);
        $resultId = $addIdFull;
        $resultLv = $lvl;
    }

    // Delta: peg på state.add[resultId] = { level, active:1 }
    return [
        'addons' => [
            [ 'id' => $resultId, 'level' => $resultLv, 'active' => 1 ]
        ],
        'state'  => [
            'add' => [
                $resultId => [ 'level' => $resultLv, 'active' => 1 ]
            ]
        ]
    ];
}

/**
 * Skriv/opforsk research ved completion.
 * - $rsdIdFull: "rsd.<serie>.lN"
 * - Opgraderer eksisterende række for samme serie (rsd_id og level), eller indsætter ny hvis ikke findes.
 * Returnerer lille delta, så frontend kan opdatere uden reload.
 */
function backend_purchase_research(PDO $db, int $userId, string $rsdIdFull): array {
    // Parse "rsd.xxx.yyy.lN" -> serie + level
    if (!preg_match('~^rsd\.((?:[^.]+(?:\.[^.]+)*)?)\.l(\d+)$~i', $rsdIdFull, $m)) {
        throw new RuntimeException("Invalid research id");
    }
    $series = $m[1];                       // fx "construction"
    $level  = intval($m[2]);

    // Find evt. eksisterende række for serien (uanset tidligere level)
    $sqlSel = "SELECT id, rsd_id, level FROM research
               WHERE user_id = :uid AND rsd_id LIKE :pref
               ORDER BY level DESC LIMIT 1";
    $stSel = $db->prepare($sqlSel);
    $stSel->execute([
        ':uid'  => $userId,
        ':pref' => "rsd.$series.l%",
    ]);
    $row = $stSel->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        // Opgradér eksisterende række til nyt id/level
        $sqlUp = "UPDATE research
                  SET rsd_id = :rid, level = :lvl
                  WHERE id = :id";
        $stUp = $db->prepare($sqlUp);
        $stUp->execute([
            ':rid' => $rsdIdFull,
            ':lvl' => $level,
            ':id'  => $row['id'],
        ]);
    } else {
        // Indsæt ny række
        $sqlIns = "INSERT INTO research (user_id, rsd_id, level, status)
                   VALUES (:uid, :rid, :lvl, 0)";
        $stIns = $db->prepare($sqlIns);
        $stIns->execute([
            ':uid' => $userId,
            ':rid' => $rsdIdFull,
            ':lvl' => $level,
        ]);
    }

    // Byg et skånsomt delta. Din applyDelta understøtter i forvejen 'research.completed'.
    return [
        'research' => [
            'completed' => [ $rsdIdFull ],
        ],
    ];
}

// ANDEN NYE FUNKTION: backend_complete_recipe
/**
 * Fuldfører et "recipe" job.
 * RETTET: Bruger nu `normalize_costs` og den nye `credit_resources`.
 */
function backend_complete_recipe(PDO $db, int $userId, string $rcpIdFull, array $defs): array {
    $key = preg_replace('~^rcp\.~i', '', $rcpIdFull);
    $def = $defs['rcp'][$key] ?? null;
    if (!$def) {
        error_log("Warning: Unknown recipe definition for ID: " . $rcpIdFull);
        return [];
    }

    // RETTET: Bruger din eksisterende `normalize_costs` funktion.
    $yield = normalize_costs($def['yield'] ?? []);
    
    if (!empty($yield)) {
        // RETTET: Bruger den nye `credit_resources` funktion.
        credit_resources($db, $userId, $yield);
    }

    $delta = ['resources' => []];
    foreach ($yield as $y) {
        $resId = $y['res_id'];
        $amount = (float)$y['amount'];
        $delta['resources'][$resId] = ($delta['resources'][$resId] ?? 0) + $amount;
    }
    
    return $delta;
}

/**
 * Krediterer ressourcer til den korrekte tabel (inventory eller animals).
 */
function credit_resources(PDO $db, int $userId, array $list): void {
    if (empty($list)) return;

    $stmtInventory = $db->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?");
    $stmtAnimals = $db->prepare("INSERT INTO animals (user_id, ani_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?");

    foreach ($list as $row) {
        $resId = $row['res_id'] ?? null;
        $amount = (float)($row['amount'] ?? 0);
        if (!$resId || $amount <= 0) continue;
        
        if (str_starts_with($resId, 'ani.')) {
            $stmtAnimals->execute([$userId, $resId, $amount, $amount]);
        } else {
            // Sørg for at ID'et er kanonisk (starter med res.)
            $canonicalId = str_starts_with($resId, 'res.') ? $resId : 'res.' . $resId;
            $stmtInventory->execute([$userId, $canonicalId, $amount, $amount]);
        }
    }
}

/**
 * Fjerner ressourcer fra den korrekte tabel (inventory eller animals) efter validering.
 */
function spend_resources(PDO $db, int $userId, array $costs): void {
    if (empty($costs)) return;

    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountNeeded = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountNeeded <= 0) continue;

        if (str_starts_with($resId, 'ani.')) {
            $stmtCheck = $db->prepare("SELECT quantity FROM animals WHERE user_id = ? AND ani_id = ?");
            $stmtCheck->execute([$userId, $resId]);
            $currentAmount = (float)($stmtCheck->fetchColumn() ?: 0.0);
        } else {
            $currentAmount = read_inventory_amount($db, $userId, $resId);
        }

        if ($currentAmount < $amountNeeded) {
            throw new Exception("Not enough of {$resId}. Required: {$amountNeeded}, Have: {$currentAmount}");
        }
    }

    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountToSpend = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountToSpend <= 0) continue;

        if (str_starts_with($resId, 'ani.')) {
            $stmtUpdate = $db->prepare("UPDATE animals SET quantity = GREATEST(0, quantity - ?) WHERE user_id = ? AND ani_id = ?");
            $stmtUpdate->execute([$amountToSpend, $userId, $resId]);
        } else {
            $stmtUpdate = $db->prepare("UPDATE inventory SET amount = GREATEST(0, amount - ?) WHERE user_id = ? AND res_id = ?");
            $stmtUpdate->execute([$amountToSpend, $userId, $resId]);
        }
    }
}

