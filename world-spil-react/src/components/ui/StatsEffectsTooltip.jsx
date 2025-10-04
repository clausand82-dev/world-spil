import React from 'react';

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
  return {
    'footprint': { label: 'Byggeplads', desc: 'Plads på kortet (m²).' },
    'animal_cap': { label: 'Dyreplads', desc: 'Plads til dyr (hvor mange dyr). Nogle dyr fylder mere end andre dyr.' },
    'housing': { label: 'Indbygger plads', desc: 'Plads til indbyggere (hvor mange indbyggere).' },
    'provision_cap': { label: 'Provision', desc: 'Forsyningskapacitet (hvor mange borgere).' },
    'provisionCapacity': { label: 'Provision', desc: 'Forsyningskapacitet (hvor mange borgere).' },
    'healthCapacity': { label: 'Sundhed', desc: 'Kapacitet til helbred/medicin.' },
    'adultsPoliceCapacity': { label: 'Politi', desc: 'Hvor mange politifolk bygningen understøtter.' },
    'adultsFireCapacity': { label: 'Brandvæsen', desc: 'Brandkapacitet.' },
    'adultsHealthCapacity': { label: 'Sundhedspersonale', desc: 'Sundhedspersonale-kapacitet.' },
    'adultsSoldierCapacity': { label: 'Soldater', desc: 'Militærkapacitet.' },
    'kidsStudentCapacity': { label: 'Kids (stud.)', desc: 'Plads til børn i skole.' },
    'youngStudentCapacity': { label: 'Young (stud.)', desc: 'Plads til unge i skole.' },
    'heatFossilCapacity': { label: 'Varme (fossil)', desc: 'Varmekapacitet (fossil).' },
    'healthUnitCapacity': { label: 'Sundhedsenhed', desc: 'Kapacitet til sundhedsenheder.' },
    'storageSolidCap': { label: 'Lagerplads (fast)', desc: 'Lagerplads til faste varer.' },
    'storageLiquidCap': { label: 'Lagerplads (flydende)', desc: 'Lagerplads til flydende varer.' },
    'healthUnitUsage': { label: 'Health Unit Forbrug', desc: 'Hvor mange health units der forbruges pr. enhed.' },
    'waterUsage': { label: 'Vandforbrug', desc: 'Hvor meget vand der forbruges pr. enhed.' },
    'provisionUsage': { label: 'Provision forbrug', desc: 'Hvor meget provision der forbruges pr. enhed.' },

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
      <div style={{ fontWeight: 700, marginBottom: 0 }}>{def?.display_name ?? def?.name ?? def?.id ?? 'Item'} </div>
      <div style={{ fontWeight: 0, marginBottom: 8, fontSize: 11, color: '#666' }}>{def?.display_desc ?? def?.desc ?? def?.id ?? 'Item'}</div>
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