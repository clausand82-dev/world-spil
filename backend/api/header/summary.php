<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/../lib/capacity_usage.php';
require_once __DIR__ . '/../lib/happiness.php';
require_once __DIR__ . '/../lib/popularity.php';
require_once __DIR__ . '/../lib/metrics_registry.php';
require_once __DIR__ . '/../lib/demands.php';
require_once __DIR__ . '/../lib/effects_rules.php';

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
  $aniDefs = $defs['ani'] ?? [];
  $resDefs = $defs['res'] ?? [];

  $citDefs = cu_load_defs_citizens($defs);

  // User stage (til gates i registry/demands/effects)
  $st = $pdo->prepare("SELECT currentstage FROM users WHERE user_id = ? LIMIT 1");
  $st->execute([$uid]);
  $userStage = (int)($st->fetchColumn() ?: 0);

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
      ['key'=>'adults','label'=>'Adults', 'count'=>(int)$macro['adultsTotal']],
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

  // Capacity keys (hold eksisterende + sub-capacities for heat/power + mulighed for registry-udvidelser)
  $CAP_KEYS = [
    /*'housingCapacity'         => ['housing','housingCapacity'],
    'provisionCapacity'       => ['provision_cap','provisionCapacity'],
    'heatCapacity'            => ['heatCapacity'],
    'healthCapacity'          => ['healthCapacity'],
    'productClothCapacity'    => ['productClothCapacity','clothCapacity'],
    'productMedicinCapacity'  => ['productMedicinCapacity','medicinCapacity'],
    'wasteOtherCapacity'      => ['wasteOtherCapacity'],

    // Heat sub-capacities
    'heatFossilCapacity'      => ['heatFossilCapacity'],
    'heatGreenCapacity'       => ['heatGreenCapacity'],
    'heatNuclearCapacity'     => ['heatNuclearCapacity'],

    // Power sub-capacities
    'powerFossilCapacity'     => ['powerFossilCapacity'],
    'powerGreenCapacity'      => ['powerGreenCapacity'],
    'powerNuclearCapacity'    => ['powerNuclearCapacity'],*/
  ];

  // Udvid CAP_KEYS fra registry (så nye metrics bliver auto-summeret)
  $registry = metrics_registry();
  foreach ($registry as $id => $m) {
    $capField = (string)($m['capacityField'] ?? '');
    if ($capField === '') continue;
    if (!isset($CAP_KEYS[$capField])) {
      $keys = array_values(array_unique(array_filter((array)($m['capacityStatKeys'] ?? []))));
      if ($keys) $CAP_KEYS[$capField] = $keys;
    }
  }

  $USE_ALIAS = [
    'useCloth'   => 'useProductCloth',
    'useMedicin' => 'useProductMedicin',
  ];

  // Kapaciteter + kilde-lister
  $capacities = [];
  $parts      = [];
  $partsList  = [];

  foreach ($CAP_KEYS as $capName => $keys) {
    $b = cu_table_exists($pdo, 'buildings')     ? cu_sum_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys) : 0.0;
    $a = cu_table_exists($pdo, 'addon')         ? cu_sum_capacity_from_table($pdo, $uid, $addDefs, 'addon',     'add_id', 'level', $keys) : 0.0;
    $r = cu_table_exists($pdo, 'research') ? cu_sum_capacity_from_research($pdo, $uid, $rsdDefs, $keys) : 0.0;
    $ani = cu_table_exists($pdo, 'animals')     ? cu_sum_capacity_from_animals($pdo, $uid, $aniDefs, $keys) : 0.0;
    $inv = cu_table_exists($pdo, 'inventory')   ? cu_sum_capacity_from_inventory($pdo, $uid, $resDefs, $keys) : 0.0;

    $capacities[$capName] = (float)($b + $a + $r + $ani + $inv);
    $parts[$capName]      = [
      'buildings'=>(float)$b,
      'addon'    =>(float)$a,
      'research' =>(float)$r,
      'animals'  =>(float)$ani,
      'inventory'=>(float)$inv,
    ];

    // Liste per item til hover (name + amount)
    $listB = cu_table_exists($pdo, 'buildings')
          ? cu_list_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $keys, 'cu_def_name') : [];
    $listA = cu_table_exists($pdo, 'addon')
          ? cu_list_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $keys, 'cu_def_name') : [];
    $listR = cu_table_exists($pdo, 'research')
          ? cu_list_capacity_from_research($pdo, $uid, $rsdDefs, $keys, 'cu_def_name') : [];
    $listAni = cu_table_exists($pdo, 'animals')
          ? cu_list_capacity_from_animals($pdo, $uid, $aniDefs, $keys, 'cu_def_name') : [];
    $listInv = cu_table_exists($pdo, 'inventory')
          ? cu_list_capacity_from_inventory($pdo, $uid, $resDefs, $keys, 'cu_def_name') : [];

    $partsList[$capName] = [
      'buildings' => $listB,
      'addon'     => $listA,
      'research'  => $listR,
      'animals'   => $listAni,
      'inventory' => $listInv,
    ];
  }

  // Aggreger totals for heat/power
  $capacities['heatCapacity']  = (float)(
    ($capacities['heatFossilCapacity']  ?? 0) +
    ($capacities['heatGreenCapacity']   ?? 0) +
    ($capacities['heatNuclearCapacity'] ?? 0) +
    ($capacities['heatCapacity']        ?? 0)
  );
  $capacities['powerCapacity'] = (float)(
    ($capacities['powerFossilCapacity']  ?? 0) +
    ($capacities['powerGreenCapacity']   ?? 0) +
    ($capacities['powerNuclearCapacity'] ?? 0) +
    ($capacities['powerCapacity']        ?? 0)
  );
  $capacities['healthCapacity'] = (float)(
    ($capacities['healthDentistCapacity']  ?? 0) +
    ($capacities['healthCapacity']   ?? 0)
  );

  // Usages (citizen-baseret)
  $USAGE_FIELDS = [
    'useHousing','useProvision','useWater',
    'useCloth','useMedicin','wasteOther',
    'deathHealthExpose','deathHealthWeight','deathHealthBaseline',
    'birthRate','movingIn','movingOut', 'usePolice', 'useSocial',

    // Heat/Power sub uses
    'useHeat','useHeatFossil','useHeatGreen','useHeatNuclear',
    'usePower','usePowerFossil','usePowerGreen','usePowerNuclear',

    // Health sub-uses
    'useHealth','useHealthDentist',
  ];
  $usages = [];
  foreach ($USAGE_FIELDS as $field) {
    $usages[$field] = cu_usage_breakdown($rawCit, $citDefs, $field, $USE_ALIAS);
  }

  // === INFRA USAGE fra registry: læg ...Usage fra defs (bld/add/rsd/ani/res) oveni citizen-usage ===
