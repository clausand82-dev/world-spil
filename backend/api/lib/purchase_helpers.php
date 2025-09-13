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

/** Canonical res-id: "res.wood" (tiltager "res." hvis mangler) */
function canonical_res_id(string $rid): string {
  $rid = trim($rid);
  if ($rid === '') return '';
  return str_starts_with($rid, 'res.') ? $rid : ('res.' . $rid);
}

/** Alternativ res-id (den modsatte variant) — bruges ved læsning fra gamle rækker */
function alt_res_id(string $rid): string {
  return str_starts_with($rid, 'res.') ? substr($rid, 4) : ('res.' . $rid);
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

/** Læs hvor meget der er i inventory for et givent res-id
 *  - Tolerant ift. "res.wood" og "wood"
 *  - Vælg evt. tabel efter din egen konvention (her simpel heuristic)
 */
function read_inventory_amount(PDO $db, int $userId, string $resId): float {
  $rid1 = canonical_res_id($resId);
  $rid2 = alt_res_id($resId);

  /*
  // Tilpas evt. din egen heuristic for "liquid" vs "solid"
  $isLiquid = str_starts_with($rid1, 'res.water') || str_starts_with($rid1, 'res.liquid');*/

$stmt = $db->prepare(
      "SELECT COALESCE(SUM(amount),0) AS s
         FROM inventory
        WHERE user_id = ?
          AND res_id IN (?, ?)");

  /*if ($isLiquid) {
    $stmt = $db->prepare(
      "SELECT COALESCE(SUM(amount),0) AS s
         FROM inventory_liquid
        WHERE user_id = ?
          AND res_id IN (?, ?)"
    );
  } else {
    $stmt = $db->prepare(
      "SELECT COALESCE(SUM(amount),0) AS s
         FROM inventory_solid
        WHERE user_id = ?
          AND res_id IN (?, ?)"
    );
  }*/
  $stmt->execute([$userId, $rid1, $rid2]);
  return (float)$stmt->fetchColumn();
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

/** Lås (escrow) costs — fejler hvis der ikke er nok frie ressourcer
 *  - Validerer først alle linjer; hvis OK, opretter låse med canonical res-id'er
 */
function lock_costs_or_throw(PDO $db, int $userId, array $costs, string $scope, string $scopeId): void {
  // Validér alle linjer først
  foreach ($costs as $c) {
    $rawId = (string)($c['res_id'] ?? $c['id'] ?? '');
    $amt   = (float)($c['amount'] ?? $c['qty'] ?? 0);
    if ($rawId === '' || $amt <= 0) throw new Exception('Bad cost row');

    $have   = read_inventory_amount($db, $userId, $rawId);
    $locked = sum_locked($db, $userId, $rawId);

    if ( ($have - $locked) < $amt ) {
      throw new Exception("Not enough resources for " . canonical_res_id($rawId));
    }
  }

  // Opret låse (canonical res-id)
  $ins = $db->prepare(
    "INSERT INTO resource_locks (user_id, scope, scope_id, res_id, amount, locked_at)
     VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)"
  );
  foreach ($costs as $c) {
    $rawId = (string)($c['res_id'] ?? $c['id'] ?? '');
    $amt   = (float)($c['amount'] ?? $c['qty'] ?? 0);
    $ins->execute([$userId, $scope, $scopeId, canonical_res_id($rawId), $amt]);
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
  // 1) Markér alle relevante låse som consumed (samme scope/scopeId)

  $stmt = $db->prepare(
    "UPDATE resource_locks
        SET consumed_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND scope    = ?
        AND scope_id = ?
        AND released_at IS NULL
        AND consumed_at IS NULL"
  );
  $stmt->execute([$userId, $scope, $scopeId]);

  // Hvis listen er tom (fx ved ældre jobs), kan vi falde tilbage til at samle fra locks.
  // Men *helst* brug den medfølgende $lockedCosts (det matcher præcis det, der blev låst).
  if (empty($lockedCosts)) {
    $q = $db->prepare(
      "SELECT res_id, SUM(amount) AS amount
         FROM resource_locks
        WHERE user_id = ?
          AND scope    = ?
          AND scope_id = ?
          AND released_at IS NULL
          AND consumed_at IS NOT NULL
        GROUP BY res_id"
    );
    $q->execute([$userId, $scope, $scopeId]);
    $lockedCosts = $q->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }

  // 2) Bogfør minus i inventory
  //    Brug samme heuristik som read_inventory_amount:
  //    Liquid hvis id starter med 'res.water' eller 'res.liquid', ellers solid.
  $updRes = $db->prepare(
    "UPDATE inventory
        SET amount = GREATEST(0, amount - ?)
      WHERE user_id = ? AND res_id IN (?, ?)");
  
  /*$updSolid = $db->prepare(
    "UPDATE inventory_solid
        SET amount = GREATEST(0, amount - ?)
      WHERE user_id = ? AND res_id IN (?, ?)"
  );
  $updLiquid = $db->prepare(
    "UPDATE inventory_liquid
        SET amount = GREATEST(0, amount - ?)
      WHERE user_id = ? AND res_id IN (?, ?)"
  );*/

  // Evt. opret 0-rækker, hvis de ikke findes (burde normalt ikke være nødvendigt,
  // fordi lock_costs_or_throw har valideret beholdning, men det gør funktionen robust).
  $insRes = $db->prepare(
    "INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, 0)"
  );
  
  /*
  $insSolid = $db->prepare(
    "INSERT INTO inventory_solid (user_id, res_id, amount) VALUES (?, ?, 0)"
  );
  $insLiquid = $db->prepare(
    "INSERT INTO inventory_liquid (user_id, res_id, amount) VALUES (?, ?, 0)"
  );*/

  foreach ($lockedCosts as $row) {
    $ridRaw = (string)($row['res_id'] ?? $row['id'] ?? '');
    $amt    = (float)($row['amount'] ?? $row['qty'] ?? 0);
    if ($ridRaw === '' || $amt <= 0) continue;

    $rid1 = canonical_res_id($ridRaw);
    $rid2 = alt_res_id($ridRaw);

    //$isLiquid = str_starts_with($rid1, 'res.water') || str_starts_with($rid1, 'res.liquid');

    $updRes->execute([$amt, $userId, $rid1, $rid2]);
      if ($updRes->rowCount() === 0) {
        // Forsøg at oprette en 0-række og prøv igen
        try { $insRes->execute([$userId, $rid1]); } catch (\Throwable $e) {  }
        $updRes->execute([$amt, $userId, $rid1, $rid2]);}

    /*
    if ($isLiquid) {
      $updLiquid->execute([$amt, $userId, $rid1, $rid2]);
      if ($updLiquid->rowCount() === 0) {
        // Forsøg at oprette en 0-række og prøv igen
        try { $insLiquid->execute([$userId, $rid1]); } catch (\Throwable $e) {  }
        $updLiquid->execute([$amt, $userId, $rid1, $rid2]);
      }
    } else {
      $updSolid->execute([$amt, $userId, $rid1, $rid2]);
      if ($updSolid->rowCount() === 0) {
        try { $insSolid->execute([$userId, $rid1]); } catch (\Throwable $e) {  }
        $updSolid->execute([$amt, $userId, $rid1, $rid2]);
      }
    }*/
  }
}




/* ================================
   Defs/price normalisering
================================= */

/** Normaliser en pris-liste til [{res_id, amount}, ...] */
function normalize_costs(array $in): array {
  $out = [];
  foreach ($in as $row) {
    $rid = $row['res_id'] ?? $row['id'] ?? $row['resource'] ?? null;
    $amt = $row['amount'] ?? $row['qty'] ?? $row['value'] ?? null;
    if ($rid && $amt !== null) $out[] = ['res_id' => canonical_res_id((string)$rid), 'amount' => (float)$amt];
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
 * Krediterer ressourcer til den SAMLEDE inventory-tabel.
 */
function credit_resources(PDO $db, int $userId, array $list): void {
    if (empty($list)) return;
    $stmt = $db->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)");
    foreach ($list as $row) {
        $resId = $row['res_id'] ?? null;
        $amount = (float)($row['amount'] ?? 0);
        if ($resId && $amount > 0) {
            $stmt->execute([$userId, canonical_res_id($resId), $amount]);
        }
    }
}


/**
 * Fjerner ressourcer fra spillerens beholdning.
 * Nu med korrekt SQL og validering.
 */
function spend_resources(PDO $db, int $userId, array $costs): void {
    if (empty($costs)) return;

    if (!function_exists('load_all_defs')) {
        require_once __DIR__ . '/../api/alldata.php';
    }
    $defs = load_all_defs();
    
    // Valider først
    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountNeeded = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountNeeded <= 0) continue;
        
        $currentAmount = read_inventory_amount($db, $userId, $resId); // Bruger din eksisterende, robuste funktion
        if ($currentAmount < $amountNeeded) {
            throw new Exception("Not enough resources for {$resId}. Required: {$amountNeeded}, Have: {$currentAmount}");
        }
    }

    // Træk ressourcer fra bagefter
    foreach ($costs as $cost) {
        $resId = $cost['res_id'] ?? null;
        $amountToSpend = (float)($cost['amount'] ?? 0);
        if (!$resId || $amountToSpend <= 0) continue;
        
        $key = preg_replace('/^res\./', '', $resId);
        $unit = strtolower((string)($defs['res'][$key]['unit'] ?? ''));
        $table = ($unit === 'l') ? 'inventory_liquid' : 'inventory_solid';

        $stmtUpdate = $db->prepare("UPDATE {$table} SET amount = GREATEST(0, amount - ?) WHERE user_id = ? AND res_id = ?");
        $stmtUpdate->execute([$amountToSpend, $userId, $resId]);
    }
}

