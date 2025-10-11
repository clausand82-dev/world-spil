import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import BuyModal from '../../components/resources/modals/BuyModal.jsx';

export default function MarketTab() {
  const { data: gameData, refetch } = useGameData();
  const userId = gameData?.state?.user?.userId ?? gameData?.state?.user?.user_id ?? 0;
  const money = Number((gameData?.state?.inv?.solid?.money ?? gameData?.state?.inv?.liquid?.money ?? 0));

  const [localRows, setLocalRows] = useState([]);
  const [globalRows, setGlobalRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtre
  const [q, setQ] = useState('');
  const [resFilter, setResFilter] = useState('');
  const [ownMode, setOwnMode] = useState('exclude'); // exclude | include | only
  const [sort, setSort] = useState('price_asc'); // price_asc|price_desc|date_desc|date_asc

  const fetchLists = async () => {
    setLoading(true);
    try {
      // lokal
      const a = await fetch('/world-spil/backend/api/actions/marketplace_list.php?scope=local', { credentials: 'include' }).then(r => r.json());
      setLocalRows(a?.ok ? (a.data?.rows || []) : []);
      // global
      const qs = new URLSearchParams({ scope: 'global', res: resFilter || '' , own: ownMode, sort, q });
      const b = await fetch('/world-spil/backend/api/actions/marketplace_list.php?' + qs.toString(), { credentials: 'include' }).then(r => r.json());
      setGlobalRows(b?.ok ? (b.data?.rows || []) : []);
    } catch {
      setLocalRows([]); setGlobalRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLists(); }, []);
  useEffect(() => { fetchLists(); }, [resFilter, ownMode, sort, q]);

  // Køb modal
  const [buyOffer, setBuyOffer] = useState(null);
  const [buyOpen, setBuyOpen] = useState(false);

  // Kapacitet til valgt res (for max beregning) – simple client-beregning; alternativt skip
  const maxCapacityAmount = useMemo(() => {
    if (!buyOffer) return Infinity;
    // Hvis du har cap-data i gameData.state.cap og unitSpace i defs, kan du regne præcist.
    // Her lader vi den være "Infinity" for enkelhed; du kan tilføje din client-cap-beregning her.
    return Infinity;
  }, [buyOffer]);

  const onBuy = async ({ qty }) => {
    try {
      const r = await fetch('/world-spil/backend/api/actions/marketplace_buy.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: buyOffer.id, amount: qty })
      }).then(r => r.json());
      if (!r?.ok) throw new Error(r?.error?.message || 'Fejl');
      setBuyOpen(false); setBuyOffer(null);
      await refetch?.();
      await fetchLists();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const cancelOwn = async (id) => {
    try {
      const r = await fetch('/world-spil/backend/api/actions/marketplace_cancel.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      }).then(r => r.json());
      if (!r?.ok) throw new Error(r?.error?.message || 'Fejl');
      await refetch?.();
      await fetchLists();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input placeholder="Søg (id/tekst)" value={q} onChange={(e)=>setQ(e.target.value)} />
        <input placeholder="Filtrér res id (fx res.wood)" value={resFilter} onChange={(e)=>setResFilter(e.target.value)} />
        <select value={sort} onChange={(e)=>setSort(e.target.value)}>
          <option value="price_asc">Billigste først</option>
          <option value="price_desc">Dyreste først</option>
          <option value="date_desc">Nyeste først</option>
          <option value="date_asc">Ældste først</option>
        </select>
        <select value={ownMode} onChange={(e)=>setOwnMode(e.target.value)}>
          <option value="exclude">Skjul egne</option>
          <option value="include">Vis inkl. egne</option>
          <option value="only">Kun egne</option>
        </select>
        <button className="tab" onClick={fetchLists} disabled={loading}>Opdater</button>
      </div>

      <section>
        <h3 style={{ marginTop: 0 }}>Lokal – til salg</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Ressource</th><th>Antal</th><th>Stk pris</th><th>Total</th><th>Sælger</th><th>Tilføjet</th><th></th></tr>
            </thead>
            <tbody>
              {localRows.length === 0 ? <tr><td colSpan={7} style={{ color:'#6b7280' }}>Ingen lokale varer</td></tr> :
                localRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.res_id}</td>
                    <td>{r.amount}</td>
                    <td>{r.price}</td>
                    <td>{+(r.amount*r.price).toFixed(2)}</td>
                    <td title={`${r.seller?.world_id} / ${r.seller?.map_id} @ ${r.seller?.x},${r.seller?.y}`}>{r.seller?.username}</td>
                    <td>{r.created_at}</td>
                    <td><button className="tab" onClick={() => { setBuyOffer(r); setBuyOpen(true); }}>Køb</button></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>Global – til salg</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Ressource</th><th>Antal</th><th>Stk pris</th><th>Total</th><th>Sælger</th><th>Tilføjet</th><th></th></tr>
            </thead>
            <tbody>
              {globalRows.length === 0 ? <tr><td colSpan={7} style={{ color:'#6b7280' }}>Ingen opslag</td></tr> :
                globalRows.map((r) => {
                  const isSelf = r.seller?.user_id && Number(r.seller.user_id) === Number(userId);
                  return (
                    <tr key={r.id}>
                      <td>{r.res_id}</td>
                      <td>{r.amount}</td>
                      <td>{r.price}</td>
                      <td>{+(r.amount*r.price).toFixed(2)}</td>
                      <td title={`${r.seller?.world_id} / ${r.seller?.map_id} @ ${r.seller?.x},${r.seller?.y}`}>{r.seller?.username}</td>
                      <td>{r.created_at}</td>
                      <td>
                        {isSelf ? (
                          <button className="tab" onClick={() => cancelOwn(r.id)}>Fortryd</button>
                        ) : (
                          <button className="tab" onClick={() => { setBuyOffer(r); setBuyOpen(true); }}>Køb</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </section>

      <BuyModal
        isOpen={buyOpen}
        offer={buyOffer}
        buyerMoney={money}
        maxCapacityAmount={maxCapacityAmount}
        onCancel={() => { setBuyOpen(false); setBuyOffer(null); }}
        onBuy={onBuy}
      />
    </div>
  );
}