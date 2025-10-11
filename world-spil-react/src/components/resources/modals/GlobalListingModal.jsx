import React, { useMemo, useState } from 'react';
import { getGlobalRefPrice } from '../../../utils/priceCatalog.js';

export default function GlobalListingModal({
  isOpen,
  resId,
  resName,
  resEmoji,
  maxAmount,
  onCancel,
  onSubmit
}) {
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(() => getGlobalRefPrice(resId) || 0);

  // display helpers (fallback formatting)
  const formatResName = (id) => {
    if (!id) return '';
    return String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };
  const displayName = resName || formatResName(resId);
  const displayEmoji = typeof resEmoji === 'string' && resEmoji ? resEmoji : '';

  // recalc default price when resId changes
  useMemo(() => { setPrice(getGlobalRefPrice(resId) || 0); }, [resId]);

  if (!isOpen) return null;

  return (
    <div
      // backdrop: full-screen, dark, centered
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2,6,23,0.6)',
        padding: 20,
        backdropFilter: 'blur(2px)'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel && onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Opret global annonce"
        style={{
          width: 'min(720px, 96%)',
          maxWidth: 560,
          borderRadius: 12,
          padding: 18,
          background: 'var(--panel-bg, #071128)',
          color: 'var(--text, #e6eef8)',
          boxShadow: '0 12px 40px rgba(2,6,23,0.7)',
          display: 'block'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Opret global annonce</div>
          <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20 }}>{displayEmoji}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1' }}>
              Ressource: <b style={{ color: '#fff' }}>{displayName}</b>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Antal</label>
            <input
              type="number"
              min={0}
              max={maxAmount}
              value={qty}
              onChange={(e) => setQty(Math.max(0, Math.min(+e.target.value || 0, maxAmount)))}
              style={{ flex: '0 0 120px', padding: '6px 8px', borderRadius: 6 }}
            />
            <span style={{ color: '#6b7280' }}>(max {maxAmount})</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Pris</label>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value || 0))}
              style={{ flex: '0 0 120px', padding: '6px 8px', borderRadius: 6 }}
            />
            <span style={{ color: '#6b7280' }}>Kr / stk (ref)</span>
          </div>

          <div>Samlet indtjening: <b>{ Math.round(qty * price) }</b> Kr</div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Fortryd</button>
            <button className="tab" disabled={qty <= 0} onClick={() => onSubmit({ qty, price })}>
              Opret annonce
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}