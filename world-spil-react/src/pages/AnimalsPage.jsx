import React, { useMemo, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import ResourceCost from '../components/requirements/ResourceCost.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useAnimalManager } from '../hooks/useAnimalManager.jsx';

/* smal helper til inline visning af pris/refusion */
function emojiForId(id, defs) {
  if (!id) return '';
  if (id.startsWith('res.')) return defs.res?.[id.replace(/^res\./, '')]?.emoji || '';
  if (id.startsWith('ani.')) return defs.ani?.[id.replace(/^ani\./, '')]?.emoji || '';
  return '';
}
function renderCostInline(costLike, defs) {
  const map = H.normalizePrice(costLike || {});
  const parts = Object.values(map).map((entry) => {
    const em = emojiForId(entry.id, defs);
    return `${entry.amount}${em ? ' ' + em : ''}`;
  });
  return parts.join(', ');
}

function AnimalPurchaseRow({ def, defs, aniId, availableCap, animalsToBuy, setQty }) {
  const capCost = Math.abs(def.stats?.animal_cap || 1);

  // hvor meget cap forbruger andre valgte dyr?
  const capUsedByOthers = useMemo(() => {
    return Object.entries(animalsToBuy).reduce((sum, [id, qty]) => {
      if (id === aniId) return sum;
      const otherDef = defs.ani?.[id.replace(/^ani\./, '')];
      return sum + (Math.abs(otherDef?.stats?.animal_cap || 1) * (qty || 0));
    }, 0);
  }, [animalsToBuy, aniId, defs]);

  const remainingCap = availableCap - capUsedByOthers;
  const maxVal = Math.floor(Math.max(0, remainingCap / capCost));
  const currentVal = Math.min(animalsToBuy[aniId] || 0, maxVal);

  return (
    <div className="item">
      <div className="icon">{def.emoji || '🐄'}</div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub"><ResourceCost cost={def.cost} /></div>
        <div className="sub">Kræver {capCost} staldplads</div>
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

export default function AnimalsPage() {
  const { data, isLoading, error } = useGameData();
  const {
    animalsToBuy, setQty, handleBuy, handleSell,
    state, defs, cap, availableCap, capToUse, totalCost, canAfford, hasCapacity, totalQty
  } = useAnimalManager();

  const [confirm, setConfirm] = useState({ isOpen: false, title: '', body: '', onConfirm: null });

  if (isLoading) return <div className="sub">Indlæser...</div>;
  if (error || !data) return <div className="sub">Fejl.</div>;

  const ownedAnimals = Object.entries(state?.ani || {}).filter(([id, a]) => a.quantity > 0);
  const availableAnimals = useMemo(() => {
    const familiesOwned = new Set(
      Object.keys(state?.bld || {}).map((id) => H.parseBldKey(id)?.family).filter(Boolean)
    );
    return Object.entries(defs.ani || {}).filter(
      ([, def]) =>
        (def.stage || 0) <= Number(state.user?.currentstage || 0) &&
        def.family?.split(',').some((f) => familiesOwned.has(f.trim()))
    );
  }, [state, defs]);

  // --- køb (åbn modal) ---
  const openBuyConfirm = () => {
    if (!totalQty) return; // intet valgt
    const costText = renderCostInline(totalCost, defs);
    setConfirm({
      isOpen: true,
      title: 'Bekræft køb',
      body: `Du køber ${totalQty} dyr.<br/><div style="margin-top:8px;">Pris: ${costText || '(ukendt)'}</div>`,
      onConfirm: async () => {
        try {
          await handleBuy(); // kalder én samlet POST: { action:'buy', animals:{...} }
        } catch (e) {
          alert(e.message || 'Køb fejlede.');
        } finally {
          setConfirm((c) => ({ ...c, isOpen: false }));
        }
      },
    });
  };

  // --- salg (åbn modal) ---
  const openSellConfirm = (aniId, quantity) => {
    const key = aniId.replace(/^ani\./, '');
    const def = defs.ani?.[key];
    if (!def) return;

    // beregn refusion ca. 50% af cost
    const costs = H.normalizePrice(def.cost || {});
    const refundMap = {};
    Object.values(costs).forEach((entry) => {
      refundMap[entry.id] = { id: entry.id, amount: (entry.amount || 0) * quantity * 0.5 };
    });
    const refundText = renderCostInline(refundMap, defs);

    setConfirm({
      isOpen: true,
      title: quantity === 1 ? 'Sælg 1 dyr' : `Sælg ${quantity} dyr`,
      body: `Du får følgende tilbage:<br/><div style="margin-top:8px;">${refundText || '(ukendt værdi)'}</div>`,
      onConfirm: async () => {
        try {
          await handleSell(aniId, quantity); // virker hos dig i backend
        } catch (e) {
          alert(e.message || 'Salg fejlede.');
        } finally {
          setConfirm((c) => ({ ...c, isOpen: false }));
        }
      },
    });
  };

  return (
    <>
      <section className="panel section">
        <div className="section-head">Dine Dyr</div>
        <div className="section-body">
          {ownedAnimals.map(([aniId, animalData]) => {
            const key = aniId.replace(/^ani\./, '');
            const def = defs.ani[key];
            return (
              <div className="item" key={aniId}>
                <div className="icon">{def.emoji || '🐄'}</div>
                <div>
                  <div className="title">
                    {def.name} (x{H.fmt(animalData.quantity)})
                  </div>
                  <div className="sub">Optager {Math.abs(def.stats?.animal_cap || 1)} staldplads</div>
                </div>
                <div className="right">
                  <button className="btn" onClick={() => openSellConfirm(aniId, 1)}>Sælg 1</button>
                  <button className="btn" onClick={() => openSellConfirm(aniId, animalData.quantity)}>Sælg alle</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel section">
        <div className="section-head">Køb Dyr</div>
        <div className="section-body">
          {availableAnimals.map(([key, def]) => (
            <AnimalPurchaseRow
              key={key}
              def={def}
              defs={defs}
              aniId={`ani.${key}`}
              availableCap={availableCap}
              animalsToBuy={animalsToBuy}
              setQty={setQty}
            />
          ))}
          <div className="actions-bar" style={{ marginTop: '16px' }}>
            <div>
              <strong>Total:</strong> <ResourceCost cost={totalCost} /> &nbsp;
              <strong style={{ marginLeft: '1em' }}>Staldplads:</strong>
              <span className={!hasCapacity ? 'price-bad' : ''}>{(cap?.used || 0) + (capToUse || 0)}</span> / {cap?.total || 0}
            </div>
            <button
              className="btn primary"
              disabled={totalQty === 0 || !canAfford || !hasCapacity}
              onClick={openBuyConfirm}
            >
              Køb valgte dyr
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
