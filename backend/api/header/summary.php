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
// Integration af management/policy-effekter
require_once __DIR__ . '/../lib/management_effects_integration.php';

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

  // --- KONFIGURATION: indlæs tidligt så config_key virker for både capacity og usage blocks ---
  $cfgIniPath = __DIR__ . '/../../data/config/config.ini';
  $cfg = is_file($cfgIniPath) ? parse_ini_file($cfgIniPath, true, INI_SCANNER_TYPED) : [];

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

  // Capacity keys (udvides dynamisk fra registry)
$CAP_KEYS = [];
$registry = metrics_registry();
foreach ($registry as $id => $m) {
  // HOP over metrikker som er låst ift. brugerens stage
  $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
  if ($userStage < $unlockAt) continue;

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



  // NYT: borger-bidrag via registry
  foreach ($registry as $id => $m) {
    $capField = (string)($m['capacityField'] ?? '');
    if ($capField === '') continue;
    $rules = (array)($m['citizenCapacityContrib'] ?? []);
    if (!$rules) continue;

    foreach ($rules as $rule) {
      $groupKey = (string)($rule['group'] ?? '');
      $per      = (float)($rule['per'] ?? 0);
      if ($groupKey === '' || ($per === 0.0 && empty($rule['config_key']))) continue;

      $count = (int)($fine[$groupKey] ?? 0);
      if ($count === 0) continue;

      $cfgKey = (string)($rule['config_key'] ?? '');
      if ($cfgKey !== '') {
        $per = (float)($cfg['tax'][$cfgKey] ?? $cfg[$cfgKey] ?? $per);
      }

      $delta = $per * $count;
      $capacities[$capField] = (float)($capacities[$capField] ?? 0) + $delta;

      if (!isset($partsList[$capField])) $partsList[$capField] = [];
      if (!isset($partsList[$capField]['citizens'])) $partsList[$capField]['citizens'] = [];
      $partsList[$capField]['citizens'][] = [
        'id'=>$groupKey, 'name'=>(string)($rule['label'] ?? $groupKey),
        'amount'=>$delta, 'count'=>$count, 'per'=>$per
      ];
    }
  }

$USAGE_FIELDS_STATIC = [/*
    'useHousing','useProvision','useWater',
    
    'deathHealthExpose','deathHealthWeight','deathHealthBaseline',
    'birthRate','movingIn','movingOut','usePolice','useSocial', 'useCulture', 'useCivilization', 'useReligion',
   
    // Heat/Power sub uses
    'useHeat','useHeatFossil','useHeatGreen','useHeatNuclear',
    'usePower','usePowerFossil','usePowerGreen','usePowerNuclear',

    // Health sub-uses
    'useHealth','useHealthDentist',

    // tax
    'useTax','useTaxHealth','useTaxCitizens',

    // Waste
    'useWaste','useWasteOrganic','useWasteOther', 'useWasteMetal','useWastePlastic','useWasteGlass','useWasteElectronic','useWasteDanger','useWastePaper',

    // Transport
    'useTransport','useTransportPassenger','useTransportGods',

    //Products
    'useCloth','useMedicin',*/
];

// Start med den statiske liste
$USAGE_FIELDS = $USAGE_FIELDS_STATIC;

// Tilføj registry-provided usageField kun hvis metric er oplåst for brugeren
$registry = metrics_registry();
foreach ($registry as $id => $m) {
  $usageField = (string)($m['usageField'] ?? '');
  if ($usageField === '') continue;
  $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
  if ($userStage < $unlockAt) continue; // hop over låste metrikker

  if (!in_array($usageField, $USAGE_FIELDS, true)) {
    $USAGE_FIELDS[] = $usageField;
  }
}

// --- Beregn usages kun for de felter vi netop har samlet (og som er oplåst hvis de kommer fra registry) ---
$usages = [];
foreach ($USAGE_FIELDS as $field) {
  $usages[$field] = cu_usage_breakdown($rawCit, $citDefs, $field, $USE_ALIAS);
}

  // INFRA usage via registry
  foreach ($registry as $id => $m) {
    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
    if ($userStage < $unlockAt) continue;

    $usageField = (string)($m['usageField'] ?? '');
    if ($usageField === '') continue;

    // Hvis metrikken har subs, så skip parent (subs håndteres separat)
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

  

  // === Konfiguration ===
  $happinessWeights  = $cfg['happiness']  ?? [];
  $popularityWeights = $cfg['popularity'] ?? [];

  // Citizen-usage bidrag fra registry (fx budget-udgifter)
  foreach ($registry as $id => $m) {
    $unlockAt = (int)($m['stage']['unlock_at'] ?? 1);
    if ($userStage < $unlockAt) continue;

    $uField = (string)($m['usageField'] ?? '');
    $rules  = (array)($m['citizenUsageContrib'] ?? []);
    if ($uField === '' || !$rules) continue;

    if (!isset($usages[$uField])) $usages[$uField] = ['total'=>0.0, 'breakdown'=>[], 'infra'=>0.0];

    foreach ($rules as $rule) {
      $group = (string)($rule['group'] ?? '');
      $per   = (float)($rule['per'] ?? 0);
      if ($group === '' || ($per === 0.0 && empty($rule['config_key']))) continue;

      // valgfri toggle
      $switchKey = (string)($rule['switch_key'] ?? '');
      if ($switchKey !== '') {
        $enabled = (int)($cfg['tax'][$switchKey] ?? 1);
        if ($enabled !== 1) continue;
      }

      // override per fra config
      $cfgKey = (string)($rule['config_key'] ?? '');
      if ($cfgKey !== '') {
        $per = (float)($cfg['tax'][$cfgKey] ?? $cfg[$cfgKey] ?? $per);
      }

      $count = (int)($fine[$group] ?? 0);
      if ($count <= 0) continue;

      $delta = $per * $count;
      $usages[$uField]['total'] = (float)($usages[$uField]['total'] ?? 0) + $delta;

      $usages[$uField]['citizens'][] = [
        'id'=>$group, 'name'=>$rule['label'] ?? $group, 'count'=>$count, 'per'=>$per, 'amount'=>$delta
      ];
    }
  }

  // ===================== NYT: Apply management policies =====================
  // Saml et summary-array af dine baseline-data, så policies kan anvendes direkte
  $summary = [
    'stage'      => ['current' => $userStage],
    'citizens'   => [
      'groupCounts' => $macro,
      'totals'      => ['totalPersons' => $totalPersons],
    ],
    'capacities' => $capacities,
    'usages'     => $usages,
    'statSources'=> $summary['statSources'] ?? [], // tom/optional
    //'state'      => $summary['state'] ?? [],       // hvis du allerede lægger ejerskab andre steder
  ];

  // Brug korrekt variabel ($uid), ikke $userId
  apply_user_policies_to_summary($pdo, $uid, $summary);

// --- Merge policy capacity breakdown (capChoice) into parts/partsList ---
if (!empty($summary['capChoice']) && is_array($summary['capChoice'])) {
  foreach ($summary['capChoice'] as $capKey => $info) {
    if (!is_array($info)) continue;

    $choiceTotal = (float)($info['choice_total'] ?? 0);
    if ($choiceTotal !== 0.0) {
      // Sørg for struktur
      if (!isset($parts[$capKey]) || !is_array($parts[$capKey]))       $parts[$capKey] = [];
      if (!isset($partsList[$capKey]) || !is_array($partsList[$capKey])) $partsList[$capKey] = [];

      // 1) Sum på parts (ny kilde 'choice' – ligesom 'buildings', 'addon', 'citizens')
      $parts[$capKey]['choice'] = (float)($parts[$capKey]['choice'] ?? 0) + $choiceTotal;

      // 2) Detaljer på partsList['choice'] (én post pr policy eller én fallback-post)
      $rows = [];
      $details = (array)($info['choiceDetails'] ?? []);
      if ($details) {
        foreach ($details as $d) {
          $rows[] = [
            'id'     => 'policy:' . (string)($d['policy'] ?? ($d['stat'] ?? '')),
            'name'   => (string)($d['policy'] ?? ($d['stat'] ?? 'policy')),
            'amount' => (float)($d['amount'] ?? 0),
            'family' => (string)($d['family'] ?? ''),
            'stat'   => (string)($d['stat'] ?? $capKey),
          ];
        }
      } else {
        $rows[] = [
          'id'     => 'policy:',
          'name'   => 'policy',
          'amount' => $choiceTotal,
          'family' => '',
          'stat'   => $capKey,
        ];
      }

      // Merge ind i partsList under "choice"
      if (!isset($partsList[$capKey]['choice']) || !is_array($partsList[$capKey]['choice'])) {
        $partsList[$capKey]['choice'] = [];
      }
      $partsList[$capKey]['choice'] = array_merge($partsList[$capKey]['choice'], $rows);
    }
  }
}



  // Skriv effekter tilbage i dine lokale variabler, så resten af pipeline bruger opdaterede tal
  $capacities = $summary['capacities'] ?? $capacities;
  $usages     = $summary['usages']     ?? $usages;
  // =================== /NYT: Apply management policies ======================


  // Aggreger top use fra sub-uses
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
  $transportT  = (float)($usages['useTransport']['total'] ?? 0);
  $transportP = (float)($usages['useTransportPassenger']['total'] ?? 0);
  $transportG = (float)($usages['useTransportGods']['total'] ?? 0);

  $wasteOrg = (float)($usages['wasteOrganic']['total'] ?? 0);
  $wasteOth = (float)($usages['wasteOther']['total'] ?? 0);  
  $wasteMet = (float)($usages['wasteMetal']['total'] ?? 0);
  $wastePla = (float)($usages['wastePlastic']['total'] ?? 0);
  $wasteGla = (float)($usages['wasteGlass']['total'] ?? 0);
  $wasteEle = (float)($usages['wasteElectronic']['total'] ?? 0);
  $wasteDng = (float)($usages['wasteDanger']['total'] ?? 0);
  $wastePap = (float)($usages['wastePaper']['total'] ?? 0); 

  $taxHealth = (float)($usages['useTaxHealth']['total'] ?? 0);
  $taxCitizens = (float)($usages['useTaxCitizens']['total'] ?? 0);
  $taxOther  = (float)($usages['useTax']['total'] ?? 0);

  $usages['useCloth']['total']   = (float)($usages['useCloth']['total'] ?? 0);
  $usages['useMedicin']['total']  = (float)($usages['useMedicin']['total'] ?? 0);

  $usages['useHeat']['total']    = $heatF + $heatG + $heatN + $useHeatTop;
  $usages['useWaste']['total']   = $wasteOrg + $wasteOth + $wasteMet + $wastePla + $wasteGla + $wasteEle + $wasteDng + $wastePap;

  $usages['usePower']['total']   = $powerF + $powerG + $powerN + $usePowerTop;
  $usages['useHealth']['total']  = $healthDen + $useHealthTop;
  $usages['useTax']['total']     = $taxHealth + $taxOther + $taxCitizens;
  $usages['useTransport']['total'] = $transportP + $transportG + $transportT;

  $usages['useProduct']['total'] = $usages['useCloth']['total'] + $usages['useMedicin']['total'];

    // Aggreger totals for heat/power/health
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
    ($capacities['healthCapacity']         ?? 0)
  );
    $capacities['taxCapacity'] = (float)(
    ($capacities['taxHealthCapacity']  ?? 0) +
    ($capacities['taxCitizensCapacity']  ?? 0) +
    ($capacities['taxCapacity']         ?? 0)
  );
    $capacities['wasteCapacity'] = (float)(
    ($capacities['wasteOrganicCapacity']  ?? 0) +
    ($capacities['wasteOtherCapacity']  ?? 0) +
    ($capacities['wasteCapacity']         ?? 0)
  );
  $capacities['transportCapacity'] = (float)(
    ($capacities['transportPassengerCapacity']  ?? 0) +
    ($capacities['transportGodsCapacity']  ?? 0) +
    ($capacities['transportCapacity']         ?? 0)
  );
 $capacities['wasteCapacity'] = (float)(
    ($capacities['wasteOrganicCapacity']  ?? 0) +
    ($capacities['wasteOtherCapacity']  ?? 0) +
    ($capacities['wasteMetalCapacity']  ?? 0) +
    ($capacities['wastePlasticCapacity']  ?? 0) +
    ($capacities['wasteGlassCapacity']  ?? 0) +
    ($capacities['wasteElectronicCapacity']  ?? 0) +
    ($capacities['wasteDangerCapacity']  ?? 0) +
    ($capacities['wastePaperCapacity']  ?? 0) +
    ($capacities['wasteCapacity']         ?? 0)
  );
   $capacities['productCapacity'] = (float)(
    ($capacities['productMedicinCapacity']  ?? 0) +
    ($capacities['productClothCapacity']  ?? 0) +
    ($capacities['productCapacity']         ?? 0)

  );

  // === HAPPINESS: byg dynamisk fra registry + stage ===
  $happinessPairs = []; // key => ['used','capacity']
  foreach ($happinessWeights as $wKey => $_w) {
  $base = preg_replace('/HappinessWeight$/', '', (string)$wKey);
  if (!isset($registry[$base])) continue;
  $m = $registry[$base];

  // NYT: hvis registry signalerer at happiness er disabled for denne metric -> skip
  if (isset($m['happiness']['enabled']) && !$m['happiness']['enabled']) continue;

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

  // === DEMANDS ===
  $demandsData = demands_evaluate_all($registry, $usages, $capacities, $counts, $cfg, $userStage);

  // === EFFECTS/RULES (tværgående checks – ændrer ikke tallene med mindre du selv vælger det) ===
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

  // Afrunding helper
  function round_numeric_recursive($val, int $decimals = 2) {
    if (is_array($val)) {
      foreach ($val as $k => $v) $val[$k] = round_numeric_recursive($v, $decimals);
      return $val;
    }
    if (is_numeric($val)) {
      $f = (float)$val;
      $r = round($f, $decimals);
      return (floor($r) == $r) ? (int)$r : $r;
    }
    return $val;
  }

  // Afrund udgående numeric felter (valgfrit)
  $ROUND_DECIMALS = 2;
  $capacities = round_numeric_recursive($capacities, $ROUND_DECIMALS);
  $parts      = round_numeric_recursive($parts, $ROUND_DECIMALS);
  $usages     = round_numeric_recursive($usages, $ROUND_DECIMALS);

  // Respond – udvidet payload (kompatibel med eksisterende UI)
  $data = [
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
    'capChoice'    => $capChoice = round_numeric_recursive(($summary['capChoice'] ?? []), $ROUND_DECIMALS),
    'happiness'    => $happinessData,
    'popularity'   => $popularityData,
    'demands'      => $demandsData,
    'effects'      => $effects,
    'state'        => $summary['state'] ?? [],
    'metricsMeta'  => (function() use ($registry, $userStage) {
      $out = [];
      foreach ($registry as $id => $m) {
        $out[$id] = $out[$id] = [
          'label'      => (string)($m['label'] ?? $id),
          'parent'     => (string)($m['parent'] ?? ''),
          'subs'       => array_values($m['subs'] ?? []),
          'stage'      => [
            'unlock_at'  => (int)($m['stage']['unlock_at'] ?? 1),
            'visible_at' => (int)($m['stage']['visible_at'] ?? 1),
            'locked'     => $userStage < (int)($m['stage']['unlock_at'] ?? 1),
          ],
          // --- NYT: eksponer happines/popularity flags fra registry så frontend kan se dem ---
          'happiness'  => [
            'enabled'   => !empty($m['happiness']['enabled']),
            'weight_key'=> isset($m['happiness']['weight_key']) ? (string)$m['happiness']['weight_key'] : '',
          ],
          'popularity' => [
            'enabled'   => !empty($m['popularity']['enabled']),
            'weight_key'=> isset($m['popularity']['weight_key']) ? (string)$m['popularity']['weight_key'] : '',
          ],
          'usageField'    => (string)($m['usageField'] ?? ''),
          'capacityField' => (string)($m['capacityField'] ?? ''),
        ];
}
      return $out;
    })(),
    'stage'        => ['current' => $userStage],
  ];

  // --- ETag / conditional response ---
  // Compute an ETag from parts of the payload that should indicate change.
  // Prefer DB timestamps in production; here we hash relevant sections.
  $etag = '"' . md5(json_encode($data['capacities'] ?? []) . json_encode($data['usages'] ?? []) . json_encode($data['state'] ?? [])) . '"';
  header('ETag: ' . $etag);

  $ifNone = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
  if ($ifNone === $etag) {
    // Not modified — client can reuse cached payload
    http_response_code(304);
    exit;
  }

  respond($data);
} catch (Throwable $e) {
  fail('E_SERVER', $e->getMessage(), 500);
}