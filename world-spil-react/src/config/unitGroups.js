// Datadrevet beskrivelse af unit-grupper.
// Tilføj nye entries for fremtidige grupper.

// Hvis jeg vil bruge plads delen (udover animal_cap) andre steder, så skal jeg tilføje dataen i backend også.
// F.eks. healthUnitUsage, policeUnitUsage, fireUnitUsage, militaryUnitUsage
// Er pt gjort for health så se denne (health unit)


export const UNIT_GROUPS = [
  {
    key: 'farm',
    label: 'Dyr',
    emoji: '🐾',
    family: 'farm',
    // Hver enhed bruger dette stat i ani-defs
    perItemStat: 'animal_cap',
    // Kapacitetsmodus for denne gruppe (special-case for dyr)
    capacityMode: 'animalCap', // læs fra state.cap.animal_cap
    capacityLabel: 'Staldplads',
  },
  {
    key: 'health',
    label: 'Health',
    emoji: '🏥',
    family: 'health',
    perItemStat: 'healthUnitUsage',
    headerCapacityKey: 'healthUnitCapacity',
    headerUsageKey: 'healthUnitUsage',
    buildingCapacityStat: 'healthUnitCapacity', // fallback sum fra ejede bygninger
    capacityLabel: 'Health units',
  },
  {
    key: 'police',
    label: 'Police',
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
    label: 'Fire',
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
    label: 'Military',
    emoji: '🪖',
    family: 'military',
    perItemStat: 'militaryUnitUsage',
    headerCapacityKey: 'militaryUnitCapacity',
    headerUsageKey: 'militaryUnitUsage',
    buildingCapacityStat: 'militaryUnitCapacity',
    capacityLabel: 'Military units',
  },
];