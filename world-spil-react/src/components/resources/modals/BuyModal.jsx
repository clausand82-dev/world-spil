import React, { useEffect, useMemo, useState } from 'react';

export default function BuyModal({ isOpen, offer, buyerMoney = 0, maxCapacityAmount = Infinity, onCancel, onBuy }) {
  const [qty, setQty] = useState(0);

  // Safe values from offer (guard if offer is null)
  const offerPrice = useMemo(() => {
    return Number((offer && Number.isFinite(Number(offer.price))) ? Number(offer.price) : 0);
  }, [offer]);

  const offerAmount = useMemo(() => {
    return Number((offer && Number.isFinite(Number(offer.amount))) ? Number(offer.amount) : 0);
  }, [offer]);

  // Reset qty when offer or open state changes
  useEffect(() => {
    setQty(0);
  }, [offer, isOpen]);

  // Compute maxBuy defensively
  const maxBuy = useMemo(() => {
    if (!offer) return 0;
    const byMoney = offerPrice > 0 ? Math.floor(Number(buyerMoney) / offerPrice) : 0;
    const byCapacity = Number.isFinite(maxCapacityAmount) ? Math.floor(maxCapacityAmount) : byMoney;
    return Math.max(0, Math.min(offerAmount, byMoney, byCapacity));
  }, [offer, offerPrice, offerAmount, buyerMoney, maxCapacityAmount]);

  const total = useMemo(() => {
    return +(qty * offerPrice).toFixed(2);
  }, [qty, offerPrice]);

  if (!isOpen) return null;

  // safety: if offer is null (shouldn't happen when open) show fallback
  if (!offer) {
    return (
      <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <div className="modal" role="dialog" aria-modal="true" style={{ width: 'min(480px,100%)', maxWidth: 480, borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Køb</div>
          <div style={{ marginTop: 12 }}>Tilbud ikke tilgængeligt.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="tab" onClick={onCancel}>Luk</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ width: 'min(480px,100%)', maxWidth: 480, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Køb</div>
          <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>Ressource: <b>{offer.res_id}</b></div>
          <div>Tilgængeligt: <b>{offerAmount}</b></div>
          <div>Stk pris: <b>{offerPrice}</b> res.money</div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Antal</label>
            <input
              type="number"
              min={0}
              max={maxBuy}
              value={qty}
              onChange={(e) => {
                const v = Math.max(0, Math.min(Math.floor(Number(e.target.value) || 0), maxBuy));
                setQty(v);
              }}
            />
            <span style={{ color: '#6b7280' }}>(max {maxBuy})</span>
          </div>

          <div>Samlet pris: <b>{total}</b> res.money</div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Annuller</button>
            <button className="tab" disabled={qty <= 0 || total > buyerMoney} onClick={() => onBuy?.({ qty, total })}>
              Køb
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}