foreach ($registry as $id => $m) {
  // Stage-gate
  $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
  if ($userStage < $unlockAt) continue;

  $usageField = (string)($m['usageField'] ?? '');
  if ($usageField === '') continue;

  // Hvis metrikken har subs, så skip parent for at undgå dobbelt-tælling — subs håndteres hver for sig
  if (!empty($m['subs'])) continue;

  $usageKeys = array_values(array_unique(array_filter((array)($m['usageStatKeys'] ?? []))));
  if (empty($usageKeys)) continue;

  $src = (array)($m['sources'] ?? []);
  $infra = 0.0;

  if (!empty($src['bld']) && cu_table_exists($pdo, 'buildings')) {
    $infra += cu_sum_capacity_from_table($pdo, $uid, $bldDefs, 'buildings', 'bld_id', 'level', $usageKeys);
  }
  if (!empty($src['add']) && cu_table_exists($pdo, 'addon')) {
    $infra += cu_sum_capacity_from_table($pdo, $uid, $addDefs, 'addon', 'add_id', 'level', $usageKeys);
  }
  if (!empty($src['rsd']) && cu_table_exists($pdo, 'research')) {
    $infra += cu_sum_capacity_from_research($pdo, $uid, $rsdDefs, $usageKeys);
  }
  if (!empty($src['ani']) && cu_table_exists($pdo, 'animals')) {
    $infra += cu_sum_capacity_from_animals($pdo, $uid, $aniDefs, $usageKeys);
  }
  if (!empty($src['res']) && cu_table_exists($pdo, 'inventory')) {
    $infra += cu_sum_capacity_from_inventory($pdo, $uid, $resDefs, $usageKeys);
  }

  if ($infra != 0.0) {
    $usages[$usageField]['infra'] = (float)($usages[$usageField]['infra'] ?? 0) + (float)$infra;
    $usages[$usageField]['total'] = (float)($usages[$usageField]['total'] ?? 0) + (float)$infra;
  }
}
  // Aggreger useHeat/usePower fra sub-uses + evt. top-niveau (bevar kompatibilitet)
  $heatF   = (float)($usages['useHeatFossil']['total']   ?? 0);
  $heatG   = (float)($usages['useHeatGreen']['total']    ?? 0);
  $heatN   = (float)($usages['useHeatNuclear']['total']  ?? 0);
  $powerF  = (float)($usages['usePowerFossil']['total']  ?? 0);
  $powerG  = (float)($usages['usePowerGreen']['total']   ?? 0);
  $powerN  = (float)($usages['usePowerNuclear']['total'] ?? 0);
  $useHeatTop  = (float)($usages['useHeat']['total']  ?? 0);
  $usePowerTop = (float)($usages['usePower']['total'] ?? 0);

  $useHealthTop  = (float)($usages['useHealth']['total']  ?? 0);
  $healthDen  = (float)($usages['useHealthDentist']['total'] ?? 0);

  $usages['useHeat']['total']  = $heatF + $heatG + $heatN + $useHeatTop;
  $usages['usePower']['total'] = $powerF + $powerG + $powerN + $usePowerTop;
  $usages['useHealth']['total'] = $healthDen + $useHealthTop;

  // === Konfiguration ===
  $cfgIniPath = __DIR__ . '/../../data/config/config.ini';
  $cfg = is_file($cfgIniPath) ? parse_ini_file($cfgIniPath, true, INI_SCANNER_TYPED) : [];
  $happinessWeights  = $cfg['happiness']  ?? [];
  $popularityWeights = $cfg['popularity'] ?? [];

  // === HAPPINESS: byg dynamisk fra registry + stage ===
  $happinessPairs = []; // key => ['used','capacity']
  foreach ($happinessWeights as $wKey => $_w) {
    $base = preg_replace('/HappinessWeight$/', '', (string)$wKey);
    if (!isset($registry[$base])) continue;
    $m = $registry[$base];
    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
    if ($userStage < $unlockAt) continue;

    $uKey = $m['usageField']     ?? null;
    $cKey = $m['capacityField']  ?? null;
    $used = $uKey ? (float)($usages[$uKey]['total'] ?? 0) : 0.0;
    $cap  = $cKey ? (float)($capacities[$cKey]      ?? 0) : 0.0;
    $happinessPairs[$base] = ['used'=>$used, 'capacity'=>$cap];
  }
  $happinessData = happiness_calc_all($happinessPairs, $happinessWeights);

  // === POPULARITY: identisk struktur ===
  $popularityPairs = [];
  foreach ($popularityWeights as $wKey => $_w) {
    $base = preg_replace('/PopularityWeight$/', '', (string)$wKey);
    if (!isset($registry[$base])) continue;
    $m = $registry[$base];
    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
    if ($userStage < $unlockAt) continue;

    $uKey = $m['usageField']     ?? null;
    $cKey = $m['capacityField']  ?? null;
    $used = $uKey ? (float)($usages[$uKey]['total'] ?? 0) : 0.0;
    $cap  = $cKey ? (float)($capacities[$cKey]      ?? 0) : 0.0;
    $popularityPairs[$base] = ['used'=>$used, 'capacity'=>$cap];
  }
  $popularityData = popularity_calc_all($popularityPairs, $popularityWeights);

  // === DEMANDS: evaluér eksempler (power/heat shares + pollution levels placeholder) ===
  $demandsData = demands_evaluate_all($registry, $usages, $capacities, $counts, $cfg, $userStage);

  // === EFFECTS/RULES: udfør tværgående checks (ændrer ikke tallene med mindre du selv vælger det) ===
  $effects = apply_effects([
    'demands'    => $demandsData,
    'usages'     => $usages,
    'capacities' => $capacities,
    'happiness'  => $happinessData,
    'popularity' => $popularityData,
    'stage'      => $userStage,
  ]);

