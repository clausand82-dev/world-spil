import React, { useMemo, useState, useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import ResourceCost from '../components/requirements/ResourceCost.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';

/**
 * UnitPage med to faner:
 * - Dyr (family="farm"): bruger animal_cap (som før).
 * - Health (family="health"): bruger healthUnitUsage/healthUnitCapacity (units), ikke healthCapacity/useHealth.
 *
 * Backend: stadig /actions/animal.php buy/sell og ani.* i DB.
 */

// Fallback-beregning hvis header-summary endnu ikke har healthUnit-cap/usage
function computeHealthUnitTotals(defs, state) {
  // Total kapacitet: sum af stats.healthUnitCapacity på ejede bygninger (og evt. addons/research hvis du vil udvide)
  let total = 0;
  for (const id of Object.keys(state?.bld || {})) {
    const p = H.parseBldKey(id);
    if (!p) continue;
    const def = defs?.bld?.[`${p.family}.l${p.level}`] || defs?.bld?.[p.key] || defs?.bld?.[`${p.family}.l${p.level}`];
    const cap = Number(def?.stats?.healthUnitCapacity ?? 0);
    total += cap;
  }

  // Forbrug: sum af healthUnitUsage for ejede ani med family="health"
  let used = 0;
  for (const [aniId, row] of Object.entries(state?.ani || {})) {
    const qty = Number(row?.quantity || 0);
    if (!qty) continue;
    const key = String(aniId).replace(/^ani\./, '');
    const adef = defs?.ani?.[key];
    if (!adef) continue;
    const fams = String(adef?.family || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!fams.includes('health')) continue;
    const per = Math.abs(Number(adef?.stats?.healthUnitUsage ?? 0)) || 0;
    used += per * qty;
  }

  return { total, used };
}

function emojiForId(id, defs) {
  if (id.startsWith('res.')) {
    const key = id.replace(/^res\./, '');
    const def = defs.res?.[key];
    return def?.emoji || '📦';
  }
  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    const def = defs.ani?.[key];
    return def?.emoji || '🐾';
  }
  return '•';
}

function renderCostInline(costLike, defs) {
  const entries = Object.values(H.normalizePrice(costLike || {}));
  if (!entries.length) return '';
  return entries.map((e) => `${emojiForId(e.id, defs)} ${H.fmt(e.amount)}`).join(' · ');
}

function PurchaseRow({ def, defs, aniId, toBuy, setQty, availableCap, isHealth }) {
  const per = isHealth
    ? Math.abs(Number(def?.stats?.healthUnitUsage ?? 0)) || 0
    : Math.abs(Number(def?.stats?.animal_cap ?? 1)) || 1;

  const capUsedByOthers = useMemo(() => {
    return Object.entries(toBuy).reduce((sum, [id, qty]) => {
      if (id === aniId) return sum;
      const otherKey = id.replace(/^ani\./, '');
      const otherDef = defs.ani?.[otherKey];
      const otherPer = isHealth
        ? Math.abs(Number(otherDef?.stats?.healthUnitUsage ?? 0)) || 0
        : Math.abs(Number(otherDef?.stats?.animal_cap ?? 1)) || 1;
      return sum + otherPer * (Number(qty) || 0);
    }, 0);
  }, [toBuy, aniId, defs, isHealth]);

  const remainingCap = Math.max(0, availableCap - capUsedByOthers);
  const maxVal = per > 0 ? Math.floor(remainingCap / per) : 999999;
  const currentVal = Math.min(Number(toBuy[aniId] || 0), maxVal);

  return (
    <div className="item">
      <div className="icon">{def.emoji || (isHealth ? '🏥' : '🐄')}</div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub"><ResourceCost cost={def.cost} /></div>
        <div className="sub">{isHealth ? `Forbruger ${per} health-unit` : `Kræver ${per} staldplads`}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <input
            type="range"
            className="slider"
            min="0"
            step="1"
            max={maxVal}
            value={currentVal}
            style={{ flexGrow: 1 }}
            onChange={(e) => setQty(aniId, parseInt(e.target.value, 10))}
            disabled={maxVal === 0}
          />
          <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'right' }}>{currentVal}</span>
        </div>
      </div>
    </div>
  );
}

