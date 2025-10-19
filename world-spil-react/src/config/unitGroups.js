// Datadrevet beskrivelse af unit-grupper.
// Tabs vises kun hvis spilleren ejer mindst én bygning i 'family' (se UnitPage).
export const UNIT_GROUPS = [
  {
    key: 'farm',
    label: 'Dyr',
    emoji: '🐾',
    family: 'farm',
    perItemStat: 'animal_cap',     // per item “pladsforbrug”
    capacityMode: 'animalCap',     // brug state.cap.animal_cap
    capacityLabel: 'Staldplads',
  },
  {
    key: 'health',
    label: 'Health',
    emoji: '🏥',
    family: 'health',
    perItemStat: 'healthUnitUsage',
    headerCapacityKey: 'healthUnitCapacity',  // header.capacities.healthUnitCapacity
    headerUsageKey: 'healthUnitUsage',        // header.usages.healthUnitUsage
    buildingCapacityStat: 'healthUnitCapacity',
    capacityLabel: 'Health units',
  },
  {
    key: 'storage',
    label: 'Storage',
    emoji: '🗄️',
    family: 'storage',
    perItemStat: 'storageUnitsUsage',
    buildingCapacityStat: 'storageUnitsCapacity',
    capacityLabel: 'Storage units',
    // Angiv sub-typer så UnitPage kan vise/liquide/solid-detaljer hvis nødvendigt.
    subTypes: [
      {
        id: 'liquid',
        label: 'Liquid',
        headerCapacityKey: 'storageLiquidCap',
        headerUsageKey: 'storageLiquidUsage',
      },
      {
        id: 'solid',
        label: 'Solid',
        headerCapacityKey: 'storageSolidCap',
        headerUsageKey: 'storageSolidUsage',
      },
    ],
  },
  {
    key: 'lake',
    label: 'Lake',
    emoji: '🐟',
    family: 'lake',
    perItemStat: 'animal_cap',     // brug samme per-item stat som dyr
    capacityMode: 'animalCap',     // samme kapacitetsmode som farm
    capacityLabel: 'Staldplads',
    // Hvis du senere får specifik kapacitet i header/buildings, kan du tilføje fx:
    // headerCapacityKey: 'lakeUnitCapacity',
    // headerUsageKey: 'lakeUnitUsage',
    // buildingCapacityStat: 'lakeUnitCapacity',
  },

  // NY: Forest-enheder (dyr/udstyr knyttet til skov-familien)
  {
    key: 'forest',
    label: 'Forest',
    emoji: '🦌',
    family: 'forest',
    perItemStat: 'animal_cap',
    capacityMode: 'animalCap',
    capacityLabel: 'Staldplads',
    // Tilsvarende kan kapacitetsnøgler tilføjes senere hvis du har dem i summary/buildings:
    // headerCapacityKey: 'forestUnitCapacity',
    // headerUsageKey: 'forestUnitUsage',
    // buildingCapacityStat: 'forestUnitCapacity',
  },
  {
    key: 'police',
    label: 'Politi',
    emoji: '👮',
    family: 'police',
    perItemStat: 'policeUnitUsage',
    headerCapacityKey: 'policeUnitCapacity',
    headerUsageKey: 'policeUnitUsage',
    buildingCapacityStat: 'policeUnitCapacity',
    capacityLabel: 'Police units',
  },
  {
    key: 'fire',
    label: 'Brand',
    emoji: '🚒',
    family: 'fire',
    perItemStat: 'fireUnitUsage',
    headerCapacityKey: 'fireUnitCapacity',
    headerUsageKey: 'fireUnitUsage',
    buildingCapacityStat: 'fireUnitCapacity',
    capacityLabel: 'Fire units',
  },
  {
    key: 'military',
    label: 'Militær',
    emoji: '🪖',
    family: 'military',
    perItemStat: 'militaryUnitUsage',
    headerCapacityKey: 'militaryUnitCapacity',
    headerUsageKey: 'militaryUnitUsage',
    buildingCapacityStat: 'militaryUnitCapacity',
    capacityLabel: 'Military units',
  },
];