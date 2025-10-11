import React, { useMemo, useState } from 'react';
import { getLocalSellPrice } from '../../../utils/priceCatalog.js';

/**
 * Centered modal (fixed) for local sell — always centered in viewport.
 */

export default function LocalSellModal({ isOpen, resId, maxAmount, onCancel, onAccepted }) {
  const [qty, setQty] = useState(0);
  const unit = useMemo(() => getLocalSellPrice(resId), [resId]);
  const total = useMemo(() => +(qty * unit).toFixed(2), [qty, unit]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ width: 'min(720px,100%)', maxWidth: 480, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Lokal handel</div>
          <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>Ressource: <b>{resId}</b></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Antal</label>
            <input type="number" min={0} max={maxAmount} value={qty}
              onChange={(e) => setQty(Math.max(0, Math.min(+e.target.value || 0, maxAmount)))} />
            <span style={{ color: '#6b7280' }}>(max {maxAmount})</span>
          </div>
          <div>Stk pris: <b>{unit}</b> res.money</div>
          <div>Samlet pris: <b>{total}</b> res.money</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Fortryd</button>
            <button className="tab" disabled={qty <= 0} onClick={() => onAccepted({ qty, unit, total })}>
              Accepter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}