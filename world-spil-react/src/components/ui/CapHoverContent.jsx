import React from 'react';
import StatsEffectsList from '../StatsEffectsList.jsx';

// capObj: { base, bonus, total, used }
export default function CapHoverContent({ title, metric, capObj }) {
  const base  = Number(capObj?.base ?? 0);
  const bonus = Number(capObj?.bonus ?? 0);
  const used  = Number(capObj?.used ?? 0);
  const total = Number(capObj?.total ?? 0);

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 420 }}>
      {title ? <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
      <div style={{ display: 'grid', gap: 2, marginBottom: 8 }}>
        <Row label="Brugt" value={used} />
        <Row label="Total" value={total} />
        <Row label="Base"  value={base} />
        <Row label="Bonus" value={bonus} />
      </div>
      <div style={{ borderTop: '1px solid #eee', margin: '6px 0', opacity: 0.6 }} />
      <StatsEffectsList
        metrics={[metric]}
        mode="both"
        groupByMetric={false}
        title="Kilder"
        showTotals={true}
      />
    </div>
  );
}