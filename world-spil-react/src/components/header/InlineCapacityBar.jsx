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

  // displayPct: hvis scaleMaxDelta>0 bruger vi gammel "delta"-mode (skaleret),
  // ellers viser vi den faktiske brug (rawPct) clamped til 0..100
  let displayPct;
  if (scaleMaxDelta > 0) {
    displayPct = Math.min(100, (delta / scaleMaxDelta) * 100);
  } else {
    displayPct = Math.min(100, Math.max(0, rawPct));
  }

  // Farver opdelt i ønskede intervaller:
  // 0-75% -> blå
  // 76-95% -> orange
  // 96-100% -> rød
  // >100% -> mørk rød
  // >=200% -> meget mørk rød
  const blueGradient = 'linear-gradient(90deg,#2c7be5,#06b6d4)'; // 0-75
  const orangeGradient = 'linear-gradient(90deg,#ffb020,#ff7a18)'; // 76-95
  const redGradient = 'linear-gradient(90deg,#ff7b72,#d9534f)'; // 96-100
  const darkRedGradient = 'linear-gradient(90deg,#6b0505,#3c0200)'; // >100
  const veryDarkRedGradient = 'linear-gradient(90deg,#300000,#120000)'; // >=200 extreme

  let fillGradient;
  if (rawPct >= 200) {
    fillGradient = veryDarkRedGradient;
  } else if (rawPct > 100) {
    fillGradient = darkRedGradient;
  } else if (rawPct >= 96) {
    fillGradient = redGradient;
  } else if (rawPct >= 76) {
    fillGradient = orangeGradient;
  } else {
    fillGradient = blueGradient;
  }

  // Tekstfarve: lys tekst ved høj brug (for kontrast), ellers lysere grå
  const textColor = rawPct >= 60 || rawPct > 100 ? '#fff' : '#cbd5e1';
  const labelColor = '#cbd5e1';

  const bar = (
    <div
      role="group"
      aria-label={`${label} kapacitet`}
      title={typeof hoverContent === 'string' ? hoverContent : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: 20,
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
      {/* fill baseret på displayPct */}
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
            transition: 'width 260ms ease, background 260ms ease',
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
          {! (rawPct > 100) && rawPct < 100 && <span style={{ marginLeft: 8, color: '#9ae6ff', fontWeight: 600 }}>-{Math.round(100 - rawPct)}%</span>}
          {rawPct > 100 && <span style={{ marginLeft: 8, color: rawPct >= 200 ? '#ffdede' : '#ffd6d6', fontWeight: 600 }}>+{Math.round(rawPct - 100)}%</span>}
        </div>
      </div>
    </div>
  );

  if (!hoverContent) return bar;
  return <HoverCard content={hoverContent}>{bar}</HoverCard>;
}