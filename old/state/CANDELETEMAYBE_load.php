<?php
declare(strict_types=1);

/**
 * backend/api/state/load.php
 *
 * Formål:
 *  - Returnér spillerens aktuelle "state" til UI.
 *  - Hvis INGEN session: returnér en gæste-/demo-state (så UI altid kan vises).
 *  - Hvis session: læs brugerens world/map/field/x/y/multipliers fra DB (users).
 *  - Ressourcer/owned/research er stadig demo indtil vi laver rigtige tabeller.
 *
 * Output (JSON):
 *   { ok:true, data:{ player:{...}, session:{...}, res:{...}, owned:{...}, research:{...}, footprint:{...}, animalCap:{...} } }
 */

require_once __DIR__ . '/../../lib/utils.php';   // json_ok/json_err
require_once __DIR__ . '/../../lib/auth.php';    // current_user_id()
require_once __DIR__ . '/../../lib/db.php';      // db()

// --- (1) Tjek session -----------------------------------------------------------
//  - Vi kræver IKKE login her, for at UI kan tegne uden 401.
//  - Hvis ingen bruger: vi leverer en "guest"-state.
//  - Hvis der er en bruger: vi henter deres felter fra DB.

$uid = current_user_id(); // kan returnere dev_force_user hvis sat i config.ini

// --- (2) Basis-state (deles af guest og login) ---------------------------------
$baseRes = [
    "res.water" => 245,
    "res.oil"   => 12,
    "res.milk"  => 8,
    "res.grain" => 156,
    "res.wood"  => 315,
    "res.stone" => 34,
    "res.iron"  => 7,
    "res.food"  => 23,
    "res.money" => 1250
];

// Owned buildings (demo)
$baseOwned = [ "bld" => [ "bld.farm.l2" => true, "bld.barn.l1" => true ] ];

// Research (demo – agri.adv fuldført)
$baseResearch = [ "rsd.agri.adv" => true ];

// Caps (demo)
$baseFootprint = [ "used" => 18, "total" => 40 ];
$baseAnimalCap = [ "used" => 3,  "total" => 10 ];

// --- (3) Hvis IKKE logget ind → returnér guest-state ----------------------------
if (!$uid) {
    json_ok([
        "player"    => [ "code"=>"Guest", "world"=>null, "map"=>null, "field"=>null, "x"=>null, "y"=>null ],
        "session"   => [ "loggedIn"=>false, "userId"=>null ],
        "res"       => $baseRes,
        "owned"     => $baseOwned,
        "research"  => $baseResearch,
        "footprint" => $baseFootprint,
        "animalCap" => $baseAnimalCap,
    ]);
}

// --- (4) Logget ind → læs users-rækken -----------------------------------------
try {
    $pdo  = db();
    $stmt = $pdo->prepare("
        SELECT
          u.username,
          u.world_nr, u.map_nr, u.field_nr,
          u.x_coord, u.y_coord,
          u.mul_water, u.mul_wood, u.mul_grain, u.mul_mining
        FROM users u
        WHERE u.user_id = ?
        LIMIT 1
    ");
    $stmt->execute([ (int)$uid ]);
    $row = $stmt->fetch();
    if (!$row) {
        // Session peger på en bruger, der ikke findes → svar som guest, men med loggedIn=true=false for tydeligt fejlfix senere
        json_ok([
            "player"    => [ "code"=>"Unknown", "world"=>null, "map"=>null, "field"=>null, "x"=>null, "y"=>null ],
            "session"   => [ "loggedIn"=>false, "userId"=>null ],
            "res"       => $baseRes,
            "owned"     => $baseOwned,
            "research"  => $baseResearch,
            "footprint" => $baseFootprint,
            "animalCap" => $baseAnimalCap,
        ]);
    }

    // Byg player-objekt – behold simple int-felter, UI viser dem fint.
    $player = [
        "code"  => (string)$row['username'],             // vis brugernavn i topbaren
        "world" => is_null($row['world_nr']) ? null : (int)$row['world_nr'],
        "map"   => is_null($row['map_nr'])   ? null : (int)$row['map_nr'],
        "field" => is_null($row['field_nr']) ? null : (int)$row['field_nr'],
        "x"     => is_null($row['x_coord'])  ? null : (int)$row['x_coord'],
        "y"     => is_null($row['y_coord'])  ? null : (int)$row['y_coord'],
        // Vi kan også sende multipliers i player-delen (valgfrit – UI bruger dem senere)
        "multipliers" => [
            "water" => is_null($row['mul_water'])  ? 1.00 : (float)$row['mul_water'],
            "wood"  => is_null($row['mul_wood'])   ? 1.00 : (float)$row['mul_wood'],
            "grain" => is_null($row['mul_grain'])  ? 1.00 : (float)$row['mul_grain'],
            "stone" => is_null($row['mul_mining']) ? 1.00 : (float)$row['mul_mining'],
        ],
    ];

    // TODO (senere): læs rigtige ressourcer/owned/research fra deres tabeller.
    // Indtil da: returnér demo-data, så UI fungerer.
    json_ok([
        "player"    => $player,
        "session"   => [ "loggedIn"=>true, "userId"=>(int)$uid ],
        "res"       => $baseRes,
        "owned"     => $baseOwned,
        "research"  => $baseResearch,
        "footprint" => $baseFootprint,
        "animalCap" => $baseAnimalCap,
    ]);

} catch (Throwable $e) {
    json_err('E_STATE', 'Could not load state: ' . $e->getMessage(), 500);
}
