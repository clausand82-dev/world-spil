import React, { useMemo } from 'react';
import { useT } from '../services/i18n.js';
import { useGameData } from '../context/GameDataContext.jsx';
import { getIconMetaForId } from '../services/requirements.js';

// ...existing code...
function makeLabelNodeFactory(defs, t) {
  return (fullId, i18nKey, fallback) => {
    const icon = getIconMetaForId(fullId, defs); // { iconUrl, emoji, name } eller null
    const labelText = (t && t(i18nKey)) || fallback || '';
    let iconNode = null;

    if (icon?.iconUrl) {
      iconNode = (
        <img
          src={icon.iconUrl}
          alt={icon.name || ''}
          style={{ width: 18, height: 18, objectFit: 'contain', verticalAlign: 'middle', marginRight: 6}}
        />
      );
    } else if (icon?.emoji) {
      iconNode = <span style={{ marginRight: 6 }}>{icon.emoji}</span>;
    } else {
      // fallback: byg URL til stats-ikon som ligger samme sted som res billeder
      // find en eksisterende res.iconUrl for at udlede base-sti
      let baseDir = null;
      try {
        const resDefs = defs?.res || {};
        for (const k of Object.keys(resDefs)) {
          const u = resDefs[k]?.iconUrl;
          if (u && typeof u === 'string') {
            const idx = u.lastIndexOf('/');
            baseDir = idx >= 0 ? u.slice(0, idx + 1) : u;
            break;
          }
        }
      } catch (e) {
        baseDir = null;
      }
      if (!baseDir) {
        baseDir = (import.meta?.env?.BASE_URL || '/') + 'assets/pic/';
      }
      const key = String(fullId || '').replace(/^res\./, '').replace(/^stats\./, '');
      const filename = `${key}.png`;
      const altUrl = baseDir + filename;
      iconNode = (
        <img
          src={altUrl}
          alt={labelText || key}
          style={{ width: 18, height: 18, objectFit: 'contain', verticalAlign: 'middle', marginRight: 4 }}
        />
      );
    }

    return <span style={{ display: '', alignItems: 'center', gap: 0 }}>{iconNode}{labelText}</span>;
  };
}

// BRUGES TIL HEADER HAPPINESS OG POPULARITY OG SIDEBAR
export function useStatsLabels() {
  const t = useT();
  const { data: gameData } = useGameData();
  const defs = gameData?.defs || {};

  const makeLabelNode = useMemo(() => makeLabelNodeFactory(defs, t), [defs, t]);

  return useMemo(() => ({
  housing: makeLabelNode("stats_housing", "ui.label.housing.h1") || 'Housing',
  food: makeLabelNode("stats_food", "ui.label.provision.h1") || 'Provision',
  water: makeLabelNode("stats_water", "ui.label.water.h1") || 'Water',
  health: makeLabelNode("stats_health", "ui.label.health.h1") || 'Health',
  healthDentist: makeLabelNode("stats_healthdentist", "ui.label.health_dentist.h1") || 'Dentist',
  // Aggregerede
  heat: makeLabelNode("stats_heat", "ui.label.heat.h1") || 'Heat',
  power: makeLabelNode("stats_power", "ui.label.power.h1") || 'Power',
  // Subkategorier
  heatFossil: makeLabelNode("stats_heatfossil", "ui.label.heat_fossil.h1") || 'Heat (Fossil)',
  heatGreen: makeLabelNode("stats_heatgreen", "ui.label.heat_green.h1") || 'Heat (Green)',
  heatNuclear: makeLabelNode("stats_heatnuclear", "ui.label.heat_nuclear.h1") || 'Heat (Nuclear)',
  powerFossil: makeLabelNode("stats_powerfossil", "ui.label.power_fossil.h1") || 'Power (Fossil)',
  powerGreen: makeLabelNode("stats_powergreen", "ui.label.power_green.h1") || 'Power (Green)',
  powerNuclear: makeLabelNode("stats_powernuclear", "ui.label.power_nuclear.h1") || 'Power (Nuclear)',
  product: makeLabelNode("stats_product", "ui.label.product.h1") || 'Product',
  cloth: makeLabelNode("stats_cloth", "ui.label.product_cloth.h1") || 'Cloth',
  medicin: makeLabelNode("stats_medicin", "ui.label.product_medicin.h1") || 'Medicine',
  social: makeLabelNode("stats_social", "ui.label.social.h1") || 'Social',

  waste: makeLabelNode("stats_waste", "ui.label.waste.h1") || 'Waste',
  wasteOrganic: makeLabelNode('stats_wasteorganic', 'ui.label.waste_organic.h1', 'Organic Waste'),
  wasteOther: makeLabelNode("stats_wasteother", "ui.label.waste_other.h1", "Other Waste"),
  wasteMetal: makeLabelNode("stats_wastemetal", "ui.label.waste_metal.h1", "Metal Waste"),
  wastePlastic: makeLabelNode("stats_wasteplastic", "ui.label.waste_plastic.h1", "Plastic Waste"),
  wasteGlass: makeLabelNode("stats_wasteglass", "ui.label.waste_glass.h1", "Glass Waste"),
  wasteElectronic: makeLabelNode("stats_wasteelectronic", "ui.label.waste_electronic.h1", "Electronic Waste"),
  wasteDanger: makeLabelNode("stats_wastedanger", "ui.label.waste_danger.h1", "Dangerous Waste"),
  wastePaper: makeLabelNode("stats_wastepaper", "ui.label.waste_paper.h1", "Paper Waste"),

  tax: makeLabelNode("stats_tax", "ui.label.tax.h1") || 'Tax',
  taxHealth: makeLabelNode("stats_taxhealth", "ui.label.tax_health.h1") || 'Skat (sundhed)',
  taxCitizens: makeLabelNode("stats_taxcitizens", "ui.label.tax_citizens.h1") || 'Skat (borgere)',
  police: makeLabelNode("stats_police", "ui.label.police.h1") || 'Police',

  // NYE / TILFØJTE
  religion: t("ui.emoji.religion.h1") + ' ' + t("ui.label.religion.h1") || 'Religion',
  culture: t("ui.emoji.culture.h1") + ' ' + t("ui.label.culture.h1") || 'Culture',
  civilization: t("ui.emoji.civilization.h1") + ' ' + t("ui.label.civilization.h1") || 'Civilization',
  transport: t("ui.emoji.transport.h1") + ' ' + t("ui.label.transport.h1") || 'Transport',

  }), [t]);
}

