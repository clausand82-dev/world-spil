import React, { useEffect, useMemo, useState } from 'react';
import BuyModal from './modals/BuyModal.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import { addMarketRefreshListener, removeMarketRefreshListener, triggerMarketRefresh  } from '../../events/marketEvents.js';

export default function MarketTab() {
  const tableCss = `
    .market-table { width:100%; table-layout: fixed; border-collapse: collapse; }
    .market-table thead th, .market-table tbody td { padding: 10px 12px; vertical-align: middle; }
    .market-table thead th { font-weight: 700; color: var(--text-muted, #94a3b8); font-size: 13px; text-align:left; }
    .market-table tbody tr { transition: background .12s ease, transform .08s ease; }
    .market-table tbody tr:hover { background: rgba(255,255,255,0.03); transform: translateY(-1px); }
    .market-table td.actions { text-align: right; white-space: nowrap; }
    .market-table col.resource { width:36%; }
    .market-table col.amount { width:8%; }
    .market-table col.price  { width:10%; }
    .market-table col.total  { width:12%; }
    .market-table col.seller { width:16%; }
    .market-table col.date   { width:10%; }
    .market-table col.actions{ width:8%; }
    .market-table .res-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .segmented { display:inline-flex; gap:6px; background:transparent; border-radius:10px; }
    .segmented button { padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.04); background:transparent; color:var(--text); cursor:pointer; }
    .segmented button.active { background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); border-color: rgba(255,255,255,0.08); }

    .market-toolbar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 18px 0; }
    .market-toolbar .search { flex:1 1 320px; display:flex; align-items:center; gap:8px; background:var(--panel-bg); border:1px solid rgba(255,255,255,0.04); padding:6px 10px; border-radius:10px; }
    .market-toolbar .search input { flex:1; background:transparent; border:0; color:var(--text); outline:none; font-size:14px; min-width:0; }
    .market-toolbar select, .market-toolbar input[type="text"] { background:var(--panel-bg); border:1px solid rgba(255,255,255,0.04); color:var(--text); padding:6px 8px; border-radius:8px; font-size:14px; }
    .market-toolbar .actions { margin-left:auto; display:flex; gap:8px; }
    .market-toolbar .tab.update { background: linear-gradient(90deg,#0ea5a0,#06b6d4); color:#021025; border:0; padding:8px 12px; border-radius:8px; }
  `;

  const { data: gameData, refetch } = useGameData();
  const userId = gameData?.state?.user?.userId ?? gameData?.state?.user?.user_id ?? 0;
  const money = Number((gameData?.state?.inv?.solid?.money ?? gameData?.state?.inv?.liquid?.money ?? 0));

  // data
  const [localRows, setLocalRows] = useState([]);
  const [globalRows, setGlobalRows] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  // view + filters (global only)
  const [viewMode, setViewMode] = useState('local'); // 'local' | 'global'
  const [q, setQ] = useState('');
  const [ownMode, setOwnMode] = useState('exclude'); // exclude | include | only
  const [sort, setSort] = useState('price_asc');

  // buy modal
  const [buyOffer, setBuyOffer] = useState(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyError, setBuyError] = useState(null);

  // confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState({ id: null, title: '', message: '', onConfirm: null });

  // success toast/modal
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // error modal state (shared)
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorPayload, setErrorPayload] = useState(null);
  const showError = (payload) => {
    if (!payload) payload = { message: 'Ukendt fejl' };
    setErrorPayload(payload);
    setErrorOpen(true);
  };

  // Render error details (try to convert common backend JSON into friendly text)
  const formatNumber = (v) => { const n = Number(v); if (!Number.isFinite(n)) return String(v); return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2); };
  const renderDetails = (details) => {
    if (typeof details === 'string') return details;
    if (!details || typeof details !== 'object') return String(details);

    // Storage/capacity error returned from backend
    if (details.need_space !== undefined && details.free_space !== undefined) {
      const unit = details.unit_space !== undefined ? Number(details.unit_space) : null;
      const need = Number(details.need_space || 0);
      const free = Number(details.free_space || 0);
      const used = details.used_space !== undefined ? Number(details.used_space) : null;
      const cap = (used !== null) ? (free + used) : null;
      const resName = (buyOffer && buyOffer.res_name) || details.res_name || details.resource || details.res_id || '';
      const qty = (buyError && buyError.details && buyError.details.amount) || details.amount || '';
      let out = '';
      if (resName) out += `Forsøgte at købe ${resName}${qty ? ` (${qty})` : ''}.\n`;
      if (unit !== null) out += `Plads pr. enhed: ${formatNumber(unit)}. `;
      out += `Kræver i alt: ${formatNumber(need)} plads. `;
      out += `Ledig plads: ${formatNumber(free)}.`;
      if (used !== null && cap !== null) out += ` (Brugt: ${formatNumber(used)} / Kapacitet: ${formatNumber(cap)})`;
      return out;
    }

    // Insufficient funds
    if (details.need !== undefined && details.have !== undefined) {
      return `Du mangler penge: Har ${formatNumber(details.have)}, kræver ${formatNumber(details.need)}.`;
    }

    // Amount exceeds available
    if (details.available !== undefined) {
      return `Tilgængelig mængde er kun ${formatNumber(details.available)}.`;
    }

    // Fallback: pretty-printed JSON
    try { return JSON.stringify(details, null, 2); } catch { return String(details); }
  };
  function ErrorModal({ isOpen, payload, onClose }) {
    if (!isOpen) return null;
    const msg = payload?.message || 'Ukendt fejl';
    const details = payload?.details ?? payload?.debug ?? payload?.error ?? null;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 31000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(2,6,23,0.6)',
          padding: 12,
          backdropFilter: 'blur(2px)'
        }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fejl"
          style={{
            width: 'min(760px, 94%)',
            maxWidth: 760,
            borderRadius: 10,
            padding: 16,
            background: 'var(--panel-bg, #071128)',
            color: 'var(--text, #e6eef8)',
            boxShadow: '0 12px 40px rgba(2,6,23,0.7)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Fejl</div>
            <button className="icon-btn" onClick={onClose} aria-label="Luk">✕</button>
          </div>

          <div style={{ marginBottom: 12, color: 'var(--price-bad, #ff8080)' }}>
            {msg}
          </div>

          {details && (
            <div style={{ marginBottom: 10, fontSize: 13, color: '#cbd5e1' }}>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Detaljer</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0, color: '#cbd5e1' }}>
                {renderDetails(details)}
              </pre>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="tab" onClick={onClose}>Luk</button>
          </div>
        </div>
      </div>
    );
  }

  function ConfirmModal({ isOpen, title, message, onCancel, onConfirm }) {
    if (!isOpen) return null;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 30000,
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
          aria-label={title || 'Bekræft'}
          style={{
            width: 'min(720px, 92%)',
            maxWidth: 520,
            borderRadius: 10,
            padding: 18,
            background: 'var(--panel-bg, #071128)',
            color: 'var(--text, #e6eef8)',
            boxShadow: '0 12px 40px rgba(2,6,23,0.7)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>{title || 'Bekræft'}</div>
            <button className="icon-btn" onClick={onCancel} aria-label="Luk">✕</button>
          </div>

          <div style={{ marginBottom: 14, color: '#cbd5e1' }}>{message}</div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tab" onClick={onCancel}>Fortryd</button>
            <button className="tab" onClick={() => { onConfirm && onConfirm(); }} style={{ background: 'linear-gradient(90deg,#ef4444,#f97316)', color: '#021025' }}>Bekræft</button>
          </div>
        </div>
      </div>
    );
  }

  function SuccessModal({ isOpen, message, onClose }) {
    if (!isOpen) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 30500, display: 'flex',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto'
      }}>
        <div style={{
          background: 'linear-gradient(180deg, #062031, #071128)', color: '#e6eef8',
          padding: 14, borderRadius: 10, boxShadow: '0 10px 30px rgba(2,6,23,0.6)', minWidth: 300
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Færdig</div>
          <div style={{ color: '#cbd5e1', marginBottom: 10 }}>{message}</div>
          <div style={{ textAlign: 'right' }}>
            <button className="tab" onClick={onClose}>Ok</button>
          </div>
        </div>
      </div>
    );
  }

  // defs lookup helper
  const defs = gameData?.defs || gameData?.data?.defs || gameData?.state?.defs || gameData?.state?.resourceDefs || {};

  function normalizeOffer(offer, defsObj) {
    if (!offer) return offer;
    const originalResId = offer.res_id || offer.resId || offer.resource || '';
    const lookupKey = String(originalResId).replace(/^res\./, '');
    const findDef = (d, key) => {
      if (!d || !key) return null;
      if (d.res && d.res[key]) return d.res[key];
      if (d[key]) return d[key];
      if (d.resources && d.resources[key]) return d.resources[key];
      if (d.byId && d.byId[key]) return d.byId[key];
      if (Array.isArray(d)) return d.find(x => x && (x.id === key || x.res_id === key || x.key === key)) || null;
      for (const v of Object.values(d)) {
        if (!v || typeof v !== 'object') continue;
        if (v[key]) return v[key];
        if (v.id === key || v.res_id === key || v.key === key) return v;
      }
      return null;
    };
    const def = findDef(defsObj, lookupKey) || {};
    const formatResName = id => String(id || '').replace(/^(res\.)?/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    const dedupeName = s => {
      if (!s) return s; const t = String(s).trim(); const m = t.match(/^(.+?)\s+\1$/i); return m ? m[1] : t;
    };
    const rawName = offer.res_name || offer.resName || offer.name || def.name || def.label || def.displayName || formatResName(lookupKey);
    const resName = dedupeName(rawName);
    const resEmoji = offer.res_emoji || offer.resEmoji || offer.emoji || def.emoji || def.icon || def.symbol || '';
    return { ...offer, res_id: originalResId, res_key: lookupKey, res_name: resName, res_emoji: resEmoji };
  }

  // format helpers
  const formatAmountAsInt = v => { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n)) : String(v); };
  const formatTwoDecimals = v => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : String(v); };

  // fetchers
  const fetchLocal = async () => {
    setLoadingLocal(true);
    try {
      const a = await fetch('/world-spil/backend/api/actions/marketplace_list.php?scope=local', { credentials: 'include' }).then(r => r.json());
      setLocalRows(a?.ok ? (a.data?.rows || []) : []);
    } catch {
      setLocalRows([]);
    } finally {
      setLoadingLocal(false);
    }
  };

  const fetchGlobal = async () => {
    setLoadingGlobal(true);
    try {
      const qs = new URLSearchParams({ scope: 'global', own: ownMode, sort });
      const b = await fetch('/world-spil/backend/api/actions/marketplace_list.php?' + qs.toString(), { credentials: 'include' }).then(r => r.json());
      setGlobalRows(b?.ok ? (b.data?.rows || []) : []);
    } catch {
      setGlobalRows([]);
    } finally {
      setLoadingGlobal(false);
    }
  };

  // initial load
  useEffect(() => { fetchLocal(); fetchGlobal(); }, []);
