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

  // Citizens (rå counts)
  $rawCit      = cu_table_exists($pdo, 'citizens') ? cu_fetch_citizens_row($pdo, $uid) : [];
  $groupCounts = cu_group_counts($rawCit)['macro']; // baby, kids, young, adults (uden crime), old, crime, adultsTotal

  // --- eksisterende beregninger af capacities/usages (uændret fra din seneste version) ---
  // Aliases (caps/uses)
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

  $capacities = [];
  $parts = [];
  foreach ($CAP_KEYS as $capName => $keys) {
    $b = cu_table_exists($pdo, 'buildings')     ? cu_sum_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys) : 0.0;
    $a = cu_table_exists($pdo, 'addon')         ? cu_sum_capacity_from_table($pdo, $uid, $addDefs, 'addon',     'add_id', 'level', $keys) : 0.0;
    $r = cu_table_exists($pdo, 'user_research') ? cu_sum_capacity_from_research($pdo, $uid, $rsdDefs, $keys) : 0.0;
    $capacities[$capName] = (float)($b + $a + $r);
    $parts[$capName]      = ['buildings'=>(float)$b,'addon'=>(float)$a,'research'=>(float)$r];
  }

  $USAGE_FIELDS = [
    'useHousing','useProvision','useWater','useHeat','useHealth',
    'useCloth','useMedicin','wasteOther',
    'deathHealthExpose','deathHealthWeight','deathHealthBaseline',
    'birthRate','movingIn','movingOut',
  ];
  $aliasMap = $USE_ALIAS;
  $usages = [];
  foreach ($USAGE_FIELDS as $field) {
    $usages[$field] = cu_usage_breakdown($rawCit, $citDefs, $field, $aliasMap);
  }

  // Bars (UI)
  $bars = [
    'housing' => [
      'used'      => $usages['useHousing']['total'] ?? 0.0,
      'capacity'  => $capacities['housingCapacity'] ?? 0.0,
      // IMPORTANT: hover skal vise RÅ PERSONER → brug groupCounts
      'breakdown' => $groupCounts,
      'parts'     => $parts['housingCapacity'] ?? [],
    ],
    'provision' => [
      'used'      => $usages['useProvision']['total'] ?? 0.0,
      'capacity'  => $capacities['provisionCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['provisionCapacity'] ?? [],
    ],
    'water' => [
      'used'      => $usages['useWater']['total'] ?? 0.0,
      'capacity'  => $capacities['waterCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['waterCapacity'] ?? [],
    ],
    'heat' => [
      'used'      => $usages['useHeat']['total'] ?? 0.0,
      'capacity'  => $capacities['heatCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['heatCapacity'] ?? [],
    ],
    'health' => [
      'used'      => $usages['useHealth']['total'] ?? 0.0,
      'capacity'  => $capacities['healthCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['healthCapacity'] ?? [],
    ],
    'cloth' => [
      'used'      => $usages['useCloth']['total'] ?? 0.0,
      'capacity'  => $capacities['productClothCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['productClothCapacity'] ?? [],
    ],
    'medicin' => [
      'used'      => $usages['useMedicin']['total'] ?? 0.0,
      'capacity'  => $capacities['productMedicinCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['productMedicinCapacity'] ?? [],
    ],
    'wasteOther' => [
      'used'      => $usages['wasteOther']['total'] ?? 0.0,
      'capacity'  => $capacities['wasteOtherCapacity'] ?? 0.0,
      'breakdown' => $groupCounts,
      'parts'     => $parts['wasteOtherCapacity'] ?? [],
    ],
  ];

  respond([
    'citizens'   => [
      'raw'         => $rawCit,
      'groupCounts' => $groupCounts, // rå personer pr. makrogruppe til hover
    ],
    'usages'     => $usages,
    'capacities' => $capacities,
    'parts'      => $parts,
    'bars'       => $bars,
  ]);
} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}