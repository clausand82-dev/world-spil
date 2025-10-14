import React, { useMemo, useState, useCallback } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import * as H from '../../services/helpers.js';
import ResourceCost from '../requirements/ResourceCost.jsx';
import ConfirmModal from '../ConfirmModal.jsx';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../ui/StatsEffectsTooltip.jsx';
import { UNIT_GROUPS } from '../../config/unitGroups.js';

// Fallback-beregning (samme logik som i UnitPage for non-animal grupper)
function computeUnitTotalsFallback(defs, state, group) {
  let total = 0;
  // Summer kapacitet fra ejede bygninger i gruppens family
  for (const id of Object.keys(state?.bld || {})) {
    const p = H.parseBldKey(id);
    if (!p) continue;
    const bdef =
      defs?.bld?.[`${p.family}.l${p.level}`] ||
      defs?.bld?.[p.key];
    const cap = Number(bdef?.stats?.[group.buildingCapacityStat] ?? 0);
    if (Number.isFinite(cap)) total += cap;
  }

  // Summer unit-forbrug fra ejede units i gruppens family
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

// Lokal kopi af købsrække (bevarer samme UI som UnitPage)
function PurchaseRow({ def, defs, aniId, toBuy, setQty, availableCap, perItemStat, isAnimal, ...rest }) {
  const per = isAnimal
    ? Math.abs(Number(def?.stats?.[perItemStat] ?? 1)) || 1
    : Math.abs(Number(def?.stats?.[perItemStat] ?? 0)) || 0;

  // Kapacitet reserveret af andre i kurven
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

  const remainingCap = Math.max(0, (availableCap || 0) - capUsedByOthers);
  const maxVal = per > 0 ? Math.floor(remainingCap / per) : 999999;
  const currentVal = Math.min(Number(toBuy[aniId] || 0), maxVal);
  const perLabel = isAnimal ? `Kræver ${per} staldplads` : (per > 0 ? `Forbruger ${per} units` : 'Ingen unit-forbrug');

  return (
    <div className="item" {...rest}>
      <div className="icon">{def.emoji || (isAnimal ? '🐄' : '🏷️')}</div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub">
          <ResourceCost cost={def.cost} />
        </div>
        <div className="sub">{perLabel}</div>
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
  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    return defs.ani?.[key]?.emoji || '🐾';
  }
  return '•';
}

function renderCostInline(costLike, defs) {
  const entries = Object.values(H.normalizePrice(costLike || {}));
  if (!entries.length) return '';
  return entries.map((e) => `${e.id.replace(/^res\./, '')}: ${H.fmt(e.amount)}`).join(' · ');
}

// Genbrugeligt panel for en enkelt family (samme layout som på UnitPage – uden top-tabs)
export default function UnitGroupPanel({ family }) {
  const { data, refreshData } = useGameData();
  const { data: header } = useHeaderSummary();

  const defs = data?.defs || {};
  const state = data?.state || {};
  const currentStage = Number(state?.user?.currentstage || state?.user?.stage || 0);

  const group = useMemo(() => UNIT_GROUPS.find((g) => g.family === family) || null, [family]);
  const isAnimal = group?.capacityMode === 'animalCap';

  // Tilgængelige defs (samme filter som UnitPage)
  const availableDefs = useMemo(() => {
    if (!group) return [];
    return Object.entries(defs.ani || {}).filter(([_, def]) => {
      const fams = String(def?.family || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const inFamily = fams.includes(group.family);
      if (!inFamily) return false;
      const stageOk = Number(def?.stage || 0) <= currentStage;
      return stageOk;
    });
  }, [defs?.ani, currentStage, group]);

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

  // Kapacitet/forbrug totals – identisk strategi som UnitPage
  const totals = useMemo(() => {
    if (!group) return { total: 0, used: 0 };

    if (isAnimal) {
      // Animal-grupper kan fås fra header (hvis du har dedikeret animal-capacitet i summary),
      // ellers beregnes usage fra ownedUnits og total = used + available fra state/defs (kan udvides senere).
      const cap = Number(header?.capacities?.[group.headerCapacityKey] ?? NaN);
      const usedHeader = Number(header?.usages?.[group.headerUsageKey]?.total ?? NaN);

      const usedFallback = ownedUnits.reduce((acc, [id, row]) => {
        const key = id.replace(/^ani\./, '');
        const def = defs.ani?.[key];
        const per = Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1;
        return acc + (Number(row?.quantity || 0) * per);
      }, 0);

      const headerLooksValid = Number.isFinite(cap) && (cap >= 0);
      const total = headerLooksValid ? cap : usedFallback; // hvis ikke header findes, vis i det mindste det samme tal på begge sider
      const used = Number.isFinite(usedHeader) ? usedHeader : usedFallback;

      return { total, used };
    }

    // Non-animal: brug header hvis data er brugbar; ellers fallback
    const hc = group.headerCapacityKey;  // fx 'healthUnitCapacity'
    const hu = group.headerUsageKey;     // fx 'healthUnitUsage'
    const headerTotal = Number(header?.capacities?.[hc] ?? NaN);
    const headerUsed = Number(header?.usages?.[hu]?.total ?? NaN);
    const fb = computeUnitTotalsFallback(defs, state, group);

    const headerLooksValid =
      Number.isFinite(headerTotal) &&
      Number.isFinite(headerUsed) &&
      (headerTotal > 0 || headerUsed > 0 || (headerTotal === 0 && headerUsed === 0 && fb.total === 0));

    return headerLooksValid ? { total: headerTotal, used: headerUsed } : fb;
  }, [group, isAnimal, state, defs, header, ownedUnits]);

  // Kurv / køb-salg
  const [toBuy, setToBuy] = useState({});
  const [confirm, setConfirm] = useState({ isOpen: false, title: '', body: '', onConfirm: null });

  const setQty = useCallback((aniId, value) => {
    setToBuy((prev) => {
      const next = { ...prev };
      if (value > 0) next[aniId] = value; else delete next[aniId];
      return next;
    });
  }, []);

  const basket = useMemo(() => {
    if (!group) return null;

    const total = Number(totals.total || 0);
    const used = Number(totals.used || 0);

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
    const hasCapacity = capToUse <= availableCap;
    const getHave = (resId) => {
      const key = String(resId).replace(/^res\./, '');
      const liquid = Number(state?.inv?.liquid?.[key] || 0);
      const solid = Number(state?.inv?.solid?.[key] || 0);
      return liquid + solid;
    };
    const canAfford = Object.values(totalCost).every((c) => getHave(c.id) >= (c.amount || 0));
    const totalQty = Object.values(toBuy).reduce((s, q) => s + (Number(q) || 0), 0);

    return { total, used, availableCap, capToUse, totalCost, canAfford, hasCapacity, totalQty };
  }, [group, totals, toBuy, defs, state, isAnimal]);

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
    setToBuy({});
    await refreshData?.();
    return json;
  }, [basket, toBuy, refreshData]);

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
      await refreshData?.();
      return json;
    },
    [refreshData]
  );

  const openBuyConfirm = () => {
    if (!basket?.totalQty) return;
    const costText = renderCostInline(basket.totalCost, defs);
    setConfirm({
      isOpen: true,
      title: `Bekræft køb (${group?.label || 'Units'})`,
      body: `Du køber ${basket.totalQty} enhed(er).<br/><div style={{ marginTop: '8px' }}>Pris: ${costText || '(ukendt)'}</div>`,
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
          <div className="sub">Ingen unit-gruppe for family: {family || '(ukendt)'}</div>
        </div>
      </section>
    );
  }

  const capLabel = isAnimal ? 'Staldplads' : 'Units';

  return (
    <>
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
            const perLabel = isAnimal ? `Optager ${per} staldplads` : (per > 0 ? `Forbruger ${per} units` : 'Ingen unit-forbrug');
            const hoverContent = <StatsEffectsTooltip def={def} translations={data?.i18n?.current ?? {}} />;

            return (
              <DockHoverCard key={aniId} content={hoverContent}>
                <div className="item">
                  <div className="icon">{def.emoji || (isAnimal ? '🐄' : group.emoji || '🏷️')}</div>
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
            return (
              <DockHoverCard key={key} content={hoverContent}>
                <PurchaseRow
                  def={def}
                  defs={defs}
                  aniId={`ani.${key}`}
                  toBuy={toBuy}
                  setQty={setQty}
                  availableCap={Math.max(0, (basket?.total || 0) - (basket?.used || 0))}
                  perItemStat={group.perItemStat}
                  isAnimal={isAnimal}
                />
              </DockHoverCard>
            );
          })}

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