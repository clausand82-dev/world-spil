import React, { useMemo, useState } from 'react';
import { getLocalSellPrice } from '../../../utils/priceCatalog.js';

/**
 * LocalSellModal: shows unit price (backend if available) formatted to 2 decimals,
 * and computes paid as whole number (ceil).
 */

export default function LocalSellModal({ isOpen, resId, resName, resEmoji, maxAmount, onCancel, onAccepted, unitFromBackend, loadingUnit }) {
  const [qty, setQty] = useState(0);
  const unitClient = useMemo(() => getLocalSellPrice(resId), [resId]);

  // unit used for calculation: prefer backend raw price if available, otherwise client estimate
  const unitRaw = unitFromBackend !== null ? Number(unitFromBackend) : Number(unitClient);

  // Displayed unit: always show with 2 decimal places
  const unitDisplay = useMemo(() => {
    return unitRaw !== null && unitRaw !== undefined ? Number(unitRaw).toFixed(2) : (Number(unitClient) || 0).toFixed(2);
  }, [unitRaw, unitClient]);

  // money model: we round UP to nearest whole unit for paid
  const paid = useMemo(() => {
    return qty > 0 ? Math.ceil(qty * unitRaw) : 0;
  }, [qty, unitRaw]);

  // display helpers (fallback formatting)
  const formatResName = (id) => {
    if (!id) return '';
    return String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };
  const displayName = resName || formatResName(resId);
  const displayEmoji = typeof resEmoji === 'string' && resEmoji ? resEmoji : '';

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2,6,23,0.6)',
        padding: 12,
        backdropFilter: 'blur(2px)'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel && onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lokal handel"
        style={{
          width: 'min(720px,100%)',
          maxWidth: 480,
          borderRadius: 10,
          padding: 16,
          background: 'var(--panel-bg, #071128)',
          color: 'var(--text, #e6eef8)',
          boxShadow: '0 12px 40px rgba(2,6,23,0.7)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Lokal handel</div>
          <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 18 }}>{displayEmoji}</div>
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

          <div>
            Stk pris: <b>{ loadingUnit ? '...' : unitDisplay }</b> Kr
            {unitFromBackend === null && !loadingUnit && <span style={{ color:'#9ca3af', marginLeft:8 }}> (est.)</span>}
          </div>

          <div>Samlet pris (afrundet op): <b>{ paid }</b> Kr</div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Fortryd</button>
            <button className="tab" disabled={qty <= 0 || loadingUnit} onClick={() => onAccepted({ qty })}>
              Accepter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}