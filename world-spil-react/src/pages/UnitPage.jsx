import React, { useMemo, useState, useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import ResourceCost from '../components/requirements/ResourceCost.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';
import { UNIT_GROUPS } from '../config/unitGroups.js';

// Fallback-beregning hvis header-summary ikke har kap/brug for en gruppe
function computeUnitTotalsFallback(defs, state, group) {
  let total = 0;
  // Bygn. kapacitet: summer stat på alle ejede bygninger
  for (const id of Object.keys(state?.bld || {})) {
    const p = H.parseBldKey(id);
    if (!p) continue;
    const bdef = defs?.bld?.[`${p.family}.l${p.level}`] || defs?.bld?.[p.key];
    if (!bdef) continue;
    const cap = Number(bdef?.stats?.[group.buildingCapacityStat] ?? 0);
    if (Number.isFinite(cap)) total += cap;
  }

  // Forbrug: sum perItemStat for ejede ani med matching family
  let used = 0;
  for (const [aniId, row] of Object.entries(state?.ani || {})) {
    const qty = Number(row?.quantity || 0);
    if (!qty) continue;
    const key = String(aniId).replace(/^ani\./, '');
    const adef = defs?.ani?.[key];
    if (!adef) continue;
    const fams = String(adef?.family || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!fams.includes(group.family)) continue;
    const per = Math.abs(Number(adef?.stats?.[group.perItemStat] ?? 0)) || 0;
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

function PurchaseRow({ def, defs, aniId, toBuy, setQty, availableCap, perItemStat, isAnimal }) {
  const per = isAnimal
    ? Math.abs(Number(def?.stats?.[perItemStat] ?? 1)) || 1
    : Math.abs(Number(def?.stats?.[perItemStat] ?? 0)) || 0;

  const capUsedByOthers = useMemo(() => {
    return Object.entries(toBuy).reduce((sum, [id, qty]) => {
      if (id === aniId) return sum;
      const otherKey = id.replace(/^ani\./, '');
      const otherDef = defs.ani?.[otherKey];
      const otherPer = isAnimal
        ? Math.abs(Number(otherDef?.stats?.[perItemStat] ?? 1)) || 1
        : Math.abs(Number(otherDef?.stats?.[perItemStat] ?? 0)) || 0;
      return sum + otherPer * (Number(qty) || 0);
    }, 0);
  }, [toBuy, aniId, defs, perItemStat, isAnimal]);

  const remainingCap = Math.max(0, availableCap - capUsedByOthers);
  const maxVal = per > 0 ? Math.floor(remainingCap / per) : 999999;
  const currentVal = Math.min(Number(toBuy[aniId] || 0), maxVal);

  return (
    <div className="item">
      <div className="icon">{def.emoji || (isAnimal ? '🐄' : '🏷️')}</div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub"><ResourceCost cost={def.cost} /></div>
        <div className="sub">
          {isAnimal ? `Kræver ${per} staldplads` : `Forbruger ${per} units`}
        </div>
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
  const [selectedKey, setSelectedKey] = useState(null);
  // Indkøbskurve pr. gruppe
  const [toBuyByGroup, setToBuyByGroup] = useState({}); // { [groupKey]: { 'ani.x': qty } }
  const [confirm, setConfirm] = useState({ isOpen: false, title: '', body: '', onConfirm: null });

  if (isLoading) return <div className="sub">Indlæser...</div>;
  if (error || !data) return <div className="sub">Fejl.</div>;

  const { state, defs } = data;

  // Ejer hvilke families?
  const familiesOwned = useMemo(() => {
    const set = new Set();
    Object.keys(state?.bld || {}).forEach((id) => {
      const p = H.parseBldKey(id);
      if (p?.family) set.add(p.family);
    });
    return set;
  }, [state?.bld]);

  // Kun tabs for grupper, hvor man ejer family
  const visibleGroups = useMemo(() => {
    return UNIT_GROUPS.filter(g => familiesOwned.has(g.family));
  }, [familiesOwned]);

  // Første synlige tab som default
  const effectiveSelectedKey = useMemo(() => {
    if (selectedKey && visibleGroups.some(g => g.key === selectedKey)) return selectedKey;
    return visibleGroups[0]?.key || null;
  }, [selectedKey, visibleGroups]);

  const group = useMemo(() => {
    return visibleGroups.find(g => g.key === effectiveSelectedKey) || null;
  }, [effectiveSelectedKey, visibleGroups]);

  const isAnimal = group?.capacityMode === 'animalCap';

  // Tilgængelige defs i aktiv gruppe
  const availableDefs = useMemo(() => {
    if (!group) return [];
    return Object.entries(defs.ani || {}).filter(([_, def]) => {
      const fams = String(def?.family || '').split(',').map(s => s.trim()).filter(Boolean);
      const inFamily = fams.includes(group.family);
      if (!inFamily) return false;
      const stageOk = Number(def?.stage || 0) <= Number(state?.user?.currentstage || 0);
      return stageOk; // ejer allerede family (tab vises kun da), så ekstra check er ikke nødvendigt
    });
  }, [defs?.ani, state?.user?.currentstage, group]);

  // Ejede units i aktiv gruppe
  const ownedUnits = useMemo(() => {
    if (!group) return [];
    return Object.entries(state?.ani || {}).filter(([id, a]) => {
      if ((a?.quantity || 0) <= 0) return false;
      const key = id.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) return false;
      const fams = String(def?.family || '').split(',').map(s => s.trim()).filter(Boolean);
      return fams.includes(group.family);
    });
  }, [state?.ani, defs?.ani, group]);

  // Kapacitet og brug for aktiv gruppe
  const totals = useMemo(() => {
    if (!group) return { total: 0, used: 0 };
    if (isAnimal) {
      const cap = state?.cap?.animal_cap || { total: 0, used: 0 };
      return { total: Number(cap.total || 0), used: Number(cap.used || 0) };
    }
    // Header-summary hvis muligt
    const hc = group.headerCapacityKey;
    const hu = group.headerUsageKey;
    const headerTotal = Number(header?.capacities?.[hc] ?? NaN);
    const headerUsed  = Number(header?.usages?.[hu]?.total ?? NaN);
    if (Number.isFinite(headerTotal) && Number.isFinite(headerUsed)) {
      return { total: headerTotal, used: headerUsed };
    }
    // Fallback: sum via defs/state
    return computeUnitTotalsFallback(defs, state, group);
  }, [group, isAnimal, state?.cap?.animal_cap, header, defs, state]);

  const toBuy = toBuyByGroup[effectiveSelectedKey] || {};

  const setQty = useCallback((aniId, value) => {
    if (!group) return;
    setToBuyByGroup(prev => {
      const bucket = { ...(prev[effectiveSelectedKey] || {}) };
      if (value > 0) bucket[aniId] = value;
      else delete bucket[aniId];
      return { ...prev, [effectiveSelectedKey]: bucket };
    });
  }, [effectiveSelectedKey, group]);

  // Beregn “kurv”-summeringer
  const basket = useMemo(() => {
    if (!group) return null;

    // total / used fra totals
    const total = Number(totals.total || 0);
    const used  = Number(totals.used  || 0);

    // Cap der bruges af det, man er ved at købe
    let capToUse = 0;
    const totalCost = {};

    for (const [aniId, qty] of Object.entries(toBuy)) {
      if (!qty) continue;
      const key = aniId.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) continue;
      const per = isAnimal
        ? Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1
        : Math.abs(Number(def?.stats?.[group.perItemStat] ?? 0)) || 0;
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
    const totalQty  = Object.values(toBuy).reduce((s, q) => s + (Number(q) || 0), 0);

    return { total, used, availableCap, capToUse, totalCost, canAfford, hasCapacity, totalQty };
  }, [group, totals, toBuy, defs, state, isAnimal]);

  // Køb/salg
  const handleBuy = useCallback(async () => {
    if (!basket) return;
    const animals = Object.fromEntries(Object.entries(toBuy).filter(([, q]) => Number(q) > 0));
    if (!Object.keys(animals).length || basket.totalQty <= 0) throw new Error('No items selected.');
    if (!basket.hasCapacity) throw new Error('Insufficient capacity.');
    if (!basket.canAfford) throw new Error('Insufficient resources.');

    const res = await fetch('/world-spil/backend/api/actions/animal.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ action: 'buy', animals }),
    });
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.message || 'Server refused purchase.');
    setToBuyByGroup(prev => ({ ...prev, [effectiveSelectedKey]: {} }));
    await refreshData();
    return json;
  }, [basket, toBuy, effectiveSelectedKey, refreshData]);

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
    if (!basket?.totalQty) return;
    const costText = renderCostInline(basket.totalCost, defs);
    setConfirm({
      isOpen: true,
      title: `Bekræft køb (${group?.label || 'Units'})`,
      body: `Du køber ${basket.totalQty} enhed(er).<br/><div style="margin-top:8px;">Pris: ${costText || '(ukendt)'}</div>`,
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

  if (!group) {
    return (
      <section className="panel section">
        <div className="section-head">Units</div>
        <div className="section-body">
          <div className="sub">Ingen unit-grupper tilgængelige. Byg først relevante faciliteter.</div>
        </div>
      </section>
    );
  }

  const capLabel = group.capacityLabel || (isAnimal ? 'Staldplads' : 'Units');

  return (
    <>
      <section className="panel section">
        <div className="section-head" style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span>Units</span>
          <div className="tabs" style={{ marginLeft: 'auto' }}>
            {visibleGroups.map(g => (
              <button
                key={g.key}
                type="button"
                className={`tab ${g.key === effectiveSelectedKey ? 'active' : ''}`}
                onClick={() => {
                  setSelectedKey(g.key);
                  // nulstil kurv for skiftet tab? vi bevarer pr. gruppe alligevel
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel section">
        <div className="section-head">
          {group.label} – Dine enheder
          <span style={{ marginLeft: 'auto' }}>
            <strong>{capLabel}:</strong> {H.fmt((basket?.used || 0) + (basket?.capToUse || 0))} / {H.fmt(basket?.total || 0)}
          </span>
        </div>
        <div className="section-body">
          {ownedUnits.map(([aniId, row]) => {
            const key = aniId.replace(/^ani\./, '');
            const def = defs.ani[key];
            const qty = Number(row?.quantity || 0);
            const per = isAnimal
              ? Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1
              : Math.abs(Number(def?.stats?.[group.perItemStat] ?? 0)) || 0;
            const perLabel = isAnimal ? `Optager ${per} staldplads` : `Forbruger ${per} units`;
            return (
              <div className="item" key={aniId}>
                <div className="icon">{def.emoji || (isAnimal ? '🐄' : group.emoji || '🏷️')}</div>
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
        <div className="section-head">Køb {group.label}</div>
        <div className="section-body">
          {availableDefs.map(([key, def]) => (
            <PurchaseRow
              key={key}
              def={def}
              defs={defs}
              aniId={`ani.${key}`}
              toBuy={toBuy}
              setQty={setQty}
              availableCap={basket?.availableCap || 0}
              perItemStat={group.perItemStat}
              isAnimal={isAnimal}
            />
          ))}
          <div className="actions-bar" style={{ marginTop: '16px' }}>
            <div>
              <strong>Total:</strong> <ResourceCost cost={basket?.totalCost || {}} /> &nbsp;
              <strong style={{ marginLeft: '1em' }}>{capLabel}:</strong>
              <span className={!basket?.hasCapacity ? 'price-bad' : ''}>
                {H.fmt((basket?.used || 0) + (basket?.capToUse || 0))}
              </span>
              {' / '}
              {H.fmt(basket?.total || 0)}
            </div>
            <button
              className="btn primary"
              disabled={!basket || basket.totalQty === 0 || !basket.canAfford || !basket.hasCapacity}
              onClick={openBuyConfirm}
            >
              Køb valgte {group.label.toLowerCase()}
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