import { useMemo } from 'react';
import { useT } from '../services/i18n.js';

// BRUGES TIL HEADER HAPPINESS OG POPULARITY
export function useStatsLabels() { 
  const t = useT();
  return useMemo(() => ({
  housing: t("ui.emoji.housing.h1") + ' ' + t("ui.label.housing.h1") || 'Housing',
  food: t("ui.emoji.provision.h1") + ' ' + t("ui.label.provision.h1") || 'Provision',
  water: t("ui.emoji.water.h1") + ' ' + t("ui.label.water.h1") || 'Water',
  health: t("ui.emoji.health.h1") + ' ' + t("ui.label.health.h1") || 'Health',
  healthDentist: t("ui.emoji.health.h1") + ' ' + t("ui.label.health_dentist.h1") || 'Dentist',
  // Aggregerede
  heat: t("ui.emoji.heat.h1") + ' ' + t("ui.label.heat.h1") || 'Heat',
  power: t("ui.emoji.power.h1") + ' ' + t("ui.label.power.h1") || 'Power',
  // Subkategorier
  heatFossil: t("ui.emoji.heat_fossil.h1") + ' ' + t("ui.label.heat_fossil.h1") || 'Heat (Fossil)',
  heatGreen: t("ui.emoji.heat_green.h1") + ' ' + t("ui.label.heat_green.h1") || 'Heat (Green)',
  heatNuclear: t("ui.emoji.heat_nuclear.h1") + ' ' + t("ui.label.heat_nuclear.h1") || 'Heat (Nuclear)',
  powerFossil: t("ui.emoji.power_fossil.h1") + ' ' + t("ui.label.power_fossil.h1") || 'Power (Fossil)',
  powerGreen: t("ui.emoji.power_green.h1") + ' ' + t("ui.label.power_green.h1") || 'Power (Green)',
  powerNuclear: t("ui.emoji.power_nuclear.h1") + ' ' + t("ui.label.power_nuclear.h1") || 'Power (Nuclear)',
  cloth: t("ui.emoji.product_cloth.h1") + ' ' + t("ui.label.product_cloth.h1") || 'Cloth',
  medicin: t("ui.emoji.product_medicin.h1") + ' ' + t("ui.label.product_medicin.h1") || 'Medicine',
  social: t("ui.emoji.social.h1") + ' ' + t("ui.label.social.h1") || 'Social',
  wasteOther: t("ui.emoji.waste_other.h1") + ' ' + t("ui.label.waste_other.h1") || 'Other Waste',

  tax: t("ui.emoji.tax.h1") + ' ' + t("ui.label.tax.h1") || 'Tax',
  taxHealth: t("ui.emoji.tax_health.h1") + ' ' + t("ui.label.tax_health.h1") || 'Skat (sundhed)',
  taxCitizens: t("ui.emoji.tax_citizens.h1") + ' ' + t("ui.label.tax_citizens.h1") || 'Skat (borgere)',
  police: t("ui.emoji.adults_police.h1") + ' ' + t("ui.citizens.adults_police.h1") || 'Police',

  }), [t]);
}