// AFSNIT HER SKAL TJEKKE OG BRUGE EFFEKTER

                // ----------------- NYT: Anvend effect-justeringer (enkelt, erstat baseline) -----------------
      // Hvis effects indeholder adjustments for happiness -> anvend dem direkte og overskriv baseline
      if (!empty($effects['adjustments']['happiness'])) {
        $adj = $effects['adjustments']['happiness'];
        $mult = (float)($adj['mult'] ?? 1.0);
        $add  = (float)($adj['add'] ?? 0.0);

        // Best-effort hent baseline fra almindelige keys, ellers 0
        $happyBaseline = 0.0;
        if (is_array($happinessData)) {
          foreach (['total','value','score','overall','happiness','mean'] as $k) {
            if (isset($happinessData[$k]) && is_numeric($happinessData[$k])) {
              $happyBaseline = (float)$happinessData[$k];
              break;
            }
          }
        } elseif (is_numeric($happinessData)) {
          $happyBaseline = (float)$happinessData;
        }

        // Beregn effektive værdi og overskriv baseline så frontend ikke skal ændres
        $effective = $happyBaseline * $mult + $add;
        // Gem både effective og overskriv total (frontend bruger total som før)
        if (is_array($happinessData)) {
          $happinessData['effective'] = $effective;
          $happinessData['total'] = $effective;
        } else {
          // hvis happinessData er scalar, pak det i en struktur
          $happinessData = ['total' => $effective, 'effective' => $effective];
        }

        // Kort warning til diagnostik (fjern senere hvis ikke ønsket)
        $effects['warnings'][] = sprintf('Applied happiness adjustment: mult=%.3f add=%.3f (baseline=%.3f -> effective=%.3f)', $mult, $add, $happyBaseline, $effective);
      }

  // AFSLUTNING AF EFFECT TJEK OG ANVENDELSE

  // Meta til UI (labels, hierarki, stages)
  $metricsMeta = [];
  foreach ($registry as $id => $m) {
    $metricsMeta[$id] = [
      'label'      => (string)($m['label'] ?? $id),
      'parent'     => (string)($m['parent'] ?? ''),
      'subs'       => array_values($m['subs'] ?? []),
      'stage'      => [
        'unlock_at'  => (int)($m['stage']['unlock_at'] ?? 1),
        'visible_at' => (int)($m['stage']['visible_at'] ?? 1),
        'locked'     => $userStage < (int)($m['stage']['unlock_at'] ?? 1),
      ],
      'usageField'    => (string)($m['usageField'] ?? ''),
      'capacityField' => (string)($m['capacityField'] ?? ''),
    ];
  }