export default function UnitPage() {
  const { data, isLoading, error, refreshData } = useGameData();
  const { data: header } = useHeaderSummary();
  const [tab, setTab] = useState('farm'); // 'farm' | 'health'
  const [confirm, setConfirm] = useState({ isOpen: false, title: '', body: '', onConfirm: null });
  const [toBuy, setToBuy] = useState({});

  const isHealth = tab === 'health';
  const familyKey = isHealth ? 'health' : 'farm';

  if (isLoading) return <div className="sub">Indlæser...</div>;
  if (error || !data) return <div className="sub">Fejl.</div>;

  const { state, defs } = data;

  const familiesOwned = useMemo(() => {
    const set = new Set();
    Object.keys(state?.bld || {}).forEach((id) => {
      const p = H.parseBldKey(id);
      if (p?.family) set.add(p.family);
    });
    return set;
  }, [state?.bld]);

  // Fallback totals for health units (hvis header ikke har det endnu)
  const healthUnitTotals = useMemo(() => computeHealthUnitTotals(defs, state), [defs, state]);

  const availableAnimals = useMemo(() => {
    return Object.entries(defs.ani || {}).filter(([_, def]) => {
      const fams = String(def?.family || '').split(',').map(s => s.trim()).filter(Boolean);
      const inFamily = fams.includes(familyKey);
      if (!inFamily) return false;
      const stageOk = Number(def?.stage || 0) <= Number(state?.user?.currentstage || 0);

      // Kræv enten ejerskab af relevant family-bygning ELLER (for health) at der findes unit-kapacitet.
      const buildingOk = fams.some(f => familiesOwned.has(f));
      const unitCapOk  = isHealth && (Number(header?.capacities?.healthUnitCapacity ?? healthUnitTotals.total) > 0);

      return stageOk && (buildingOk || unitCapOk);
    });
  }, [defs?.ani, state?.user?.currentstage, familiesOwned, familyKey, isHealth, header?.capacities?.healthUnitCapacity, healthUnitTotals.total]);

  const ownedUnits = useMemo(() => {
    return Object.entries(state?.ani || {}).filter(([id, a]) => {
      if ((a?.quantity || 0) <= 0) return false;
      const key = id.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) return false;
      const fams = String(def?.family || '').split(',').map(s => s.trim()).filter(Boolean);
      return fams.includes(familyKey);
    });
  }, [state?.ani, defs?.ani, familyKey]);

  const details = useMemo(() => {
    if (!defs) return null;

    let total = 0, used = 0;

    if (isHealth) {
      // Brug nye unit-metrics hvis de findes, ellers fallback
      const headerTotal = Number(header?.capacities?.healthUnitCapacity ?? NaN);
      const headerUsed  = Number(header?.usages?.healthUnitUsage?.total ?? NaN);
      if (Number.isFinite(headerTotal) && Number.isFinite(headerUsed)) {
        total = headerTotal;
        used  = headerUsed;
      } else {
        total = healthUnitTotals.total;
        used  = healthUnitTotals.used;
      }
    } else {
      const cap = state?.cap?.animal_cap || { total: 0, used: 0 };
      total = Number(cap.total || 0);
      used  = Number(cap.used || 0);
    }

    // Kurv-summeringer
    let capToUse = 0;
    const totalCost = {};

    for (const [aniId, qty] of Object.entries(toBuy)) {
      if (!qty) continue;
      const key = aniId.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) continue;

      const per = isHealth
        ? Math.abs(Number(def?.stats?.healthUnitUsage ?? 0)) || 0
        : Math.abs(Number(def?.stats?.animal_cap ?? 1)) || 1;
      capToUse += per * qty;

      const costs = H.normalizePrice(def?.cost || {});
      Object.values(costs).forEach((entry) => {
        const prev = totalCost[entry.id]?.amount || 0;
        totalCost[entry.id] = { id: entry.id, amount: prev + (entry.amount || 0) * qty };
      });
    }

    const availableCap = Math.max(0, total - used);
    const hasCapacity  = capToUse <= availableCap;

    const getHave = (resId) => {
      const key = String(resId).replace(/^res\./, '');
      const liquid = Number(state?.inv?.liquid?.[key] || 0);
      const solid  = Number(state?.inv?.solid?.[key]  || 0);
      return liquid + solid;
    };
    const canAfford = Object.values(totalCost).every((c) => getHave(c.id) >= (c.amount || 0));

    const totalQty = Object.values(toBuy).reduce((s, q) => s + (Number(q) || 0), 0);

    return { total, used, availableCap, capToUse, totalCost, canAfford, hasCapacity, totalQty };
  }, [defs, state, header, toBuy, isHealth, healthUnitTotals]);

  const setQty = useCallback((aniId, value) => {
    setToBuy((prev) => {
      const next = { ...prev };
      if (value > 0) next[aniId] = value;
      else delete next[aniId];
      return next;
    });
  }, []);

  const handleBuy = useCallback(async () => {
    if (!details) return;
    const animals = Object.fromEntries(Object.entries(toBuy).filter(([, q]) => Number(q) > 0));
    if (!Object.keys(animals).length || details.totalQty <= 0) throw new Error('No items selected.');
    if (!details.hasCapacity) throw new Error('Insufficient capacity.');
    if (!details.canAfford) throw new Error('Insufficient resources.');

    const res = await fetch('/world-spil/backend/api/actions/animal.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ action: 'buy', animals }),
    });
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.message || 'Server refused purchase.');
    setToBuy({});
    await refreshData();
    return json;
  }, [details, toBuy, refreshData]);

  const handleSell = useCallback(async (aniId, quantity) => {
    if (!aniId || !quantity) return;
    const res = await fetch('/world-spil/backend/api/actions/animal.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ action: 'sell', animal_id: aniId, quantity }),
    });
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.message || 'Server refused sale.');
    await refreshData();
    return json;
  }, [refreshData]);

  const openBuyConfirm = () => {
    if (!details?.totalQty) return;
    const costText = renderCostInline(details.totalCost, defs);
    setConfirm({
      isOpen: true,
      title: isHealth ? 'Bekræft køb (Health units)' : 'Bekræft køb (Dyr)',
      body: `Du køber ${details.totalQty} enhed(er).<br/><div style="margin-top:8px;">Pris: ${costText || '(ukendt)'}</div>`,
      onConfirm: async () => {
        try { await handleBuy(); }
        catch (e) { alert(e.message || 'Køb fejlede.'); }
        finally { setConfirm((c) => ({ ...c, isOpen: false })); }
      },
    });
  };

  const openSellConfirm = (aniId, quantity) => {
    const key = aniId.replace(/^ani\./, '');
    const def = defs.ani?.[key];
    if (!def) return;

    const costs = H.normalizePrice(def.cost || {});
    const refundMap = {};
    Object.values(costs).forEach((entry) => {
      refundMap[entry.id] = { id: entry.id, amount: (entry.amount || 0) * quantity * 0.5 };
    });
    const refundText = renderCostInline(refundMap, defs);

    setConfirm({
      isOpen: true,
      title: quantity === 1 ? 'Sælg 1 enhed' : `Sælg ${quantity} enheder`,
      body: `Du får følgende tilbage:<br/><div style="margin-top:8px;">${refundText || '(ukendt værdi)'}</div>`,
      onConfirm: async () => {
        try { await handleSell(aniId, quantity); }
        catch (e) { alert(e.message || 'Salg fejlede.'); }
        finally { setConfirm((c) => ({ ...c, isOpen: false })); }
      },
    });
  };

  const capHead = (() => {
    if (!details) return null;
    const label = isHealth ? 'Health unit-kapacitet' : 'Staldplads';
    return (
      <span style={{ marginLeft: 'auto' }}>
        <strong>{label}:</strong> {H.fmt(details.used + details.capToUse)} / {H.fmt(details.total)}
      </span>
    );
  })();

  return (
    <>
      <section className="panel section">
        <div className="section-head" style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span>Units</span>
          <div className="tabs" style={{ marginLeft: 'auto' }}>
            <button type="button" className={`tab ${tab === 'farm' ? 'active' : ''}`} onClick={() => { setTab('farm'); setToBuy({}); }}>
              Dyr
            </button>
            <button type="button" className={`tab ${tab === 'health' ? 'active' : ''}`} onClick={() => { setTab('health'); setToBuy({}); }}>
              Health
            </button>
          </div>
        </div>
      </section>

      <section className="panel section">
        <div className="section-head">
          {tab === 'farm' ? 'Dine Dyr' : 'Dine Health units'}
          {capHead}
        </div>
        <div className="section-body">
          {ownedUnits.map(([aniId, row]) => {
            const key = aniId.replace(/^ani\./, '');
            const def = defs.ani[key];
            const qty = Number(row?.quantity || 0);
            const per = isHealth
              ? Math.abs(Number(def?.stats?.healthUnitUsage ?? 0)) || 0
              : Math.abs(Number(def?.stats?.animal_cap ?? 1)) || 1;
            const perLabel = isHealth ? `Forbruger ${per} health-unit` : `Optager ${per} staldplads`;
            return (
              <div className="item" key={aniId}>
                <div className="icon">{def.emoji || (isHealth ? '🏥' : '🐄')}</div>
                <div>
                  <div className="title">
                    {def.name} (x{H.fmt(qty)})
                  </div>
                  <div className="sub">{perLabel}</div>
                </div>
                <div className="right">
                  <button className="btn" onClick={() => openSellConfirm(aniId, 1)}>Sælg 1</button>
                  <button className="btn" onClick={() => openSellConfirm(aniId, qty)}>Sælg alle</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel section">
        <div className="section-head">{tab === 'farm' ? 'Køb Dyr' : 'Køb Health units'}</div>
        <div className="section-body">
          {availableAnimals.map(([key, def]) => (
            <PurchaseRow
              key={key}
              def={def}
              defs={defs}
              aniId={`ani.${key}`}
              toBuy={toBuy}
              setQty={setQty}
              availableCap={details?.availableCap || 0}
              isHealth={isHealth}
            />
          ))}
          <div className="actions-bar" style={{ marginTop: '16px' }}>
            <div>
              <strong>Total:</strong> <ResourceCost cost={details?.totalCost || {}} /> &nbsp;
              <strong style={{ marginLeft: '1em' }}>{isHealth ? 'Health units:' : 'Staldplads:'}</strong>
              <span className={!details?.hasCapacity ? 'price-bad' : ''}>
                {H.fmt((details?.used || 0) + (details?.capToUse || 0))}
              </span>
              {' / '}
              {H.fmt(details?.total || 0)}
            </div>
            <button
              className="btn primary"
              disabled={!details || details.totalQty === 0 || !details.canAfford || !details.hasCapacity}
              onClick={() => {
                // ekstra guard: ingen kapacitet? vis en besked
                if (!details?.hasCapacity && isHealth && (details?.total || 0) === 0) {
                  alert('Ingen health unit-kapacitet tilgængelig. Byg en health-bygning først.');
                  return;
                }
                openBuyConfirm();
              }}
            >
              {tab === 'farm' ? 'Køb valgte dyr' : 'Køb valgte units'}
            </button>
          </div>
        </div>
      </section>

      <ConfirmModal
        isOpen={confirm.isOpen}
        title={confirm.title}
        body={confirm.body}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, isOpen: false }))}
        confirmText="OK"
        cancelText="Annuller"
      />
    </>
  );
}