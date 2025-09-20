import React, { useMemo } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { computeStatsEffects, resolveSelectedMetrics } from '../services/statsEffects.js';

/**
 * Props:
 * - metrics: string | string[]     // "footprint" | "animal" | "solid" | "liquid" eller kombi
 * - mode: "give" | "take" | "both" // default "both"
 * - groupByMetric: boolean         // default true, grupperer per metric
 * - title: string                  // overskrift (valgfri)
 * - emptyText: string              // vises hvis ingen effekter (default "Ingen")
 */
export default function StatsEffectsList({
  metrics,
  mode = 'both',
  groupByMetric = true,
  title,
  emptyText = 'Ingen',
  className = '',
  style,
}) {
  const { data } = useGameData() || {};
  const defs = data?.defs || {};
  const state = data?.state || {};

  const result = useMemo(() => computeStatsEffects({ defs, state, metrics, mode }), [defs, state, metrics, mode]);
  const selected = result.selected;

  const Label = ({ m }) => {
    const nice = {
      footprint: 'Footprint',
      animal_cap: 'Animal cap',
      storageSolidCap: 'Solid cap',
      storageLiquidCap: 'Liquid cap',
    }[m] || m;
    return <span style={{ textTransform: 'none' }}>{nice}</span>;
  };

  const Section = ({ heading, items }) => (
    <div style={{ marginBottom: 8 }}>
      {heading ? <div style={{ fontWeight: 700, marginBottom: 4 }}>{heading}</div> : null}
      {items.length === 0 ? (
        <div className="sub" style={{ opacity: 0.7 }}>{emptyText}</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ display: 'flex', gap: 8, padding: '2px 0', alignItems: 'center' }}>
              <span style={{ opacity: 0.7, minWidth: 60 }}>{it.sourceType.toUpperCase()}</span>
              <span style={{ flex: 1 }}>{it.name || it.sourceId}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {it.amount > 0 ? '+' : ''}{it.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (!selected?.length) return null;

  if (groupByMetric) {
    return (
      <div className={className} style={style}>
        {title ? <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
        {selected.map((m) => (
          <div key={m} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}><Label m={m} /></div>
            {mode !== 'take' && <Section heading="Giver (+)" items={result.positiveByMetric[m]} />}
            {mode !== 'give' && <Section heading="Tager (-)" items={result.negativeByMetric[m]} />}
          </div>
        ))}
      </div>
    );
  }

  // Flat rendering uden gruppering
  const posFlat = selected.flatMap(m => result.positiveByMetric[m].map(x => ({ ...x, _m: m })));
  const negFlat = selected.flatMap(m => result.negativeByMetric[m].map(x => ({ ...x, _m: m })));

  return (
    <div className={className} style={style}>
      {title ? <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
      {mode !== 'take' && <Section heading="Giver (+)" items={posFlat} />}
      {mode !== 'give' && <Section heading="Tager (-)" items={negFlat} />}
    </div>
  );
}

// Valgfri named-exports til “funktionel” brug (uden UI)
export { computeStatsEffects, resolveSelectedMetrics } from '../services/statsEffects.js';