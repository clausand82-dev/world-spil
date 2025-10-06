import React, { useMemo, useState } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import HoverCard from '../ui/HoverCard.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import {useStatsLabels, popularityEmojiFromScore} from '../../hooks/useStatsLabels.js';

// Simpel farvekodning/emoji som i happiness


// Venlige labels for kendte metrics
/*const LABELS = {
  housing: 'Housing',
  food: 'Provision',
  water: 'Vand',
  health: 'Sundhed',
  heat: 'Varme',
  power: 'Strøm',
  powerGreen: 'Strøm (Grøn)',
  powerNuclear: 'Strøm (Nuclear)',
  powerFossil: 'Strøm (Fossil)',
  heatGreen: 'Varme (Grøn)',
  heatNuclear: 'Varme (Nuclear)',
  heatFossil: 'Varme (Fossil)',
  cloth: 'Tøj',
  medicin: 'Medicin',
  wasteOther: 'Affald (Andet)',
};*/

export default function HeaderPopularityBadge() {
  const { data, loading, err } = useHeaderSummary();
  const [hoverKey, setHoverKey] = useState(null);
  const LABELS = useStatsLabels(); // Henter LABELS fra hook

  if (err) return null;
  const p = data?.popularity ?? { impacts: {}, weightTotal: 0, impactTotal: 0, popularity: 0 };

  const score01 = Number(p.popularity || 0);
  const pct = Math.round(score01 * 100);
  const emoji = popularityEmojiFromScore(score01);

  // Lav rækker ud fra backend-impacts
  const rows = useMemo(() => {
    const impacts = p.impacts || {};
    const list = Object.entries(impacts).map(([key, imp]) => {
      const label = LABELS[key] || key;
      const used = Number(imp.used || 0);
      const cap = Number(imp.capacity || 0);
      const score = Number(imp.score || 0);
      const weight = Number(imp.weight || 0);
      const impact = Number(imp.impact || 0);
      return {
        key, label, used, cap,
        scorePct: Math.round(score * 100),
        weight, impact,
      };
    });
    // Sortér efter impact (desc), derefter vægt
    list.sort((a, b) => (b.impact - a.impact) || (b.weight - a.weight));
    return list;
  }, [p.impacts, LABELS]);

  const hover = (
    <div style={{ minWidth: 260, maxWidth: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>Popularity breakdown</strong>
        <span style={{ opacity: 0.75 }}>Σw={Math.round(p.weightTotal || 0)}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Ingen aktive kategorier.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {rows.map(r => (
            <li
              key={r.key}
              onMouseEnter={() => setHoverKey(r.key)}
              onMouseLeave={() => setHoverKey(null)}
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                background: hoverKey === r.key ? 'rgba(76, 175, 80, 0.10)' : 'transparent',
                transition: 'background 120ms linear',
              }}
            >
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{r.label}</strong>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>
                    brug: {r.used.toLocaleString()} / {r.cap.toLocaleString()}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>{r.scorePct}%</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Weight:{r.weight}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}<span style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}><hr></hr>Se detaljer i <a href="#/help?topic=stats-popularity">Hjælp: Popularity</a> og <a href="#/help?topic=stats-overview">Hjælp: Stats</a>.</span>
    </div>
  );

  return (
    <HoverCard content={hover}>
      <div
        title={undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', userSelect: 'none', fontSize: 14,
        }}
      >
        <span className="res-chip" title={undefined} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span role="img" aria-label="popularity" style={{ fontSize: 16 }}>📣</span>
        <span style={{ fontWeight: 600 }}>{pct}%</span>
        <span>{emoji}</span>
        </span>
      </div>
    </HoverCard>
  );
}