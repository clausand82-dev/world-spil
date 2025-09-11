<?php
declare(strict_types=1);

/**
 * backend/api/defs/all.php
 *
 * Formål:
 *  - Returnér en samlet "definitions-bundle" som frontend kan bruge til at tegne UI.
 *  - Lige nu: hardcodet DEMO-indhold (samme struktur som din mock fra frontend).
 *  - Senere: vi skifter dette til at læse RIGTIG XML fra cfg('dirs'), men beholder samme JSON-format.
 *
 * Output (JSON):
 *   { ok:true, data:{ version, res:{...}, bld:{...}, rsd:{...}, rcp:{...}, config:{...} } }
 */

require_once __DIR__ . '/../../lib/utils.php';   // json_ok/json_err
require_once __DIR__ . '/../../lib/config.php';  // app_config()/cfg()

// --- (1) Læs config, så 'version'/'lang' osv. følger din config.ini ---------------
try {
    $conf = app_config(); // kaster exception hvis config.ini/db.ini mangler
} catch (Throwable $e) {
    json_err('E_CONFIG', 'Config error: ' . $e->getMessage(), 500);
}

// Spilversion (fra [game_data] version = 2.0)
$defsVersion = (string)($conf['game_data']['version'] ?? '0');
// Sprog (fra [game_data] lang = da)
$defaultLocale = (string)($conf['game_data']['lang'] ?? 'da');

// --- (2) DEMO-DEFS: samme struktur som frontend forventer ------------------------
// NOTE: Her bruger vi samme "mock"-data, så UI tegner 1:1.
//       Når dine XML-parser-filer er klar, bytter vi disse arrays ud med dem.

$defs_res = [
    "res.water" => [ "name"=>"Water", "emoji"=>"💧", "type"=>"liquid",  "unit"=>"L",   "max"=>500, "spacePerUnit"=>1 ],
    "res.oil"   => [ "name"=>"Oil",   "emoji"=>"🛢️", "type"=>"liquid",  "unit"=>"L",   "max"=>80,  "spacePerUnit"=>1 ],
    "res.milk"  => [ "name"=>"Milk",  "emoji"=>"🥛", "type"=>"liquid",  "unit"=>"L",   "max"=>40,  "spacePerUnit"=>1 ],
    "res.grain" => [ "name"=>"Grain", "emoji"=>"🌾", "type"=>"solid",   "unit"=>"kg",  "max"=>999, "spacePerUnit"=>1 ],
    "res.wood"  => [ "name"=>"Wood",  "emoji"=>"🪵", "type"=>"solid",   "unit"=>"stk", "max"=>800, "spacePerUnit"=>1 ],
    "res.stone" => [ "name"=>"Stone", "emoji"=>"🪨", "type"=>"solid",   "unit"=>"stk", "max"=>500, "spacePerUnit"=>1 ],
    "res.iron"  => [ "name"=>"Iron",  "emoji"=>"⚙️", "type"=>"solid",   "unit"=>"kg",  "max"=>120, "spacePerUnit"=>1 ],
    "res.food"  => [ "name"=>"Food",  "emoji"=>"🥫", "type"=>"solid",   "unit"=>"stk", "max"=>300, "spacePerUnit"=>1 ],
    "res.money" => [ "name"=>"Money", "emoji"=>"🟡", "type"=>"currency","unit"=>"",    "max"=>999999 ]
];

