import React, { useEffect, useMemo, useState } from 'react';

export default function BuyModal({
  isOpen,
  offer,               // objekt fra server { id, res_id, amount, price, seller, created_at, res_name?, res_emoji? }
  buyerMoney = 0,
  maxCapacityAmount = Infinity,
  onCancel,
  onBuy
}) {
  const [qty, setQty] = useState(0);

  useEffect(() => {
    setQty(offer ? Math.min(1, offer.amount || 0) : 0);
  }, [offer]);

  const formatResName = (id) => {
    if (!id) return '';
    return String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };

  // Accept multiple possible property names from server: res_name / resName / name
  const displayName = offer?.res_name || offer?.resName || offer?.name || formatResName(offer?.res_id || offer?.resId || '');
  // Accept multiple possible emoji fields and fall back to empty string
  const displayEmoji = offer?.res_emoji || offer?.resEmoji || offer?.emoji || '';

  const maxBuyable = useMemo(() => {
    if (!offer) return 0;
    return Math.min(Number(offer.amount || 0), Number(maxCapacityAmount || Infinity));
  }, [offer, maxCapacityAmount]);

  const totalPrice = useMemo(() => {
    return Math.round((qty || 0) * (Number(offer?.price || 0)));
  }, [qty, offer]);

  if (!isOpen || !offer) return null;

  return (
    <div
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
        aria-label="Køb tilbud"
        style={{
          width: 'min(720px, 96%)',
          maxWidth: 560,
          borderRadius: 12,
          padding: 18,
          background: 'var(--panel-bg, #071128)',
          color: 'var(--text, #e6eef8)',
          boxShadow: '0 12px 40px rgba(2,6,23,0.7)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Køb tilbud</div>
          <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{displayEmoji}</div>
            <div>
              <div style={{ fontSize: 14, color: '#cbd5e1' }}>Ressource</div>
              <div style={{ fontSize: 16, color: '#fff', fontWeight: 700 }}>{displayName}</div>
              {offer?.res_id ? <div style={{ fontSize: 12, color: '#94a3b8' }}>{offer.res_id}</div> : null}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Tilgængeligt</label>
            <div>{offer.amount}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Antal</label>
            <input
              type="number"
              min={1}
              max={maxBuyable}
              value={qty}
              onChange={(e) => {
                const v = Math.max(1, Math.min(maxBuyable, Number(e.target.value || 0)));
                setQty(Number.isFinite(v) ? v : 1);
              }}
              style={{ flex: '0 0 120px', padding: '6px 8px', borderRadius: 6 }}
            />
            <span style={{ color: '#6b7280' }}>(max {maxBuyable})</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 80 }}>Stk pris</label>
            <div>{offer.price} Kr</div>
          </div>

          <div>Samlet pris: <b>{totalPrice}</b> Kr</div>
          <div style={{ color: totalPrice > buyerMoney ? '#fca5a5' : '#94a3b8' }}>
            Dit beløb: <b style={{ color: '#fff' }}>{buyerMoney}</b> Kr
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Fortryd</button>
            <button
              className="tab"
              disabled={qty <= 0 || totalPrice > buyerMoney}
              onClick={() => onBuy && onBuy({ qty })}
            >
              Køb
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}