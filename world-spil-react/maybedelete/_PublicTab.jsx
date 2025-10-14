import React from 'react';
import * as MP from './managementparts.jsx';

export default function PublicTab({ choices, setChoice }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Tandlæge‑ordninger</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!choices.free_dentist_children}
            onChange={(e)=>setChoice('free_dentist_children', e.target.checked)}
          />
          Gratis tandlæge — børn
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!choices.free_dentist_young}
            onChange={(e)=>setChoice('free_dentist_young', e.target.checked)}
          />
          Gratis tandlæge — unge
        </label>
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Tilskud til sundhed (procent)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={choices.public_health_subsidy_pct ?? 0}
            onChange={(e)=>setChoice('public_health_subsidy_pct', Number(e.target.value))}
          />
          <div style={{ minWidth: 60, textAlign: 'right' }}>{Math.round(choices.public_health_subsidy_pct || 0)}%</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Ydelses‑model</div>
        <select
          value={choices.public_benefit_mode}
          onChange={(e)=>setChoice('public_benefit_mode', e.target.value)}
          style={{ padding: '6px 8px', width: 220 }}
        >
          <option value="none">Ingen</option>
          <option value="poverty">Fattigdoms‑fokus</option>
          <option value="kids">Børn‑fokus</option>
          <option value="elderly">Ældre‑fokus</option>
        </select>
      </div>
    </div>
  );
}