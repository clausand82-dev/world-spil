import React, { useMemo, useState, useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import ResourceCost from '../components/requirements/ResourceCost.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';
import DockHoverCard from '../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../components/ui/StatsEffectsTooltip.jsx';
import { UNIT_GROUPS } from '../config/unitGroups.js';
import { applyCostBuffsToAmount } from '../services/calcEngine-lite.js';
import { collectActiveBuffs } from '../services/requirements.js';

/**
 * UnitPage – dynamisk på baggrund af UNIT_GROUPS:
 * - Viser kun tabs for grupper, hvor spilleren ejer mindst én bygning i gruppens family.
 * - "Dyr" (farm) bruger animal_cap som før.
 * - Øvrige grupper (health/police/fire/military …) bruger gruppens headerCapacityKey/headerUsageKey,
 *   og hvis header ikke har tal, falder vi tilbage til at summere:
 *     - Bygningsstats: group.buildingCapacityStat (f.eks. healthUnitCapacity)
 *     - Unit-forbrug:  group.perItemStat        (f.eks. healthUnitUsage)
 */

// Generisk fallback-beregning for alle non-animal grupper
function computeUnitTotalsFallback(defs, state, group) {
  let total = 0;
  // Summer kapacitet fra ejede bygninger for den relevante stat
  for (const id of Object.keys(state?.bld || {})) {
    const p = H.parseBldKey(id);
    if (!p) continue;
    const bdef =
      defs?.bld?.[`${p.family}.l${p.level}`] ||
      defs?.bld?.[p.key];
    const cap = Number(bdef?.stats?.[group.buildingCapacityStat] ?? 0);
    if (Number.isFinite(cap)) total += cap;
  }

  // Summer usage fra ejede ani i gruppens family
  let used = 0;
  for (const [aniId, row] of Object.entries(state?.ani || {})) {
    const qty = Number(row?.quantity || 0);
    if (!qty) continue;
    const key = String(aniId).replace(/^ani\./, '');
    const adef = defs?.ani?.[key];
    if (!adef) continue;
    const fams = String(adef?.family || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!fams.includes(group.family)) continue;
    const per = Math.abs(Number(adef?.stats?.[group.perItemStat] ?? 0)) || 0;
    used += per * qty;
  }

  return { total, used };
}

// IMPORTANT: forward ...rest to the root DOM node so DockHoverCard can inject mouse handlers
function PurchaseRow({ def, defs, aniId, toBuy, setQty, availableCap, perItemStat, isAnimal, ...rest }) {
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
    <div className="item" {...rest}>
      <div className="icon">{def.emoji || (isAnimal ? '🐄' : '🏷️')}</div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub">
          <ResourceCost cost={def.cost} />
        </div>
        <div className="sub">{isAnimal ? `Kræver ${Math.max(1, per)} staldplads` : (per > 0 ? `Forbruger ${per} units` : 'Ingen unit-forbrug')}</div>
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

export default function UnitPage({ embedFamily = null, embed = false }) {
  const { data, isLoading, error, refreshData } = useGameData();
  const { data: header } = useHeaderSummary();
  const [selectedKey, setSelectedKey] = useState(null);
  const [confirm, setConfirm] = useState({ isOpen: false, title: '', body: '', onConfirm: null });
  const [toBuyByGroup, setToBuyByGroup] = useState({}); // { [groupKey]: { 'ani.x': qty } }

  if (isLoading) return <div className="sub">Indlæser...</div>;
  if (error || !data) return <div className="sub">Fejl.</div>;

  const { state, defs } = data;

  // Ejer hvilke families (fra bygninger)?
  const familiesOwned = useMemo(() => {
    const set = new Set();
    Object.keys(state?.bld || {}).forEach((id) => {
      const p = H.parseBldKey(id);
      if (p?.family) set.add(p.family);
    });
    return set;
  }, [state?.bld]);

  // Synlige grupper:
  // - Normalt: dem man ejer (familiesOwned)
  // - Embed: kun embedFamily (hvis def findes i UNIT_GROUPS), uanset familiesOwned
  const visibleGroups = useMemo(() => {
    if (embedFamily) {
      const g = UNIT_GROUPS.find((x) => x.family === embedFamily);
      return g ? [g] : [];
    }
    return UNIT_GROUPS.filter((g) => familiesOwned.has(g.family));
  }, [familiesOwned, embedFamily]);

  // Vælg første synlige tab hvis selectedKey ikke længere er gyldig
  const effectiveSelectedKey = useMemo(() => {
    if (embedFamily) {
      return visibleGroups[0]?.key || null;
    }
    if (selectedKey && visibleGroups.some((g) => g.key === selectedKey)) return selectedKey;
    return visibleGroups[0]?.key || null;
  }, [selectedKey, visibleGroups, embedFamily]);

  const group = useMemo(() => {
    return visibleGroups.find((g) => g.key === effectiveSelectedKey) || null;
  }, [effectiveSelectedKey, visibleGroups]);

  const isAnimal = group?.capacityMode === 'animalCap';

  // Tilgængelige defs i aktiv gruppe
  const availableDefs = useMemo(() => {
    if (!group) return [];
    return Object.entries(defs.ani || {}).filter(([_, def]) => {
      const fams = String(def?.family || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const inFamily = fams.includes(group.family);
      if (!inFamily) return false;
      const stageOk = Number(def?.stage || 0) <= Number(state?.user?.currentstage || 0);
      return stageOk;
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
      const fams = String(def?.family || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return fams.includes(group.family);
    });
  }, [state?.ani, defs?.ani, group]);

  // Kapacitet & usage totals for aktiv gruppe
  const totals = useMemo(() => {
    if (!group) return { total: 0, used: 0 };

    if (isAnimal) {
      const cap = state?.cap?.animal_cap || { total: 0, used: 0 };
      return { total: Number(cap.total || 0), used: Number(cap.used || 0) };
    }

    // Non-animal grupper: brug header hvis tilgængelig, ellers fallback
    const hc = group.headerCapacityKey;  // fx 'healthUnitCapacity'
    const hu = group.headerUsageKey;     // fx 'healthUnitUsage'
    const headerTotal = Number(header?.capacities?.[hc] ?? NaN);
    const headerUsed = Number(header?.usages?.[hu]?.total ?? NaN);

    // Fallback
    let fbTotal = 0;
    for (const id of Object.keys(state?.bld || {})) {
      const p = H.parseBldKey(id);
      if (!p) continue;
      const bdef =
        defs?.bld?.[`${p.family}.l${p.level}`] ||
        defs?.bld?.[p.key];
      const cap = Number(bdef?.stats?.[group.buildingCapacityStat] ?? 0);
      if (Number.isFinite(cap)) fbTotal += cap;
    }
    let fbUsed = 0;
    for (const [aniId, row] of Object.entries(state?.ani || {})) {
      const qty = Number(row?.quantity || 0);
      if (!qty) continue;
      const key = String(aniId).replace(/^ani\./, '');
      const adef = defs?.ani?.[key];
      if (!adef) continue;
      const fams = String(adef?.family || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!fams.includes(group.family)) continue;
      const per = Math.abs(Number(adef?.stats?.[group.perItemStat] ?? 0)) || 0;
      fbUsed += per * qty;
    }

    const headerLooksValid =
      Number.isFinite(headerTotal) &&
      Number.isFinite(headerUsed) &&
      (headerTotal > 0 || headerUsed > 0 || (headerTotal === 0 && headerUsed === 0 && fbTotal === 0));

    return headerLooksValid ? { total: headerTotal, used: headerUsed } : { total: fbTotal, used: fbUsed };
  }, [group, isAnimal, state, defs, header]);

  const toBuy = toBuyByGroup[effectiveSelectedKey] || {};

  const setQty = useCallback(
    (aniId, value) => {
      if (!group) return;
      setToBuyByGroup((prev) => {
        const bucket = { ...(prev[effectiveSelectedKey] || {}) };
        if (value > 0) bucket[aniId] = value;
        else delete bucket[aniId];
        return { ...prev, [effectiveSelectedKey]: bucket };
      });
    },
    [effectiveSelectedKey, group]
  );

const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);

// Kurv – hold både base (til visning) og buffed (til afford-check)
const basket = useMemo(() => {
  if (!group) return null;

  const total = Number(totals.total || 0);
  const used = Number(totals.used || 0);

  let capToUse = 0;
  const totalCostBase = {};
  const totalCostBuffed = {};

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
      const rid = entry.id;
      const baseAmt = (entry.amount || 0) * qty;

      // Base (til UI, ResourceCost vil selv anvende buffs)
      totalCostBase[rid] = (totalCostBase[rid] || 0) + baseAmt;

      // Buffed (kun til afford/disabled)
      const effRid = rid.startsWith('res.') ? rid : (defs?.res?.[rid] ? `res.${rid}` : rid);
      const buffedAmt = effRid.startsWith('res.')
        ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
        : baseAmt;
      totalCostBuffed[rid] = (totalCostBuffed[rid] || 0) + buffedAmt;
    });
  }

  const availableCap = Math.max(0, total - used);
  const hasCapacity = capToUse <= availableCap;

  const getHave = (resId) => {
    const key = String(resId).replace(/^res\./, '');
    const liquid = Number(state?.inv?.liquid?.[key] || 0);
    const solid = Number(state?.inv?.solid?.[key] || 0);
    return liquid + solid;
  };
  const canAffordBuffed = Object.entries(totalCostBuffed).every(([rid, amt]) => getHave(rid) >= (amt || 0));
  const totalQty = Object.values(toBuy).reduce((s, q) => s + (Number(q) || 0), 0);

  return {
    total,
    used,
    availableCap,
    capToUse,
    totalCostBase,      // <- til visning
    totalCostBuffed,    // <- til afford
    canAffordBuffed,
    hasCapacity,
    totalQty
  };
}, [group, totals, toBuy, defs, state, isAnimal, activeBuffs]);

// Samlet dyr (på tværs af dyr-faner) med buffede beløb — kun relevant på fuld side
const combinedAnimals = useMemo(() => {
  if (embed || !group || group.capacityMode !== 'animalCap') return null;

  const total = Number(totals.total || 0);
  const used = Number(totals.used || 0);

  let capToUseAll = 0;
  const costAllBuffed = {};

  const animalGroups = UNIT_GROUPS.filter(g => g.capacityMode === 'animalCap');
  for (const ag of animalGroups) {
    const bucket = toBuyByGroup[ag.key] || {};
    for (const [aniId, qty] of Object.entries(bucket)) {
      if (!qty) continue;
      const key = String(aniId).replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) continue;

      const per = Math.abs(Number(def?.stats?.[ag.perItemStat] ?? 1)) || 1;
      capToUseAll += per * (Number(qty) || 0);

      const costs = H.normalizePrice(def?.cost || {});
      Object.values(costs).forEach((entry) => {
        const rid = entry.id;
        const baseAmt = (entry.amount || 0) * (Number(qty) || 0);
        const effRid = rid.startsWith('res.') ? rid : (defs?.res?.[rid] ? `res.${rid}` : rid);
        const buffedAmt = effRid.startsWith('res.')
          ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
          : baseAmt;
        costAllBuffed[rid] = (costAllBuffed[rid] || 0) + buffedAmt;
      });
    }
  }

  const availableCap = Math.max(0, total - used);
  const hasCapacity = capToUseAll <= availableCap;

  const getHave = (resId) => {
    const key = String(resId).replace(/^res\./, '');
    const liquid = Number(state?.inv?.liquid?.[key] || 0);
    const solid = Number(state?.inv?.solid?.[key] || 0);
    return liquid + solid;
  };
  const canAfford = Object.entries(costAllBuffed).every(([rid, amt]) => getHave(rid) >= (amt || 0));

  return { hasCapacity, canAfford };
}, [embed, group, totals, toBuyByGroup, defs, state, activeBuffs]);



