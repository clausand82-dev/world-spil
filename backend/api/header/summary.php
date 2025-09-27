<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/capacity_usage.php';
require_once __DIR__ . '/../lib/happiness.php';

function respond($p, int $http=200): never {
  http_response_code($http);
  echo json_encode(['ok'=>true,'data'=>$p], JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $code, string $msg, int $http=500): never {
  http_response_code($http);
  echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$msg]], JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  $uid = auth_require_user_id();
  $pdo = db();

  if (!function_exists('load_all_defs')) throw new RuntimeException('load_all_defs() not available');
  $defs    = load_all_defs();
  $bldDefs = $defs['bld'] ?? [];
  $addDefs = $defs['add'] ?? [];
  $rsdDefs = $defs['rsd'] ?? [];
  $citDefs = cu_load_defs_citizens($defs);
  $aniDefs = $defs['ani'] ?? [];  // NY
  $resDefs = $defs['res'] ?? [];  // NY

  // Citizens
  $rawCit = cu_table_exists($pdo, 'citizens') ? cu_fetch_citizens_row($pdo, $uid) : [];
  $counts = cu_group_counts($rawCit);
  $macro  = $counts['macro'];
  $fine   = $counts['fine'];
  $totalPersons = (int)$macro['baby'] + (int)$macro['kids'] + (int)$macro['young'] + (int)$macro['adultsTotal'] + (int)$macro['old'];

  // Byg hover-lister: kort/lang (uden crime i begge)
  $citLists = [
    'short' => [
      ['key'=>'baby',  'label'=>'Baby',   'count'=>(int)$macro['baby']],
      ['key'=>'kids',  'label'=>'Kids',   'count'=>(int)$macro['kids']],
      ['key'=>'young', 'label'=>'Young',  'count'=>(int)$macro['young']],
      ['key'=>'adults','label'=>'Adults', 'count'=>(int)$macro['adultsTotal']], // inkl. crime
      ['key'=>'old',   'label'=>'Old',    'count'=>(int)$macro['old']],
    ],
    'long' => [
      ['key'=>'baby','label'=>'Baby','count'=>(int)$fine['baby']],
      ['key'=>'kidsStreet','label'=>'Kids - Street','count'=>(int)$fine['kidsStreet']],
      ['key'=>'kidsStudent','label'=>'Kids - Student','count'=>(int)$fine['kidsStudent']],
      ['key'=>'youngStudent','label'=>'Young - Student','count'=>(int)$fine['youngStudent']],
      ['key'=>'youngWorker','label'=>'Young - Worker','count'=>(int)$fine['youngWorker']],
      ['key'=>'adultsPolice','label'=>'Adults - Police','count'=>(int)$fine['adultsPolice']],
      ['key'=>'adultsFire','label'=>'Adults - Fire','count'=>(int)$fine['adultsFire']],
      ['key'=>'adultsHealth','label'=>'Adults - Health','count'=>(int)$fine['adultsHealth']],
      ['key'=>'adultsSoldier','label'=>'Adults - Soldier','count'=>(int)$fine['adultsSoldier']],
      ['key'=>'adultsGovernment','label'=>'Adults - Government','count'=>(int)$fine['adultsGovernment']],
      ['key'=>'adultsPolitician','label'=>'Adults - Politician','count'=>(int)$fine['adultsPolitician']],
      ['key'=>'adultsUnemployed','label'=>'Adults - Unemployed','count'=>(int)$fine['adultsUnemployed']],
      ['key'=>'adultsWorker','label'=>'Adults - Worker','count'=>(int)$fine['adultsWorker']],
      ['key'=>'adultsHomeless','label'=>'Adults - Homeless','count'=>(int)$fine['adultsHomeless']],
      ['key'=>'old','label'=>'Old','count'=>(int)$fine['old']],
    ],
  ];

  // Capacity keys (inkl. sub-capacities for heat/power)
  $CAP_KEYS = [
    'housingCapacity'         => ['housing','housingCapacity'],
    'provisionCapacity'       => ['provision_cap','provisionCapacity'],
    'waterCapacity'           => ['waterCapacity'],
    'heatCapacity'            => ['heatCapacity'], // legacy/top-level (hvis sat direkte)
    'healthCapacity'          => ['healthCapacity'],
    'productClothCapacity'    => ['productClothCapacity','clothCapacity'],
    'productMedicinCapacity'  => ['productMedicinCapacity','medicinCapacity'],
    'wasteOtherCapacity'      => ['wasteOtherCapacity'],

    // Sub-capacities for heat
    'heatFossilCapacity'      => ['heatFossilCapacity'],
    'heatGreenCapacity'       => ['heatGreenCapacity'],
    'heatNuclearCapacity'     => ['heatNuclearCapacity'],

    // Sub-capacities for power
    'powerFossilCapacity'     => ['powerFossilCapacity'],
    'powerGreenCapacity'      => ['powerGreenCapacity'],
    'powerNuclearCapacity'    => ['powerNuclearCapacity'],
  ];
  $USE_ALIAS = [
    'useCloth'   => 'useProductCloth',
    'useMedicin' => 'useProductMedicin',
  ];

  // Kapaciteter + kilde-lister
  $capacities = [];
  $parts      = [];
  $partsList  = [];

  foreach ($CAP_KEYS as $capName => $keys) {
    $b = cu_table_exists($pdo, 'buildings') ? cu_sum_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys) : 0.0;
    $a = cu_table_exists($pdo, 'addon')     ? cu_sum_capacity_from_table($pdo, $uid, $addDefs, 'addon',     'add_id', 'level', $keys) : 0.0;
    $r = cu_table_exists($pdo, 'user_research') ? cu_sum_capacity_from_research($pdo, $uid, $rsdDefs, $keys) : 0.0;

    $ani = cu_table_exists($pdo, 'animals')   ? cu_sum_capacity_from_animals($pdo, $uid, $aniDefs, $keys) : 0.0;
    $inv = cu_table_exists($pdo, 'inventory') ? cu_sum_capacity_from_inventory($pdo, $uid, $resDefs, $keys) : 0.0;

    $capacities[$capName] = (float)($b + $a + $r + $ani + $inv);
    $parts[$capName]      = [
      'buildings'=>(float)$b,
      'addon'    =>(float)$a,
      'research' =>(float)$r,
      'animals'  =>(float)$ani,      // NY
      'inventory'=>(float)$inv,      // NY
    ];

    // Liste per item til hover (name + amount)
    $listB = cu_table_exists($pdo, 'buildings')
          ? cu_list_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys, 'cu_def_name') : [];
    $listA = cu_table_exists($pdo, 'addon')
          ? cu_list_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $keys, 'cu_def_name') : [];
    $listR = cu_table_exists($pdo, 'user_research')
          ? cu_list_capacity_from_research($pdo, $uid, $rsdDefs, $keys, 'cu_def_name') : [];

    // NYE lister
    $listAni = cu_table_exists($pdo, 'animals')
          ? cu_list_capacity_from_animals($pdo, $uid, $aniDefs, $keys, 'cu_def_name') : [];
    $listInv = cu_table_exists($pdo, 'inventory')
          ? cu_list_capacity_from_inventory($pdo, $uid, $resDefs, $keys, 'cu_def_name') : [];

    $partsList[$capName] = [
      'buildings' => $listB,
      'addon'     => $listA,
      'research'  => $listR,
      'animals'   => $listAni,  // NY
      'inventory' => $listInv,  // NY
    ];
  }

  // Efter vi har alle enkeltdels-kapaciteter, lav aggregerede totals for heat/power
  $capacities['heatCapacity']  = (float)(
    ($capacities['heatFossilCapacity']  ?? 0) +
    ($capacities['heatGreenCapacity']   ?? 0) +
    ($capacities['heatNuclearCapacity'] ?? 0) +
    ($capacities['heatCapacity']        ?? 0)   // hvis sat direkte fra et item
  );
  $capacities['powerCapacity'] = (float)(
    ($capacities['powerFossilCapacity']  ?? 0) +
    ($capacities['powerGreenCapacity']   ?? 0) +
    ($capacities['powerNuclearCapacity'] ?? 0) +
    ($capacities['powerCapacity']        ?? 0)  // hvis sat direkte
  );

  // Usages (vægtet)
  $USAGE_FIELDS = [
    'useHousing','useProvision','useWater','useHeat','useHealth',
    'useCloth','useMedicin','wasteOther',
    'deathHealthExpose','deathHealthWeight','deathHealthBaseline',
    'birthRate','movingIn','movingOut',

    // Sub-usage for heat
    'useHeatFossil','useHeatGreen','useHeatNuclear',
    // Power usage (top + subs)
    'usePower','usePowerFossil','usePowerGreen','usePowerNuclear',
  ];
  $usages = [];
  foreach ($USAGE_FIELDS as $field) {
    $usages[$field] = cu_usage_breakdown($rawCit, $citDefs, $field, $USE_ALIAS);
  }

  // Aggreger totals for useHeat/usePower (bevar evt. eksisterende top-niveau og læg oveni)
  $heatF   = (float)($usages['useHeatFossil']['total']   ?? 0);
  $heatG   = (float)($usages['useHeatGreen']['total']    ?? 0);
  $heatN   = (float)($usages['useHeatNuclear']['total']  ?? 0);
  $powerF  = (float)($usages['usePowerFossil']['total']  ?? 0);
  $powerG  = (float)($usages['usePowerGreen']['total']   ?? 0);
  $powerN  = (float)($usages['usePowerNuclear']['total'] ?? 0);

  $useHeatTop  = (float)($usages['useHeat']['total']  ?? 0);
  $usePowerTop = (float)($usages['usePower']['total'] ?? 0);

  $usages['useHeat']['total']  = $heatF + $heatG + $heatN + $useHeatTop;
  $usages['usePower']['total'] = $powerF + $powerG + $powerN + $usePowerTop;

  // === HAPPINESS: læs weights og beregn – EFTER $usages og $capacities er klar ===
  $cfgIniPath = __DIR__ . '/../../data/config/config.ini';
  $cfg = is_file($cfgIniPath) ? parse_ini_file($cfgIniPath, true, INI_SCANNER_TYPED) : [];
  $happinessWeights = $cfg['happiness'] ?? [];

  // Map fra base-key → usage/capacity felter i dine eksisterende arrays
  $HAP_KEYMAP = [
    // Eksisterende
    'health'     => ['usage' => 'useHealth',     'cap' => 'healthCapacity'],
    'food'       => ['usage' => 'useProvision',  'cap' => 'provisionCapacity'],
    'water'      => ['usage' => 'useWater',      'cap' => 'waterCapacity'],
    'housing'    => ['usage' => 'useHousing',    'cap' => 'housingCapacity'],

    // Aggregerede
    'heat'       => ['usage' => 'useHeat',       'cap' => 'heatCapacity'],
    'power'      => ['usage' => 'usePower',      'cap' => 'powerCapacity'],

    // Sub-kategorier
    'heatFossil'   => ['usage' => 'useHeatFossil',   'cap' => 'heatFossilCapacity'],
    'heatGreen'    => ['usage' => 'useHeatGreen',    'cap' => 'heatGreenCapacity'],
    'heatNuclear'  => ['usage' => 'useHeatNuclear',  'cap' => 'heatNuclearCapacity'],

    'powerFossil'  => ['usage' => 'usePowerFossil',  'cap' => 'powerFossilCapacity'],
    'powerGreen'   => ['usage' => 'usePowerGreen',   'cap' => 'powerGreenCapacity'],
    'powerNuclear' => ['usage' => 'usePowerNuclear', 'cap' => 'powerNuclearCapacity'],
  ];

  // Byg happinessUsages dynamisk ud fra weights (kun weights > 0)
  $happinessUsages = [];
  foreach ($happinessWeights as $key => $rawW) {
    $w = (float)$rawW;
    if ($w <= 0) continue;
    $base = preg_replace('/HappinessWeight$/', '', (string)$key); // fx "health" fra "healthHappinessWeight"
    if (!isset($HAP_KEYMAP[$base])) continue;
    $uKey = $HAP_KEYMAP[$base]['usage'];
    $cKey = $HAP_KEYMAP[$base]['cap'];
    $happinessUsages[$base] = [
      'used'     => (float)($usages[$uKey]['total'] ?? 0),
      'capacity' => (float)($capacities[$cKey] ?? 0),
    ];
  }

  $happinessData = happiness_calc_all($happinessUsages, $happinessWeights);

  // Respond – nu inkl. happiness
  respond([
    'citizens' => [
      'raw'          => $rawCit,         // alle felter inkl. crime
      'groupCounts'  => $macro,          // macro + adultsTotal
      'lists'        => $citLists,       // short + long (uden crime)
      'totals'       => ['totalPersons' => $totalPersons],
      'sorted' => [
        'baby'   => ['baby' => (int)$macro['baby']],
        'kids'   => ['kids' => (int)$macro['kids']],
        'young'  => ['young'=> (int)$macro['young']],
        'adults' => ['adultsTotal'=> (int)$macro['adultsTotal'], 'adults'=> (int)$macro['adults']],
        'crime'  => ['crime'=> (int)$macro['crime']],
      ],
    ],
    'usages'     => $usages,
    'capacities' => $capacities,
    'parts'      => $parts,
    'partsList'  => $partsList,
    'happiness'  => $happinessData, // til frontend (badge + hover)
  ]);

} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}