$defs_bld = [
    "bld.farm.l2" => [
        "name"=>"Farm", "icon"=>"🚜", "level"=>2, "desc"=>"A productive farming facility.",
        "yield"=>[ ["res"=>"res.grain", "amount"=>12, "time"=>"1h"] ],
        "durability"=>0.85, "footprintDelta"=>+5, "animalCapDelta"=>+2,
        "repairPrice"=>["res.money"=>120],
        "price"=>["res.money"=>300],
        "req"=>[ ["type"=>"rsd", "id"=>"rsd.agri.adv", "label"=>"Advanced Agriculture"] ],
        "photoBig"=>"assets/art/bld.basecamp.l1.big.png",
        "photoMedium"=>"assets/art/bld.basecamp.l1.medium.png"
    ],
    "bld.barn.l1" => [
        "name"=>"Barn", "icon"=>"🏚️", "level"=>1, "desc"=>"Storage for harvested crops.",
        "yield"=>[], "durability"=>0.95, "footprintDelta"=>+10, "animalCapDelta"=>+4,
        "repairPrice"=>["res.money"=>80], "price"=>["res.money"=>500],
        "req"=>[ ["type"=>"bld", "id"=>"bld.farm.l3", "label"=>"Farm Level 3"] ]
    ],
    "bld.sawmill.l1" => [
        "name"=>"Sawmill", "icon"=>"🪚", "level"=>1, "desc"=>"Processes wood.",
        "yield"=>[ ["res"=>"res.wood","amount"=>6,"time"=>"1h"] ], "durability"=>0.90,
        "footprintDelta"=>-4, "animalCapDelta"=>0,
        "repairPrice"=>["res.money"=>90], "price"=>["res.money"=>500],
        "req"=>[ ["type"=>"bld", "id"=>"bld.farm.l3", "label"=>"Farm Level 3"] ]
    ],
    "bld.mine.l1" => [
        "name"=>"Mine", "icon"=>"⛏️", "level"=>1, "desc"=>"Extracts stone.",
        "yield"=>[ ["res"=>"res.stone","amount"=>4,"time"=>"1h"] ], "durability"=>0.60,
        "footprintDelta"=>-6, "animalCapDelta"=>0,
        "repairPrice"=>["res.money"=>150], "price"=>["res.money"=>1200],
        "req"=>[ ["type"=>"rsd","id"=>"rsd.mining.t1","label"=>"Mining Techniques"] ]
    ],
    "bld.lake.l1" => [
        "name"=>"Lake", "icon"=>"🧪", "level"=>1, "desc"=>"Provides water access.",
        "yield"=>[ ["res"=>"res.water","amount"=>25,"time"=>"1h"] ], "durability"=>0.80,
        "footprintDelta"=>-2, "animalCapDelta"=>0,
        "repairPrice"=>["res.money"=>60], "price"=>["res.money"=>800],
        "req"=>[ ["type"=>"rsd","id"=>"rsd.water.access","label"=>"Water Access"] ]
    ],
];

$defs_rsd = [
    "rsd.agri.adv"   => [ "name"=>"Advanced Agriculture", "icon"=>"🎋", "desc"=>"Better crop yield.",   "cost"=>["res.money"=>600], "progress"=>1.0 ],
    "rsd.mining.t1"  => [ "name"=>"Mining Techniques",    "icon"=>"⛏️", "desc"=>"Improve extraction.", "cost"=>["res.money"=>300], "progress"=>0.60 ],
    "rsd.forest.m1"  => [ "name"=>"Forestry Management",  "icon"=>"🌲", "desc"=>"Manage woodlands.",    "cost"=>["res.money"=>450], "progress"=>0.0 ],
];

$defs_rcp = [
    "rcp.farm.irrigation" => [ "name"=>"Irrigation System", "icon"=>"💧", "effect"=>"+20% water efficiency", "price"=>["res.money"=>300,"res.wood"=>10], "kind"=>"addon", "owned"=>true ],
    "rcp.farm.fertilizer" => [ "name"=>"Fertilizer Storage","icon"=>"🌱","effect"=>"+15% crop yield",        "price"=>["res.money"=>150,"res.stone"=>5], "kind"=>"addon", "owned"=>false ],
    "rcp.farm.greenhouse" => [ "name"=>"Greenhouse Extension","icon"=>"🏡","effect"=>"Year-round production", "price"=>["res.money"=>800,"res.wood"=>20,"res.stone"=>10], "kind"=>"addon", "owned"=>false ],
    "rcp.job.wheat"       => [ "name"=>"Grow Wheat", "icon"=>"🌾", "kind"=>"job", "desc"=>"Produces grain in 1h", "consumes"=>["res.water"=>5], "produces"=>["res.grain"=>12], "duration"=>"1h", "state"=>"idle" ],
];

// Lidt config med på rejsen (så frontend og backend kan være enige om regler)
$configSmall = [
    "game_version" => $defsVersion,                 // "2.0"
    "locale"       => $defaultLocale,               // "da"
    "setup"        => [ "constDecimals" => (int)($conf['setup']['constDecimals'] ?? 2) ],
    "durability"   => [
        "buildingDecayStartDelay" => (string)($conf['durability']['buildingDecayStartDelay'] ?? "48h"),
        "addonDecayStartDelay"    => (string)($conf['durability']['addonDecayStartDelay'] ?? "48h"),
        "decayPerHour"            => (int)   ($conf['durability']['decayPerHour'] ?? 1),
    ],
    "water"        => [
        "thirst.output_floor" => (float)($conf['water']['thirst.output_floor'] ?? 0.30),
        "thirst.apply_mode"   => (string)($conf['water']['thirst.apply_mode'] ?? "ratio"),
        "water.priority"      => (string)($conf['water']['water.priority'] ?? "animal"),
        "round.consumption"   => (string)($conf['water']['round.consumption'] ?? "ceil"),
        "round.production"    => (string)($conf['water']['round.production'] ?? "floor"),
    ],
];

// --- (3) Send svar --------------------------------------------------------------
json_ok([
    "version" => $defsVersion,
    "res"     => $defs_res,
    "bld"     => $defs_bld,
    "rsd"     => $defs_rsd,
    "rcp"     => $defs_rcp,
    "config"  => $configSmall,
]);
