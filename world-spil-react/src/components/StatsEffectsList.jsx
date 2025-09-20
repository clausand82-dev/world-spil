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
 * - showTotals: boolean            // default true, viser samlet +, - og netto i bunden
 */
export default function StatsEffectsList({
  metrics,
  mode = 'both',
  groupByMetric = true,
  title,
  emptyText = 'Ingen',
  showTotals = true,
  className = '',
  style,
}) {
  const { data } = useGameData() || {};
  const defs = data?.defs || {};
  const state = data?.state || {};

  const result = useMemo(() => {
    return computeStatsEffects({ defs, state, metrics, mode });
  }, [defs, state, metrics, mode]);

  const selected = result.selected;

  const fmtNum = (n) => {
    const v = Number(n ?? 0);
    return (v > 0 ? '+' : '') + v;
  };

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
                {fmtNum(it.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const Totals = ({ positiveItems, negativeItems }) => {
    if (!showTotals) return null;
    const posSum = positiveItems.reduce((a, e) => a + (e.amount ?? 0), 0);
    const negSum = negativeItems.reduce((a, e) => a + (e.amount ?? 0), 0); // negSum er (typisk) negativ
    const negAbs = Math.abs(negSum);
    const net = posSum + negSum;

    // Når mode ikke viser begge sider, giver vi stadig en tydelig total af det viste
    const parts = [];
    if (mode !== 'cost' && mode !== 'take') parts.push(`+${posSum}`);
    if (mode !== 'give') parts.push(`-${negAbs}`);
    // Vis altid Netto hvis begge sider er med, ellers bare summen af den viste side
    const summary = (mode === 'both') ? `Netto: ${net >= 0 ? '+' : ''}${net}` : undefined;

    return (
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6, marginTop: 6, fontWeight: 700, display: 'flex', gap: 12 }}>
        <span>Total:</span>
        {parts.map((p, i) => <span key={i}>{p}</span>)}
        {summary ? <span style={{ marginLeft: 'auto' }}>{summary}</span> : null}
      </div>
    );
  };

  if (!selected?.length) return null;

  if (groupByMetric) {
    return (
      <div className={className} style={style}>
        {title ? <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
        {selected.map((m) => {
          const positiveItems = result.positiveByMetric[m] || [];
          const negativeItems = result.negativeByMetric[m] || [];
          return (
            <div key={m} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}><Label m={m} /></div>
              {mode !== 'take' && <Section heading="Giver (+)" items={positiveItems} />}
              {mode !== 'give' && <Section heading="Tager (-)" items={negativeItems} />}
              <Totals positiveItems={positiveItems} negativeItems={negativeItems} />
            </div>
          );
        })}
      </div>
    );
  }

  // Flat rendering (samlet for alle valgte metrics)
  const posFlat = selected.flatMap(m => result.positiveByMetric[m].map(x => ({ ...x, _m: m })));
  const negFlat = selected.flatMap(m => result.negativeByMetric[m].map(x => ({ ...x, _m: m })));

  return (
    <div className={className} style={style}>
      {title ? <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
      {mode !== 'take' && <Section heading="Giver (+)" items={posFlat} />}
      {mode !== 'give' && <Section heading="Tager (-)" items={negFlat} />}
      <Totals positiveItems={posFlat} negativeItems={negFlat} />
    </div>
  );
}

export { computeStatsEffects, resolveSelectedMetrics } from '../services/statsEffects.js';