/** Rekursiv afrunding af numeriske værdier i arrays/skalare */
function round_numeric_recursive($val, int $decimals = 2) {
  if (is_array($val)) {
    foreach ($val as $k => $v) {
      $val[$k] = round_numeric_recursive($v, $decimals);
    }
    return $val;
  }
  if (is_numeric($val)) {
    $f = (float)$val;
    $r = round($f, $decimals);
    // Return int hvis helt tal efter afrunding
    if (floor($r) == $r) return (int)$r;
    return $r;
  }
  return $val;
}

// --- Afslutningsvis: afrund de ønskede strukturer til maks 2 decimaler ---
$ROUND_DECIMALS = 2;
$capacities = round_numeric_recursive($capacities, $ROUND_DECIMALS);
$parts      = round_numeric_recursive($parts, $ROUND_DECIMALS);
$usages     = round_numeric_recursive($usages, $ROUND_DECIMALS);



  // Respond – udvidet payload (kompatibel med eksisterende UI)
  respond([
    'citizens' => [
      'raw'          => $rawCit,
      'groupCounts'  => $macro,
      'lists'        => $citLists,
      'totals'       => ['totalPersons' => $totalPersons],
      'sorted' => [
        'baby'   => ['baby' => (int)$macro['baby']],
        'kids'   => ['kids' => (int)$macro['kids']],
        'young'  => ['young'=> (int)$macro['young']],
        'adults' => ['adultsTotal'=> (int)$macro['adultsTotal'], 'adults'=> (int)$macro['adults']],
        'crime'  => ['crime'=> (int)$macro['crime']],
      ],
    ],
    'usages'       => $usages,
    'capacities'   => $capacities,
    'parts'        => $parts,
    'partsList'    => $partsList,
    'happiness'    => $happinessData,   // uændret form – frontend virker videre
    'popularity'   => $popularityData,  // ny (samme struktur)
    'demands'      => $demandsData,     // ny
    'effects'      => $effects,         // ny – anvend når du vil
    'metricsMeta'  => $metricsMeta,     // ny – labels/hierarki/stage til UI
    'stage'        => ['current' => $userStage],
  ]);

} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}