// BRUGES TIL StatsEffectsTooltip
export function defaultLabelMap() {
  // Her hardcode vi labels + (valgfri) korte forklaringer.
  // Byt senere med i18n keys / oversætterfunktion.
  const t = useT();
  const { data: gameData } = useGameData();
  const defs = gameData?.defs || {};
  const makeLabelNode = useMemo(() => makeLabelNodeFactory(defs, t), [defs, t]);

  const map = {
// STAGE 1
    'footprint': { label: t("ui.emoji.footprint.h1")+t("ui.label.footprint.h1"), desc: t("ui.desc.footprint.h1") },
    'animal_cap': { label: t("ui.emoji.animalcap.h1")+t("ui.label.animalcap.h1"), desc: t("ui.desc.animalcap.h1") },
    'housing': { label: t("ui.emoji.housing.h1")+t("ui.label.housing.h1"), desc: t("ui.capdesc.housing.h1") },
    'housingCapacity': { label: t("ui.emoji.housing.h1")+t("ui.label.housing.h1"), desc: t("ui.capdesc.housing.h1") },

    'provision_cap': { label: makeLabelNode("stats_food", "ui.label.provision.h1"), desc: t("ui.capdesc.provision.h1") },
    'provisionCapacity': { label: makeLabelNode("stats_food", "ui.label.provision.h1"), desc: t("ui.capdesc.provision.h1") },
    'provisionUsage': { label: makeLabelNode("stats_food", "ui.label.provision.h1"), desc: t("ui.usagedesc.provision.h1") },

    'heatFossilCapacity': { label: makeLabelNode("stats_heat", "ui.label.heat.h1"), desc: t("ui.capdesc.heat.h1") },

    'storageSolidCap': { label: makeLabelNode("stats_storage_solid", "ui.label.storage_solid.h1"), desc: t("ui.capdesc.storage_solid.h1") },
    'storageLiquidCap': { label: makeLabelNode("stats_storage_liquid", "ui.label.storage_liquid.h1"), desc: t("ui.capdesc.storage_liquid.h1") },

    'waterUsage': { label: makeLabelNode("stats_water", "ui.label.water.h1"), desc: t("ui.usagedesc.water.h1") },
    'waterCapacity': { label: makeLabelNode("stats_water", "ui.label.water.h1"), desc: t("ui.capdesc.water.h1") },

    'wasteUsage': { label: makeLabelNode("stats_waste", "ui.label.waste.h1"), desc: t("ui.usagedesc.waste.h1") },
    'wasteCapacity': { label: makeLabelNode("stats_waste", "ui.label.waste.h1"), desc: t("ui.capdesc.waste.h1") },
    'wasteOrganicUsage': { label: makeLabelNode("stats_wasteorganic", "ui.label.waste_organic.h1"), desc: t("ui.usagedesc.waste_organic.h1") },
    'wasteOrganicCapacity': { label: makeLabelNode("stats_wasteorganic", "ui.label.waste_organic.h1"), desc: t("ui.capdesc.waste_organic.h1") },
    'wasteOtherUsage': { label: makeLabelNode("stats_wasteother", "ui.label.waste_other.h1"), desc: t("ui.usagedesc.waste_other.h1") },
    'wasteOtherCapacity': { label: makeLabelNode("stats_wasteother", "ui.label.waste_other.h1"), desc: t("ui.capdesc.waste_other.h1") },
    'wasteMetalUsage': { label: makeLabelNode("stats_wastemetal", "ui.label.waste_metal.h1"), desc: t("ui.usagedesc.waste_metal.h1") },
    'wasteMetalCapacity': { label: makeLabelNode("stats_wastemetal", "ui.label.waste_metal.h1"), desc: t("ui.capdesc.waste_metal.h1") },
    'wastePlasticUsage': { label: makeLabelNode("stats_wasteplastic", "ui.label.waste_plastic.h1"), desc: t("ui.usagedesc.waste_plastic.h1") },
    'wastePlasticCapacity': { label: makeLabelNode("stats_wasteplastic", "ui.label.waste_plastic.h1"), desc: t("ui.capdesc.waste_plastic.h1") },
    'wasteGlassUsage': { label: makeLabelNode("stats_wasteglass", "ui.label.waste_glass.h1"), desc: t("ui.usagedesc.waste_glass.h1") },
    'wasteGlassCapacity': { label: makeLabelNode("stats_wasteglass", "ui.label.waste_glass.h1"), desc: t("ui.capdesc.waste_glass.h1") },
    'wasteElectronicUsage': { label: makeLabelNode("stats_wasteelectronic", "ui.label.waste_electronic.h1"), desc: t("ui.usagedesc.waste_electronic.h1") },
    'wasteElectronicCapacity': { label: makeLabelNode("stats_wasteelectronic", "ui.label.waste_electronic.h1"), desc: t("ui.capdesc.waste_electronic.h1") },
    'wasteDangerUsage': { label: makeLabelNode("stats_wastedanger", "ui.label.waste_danger.h1"), desc: t("ui.usagedesc.waste_danger.h1") },
    'wasteDangerCapacity': { label: makeLabelNode("stats_wastedanger", "ui.label.waste_danger.h1"), desc: t("ui.capdesc.waste_danger.h1") },
    'wastePaperUsage': { label: makeLabelNode("stats_wastepaper", "ui.label.waste_paper.h1"), desc: t("ui.usagedesc.waste_paper.h1") },
    'wastePaperCapacity': { label: makeLabelNode("stats_wastepaper", "ui.label.waste_paper.h1"), desc: t("ui.capdesc.waste_paper.h1") },


// OTHER STAGE    


    'healthCapacity': { label: t("ui.emoji.health.h1")+t("ui.label.health.h1"), desc: t("ui.capdesc.health.h1") },
    /*'healthUnitUsage': { label: t("ui.emoji.health_unit.h1")+t("ui.label.health_unit.h1"), desc: t("ui.usagedesc.health_unit.h1") },
    'healthUnitCapacity': { label: t("ui.emoji.health_unit.h1")+t("ui.label.health_unit.h1"), desc: t("ui.capdesc.health_unit.h1") },*/
    'healthDentistUsage': { label: t("ui.emoji.health_dentist.h1")+t("ui.label.health_dentist.h1"), desc: t("ui.usagedesc.health_dentist.h1") },
    'healthDentistCapacity': { label: t("ui.emoji.health_dentist.h1")+t("ui.label.health_dentist.h1"), desc: t("ui.capdesc.health_dentist.h1") },

    'adultsPoliceCapacity': { label: t("ui.emoji.adults_police.h1")+t("ui.citizens.adults_police.h1"), desc: t("ui.capdesc.adults_police.h1") },
    'adultsFireCapacity': { label: t("ui.emoji.adults_fire.h1")+t("ui.citizens.adults_fire.h1"), desc: t("ui.capdesc.adults_fire.h1") },
    'adultsHealthCapacity': { label: t("ui.emoji.adults_health.h1")+t("ui.citizens.adults_health.h1"), desc: t("ui.capdesc.adults_health.h1") },
    'adultsSoldierCapacity': { label: t("ui.emoji.adults_soldier.h1")+t("ui.citizens.adults_soldier.h1"), desc: t("ui.capdesc.adults_soldier.h1") },
    'kidsStudentCapacity': { label: t("ui.emoji.kids_student.h1")+t("ui.citizens.kids_student.h1"), desc: t("ui.capdesc.kids_student.h1") },
    'youngStudentCapacity': { label: t("ui.emoji.young_student.h1")+t("ui.citizens.young_student.h1"), desc: t("ui.capdesc.young_student.h1") },

    'productClothUsage': { label: t("ui.emoji.cloth.h1")+t("ui.label.product_cloth.h1"), desc: t("ui.usagedesc.product_cloth.h1") },
    'productClothCapacity': { label: t("ui.emoji.cloth.h1")+t("ui.label.product_cloth.h1"), desc: t("ui.capdesc.product_cloth.h1") },

    'taxUsage': { label: t("ui.emoji.tax.h1")+t("ui.label.tax.h1"), desc: t("ui.capdesc.tax.h1") },
    'taxCapacity': { label: t("ui.emoji.tax.h1")+t("ui.label.tax.h1"), desc: t("ui.usagedesc.tax.h1") },

    'taxHealthUsage': { label: t("ui.emoji.tax_health.h1")+t("ui.label.tax_health.h1"), desc: t("ui.capdesc.tax_health.h1") },
    'taxHealthCapacity': { label: t("ui.emoji.tax_health.h1")+t("ui.label.tax_health.h1"), desc: t("ui.usagedesc.tax_health.h1") },

    'transportUsage': { label: t("ui.emoji.transport.h1")+t("ui.label.transport.h1"), desc: t("ui.capdesc.transport.h1") },
    'transportCapacity': { label: t("ui.emoji.transport.h1")+t("ui.label.transport.h1"), desc: t("ui.usagedesc.transport.h1") },
    'transportGodsUsage': { label: t("ui.emoji.transport_gods.h1")+t("ui.label.transport_gods.h1"), desc: t("ui.capdesc.transport_gods.h1") },
    'transportGodsCapacity': { label: t("ui.emoji.transport_gods.h1")+t("ui.label.transport_gods.h1"), desc: t("ui.usagedesc.transport_gods.h1") },
    'transportPassengerCapacity': { label: t("ui.emoji.transport_passenger.h1")+t("ui.label.transport_passenger.h1"), desc: t("ui.capdesc.transport_passenger.h1") },
    'transportPassengerUsage': { label: t("ui.emoji.transport_passenger.h1")+t("ui.label.transport_passenger.h1"), desc: t("ui.usagedesc.transport_passenger.h1") },
    'socialCapacity': { label: t("ui.emoji.social.h1")+t("ui.label.social.h1"), desc: t("ui.capdesc.social.h1") },
    'socialUsage': { label: t("ui.emoji.social.h1")+t("ui.label.social.h1"), desc: t("ui.usagedesc.social.h1") },
    'cultureCapacity': { label: t("ui.emoji.culture.h1")+t("ui.label.culture.h1"), desc: t("ui.capdesc.culture.h1") },
    'cultureUsage': { label: t("ui.emoji.culture.h1")+t("ui.label.culture.h1"), desc: t("ui.usagedesc.culture.h1") },
    'religionCapacity': { label: t("ui.emoji.religion.h1")+t("ui.label.religion.h1"), desc: t("ui.capdesc.religion.h1") },  
    'religionUsage': { label: t("ui.emoji.religion.h1")+t("ui.label.religion.h1"), desc: t("ui.usagedesc.religion.h1") },
    'civilizationCapacity': { label: t("ui.emoji.civilization.h1")+t("ui.label.civilization.h1"), desc: t("ui.capdesc.civilization.h1") },  
    'civilizationUsage': { label: 't("ui.emoji.civilization.h1")+t("ui.label.civilization.h1")', desc: t("ui.usagedesc.civilization.h1") },


    // ... tilføj flere efter behov
  };

  // alias: sørg for gamle/alternate nøgler peger på samme entry
  map.provision_cap = map.provisionCapacity;
  map.housing = map.housingCapacity;
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
