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