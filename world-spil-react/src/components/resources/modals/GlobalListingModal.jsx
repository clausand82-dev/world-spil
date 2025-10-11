import React, { useEffect, useMemo, useState } from 'react';
import { getGlobalRefPrice } from '../../../utils/priceCatalog.js';

/**
 * Centered modal (fixed) for creating a global listing.
 */

export default function GlobalListingModal({ isOpen, resId, maxAmount, onCancel, onSubmit }) {
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(getGlobalRefPrice(resId));
  const total = useMemo(() => +(qty * price).toFixed(2), [qty, price]);

  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Hent konkurrent-liste for samme ressource
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/world-spil/backend/api/actions/marketplace_list.php?scope=global&res=${encodeURIComponent(resId)}`, {
      credentials: 'include',
    }).then(r => r.json()).then(j => {
      setPeers(j?.ok ? (j.data?.rows || []) : []);
    }).catch(() => setPeers([])).finally(() => setLoading(false));
  }, [isOpen, resId]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ width: 'min(920px,100%)', maxWidth: 920, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Sæt til salg (globalt)</div>
          <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>Ressource: <b>{resId}</b></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 100 }}>Antal</label>
            <input type="number" min={0} max={maxAmount} value={qty}
              onChange={(e) => setQty(Math.max(0, Math.min(+e.target.value || 0, maxAmount)))} />
            <span style={{ color: '#6b7280' }}>(max {maxAmount})</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ minWidth: 100 }}>Stk pris</label>
            <input type="number" min={0} step="0.01" value={price}
              onChange={(e) => setPrice(Math.max(0, +(e.target.value || 0)))} />
            <span style={{ color: '#6b7280' }}>res.money</span>
          </div>
          <div>Samlet pris: <b>{total}</b> res.money</div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Andres opslag</div>
            {loading ? <div>Indlæser...</div> : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <table className="table">
                  <thead>
                    <tr><th>Antal</th><th>Stk pris</th><th>Total</th><th>Tilføjet</th><th>Sælger</th></tr>
                  </thead>
                  <tbody>
                    {peers.length === 0 ? (
                      <tr><td colSpan={5} style={{ color: '#6b7280' }}>Ingen opslag endnu</td></tr>
                    ) : peers.map(r => (
                      <tr key={r.id}>
                        <td>{r.amount}</td>
                        <td>{r.price}</td>
                        <td>{+(r.amount * r.price).toFixed(2)}</td>
                        <td>{r.created_at}</td>
                        <td title={`${r.seller?.world_id || '?'} / ${r.seller?.map_id || '?'} @ ${r.seller?.x || '?'},${r.seller?.y || '?'}`}>
                          {r.seller?.username || 'Ukendt'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Annuller</button>
            <button className="tab" disabled={qty <= 0 || price <= 0} onClick={() => onSubmit({ qty, price, total })}>
              Sæt til salg
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}