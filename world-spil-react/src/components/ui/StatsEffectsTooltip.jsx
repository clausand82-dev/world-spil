import React from 'react';
import { useT } from "../../services/i18n.js";

/**
 * StatsEffectsTooltip
 * - def: object for en definition (bld/add/rsd/ani/res). Forventes at indeholde enten:
 *    def.stats as object { key: value, ... }
 *    eller def.stats as string "k=v;k2=v2;..."
 * - translations (optional): object med oversættelser fx { 'stat.provision_cap.label': 'Provision', ... }
 *
 * Output: simpelt UI (label + value [+ short desc]) som kan bruges i HoverCard content.
 *
 * NOTE: Hardcoded labels/descriptions nu — swap til jeres i18n ved at sende translations eller ved at hente fra useGameData().
 */

function parseStatsField(stats) {
  if (!stats) return {};
  if (typeof stats === 'object') return stats;
  if (typeof stats === 'string') {
    const parts = stats.split(';').map(s => s.trim()).filter(Boolean);
    const out = {};
    for (const p of parts) {
      const [k, v = ''] = p.split('=', 2).map(s => s.trim());
      if (k === '') continue;
      // Prøv konverter til int hvis muligt
      const num = Number(v);
      out[k] = (!Number.isNaN(num) && v !== '') ? num : v;
    }
    return out;
  }
  return {};
}

function defaultLabelMap() {
  // Her hardcode vi labels + (valgfri) korte forklaringer.
  // Byt senere med i18n keys / oversætterfunktion.
  const t = useT();

  return {
    'footprint': { label: t("ui.emoji.footprint.h1")+'Byggeplads', desc: 'Plads på kortet (m²).' },
    'animal_cap': { label: t("ui.emoji.animalcap.h1")+'Dyreplads', desc: 'Plads til dyr (hvor mange dyr). Nogle dyr fylder mere end andre dyr.' },
    'housing': { label: t("ui.emoji.housing.h1")+'Indbygger plads', desc: 'Plads til indbyggere (hvor mange indbyggere).' },
    'provision_cap': { label: t("ui.emoji.provision.h1")+'Provision', desc: 'Forsyningskapacitet (hvor mange borgere).' },
    'provisionCapacity': { label: t("ui.emoji.provision.h1")+'Provision', desc: 'Forsyningskapacitet (hvor mange borgere).' },
    'healthCapacity': { label: t("ui.emoji.health.h1")+'Sundhed', desc: 'Kapacitet til helbred/medicin.' },
    'adultsPoliceCapacity': { label: t("ui.emoji.adults_police.h1")+'Politi', desc: 'Hvor mange politifolk bygningen understøtter.' },
    'adultsFireCapacity': { label: t("ui.emoji.adults_fire.h1")+'Brandvæsen', desc: 'Brandkapacitet.' },
    'adultsHealthCapacity': { label: t("ui.emoji.adults_health.h1")+'Sundhedspersonale', desc: 'Sundhedspersonale kapacitet.' },
    'adultsSoldierCapacity': { label: t("ui.emoji.adults_soldier.h1")+'Soldater', desc: 'Militærkapacitet.' },
    'kidsStudentCapacity': { label: t("ui.emoji.kids_student.h1")+'Børn (stud.)', desc: 'Plads til børn i skole.' },
    'youngStudentCapacity': { label: t("ui.emoji.young_student.h1")+'Unge (stud.)', desc: 'Plads til unge i skole.' },
    'heatFossilCapacity': { label: t("ui.emoji.heat.h1")+'Varme (fossil)', desc: 'Varmekapacitet (fossil).' },
    'healthUnitCapacity': { label: t("ui.emoji.health_unit.h1")+'Udstyr Kapacitet', desc: 'Kapacitet til sundheds udstyr.' },
    'storageSolidCap': { label: t("ui.emoji.storage_solid.h1")+'Lagerplads (fast)', desc: 'Lagerplads til faste varer.' },
    'storageLiquidCap': { label: t("ui.emoji.storage_liquid.h1")+'Lagerplads (flydende)', desc: 'Lagerplads til flydende varer.' },
    'healthUnitUsage': { label: t("ui.emoji.health_unit.h1")+'Udstyr Forbrug', desc: 'Hvor meget udstyrsplads, der forbruges pr. enhed.' },
    'waterUsage': { label: t("ui.emoji.water.h1")+'Vandforbrug', desc: 'Hvor meget vand der forbruges pr. enhed.' },
    'waterCapacity': { label: t("ui.emoji.water.h1")+'Vandkapacitet', desc: 'Kapacitet til vand (hvor meget vand der kan leveres).' },
    'provisionUsage': { label: t("ui.emoji.provision.h1")+'Provision forbrug', desc: 'Hvor meget provision der forbruges pr. enhed.' },
    'wasteOtherUsage': { label: t("ui.emoji.waste.h1")+'Affalds (andet) forbrug', desc: 'Hvor meget affald (andet) laves.' },
    'wasteOtherCapacity': { label: t("ui.emoji.waste.h1")+'Affald (andet) kapacitet', desc: 'Hvor meget affald (andet) der kan opbevares og behandles.' },
    'productClothUsage': { label: t("ui.emoji.cloth.h1")+'Tøj forbrug', desc: 'Mængde tøj der er brug for.' },
    'productClothCapacity': { label: t("ui.emoji.cloth.h1")+'Tøj Kapacitet', desc: 'Kapacitet til tøj.' },

    // ... tilføj flere efter behov
  };
}

function fmtNum(v) {
  if (typeof v === 'number') return v.toLocaleString('da-DK');
  return String(v);
}

export default function StatsEffectsTooltip({ def, translations = {} }) {
  const stats = parseStatsField(def?.stats ?? def?.stat ?? {});

  const map = defaultLabelMap();

  // Funktion til at hente label/desc — prøver translations først, ellers map, ellers fall back
  const getLabelDesc = (key) => {
    // translations: forvent nøgler som 'stat.provision_cap.label' og 'stat.provision_cap.desc'
    const tLabel = translations[`stat.${key}.label`] ?? translations[`${key}.label`] ?? null;
    const tDesc  = translations[`stat.${key}.desc`]  ?? translations[`${key}.desc`]  ?? null;
    if (tLabel || tDesc) return { label: tLabel || key, desc: tDesc || '' };

    if (map[key]) return { label: map[key].label || key, desc: map[key].desc || '' };

    // Fallback: prøv nogle simple transform på key (snake -> Title Case)
    const pretty = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const label = pretty.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    return { label, desc: '' };
  };

  const rows = Object.entries(stats)
    // Filtrer null/0/'' ? Vi viser 0 også, så brugeren kan se effekten.
    .filter(([k]) => k && k !== 'id')
    .map(([k, v]) => {
      const { label, desc } = getLabelDesc(k);
      return { key: k, label, desc, value: v };
    });

  if (rows.length === 0) {
    return <div style={{ maxWidth: 320, color: '#666' }}>Ingen stats.</div>;
  }

  return (
    <div style={{ maxWidth: 380 }}>
      <div style={{ fontWeight: 700, marginBottom: 0 }}>{def?.display_name ?? def?.name ?? def?.id} </div>
      <div style={{ fontWeight: 0, marginBottom: 8, fontSize: 11, color: '#666' }}>{def?.display_desc ?? def?.desc ?? def?.id}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map(r => (
          <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
              {r.desc ? <div style={{ fontSize: 11, color: '#666' }}>{r.desc}</div> : null}
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 60 }}>{fmtNum(r.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}