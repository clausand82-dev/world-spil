import React from 'react';
import * as MP from './managementparts.jsx';

const AREAS = [
  { value: 'schools', label: 'Skoler' },
  { value: 'stadium', label: 'Stadion' },
  { value: 'harbor',  label: 'Havn' },
  { value: 'mall',    label: 'Indkøbscenter' },
];

export default function PoliceTab({ choices, setChoice }) {
  const toggleFromList = (key, val, checked) => {
    const cur = new Set(choices[key] || []);
    if (checked) cur.add(val); else cur.delete(val);
    setChoice(key, Array.from(cur));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Økonomi</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Løn (DKK per officer)</div>
            <input
              type="number"
              min={10000}
              max={100000}
              step={500}
              value={choices.police_salary ?? 0}
              onChange={(e)=>setChoice('police_salary', e.target.value === '' ? '' : Number(e.target.value))}
              style={{ width: 200, padding: '6px 8px' }}
            />
          </label>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Indsatser</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!choices.police_campaign_traffic}
            onChange={(e)=>setChoice('police_campaign_traffic', e.target.checked)}
          />
          Kampagne: Trafiksikkerhed
        </label>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Patruljestrategi</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {[
              { value: 'visible', label: 'Synlig patrulje' },
              { value: 'rapid',   label: 'Hurtig respons' },
              { value: 'mixed',   label: 'Blandet' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  checked={choices.police_patrol_strategy === opt.value}
                  onChange={()=>setChoice('police_patrol_strategy', opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Prioriterede områder (flere valg)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            {AREAS.map(a => (
              <label key={a.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={(choices.police_priority_areas || []).includes(a.value)}
                  onChange={(e)=>toggleFromList('police_priority_areas', a.value, e.target.checked)}
                />
                {a.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}