useEffect(() => { if (viewMode === 'global') fetchGlobal(); }, [ownMode, sort, q, viewMode]);

// NEW: refresh on focus/visibility + global event
useEffect(() => {
  const refreshLists = () => {
    if (document.visibilityState === 'visible') {
      fetchLocal();
      fetchGlobal();
    }
  };
  const onFocus = () => refreshLists();
  const onVisibility = () => refreshLists();

  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  addMarketRefreshListener(refreshLists);

  return () => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    removeMarketRefreshListener(refreshLists);
  };
}, []);

  // open buy (use normalized offer) and clear previous errors
  const openBuy = (offer) => {
    setBuyError(null);
    setBuyOffer(normalizeOffer(offer, defs));
    setBuyOpen(true);
  };

  // cancel own listing
  const requestCancelOwn = (id, title, message) => {
    setConfirmPayload({
      id,
      title: title || 'Fortryd opslag',
      message: message || 'Er du sikker på at du vil fortryde dette opslag?',
      onConfirm: () => cancelOwnConfirmed(id)
    });
    setConfirmOpen(true);
  };

  const cancelOwnConfirmed = async (id) => {
    setConfirmOpen(false);
    try {
      const params = new URLSearchParams();
      params.set('id', String(id));
      const res = await fetch('/world-spil/backend/api/actions/marketplace_cancel.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        console.warn('cancelOwn failed', res.status, json);
        // show inside modal
        const err = json?.error || {};
        const friendly = err.message || 'Kunne ikke fortryde opslaget';
        showError({ message: friendly, details: err.details || err.debug || json });
        return;
      }
      // optimistic UI update
      setLocalRows(prev => prev.filter(x => String(x.id) !== String(id)));
      setGlobalRows(prev => prev.filter(x => String(x.id) !== String(id)));
      const msg = json?.data?.message || json?.message || 'Opslaget er annulleret';
      setSuccessMessage(msg);
      setSuccessOpen(true);
      setTimeout(() => setSuccessOpen(false), 2500);
      try { await refetch?.(); } catch (e) { /* ignore */ }
      await fetchLocal(); await fetchGlobal();
      try { triggerMarketRefresh(); } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('cancelOwn error', e);
      showError({ message: e?.message || 'Uventet fejl', details: e });
    }
  };

  // search normalization
  const normalizeText = (s) => {
    if (!s && s !== 0) return '';
    try {
      return String(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return String(s).toLowerCase();
    }
  };

  // Filter + search + ownMode (local listings are synthetic and include res_id already)
  const filteredGlobalRows = useMemo(() => {
    const qn = normalizeText(q);
    const rows = globalRows || [];

    return rows.filter((r) => {
      // ownMode filtering
      if (ownMode === 'only' && !(r.seller && (Number(r.seller.user_id || r.seller.user?.user_id || 0) === Number(userId) || Number(r.user_id || 0) === Number(userId)))) {
        return false;
      }
      if (ownMode === 'exclude' && (r.seller && (Number(r.seller.user_id || r.seller.user?.user_id || 0) === Number(userId) || Number(r.user_id || 0) === Number(userId)))) {
        return false;
      }

      if (!qn) return true;

      const norm = normalizeOffer(r, defs);
      const candidates = [
        norm.res_name,
        norm.res_id,
        r.seller?.username,
        r.seller?.name,
        r.seller?.user?.username,
        r.seller?.user?.name,
        r.seller?.world_id,
        r.seller?.map_id,
        String(r.id)
      ];
      for (const c of candidates) {
        if (!c && c !== 0) continue;
        const nc = normalizeText(c);
        if (nc && nc.includes(qn)) return true;
      }
      return false;
    });
  }, [globalRows, q, defs, ownMode, userId]);

  const sortRows = (rows) => {
    const cmp = {
      price_asc: (a,b) => Number(a.price) - Number(b.price),
      price_desc: (a,b) => Number(b.price) - Number(a.price),
      date_desc: (a,b) => new Date(b.created_at) - new Date(a.created_at),
      date_asc: (a,b) => new Date(a.created_at) - new Date(b.created_at),
    }[sort] || (() => 0);
    return [...rows].sort(cmp);
  };

  const displayedGlobal = useMemo(() => sortRows(filteredGlobalRows), [filteredGlobalRows, sort]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <style>{tableCss}</style>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Marked</div>
        <div className="segmented" role="tablist" aria-label="Vis">
          <button className={viewMode === 'local' ? 'active' : ''} onClick={() => setViewMode('local')}>Lokalt</button>
          <button className={viewMode === 'global' ? 'active' : ''} onClick={() => setViewMode('global')}>Globalt</button>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {viewMode === 'local' ? (
            <button className="tab" onClick={fetchLocal} disabled={loadingLocal}>{loadingLocal ? 'Opdaterer…' : 'Opdater lokal'}</button>
          ) : (
            <button className="tab update" onClick={fetchGlobal} disabled={loadingGlobal}>{loadingGlobal ? 'Opdaterer…' : 'Opdater global'}</button>
          )}
        </div>
      </div>

      {/* Global toolbar (search / ownMode / sort) restored */}
      {viewMode === 'global' && (
        <div className="market-toolbar">
          <div className="search" aria-hidden>
            <span style={{ opacity: 0.8 }}>🔎</span>
            <input
              aria-label="Søg i globalt marked"
              placeholder="Søg (navn, id, sælger... )"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sorter">
            <option value="price_asc">Billigste først</option>
            <option value="price_desc">Dyreste først</option>
            <option value="date_desc">Nyeste først</option>
            <option value="date_asc">Ældste først</option>
          </select>

          <select value={ownMode} onChange={e => setOwnMode(e.target.value)} aria-label="Vis egne">
            <option value="exclude">Skjul egne</option>
            <option value="include">Vis inkl.</option>
            <option value="only">Kun egne</option>
          </select>

          <div className="actions" style={{ marginLeft: 'auto' }}>
            <button className="tab" onClick={() => { setQ(''); setOwnMode('exclude'); setSort('price_asc'); }}>Nulstil filtre</button>
          </div>
        </div>
      )}

      {viewMode === 'local' && (
        <section>
          <h3 style={{ marginTop: 0 }}>Lokal – til salg</h3>
          <div className="table-wrap">
            <table className="table market-table">
              <colgroup>
                <col className="resource" />
                <col className="amount" />
                <col className="price" />
                <col className="total" />
                <col className="seller" />
                <col className="date" />
                <col className="actions" />
              </colgroup>
              <thead>
                <tr><th>Ressource</th><th>Antal</th><th>Stk pris</th><th>Total</th><th>Sælger</th><th>Tilføjet</th><th></th></tr>
              </thead>
              <tbody>
                {localRows.length === 0 ? (
                  <tr><td colSpan={7} style={{ color:'#6b7280' }}>Ingen lokale varer</td></tr>
                ) : localRows.map(r => {
                  const norm = normalizeOffer(r, defs);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ fontSize:18, flex:'0 0 auto' }}>{norm.res_emoji}</div>
                          <div style={{ minWidth:0 }}>
                            <div className="res-name" style={{ fontSize:14, color:'#fff', fontWeight:700 }}>{norm.res_name}</div>
                                                    </div>
                        </div>
                      </td>
                      <td>{formatAmountAsInt(r.amount)}</td>
                      <td>{formatTwoDecimals(r.price)}</td>
                      <td>{formatTwoDecimals(Number(r.amount)*Number(r.price))}</td>
                      <td title={`${r.seller?.world_id} / ${r.seller?.map_id} @ ${r.seller?.x},${r.seller?.y}`}>{r.seller?.username}</td>
                      <td>{r.created_at}</td>
                      <td className="actions">
                        <button className="tab" onClick={() => openBuy(r)}>Køb</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === 'global' && (
        <section>
          <h3 style={{ marginTop: 0 }}>Global – til salg</h3>
          <div className="table-wrap">
            <table className="table market-table">
              <colgroup>
                <col className="resource" />
                <col className="amount" />
                <col className="price" />
                <col className="total" />
                <col className="seller" />
                <col className="date" />
                <col className="actions" />
              </colgroup>
              <thead>
                <tr><th>Ressource</th><th>Antal</th><th>Stk pris</th><th>Total</th><th>Sælger</th><th>Tilføjet</th><th></th></tr>
              </thead>
              <tbody>
                {displayedGlobal.length === 0 ? (
                  <tr><td colSpan={7} style={{ color:'#6b7280' }}>Ingen opslag</td></tr>
                ) : displayedGlobal.map(r => {
                  const isSelf = r.seller?.user_id && Number(r.seller.user_id) === Number(userId);
                  const norm = normalizeOffer(r, defs);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ fontSize:18, flex:'0 0 auto' }}>{norm.res_emoji}</div>
                          <div style={{ minWidth:0 }}>
                            <div className="res-name" style={{ fontSize:14, color:'#fff', fontWeight:700 }}>{norm.res_name}</div>
                      
                          </div>
                        </div>
                      </td>
                      <td>{formatAmountAsInt(r.amount)}</td>
                      <td>{formatTwoDecimals(r.price)}</td>
                      <td>{formatTwoDecimals(Number(r.amount)*Number(r.price))}</td>
                      <td title={`${r.seller?.world_id} / ${r.seller?.map_id} @ ${r.seller?.x},${r.seller?.y}`}>{r.seller?.username}</td>
                      <td>{r.created_at}</td>
                      <td className="actions">
                        {isSelf ? (
                          <button className="tab" onClick={() => {
                            const norm2 = normalizeOffer(r, defs);
                            requestCancelOwn(r.id, 'Fortryd opslag', `Vil du annullere opslaget for ${norm2.res_name}?`);
                          }}>Fortryd</button>
                        ) : (
                          <button className="tab" onClick={() => openBuy(r)}>Køb</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <BuyModal
        isOpen={buyOpen}
        offer={buyOffer}
        buyerMoney={money}
        maxCapacityAmount={Infinity}
        errorData={buyError}
        onClearError={() => setBuyError(null)}
        onCancel={() => { setBuyOpen(false); setBuyOffer(null); setBuyError(null); }}
        onBuy={async ({ qty }) => {
          try {
            if (!buyOffer) return;
            const isLocal = typeof buyOffer.id === 'string' && String(buyOffer.id).startsWith('local:');
            const payload = isLocal
              ? { id: buyOffer.id, scope: 'local', res_id: buyOffer.res_id, price: Number(buyOffer.price || 0), amount: qty }
              : { id: buyOffer.id, amount: qty };

            const res = await fetch('/world-spil/backend/api/actions/marketplace_buy.php', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
              const err = json?.error || {};
              const friendly =
                err.message === 'Not enough storage space for this purchase'
                  ? 'Der er ikke plads nok i dit lager til dette køb.'
                  : err.message || 'Købet fejlede.';
              setBuyError({
                message: friendly,
                rawMessage: err.message,
                details: err.details || err.debug || null,
                httpStatus: res.status,
              });
              showError({ message: friendly, details: err.details || err.debug || json });
              return;
            }

            // success
            setBuyOpen(false);
            setBuyOffer(null);
            setBuyError(null);
            // sørg for at opdatere global game-data først
            try { await refetch?.(); } catch (e) { console.warn('refetch failed', e); }
            // opdater markeds-lister
            await fetchLocal();
            await fetchGlobal();
            // notify resten af app'en om at noget ændrede sig (fx Header/Inventory kan lytte)
            try { triggerMarketRefresh(); } catch (e) { /* ignore */ }

            setSuccessMessage('Købet er gennemført.');
            setSuccessOpen(true);
            setTimeout(() => setSuccessOpen(false), 2200);
          } catch (e) {
            setBuyError({
              message: e?.message || 'Uventet fejl.',
              details: null,
              httpStatus: 0,
            });
            showError({ message: e?.message || 'Uventet fejl', details: e });
          }
        }}
      />

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={confirmOpen}
        title={confirmPayload.title}
        message={confirmPayload.message}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { confirmPayload.onConfirm && confirmPayload.onConfirm(); }}
      />

      {/* success confirmation */}
      <SuccessModal
        isOpen={successOpen}
        message={successMessage}
        onClose={() => setSuccessOpen(false)}
      />

      {/* global error modal (renders backend/client errors) */}
      <ErrorModal
        isOpen={errorOpen}
        payload={errorPayload}
        onClose={() => { setErrorOpen(false); setErrorPayload(null); }}
      />
    </div>
  );
}