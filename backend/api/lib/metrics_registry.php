<?php
declare(strict_types=1);

/**
 * MANUAL TIL AT TILFØJE NYE TING:
 * 1: TILFØJ HER I METRICS
 * 2: TILFØJ I SUMMARY - $USAGE_FIELDS
 * 3: TILFØJ I SUMMARY - $capacities (summer hvis noget er kædet sammen)
 * 4: TILFØJ I SUMMARY - $usages (summer hvis noget er kædet sammen)
 * 5: TILFØJ I STATSEFFECTSTOOLTIP (FRONTEND)
 * 6: TILFØJ I LANG FIL (GØRES OFTE I FORBINDELSEN MED PUNKT 5)
 * 7: I happiness og Popularity skal grupperinger kædes sammen også (FRONTEND)
 * 
 * adultsTotal er alle adults inc. crimes
 * adults er alle adults uden crimes
 * 
 * 
 * Metrics Registry
 * - Én kilde til sandhed for capacity/use, hierarkier (parent/subs), stages, happiness/popularity,
 *   samt deklaration af demands og citizen-flows.
 *
 * Konvention:
 * - id: nøgle der også kan matche dine *_HappinessWeight / *_PopularityWeight i config (fx 'food', 'water', 'powerGreen' ...)
 * - usageField: key i $usages (fx 'useProvision', 'usePowerGreen')
 * - capacityField: key i $capacities (fx 'provisionCapacity', 'powerGreenCapacity')
 * - capacityStatKeys: stats-navne som findes i defs (bld/add/rsd/ani/res) der skal summeres ind i capacityField
 * - usageStatKeys: stats-navne som findes i defs og lægges oveni citizen-usage (infra-usage); kan være tom
 * - sources: hvilke kilder der må tælle (bld/add/rsd/ani/res) for capacity/usageStatKeys
 * - stage: unlock_at (int), visible_at (int) – locked metrics får neutrale værdier og kan markeres i meta
 * - happiness/popularity: enabled (+ optional weight_key, ellers id + 'HappinessWeight'/'PopularityWeight')
 * - demands: (eksempler) declarativ beskrivelse; evaluator kigger i config.ini [demands]
 * - flows: citizenProduction: felt i citizens-defs (fx 'wastePlastic') – ikke brugt i summary endnu, men klarlagt her
 *
 * OBS: Dette er et seed – du kan trygt udvide/ændre lokalt.
 */
