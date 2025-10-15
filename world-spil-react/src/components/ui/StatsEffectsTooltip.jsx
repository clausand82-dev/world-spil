import React from 'react';
import { useT } from "../../services/i18n.js";
import {defaultLabelMap} from '../../hooks/useStatsLabels.js';

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

      // afgør prefix ud fra key-navn (case-insensitive) footprint og housing er med seperat nævnt for at virke korrekt
      const lk = String(k).toLowerCase();
      let prefix = '';
      if (lk.includes('cap') || lk.includes('capacity') || lk.includes('footprint') || lk.includes('housing')) prefix = '+';
      else if (lk.includes('usage') || lk.includes('use')) prefix = '-';

let display;
if (typeof v === 'number') {
  // altid viste tegn: +10, -5, 0 => +0
  const nf = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2, signDisplay: 'always' });
  display = nf.format(v);
} else {
  display = `${prefix}${String(v)}`;
}

      // farvelogik: plus = grøn, minus = rød; negative tal altid rød
      let color = '#000000ff';
      if (typeof v === 'number' && v < 0) color = '#ff6b6b';
      else if (prefix === '+') color = '#16a34a'; // grøn
      else if (prefix === '-') color = '#ef4444'; // rød

      return { key: k, label, desc, value: v, display, color };
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
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 60, color: r.color }}>
              {r.display}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}