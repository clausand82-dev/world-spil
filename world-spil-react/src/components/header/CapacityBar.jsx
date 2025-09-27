import React from 'react';
import HoverCard from '../ui/HoverCard.jsx';

export default function CapacityBar({ label, used, capacity, breakdown, style, titleOverride, hoverContent }) {
  const safeUsed = Math.max(0, Number(used) || 0);
  const safeCap  = Math.max(0, Number(capacity) || 0);
  const pct = safeCap > 0 ? Math.min(100, Math.round((safeUsed / safeCap) * 100)) : 0;

  const defaultTooltip = (() => {
    if (!breakdown) return '';
    const parts = [];
    for (const [k, v] of Object.entries(breakdown)) {
      parts.push(`${k}: ${v}`);
    }
    return parts.join(' | ');
  })();

  const base = (
    <div className="capacity-bar" style={{ minWidth: 200, ...style }} title={hoverContent ? undefined : (titleOverride ?? defaultTooltip)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span>
        <span>{safeUsed} / {safeCap}</span>
      </div>
      <div style={{ background: '#eee', borderRadius: 6, height: 10, position: 'relative' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 6,
            background: pct >= 100 ? '#d9534f' : '#2c7be5',
            transition: 'width 200ms linear'
          }}
        />
      </div>
    </div>
  );

  if (!hoverContent) return base;

  return (
    <HoverCard content={hoverContent}>
      {base}
    </HoverCard>
  );
}