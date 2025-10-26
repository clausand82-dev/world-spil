import React from 'react';

export default function ProgressBar({ percent = 0 }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="build-progress" style={{ display: 'block', width: '100%' }}>
      <div className="pb-track" style={{ position: 'relative', height: 12, background: 'var(--border,#ddd)', borderRadius: 6, overflow: 'hidden' }}>
        <div className="pb-fill" style={{ height: '100%', width: `${pct}%`, background: 'var(--primary,#4aa)', transition: 'width 250ms linear' }} />
      </div>
    </div>
  );
}