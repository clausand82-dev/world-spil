<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/capacity_usage.php';

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

  // Capacity keys
  $CAP_KEYS = [
    'housingCapacity'         => ['housing','housingCapacity'],
    'provisionCapacity'       => ['provision_cap','provisionCapacity'],
    'waterCapacity'           => ['waterCapacity'],
    'heatCapacity'            => ['heatCapacity'],
    'healthCapacity'          => ['healthCapacity'],
    'productClothCapacity'    => ['productClothCapacity','clothCapacity'],
    'productMedicinCapacity'  => ['productMedicinCapacity','medicinCapacity'],
    'wasteOtherCapacity'      => ['wasteOtherCapacity'],
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

    $capacities[$capName] = (float)($b + $a + $r);
    $parts[$capName]      = ['buildings'=>(float)$b,'addon'=>(float)$a,'research'=>(float)$r];

    // Liste per item til hover (name + amount)
    $listB = cu_table_exists($pdo, 'buildings')
          ? cu_list_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys, 'cu_def_name') : [];
    $listA = cu_table_exists($pdo, 'addon')
          ? cu_list_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $keys, 'cu_def_name') : [];
    $listR = cu_table_exists($pdo, 'user_research')
          ? cu_list_capacity_from_research($pdo, $uid, $rsdDefs, $keys, 'cu_def_name') : [];

    $partsList[$capName] = [
      'buildings' => $listB,
      'addon'     => $listA,
      'research'  => $listR,
    ];
  }

  // Usages (vægtet)
  $USAGE_FIELDS = [
    'useHousing','useProvision','useWater','useHeat','useHealth',
    'useCloth','useMedicin','wasteOther',
    'deathHealthExpose','deathHealthWeight','deathHealthBaseline',
    'birthRate','movingIn','movingOut',
  ];
  $usages = [];
  foreach ($USAGE_FIELDS as $field) {
    $usages[$field] = cu_usage_breakdown($rawCit, $citDefs, $field, $USE_ALIAS);
  }

  respond([
    'citizens' => [
      'raw'          => $rawCit,         // alle felter inkl. crime
      'groupCounts'  => $macro,          // macro + adultsTotal
      'lists'        => $citLists,       // short + long (uden crime)
      'totals'       => ['totalPersons' => $totalPersons],
      // Hjælpestrukturer, hvis du vil have hurtig adgang:
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
    'parts'      => $parts,      // totals pr. kilde
    'partsList'  => $partsList,  // detaljer pr. item (til hover)
  ]);
} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}