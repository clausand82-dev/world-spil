import React from 'react';
import HoverCard from '../ui/HoverCard.jsx';

export default function InlineCapacityBar({
  label,
  used = 0,
  capacity = 0,
  hoverContent = null,
  scaleMaxDelta = 0, // største |pct-100| fra listen
}) {
  const u = Math.max(0, Number(used) || 0);
  const c = Math.max(0, Number(capacity) || 0);

  const rawPct = c > 0 ? (u / c) * 100 : (u > 0 ? 200 : 0); // reel pct (kan >100)
  const roundedRaw = Math.round(rawPct);
  const delta = Math.abs(rawPct - 100); // afvigelse fra 100%

  // visuel længde baseret på delta relativt til scaleMaxDelta
  const displayPct = scaleMaxDelta > 0 ? Math.min(100, (delta / scaleMaxDelta) * 100) : Math.min(100, delta);

  // farver: under -> blå, over -> rød; ekstrem over (>=200) -> mørkerød
  const isOver = rawPct > 100;
  const redGradient = rawPct >= 200
    ? 'linear-gradient(90deg,#6b0505,#3c0200)'
    : 'linear-gradient(90deg,#ff7b72,#d9534f)';
  const blueGradient = 'linear-gradient(90deg,#2c7be5,#06b6d4)';

  const fillGradient = isOver ? redGradient : blueGradient;
  const textColor = isOver || roundedRaw >= 60 ? '#fff' : '#cbd5e1';
  const labelColor = '#cbd5e1';

  const bar = (
    <div
      role="group"
      aria-label={`${label} kapacitet`}
      title={typeof hoverContent === 'string' ? hoverContent : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: 16,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'linear-gradient(90deg,#0b1220,#0f1724)',
        border: '1px solid rgba(255,255,255,0.03)',
        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 10,
      }}
    >
      {/* fill baseret på scaled delta */}
      {displayPct > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${displayPct}%`,
            background: fillGradient,
            transition: 'width 260ms ease',
            zIndex: 0,
          }}
        />
      )}

      {/* 100% marker for reference */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '100%',
          top: 3,
          bottom: 3,
          width: 2,
          transform: 'translateX(-100%)',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 2,
          zIndex: 1,
        }}
      />

      {/* overlay text */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: labelColor }}>
            {label} ({u.toLocaleString()} / {c.toLocaleString()})
          </div>
        </div>

        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: textColor, fontSize: 12 }}>
          {Math.round(rawPct)}%
          {!isOver && rawPct < 100 && <span style={{ marginLeft: 8, color: '#9ae6ff', fontWeight: 600 }}>-{Math.round(100 - rawPct)}%</span>}
          {isOver && <span style={{ marginLeft: 8, color: rawPct >= 200 ? '#ffdede' : '#ffd6d6', fontWeight: 600 }}>+{Math.round(rawPct - 100)}%</span>}
        </div>
      </div>
    </div>
  );

  if (!hoverContent) return bar;
  return <HoverCard content={hoverContent}>{bar}</HoverCard>;
}