// --- DEBUG: log centrale værdier for animal capacity issues ---
useMemo(() => {
  try {
    console.debug('UNITPAGE DEBUG state.cap.animal_cap =', state?.cap?.animal_cap);
    console.debug('UNITPAGE DEBUG totals (active group) =', totals);
    console.debug('UNITPAGE DEBUG basket =', basket);
    console.debug('UNITPAGE DEBUG combinedAnimals =', combinedAnimals);
    // sanity convert to numbers for quick check
    const stTotal = Number(state?.cap?.animal_cap?.total ?? NaN);
    const stUsed = Number(state?.cap?.animal_cap?.used ?? NaN);
    console.debug('UNITPAGE DEBUG numeric checks: total=', stTotal, 'used=', stUsed, 'available=', (Number.isFinite(stTotal) && Number.isFinite(stUsed) ? stTotal - stUsed : 'n/a'));
  } catch (e) { console.error('UNITPAGE DEBUG error', e); }
  return null;
}, [state?.cap?.animal_cap, totals, basket, combinedAnimals]);

// Disabled-logik: dyr på fuld side bruger samlet (cross-tab) check; ellers pr. fane
const buyDisabled = useMemo(() => {
  if (!basket || basket.totalQty === 0) return true;
  if (!embed && group?.capacityMode === 'animalCap' && combinedAnimals) {
    return !(combinedAnimals.canAfford && combinedAnimals.hasCapacity);
  }
  return !(basket.canAffordBuffed && basket.hasCapacity);
}, [basket, embed, group, combinedAnimals]);


  // KØB (samlet)
  const handleBuy = useCallback(async () => {
    if (!basket) return;
    const animals = Object.fromEntries(Object.entries(toBuy).filter(([, q]) => Number(q) > 0));
    if (!Object.keys(animals).length || basket.totalQty <= 0) throw new Error('No items selected.');
    if (!basket.hasCapacity) throw new Error('Insufficient capacity.');
    if (!basket.canAfford) throw new Error('Insufficient resources.');

    const res = await fetch('/world-spil/backend/api/actions/animal.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'buy', animals }),
    });
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.message || 'Server refused purchase.');
    setToBuyByGroup((prev) => ({ ...prev, [effectiveSelectedKey]: {} }));
    await refreshData();
    return json;
  }, [basket, toBuy, effectiveSelectedKey, refreshData]);

  // SALG (per item)
  const handleSell = useCallback(
    async (aniId, quantity) => {
      if (!aniId || !quantity) return;
      const res = await fetch('/world-spil/backend/api/actions/animal.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sell', animal_id: aniId, quantity }),
      });
      const json = await res.json();
      if (json && json.ok === false) throw new Error(json.message || 'Server refused sale.');
      await refreshData();
      return json;
    },
    [refreshData]
  );

  // Bekræft-dialoger
  const openBuyConfirm = () => {
    if (!basket?.totalQty) return;
    const costText = renderCostInline(basket.totalCost, defs);
    setConfirm({
      isOpen: true,
      title: `Bekræft køb (${group?.label || 'Units'})`,
      body: `Du køber ${basket.totalQty} enhed(er).<br/><div style="margin-top:8px;">Pris: ${costText || '(ukendt)'}</div>`,
      onConfirm: async () => {
        try {
          await handleBuy();
        } catch (e) {
          alert(e.message || 'Køb fejlede.');
        } finally {
          setConfirm((c) => ({ ...c, isOpen: false }));
        }
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
      body: `Du får følgende tilbage:<br/><div style={{ marginTop: '8px' }}>${refundText || '(ukendt værdi)'}</div>`,
      onConfirm: async () => {
        try {
          await handleSell(aniId, quantity);
        } catch (e) {
          alert(e.message || 'Salg fejlede.');
        } finally {
          setConfirm((c) => ({ ...c, isOpen: false }));
        }
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
      {/* Top-tabs vises kun i normal side, ikke embed */}
      {!embed && (
        <section className="panel section">
          <div className="section-head" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Units</span>
            <div className="tabs" style={{ marginLeft: 'auto' }}>
              {visibleGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`tab ${g.key === effectiveSelectedKey ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedKey(g.key);
                    // Kurven bevares pr. gruppe i toBuyByGroup
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="panel section">
        <div className="section-head">
          {group.label} – Dine enheder
          <span style={{ marginLeft: 'auto' }}>
            <strong>{capLabel}:</strong> {H.fmt((Number(totals.used || 0)) + 0)} / {H.fmt(Number(totals.total || 0))}
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
            const hoverContent = <StatsEffectsTooltip def={def} translations={data?.i18n?.current ?? {}} />;

            return (
              <DockHoverCard key={aniId} content={hoverContent}>
                <div className="item">
                  <div className="icon">{def.emoji || (isAnimal ? '🐄' : '🏷️')}</div>
                  <div>
                    <div className="title">
                      {def.name} (x{H.fmt(qty)})
                    </div>
                    <div className="sub">{perLabel}</div>
                  </div>
                  <div className="right">
                    <button className="btn" onClick={() => openSellConfirm(aniId, 1)}>
                      Sælg 1
                    </button>
                    <button className="btn" onClick={() => openSellConfirm(aniId, qty)}>
                      Sælg alle
                    </button>
                  </div>
                </div>
              </DockHoverCard>
            );
          })}
        </div>
      </section>

      <section className="panel section">
        <div className="section-head">Køb {group.label}</div>
        <div className="section-body">
          {availableDefs.map(([key, def]) => {
            const hoverContent = <StatsEffectsTooltip def={def} translations={data?.i18n?.current ?? {}} />;
            const aniId = `ani.${key}`;
            const per = isAnimal
              ? Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1
              : Math.abs(Number(def?.stats?.[group.perItemStat] ?? 0)) || 0;
            const availableCap = Math.max(0, Number(totals.total || 0) - Number(totals.used || 0));
            const maxVal = per > 0 ? Math.floor(availableCap / per) : 999999;
            const currentVal = Math.min(Number(toBuy[aniId] || 0), maxVal);

            return (
              <DockHoverCard key={key} content={hoverContent}>
                <div className="item">
                  <div className="icon">{def.emoji || (isAnimal ? '🐄' : '🏷️')}</div>
                  <div className="grow">
                    <div className="title">{def.name}</div>
                    <div className="sub">
                      <ResourceCost cost={def.cost || {}} />
                    </div>
                    <div className="sub">{isAnimal ? `Kræver ${per} staldplads` : (per > 0 ? `Forbruger ${per} units` : 'Ingen unit-forbrug')}</div>
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
              </DockHoverCard>
            );
          })}
<div className="actions-bar" style={{ marginTop: '16px' }}>
  <div>
    <strong>Total:</strong> <ResourceCost cost={basket?.totalCostBase || {}} /> &nbsp;
    <strong style={{ marginLeft: '1em' }}>{capLabel}:</strong>
    <span className={!basket?.hasCapacity ? 'price-bad' : ''}>
      {H.fmt((basket?.used || 0) + (basket?.capToUse || 0))}
    </span>
    {' / '}
    {H.fmt(basket?.total || 0)}
  </div>
  <button
    className="btn primary"
    disabled={buyDisabled}
    onClick={openBuyConfirm}
  >
    Køb valgte {group.label.toLowerCase()}
  </button>
</div>
<div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted,#999)' }}>
    <div>DEBUG — animal_cap (raw): {JSON.stringify(state?.cap?.animal_cap)}</div>
    <div>DEBUG — totals: total={H.fmt(basket?.total || 0)}, used={H.fmt(basket?.used || 0)}, capToUse={H.fmt(basket?.capToUse || 0)}</div>
    <div>DEBUG — combined: total={H.fmt(combinedAnimals?.globalTotal || 0)}, used={H.fmt(combinedAnimals?.globalUsed || 0)}, capToUseAll={H.fmt(combinedAnimals?.capToUseAll || 0)}, available={H.fmt(combinedAnimals?.availableCap || 0)}</div>
  </div>
  {basket?.shortfalls && Object.keys(basket.shortfalls).length > 0 && (
  <div style={{ marginTop: 8, color: '#f66', fontSize: 13 }}>
    <strong>Manglende ressourcer:</strong>
    <div>
      {Object.entries(basket.shortfalls).map(([id, s]) => (
        <div key={id}>
          {id.replace(/^res\./, '')}: mangler {H.fmt(s.need - s.have)} ({H.fmt(s.have)} / {H.fmt(s.need)})
        </div>
      ))}
    </div>
  </div>
)}
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