// BRUGES TIL StatsEffectsTooltip
export function defaultLabelMap() {
  // Her hardcode vi labels + (valgfri) korte forklaringer.
  // Byt senere med i18n keys / oversætterfunktion.
  const t = useT();

  const map = {
    'footprint': { label: t("ui.emoji.footprint.h1")+t("ui.label.footprint.h1"), desc: t("ui.desc.footprint.h1") },
    'animal_cap': { label: t("ui.emoji.animalcap.h1")+t("ui.label.animalcap.h1"), desc: t("ui.desc.animalcap.h1") },
    'housing': { label: t("ui.emoji.housing.h1")+t("ui.label.housing.h1"), desc: t("ui.capdesc.housing.h1") },
    'housingCapacity': { label: t("ui.emoji.housing.h1")+t("ui.label.housing.h1"), desc: t("ui.capdesc.housing.h1") },

    'provision_cap': { label: t("ui.emoji.provision.h1")+t("ui.label.provision.h1"), desc: t("ui.capdesc.provision.h1") },
    'provisionCapacity': { label: t("ui.emoji.provision.h1")+t("ui.label.provision.h1"), desc: t("ui.capdesc.provision.h1") },
    'provisionUsage': { label: t("ui.emoji.provision.h1")+t("ui.label.provision.h1"), desc: t("ui.usagedesc.provision.h1") },

    'healthCapacity': { label: t("ui.emoji.health.h1")+t("ui.label.health.h1"), desc: t("ui.capdesc.health.h1") },
    'healthUnitUsage': { label: t("ui.emoji.health_unit.h1")+t("ui.label.health_unit.h1"), desc: t("ui.usagedesc.health_unit.h1") },
    'healthUnitCapacity': { label: t("ui.emoji.health_unit.h1")+t("ui.label.health_unit.h1"), desc: t("ui.capdesc.health_unit.h1") },
    'healthDentistUsage': { label: t("ui.emoji.health_dentist.h1")+t("ui.label.health_dentist.h1"), desc: t("ui.usagedesc.health_dentist.h1") },
    'healthDentistCapacity': { label: t("ui.emoji.health_dentist.h1")+t("ui.label.health_dentist.h1"), desc: t("ui.capdesc.health_dentist.h1") },


    'adultsPoliceCapacity': { label: t("ui.emoji.adults_police.h1")+t("ui.citizens.adults_police.h1"), desc: t("ui.capdesc.adults_police.h1") },
    'adultsFireCapacity': { label: t("ui.emoji.adults_fire.h1")+t("ui.citizens.adults_fire.h1"), desc: t("ui.capdesc.adults_fire.h1") },
    'adultsHealthCapacity': { label: t("ui.emoji.adults_health.h1")+t("ui.citizens.adults_health.h1"), desc: t("ui.capdesc.adults_health.h1") },
    'adultsSoldierCapacity': { label: t("ui.emoji.adults_soldier.h1")+t("ui.citizens.adults_soldier.h1"), desc: t("ui.capdesc.adults_soldier.h1") },
    'kidsStudentCapacity': { label: t("ui.emoji.kids_student.h1")+t("ui.citizens.kids_student.h1"), desc: t("ui.capdesc.kids_student.h1") },
    'youngStudentCapacity': { label: t("ui.emoji.young_student.h1")+t("ui.citizens.young_student.h1"), desc: t("ui.capdesc.young_student.h1") },

    'heatFossilCapacity': { label: t("ui.emoji.heat.h1")+t("ui.label.heat.h1"), desc: t("ui.capdesc.heat.h1") },    
    
    'storageSolidCap': { label: t("ui.emoji.storage_solid.h1")+t("ui.label.storage_solid.h1"), desc: t("ui.capdesc.storage_solid.h1") },
    'storageLiquidCap': { label: t("ui.emoji.storage_liquid.h1")+t("ui.label.storage_liquid.h1"), desc: t("ui.capdesc.storage_liquid.h1") },
    
    'waterUsage': { label: t("ui.emoji.water.h1")+t("ui.label.water.h1"), desc: t("ui.usagedesc.water.h1") },
    'waterCapacity': { label: t("ui.emoji.water.h1")+t("ui.label.water.h1"), desc: t("ui.capdesc.water.h1") },
    
    'wasteOtherUsage': { label: t("ui.emoji.waste_other.h1")+t("ui.label.waste_other.h1"), desc: t("ui.usagedesc.waste_other.h1") },
    'wasteOtherCapacity': { label: t("ui.emoji.waste_other.h1")+t("ui.label.waste_other.h1"), desc: t("ui.capdesc.waste_other.h1") },

    'productClothUsage': { label: t("ui.emoji.cloth.h1")+t("ui.label.product_cloth.h1"), desc: t("ui.usagedesc.product_cloth.h1") },
    'productClothCapacity': { label: t("ui.emoji.cloth.h1")+t("ui.label.product_cloth.h1"), desc: t("ui.capdesc.product_cloth.h1") },

    'taxUsage': { label: t("ui.emoji.tax.h1")+t("ui.label.tax.h1"), desc: t("ui.capdesc.tax.h1") },
    'taxCapacity': { label: t("ui.emoji.tax.h1")+t("ui.label.tax.h1"), desc: t("ui.usagedesc.tax.h1") },

    'taxHealthUsage': { label: t("ui.emoji.tax_health.h1")+t("ui.label.tax_health.h1"), desc: t("ui.capdesc.tax_health.h1") },
    'taxHealthCapacity': { label: t("ui.emoji.tax_health.h1")+t("ui.label.tax_health.h1"), desc: t("ui.usagedesc.tax_health.h1") },


    // ... tilføj flere efter behov
  };

  // alias: sørg for gamle/alternate nøgler peger på samme entry
  map.provision_cap = map.provisionCapacity;
  // hvis du vil aliasere flere varianter, tilføj dem her:
  // map.provision = map.provisionCapacity;

  return map;

}

export function happinessEmojiFromScore(score01) {
  if (score01 >= 0.90) return '😊';
  if (score01 >= 0.80) return '😐';
  if (score01 >= 0.70) return '😞';
  if (score01 >= 0.60) return '😢';
  if (score01 >= 0.50) return '😠';
  return '😡';
}

export function popularityEmojiFromScore(x) {
  const s = Number(x || 0);
  if (s >= 0.85) return '🏆';
  if (s >= 0.70) return '😊';
  if (s >= 0.55) return '🙂';
  if (s >= 0.40) return '😐';
  if (s >= 0.25) return '😕';
  return '😟';
}