function metrics_registry(): array {
  $metrics = [

// Basale
    'housing' => [
      'label' => 'Housing',
      'usageField' => 'useHousing',
      'capacityField' => 'housingCapacity',
      'capacityStatKeys' => ['housingCapacity','housing'],
      'usageStatKeys' => ['housingUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'housingHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'housingPopularityWeight'],
      'subs' => [],
      'demands' => [],
      'flows' => [],
    ],

    'food' => [
      'label' => 'Provision',
      'usageField' => 'useProvision',
      'capacityField' => 'provisionCapacity',
      'capacityStatKeys' => ['provisionCapacity','provision_cap', 'provision'],
      'usageStatKeys' => ['provisionUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'foodHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'foodPopularityWeight'],
      'subs' => [],
      'demands' => [],
      'flows' => [],
    ],

    'water' => [
      'label' => 'Water',
      'usageField' => 'useWater',
      'capacityField' => 'waterCapacity',
      'capacityStatKeys' => ['waterCapacity'],
      'usageStatKeys' => ['waterUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'waterHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'waterPopularityWeight'],
      'subs' => [],
      'demands' => [
        // Eksempel på max forurening som demand – evalueres i demands.php
        ['id'=>'demandsPollutionWaterMax', 'type'=>'max', 'domain'=>'pollution', 'basis'=>'level', 'config_key'=>'demandsPollutionWaterMax'],
      ],
      'flows' => [
        // Eksempel: borger-flow kunne påvirke forbrug/indikatorer (ikke bogført i summary endnu)
      ],
    ],

    // Heat + subs
    'heat' => [
      'label' => 'Heat',
      'usageField' => 'useHeat',
      'capacityField' => 'heatCapacity',
      'capacityStatKeys' => ['heatCapacity'],
      'usageStatKeys' => ['heatUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'heatHappinessWeight'], // sæt 0 hvis du kun vægter subs
      'popularity'=> ['enabled'=>true, 'weight_key'=>'heatPopularityWeight'],
      'subs' => ['heatGreen','heatNuclear','heatFossil'],
      'demands' => [],
      'flows' => [],
    ],

  // HEAT
    'heatGreen' => [
      'label' => 'Heat (Green)',
      'usageField' => 'useHeatGreen',
      'capacityField' => 'heatGreenCapacity',
      'capacityStatKeys' => ['heatGreenCapacity'],
      'usageStatKeys' => ['heatGreenUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'heatGreenHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'heatGreenPopularityWeight'],
      'parent' => 'heat',
      'demands' => [
        ['id'=>'demandsHeatGreenMin', 'type'=>'minShare', 'domain'=>'heat', 'basis'=>'usage_share_in_parent', 'config_key'=>'demandsHeatGreenMin', 'parent'=>'useHeat'],
      ],
      'flows' => [],
    ],
    'heatNuclear' => [
      'label' => 'Heat (Nuclear)',
      'usageField' => 'useHeatNuclear',
      'capacityField' => 'heatNuclearCapacity',
      'capacityStatKeys' => ['heatNuclearCapacity'],
      'usageStatKeys' => ['heatNuclearUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'heatNuclearHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'heatNuclearPopularityWeight'],
      'parent' => 'heat',
      'demands' => [
        ['id'=>'demandsHeatNuclearMax', 'type'=>'maxShare', 'domain'=>'heat', 'basis'=>'usage_share_in_parent', 'config_key'=>'demandsHeatNuclearMax', 'parent'=>'useHeat'],
      ],
      'flows' => [],
    ],
    'heatFossil' => [
      'label' => 'Heat (Fossil)',
      'usageField' => 'useHeatFossil',
      'capacityField' => 'heatFossilCapacity',
      'capacityStatKeys' => ['heatFossilCapacity'],
      'usageStatKeys' => ['heatFossilUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'heatFossilHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'heatFossilPopularityWeight'],
      'parent' => 'heat',
      'demands' => [
        ['id'=>'demandsHeatFossilMax', 'type'=>'maxShare', 'domain'=>'heat', 'basis'=>'usage_share_in_parent', 'config_key'=>'demandsHeatFossilMax', 'parent'=>'useHeat'],
      ],
      'flows' => [],
    ],

// Health + subs

    'health' => [
      'label' => 'Health',
      'usageField' => 'useHealth',
      'capacityField' => 'healthCapacity',
      // Tilføj nye stat keys fra defs (både bld og ani kan bidrage)
      'capacityStatKeys' => ['healthCapacity'],
      'usageStatKeys'    => ['healthUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'healthHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'healthPopularityWeight'],
      'subs' => ['healthDentist'],
      'demands' => [],
      'flows' => [],
      // NYT: borger-bidrag til kapacitet
      'citizenCapacityContrib' => [
        // hver adultsHealth giver +10 til healthCapacity
        ['group'=>'adultsHealth', 'per'=>10, 'label'=>'Sundhedspersonale'],
      ],
    ],

    'healthDentist' => [
      'label' => 'Tandlæge',
      'usageField' => 'useHealthDentist',
      'capacityField' => 'healthDentistCapacity',
      'capacityStatKeys' => ['healthDentistCapacity'],
      'usageStatKeys' => ['healthDentistUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>5,'visible_at'=>5],
      'happiness' => ['enabled'=>true, 'weight_key'=>'healthDentistHappinessWeight'], 
      'popularity'=> ['enabled'=>false],
      'parent' => 'health',
      'demands' => [],
      'flows' => [],
     ],

      // Tilføj under $metrics = [ ... ] som ny top-level metric:
    /*'healthUnit' => [
      'label' => 'Health Units',
      'usageField' => 'healthUnitUsage',         // summary.usages.healthUnitUsage
      'capacityField' => 'healthUnitProvision',  // summary.capacities.healthUnitProvision
      'capacityStatKeys' => ['healthUnitProvision'],
      'usageStatKeys' => ['healthUnitUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1000,'visible_at'=>1000], // ikke tilgængelig
      'happiness' => ['enabled'=>false],
      'popularity'=> ['enabled'=>false],
      'subs' => [],
      'demands' => [],
      'flows' => [],
    ],

     'storageUnit' => [
      'label' => 'Storage Units',
      'usageField' => 'storageUnitUsage',         // summary.usages.storageUnitUsage
      'capacityField' => 'storageUnitProvision',  // summary.capacities.storageUnitProvision
      'capacityStatKeys' => ['storageUnitProvision'],
      'usageStatKeys' => ['storageUnitUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1000,'visible_at'=>1000], // ikke tilgængelig
      'happiness' => ['enabled'=>false],
      'popularity'=> ['enabled'=>false],
      'subs' => [],
      'demands' => [],
      'flows' => [],
    ],*/

     

    

// Power + subs
    'power' => [
      'label' => 'Power',
      'usageField' => 'usePower',
      'capacityField' => 'powerCapacity',
      'capacityStatKeys' => ['powerCapacity'],
      'usageStatKeys' => ['powerUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'powerHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'powerPopularityWeight'],
      'subs' => ['powerGreen','powerNuclear','powerFossil'],
      'demands' => [],
      'flows' => [],
    ],
    'powerGreen' => [
      'label' => 'Power (Green)',
      'usageField' => 'usePowerGreen',
      'capacityField' => 'powerGreenCapacity',
      'capacityStatKeys' => ['powerGreenCapacity'],
      'usageStatKeys' => ['powerGreenUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'powerGreenHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'powerGreenPopularityWeight'],
      'parent' => 'power',
      'demands' => [
        ['id'=>'demandsPowerGreenMin', 'type'=>'minShare', 'domain'=>'power', 'basis'=>'usage_share_in_parent', 'config_key'=>'demandsPowerGreenMin', 'parent'=>'usePower'],
      ],
      'flows' => [],
    ],
    'powerNuclear' => [
      'label' => 'Power (Nuclear)',
      'usageField' => 'usePowerNuclear',
      'capacityField' => 'powerNuclearCapacity',
      'capacityStatKeys' => ['powerNuclearCapacity'],
      'usageStatKeys' => ['powerNuclearUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'powerNuclearHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'powerNuclearPopularityWeight'],
      'parent' => 'power',
      'demands' => [
        ['id'=>'demandsPowerNuclearMax', 'type'=>'maxShare', 'domain'=>'power', 'basis'=>'usage_share_in_parent', 'config_key'=>'demandsPowerNuclearMax', 'parent'=>'usePower'],
      ],
      'flows' => [],
    ],
    'powerFossil' => [
      'label' => 'Power (Fossil)',
      'usageField' => 'usePowerFossil',
      'capacityField' => 'powerFossilCapacity',
      'capacityStatKeys' => ['powerFossilCapacity'],
      'usageStatKeys' => ['powerFossilUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'powerFossilHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'powerFossilPopularityWeight'],
      'parent' => 'power',
      'demands' => [
        ['id'=>'demandsPowerFossilMax', 'type'=>'maxShare', 'domain'=>'power', 'basis'=>'usage_share_in_parent', 'config_key'=>'demandsPowerFossilMax', 'parent'=>'usePower'],
      ],
      'flows' => [],
    ],

// Produkter
    'product' => [
      'label' => 'Product',
      'usageField' => 'useProduct',
      'capacityField' => 'productClothCapacity',
      'capacityStatKeys' => ['productCapacity'],
      'usageStatKeys' => ['productUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'productHappinessWeight'], // eller clothHappinessWeight, hvis du opretter den
      'popularity'=> ['enabled'=>true, 'weight_key'=>'productPopularityWeight'],
      'subs' => ['productClothing','productMedicin'],
      'demands' => [],
      'flows' => [],
    ],

    'productClothing' => [
      'label' => 'Clothing',
      'usageField' => 'useProductClothing',
      'capacityField' => 'productClothingCapacity',
      'capacityStatKeys' => ['productClothingCapacity','clothingCapacity'],
      'usageStatKeys' => ['productClothingUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'clothingHappinessWeight'], // eller clothHappinessWeight, hvis du opretter den
      'popularity'=> ['enabled'=>true, 'weight_key'=>'clothingPopularityWeight'],
      'parent' => ['product'],
      'demands' => [],
      'flows' => [],
    ],
    'productMedicin' => [
      'label' => 'Medicin',
      'usageField' => 'useProductMedicin',
      'capacityField' => 'productMedicinCapacity',
      'capacityStatKeys' => ['productMedicinCapacity','medicinCapacity'],
      'usageStatKeys' => ['productMedicinUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'medicinHappinessWeight'], // eksempel – sæt din egen
      'popularity'=> ['enabled'=>true, 'weight_key'=>'medicinPopularityWeight'],
      'parent' => ['product'],
      'demands' => [],
      'flows' => [],
    ],
// WASTE og SUBS
    'waste' => [
      'label' => 'Waste ',
      'usageField' => 'useWaste',
      'capacityField' => 'wasteCapacity',
      'capacityStatKeys' => ['wasteCapacity'],
      'usageStatKeys' => ['wasteUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'subs' => ['wasteOrganic','wasteOther', 'wasteGlass', 'wasteMetal', 'wastePlastic', 'wasteElectronic', 'wasteDanger', 'wastePaper'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

    'wasteOther' => [
      'label' => 'Waste Other',
      'usageField' => 'wasteOther',
      'capacityField' => 'wasteOtherCapacity',
      'capacityStatKeys' => ['wasteOtherCapacity'],
      'usageStatKeys' => ['wasteOtherUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteOtherHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

    'wasteOrganic' => [
      'label' => 'Waste Organic',
      'usageField' => 'wasteOrganic',
      'capacityField' => 'wasteOrganicCapacity',
      'capacityStatKeys' => ['wasteOrganicCapacity'],
      'usageStatKeys' => ['wasteOrganicUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>1,'visible_at'=>1],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteOrganicHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

    'wasteGlass' => [
      'label' => 'Waste Glass',
      'usageField' => 'wasteGlass',
      'capacityField' => 'wasteGlassCapacity',
      'capacityStatKeys' => ['wasteGlassCapacity'],
      'usageStatKeys' => ['wasteGlassUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteGlassHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

    'wasteMetal' => [
      'label' => 'Waste Metal',
      'usageField' => 'wasteMetal',
      'capacityField' => 'wasteMetalCapacity',
      'capacityStatKeys' => ['wasteMetalCapacity'],
      'usageStatKeys' => ['wasteMetalUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteMetalHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

        'wastePlastic' => [
      'label' => 'Waste Plastic',
      'usageField' => 'wastePlastic',
      'capacityField' => 'wastePlasticCapacity',
      'capacityStatKeys' => ['wastePlasticCapacity'],
      'usageStatKeys' => ['wastePlasticUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wastePlasticHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

        'wasteElectronic' => [
      'label' => 'Waste Electronic',
      'usageField' => 'wasteElectronic',
      'capacityField' => 'wasteElectronicCapacity',
      'capacityStatKeys' => ['wasteElectronicCapacity'],
      'usageStatKeys' => ['wasteElectronicUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteElectronicHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

            'wastePaper' => [
      'label' => 'Waste Paper',
      'usageField' => 'wastePaper',
      'capacityField' => 'wastePaperCapacity',
      'capacityStatKeys' => ['wastePaperCapacity'],
      'usageStatKeys' => ['wastePaperUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wastePaperHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

            'wasteDanger' => [
      'label' => 'Waste Danger',
      'usageField' => 'wasteDanger',
      'capacityField' => 'wasteDangerCapacity',
      'capacityStatKeys' => ['wasteDangerCapacity'],
      'usageStatKeys' => ['wasteDangerUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'wasteDangerHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['waste'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

// SOCIAL

    'social' => [
      'label' => 'Social',
      'usageField' => 'useSocial',
      'capacityField' => 'socialCapacity',
      'capacityStatKeys' => ['socialCapacity'],
      'usageStatKeys' => ['socialUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>false, 'weight_key'=>'socialHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'subs' => ['religion','culture','civilization'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

      'religion' => [
      'label' => 'Religion',
      'usageField' => 'useReligion',
      'capacityField' => 'religionCapacity',
      'capacityStatKeys' => ['religionCapacity'],
      'usageStatKeys' => ['religionUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>false, 'weight_key'=>'religionHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['social'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

      'culture' => [
      'label' => 'Culture',
      'usageField' => 'useCulture',
      'capacityField' => 'cultureCapacity',
      'capacityStatKeys' => ['cultureCapacity'],
      'usageStatKeys' => ['cultureUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>false, 'weight_key'=>'cultureHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['social'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

      'civilization' => [
      'label' => 'Civilization',
      'usageField' => 'useCivilization',
      'capacityField' => 'civilizationCapacity',
      'capacityStatKeys' => ['civilizationCapacity'],
      'usageStatKeys' => ['civilizationUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>false, 'weight_key'=>'civilizationHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['social'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

      'transport' => [
      'label' => 'Transport',
      'usageField' => 'useTransport',
      'capacityField' => 'transportCapacity',
      'capacityStatKeys' => ['transportCapacity'],
      'usageStatKeys' => ['transportUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>false, 'weight_key'=>'transportHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'subs' => ['transportPassenger','transportGods'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

     'transportPassenger' => [
      'label' => 'Transport (Passenger)',
      'usageField' => 'useTransportPassenger',
      'capacityField' => 'transportPassengerCapacity',
      'capacityStatKeys' => ['transportPassengerCapacity'],
      'usageStatKeys' => ['transportPassengerUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>false, 'weight_key'=>'transportPassengerHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['transport'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

      'transportGoods' => [
      'label' => 'Transport (Gods)',
      'usageField' => 'useTransportGoods',
      'capacityField' => 'transportGoodsCapacity',
      'capacityStatKeys' => ['transportGoodsCapacity'],
      'usageStatKeys' => ['transportGoodsUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'transportGoodsHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'parent' => ['transport'],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],



      'police' => [
      'label' => 'Police',
      'usageField' => 'usePolice',
      'capacityField' => 'policeCapacity',
      'capacityStatKeys' => ['policeCapacity'],
      'usageStatKeys' => ['policeUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>3,'visible_at'=>3],
      'happiness' => ['enabled'=>false, 'weight_key'=>'policeHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'subs' => [],
      'demands' => [],
      'flows' => [
      ],
    ],

        'traffic' => [
      'label' => 'Traffic',
      'usageField' => 'useTraffic',
      'capacityField' => 'trafficCapacity',
      'capacityStatKeys' => ['trafficCapacity'],
      'usageStatKeys' => ['trafficUsage'],
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>4,'visible_at'=>4],
      'happiness' => ['enabled'=>true, 'weight_key'=>'trafficHappinessWeight'], // eksempel
      'popularity'=> ['enabled'=>false],
      'subs' => [],
      'demands' => [],
      'flows' => [
        // Eksempel på borger-flow du kan bruge senere:
        // ['citizenField'=>'wastePlastic', 'unit'=>'per_hour'],
      ],
    ],

    
    

    // Pollution (eksempel – ikke koblet til capacity/use direkte her)
    'pollutionAir' => [
      'label' => 'Pollution (Air)',
      'usageField' => null,
      'capacityField' => null,
      'capacityStatKeys' => [],
      'usageStatKeys' => [],
      'sources' => [],
      'stage' => ['unlock_at'=>3,'visible_at'=>3],
      'happiness' => ['enabled'=>true, 'weight_key'=>'pollutionAirHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'pollutionAirPopularityWeight'],
      'subs' => [],
      'demands' => [
        ['id'=>'demandsPollutionAirMax', 'type'=>'max', 'domain'=>'pollution', 'basis'=>'level', 'config_key'=>'demandsPollutionAirMax'],
      ],
      'flows' => [],
    ],

    // Traffic (eksempel demands)
    'trafficFossil' => [
      'label' => 'Traffic (Fossil)',
      'usageField' => null, // kunne være useTrafficFossil hvis du vil
      'capacityField' => null,
      'capacityStatKeys' => [],
      'usageStatKeys' => [],
      'sources' => [],
      'stage' => ['unlock_at'=>3,'visible_at'=>3],
      'happiness' => ['enabled'=>true, 'weight_key'=>'trafficHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'trafficFossilPopularityWeight'],
      'parent' => 'traffic',
      'demands' => [
        ['id'=>'demandsTrafficFossil', 'type'=>'max', 'domain'=>'traffic', 'basis'=>'level', 'config_key'=>'demandsTrafficFossil'],
      ],
      'flows' => [],
    ],

// TAX

      'tax' => [
      'label' => 'Skat ',
      'usageField' => 'useTax', // kunne være useTrafficFossil hvis du vil
      'capacityField' => 'taxCapacity',
      'capacityStatKeys' => 'taxCapacity',
      'usageStatKeys' => 'taxUsage',
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'taxHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'taxPopularityWeight'],
      'subs' => ['taxCitizens','taxHealth'],
      'demands' => [],
      'flows' => [],  
  ],
    

    'taxCitizens' => [
      'label' => 'Skat (borger)',
      'usageField' => 'useTaxCitizens', // kunne være useTrafficFossil hvis du vil
      'capacityField' => 'taxCitizensCapacity',
      'capacityStatKeys' => 'taxCitizensCapacity',
      'usageStatKeys' => 'taxCitizensUsage',
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'taxCitizensHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'taxCitizensPopularityWeight'],
      'parent' => ['tax'],
      'demands' => [],
      'flows' => [],    

    // Skatteindtægter (revenue) fra borgere => lægges på capacityField
    'citizenCapacityContrib' => [
      // Arbejdende betaler skat (eksempel)
      ['group'=>'adultsWorker', 'config_key'=>'taxWorkerPer', 'label'=>'Skat fra arbejdende'],
      // Tilføj evt. andre grupper (fx adultsGovernment, hvis du vil de også betaler skat)
    ],

    // Offentlige udgifter (expense) fra borgere => lægges på usageField
    'citizenUsageContrib' => [
      ['group'=>'adultsPolice',     'config_key'=>'wagePolicePer',  'label'=>'Løn (politi)'],
      ['group'=>'adultsFire',       'config_key'=>'wageFirePer',  'label'=>'Løn (brand)'],
      ['group'=>'adultsHealth',     'config_key'=>'wageHealthPer',  'label'=>'Løn (sundhed)'], /// bruger config_key hvis du vil kunne ændre via config
      ['group'=>'adultsGovernment', 'config_key'=>'wageGovernmentPer',  'label'=>'Løn (offentlige)'],
      ['group'=>'adultsPolitician', 'config_key'=>'wagePoliticianPer', 'label'=>'Løn (politikere)'],

      // Ydelser – kan styres med switch_key i config (valgfrit)
      ['group'=>'adultsUnemployed', 'per'=>4,  'label'=>'Offentlig ydelse (arbejdsløse)', 'switch_key'=>'benefitUnemployedEnabled'],
      ['group'=>'adultsHomeless',   'per'=>3,  'label'=>'Offentlig ydelse (hjemløse)',    'switch_key'=>'benefitHomelessEnabled'],
    ],
  ],

      'taxHealth' => [
      'label' => 'Skat (sundhed)',
      'usageField' => 'useTaxHealth', // kunne være useTrafficFossil hvis du vil
      'capacityField' => 'taxHealthCapacity',
      'capacityStatKeys' => 'taxHealthCapacity',
      'usageStatKeys' => 'taxHealthUsage',
      'sources' => ['bld'=>true,'add'=>true,'rsd'=>true,'ani'=>true,'res'=>true],
      'stage' => ['unlock_at'=>2,'visible_at'=>2],
      'happiness' => ['enabled'=>true, 'weight_key'=>'taxHealthHappinessWeight'],
      'popularity'=> ['enabled'=>true, 'weight_key'=>'taxHealthPopularityWeight'],
      'parent' => ['tax'],
      'demands' => [],
      'flows' => [],  
  ],
  ];

  return $metrics;
}