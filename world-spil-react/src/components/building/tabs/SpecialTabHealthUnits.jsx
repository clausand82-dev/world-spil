import React, { useMemo, useState } from 'react';
import { useGameData } from '../../../context/GameDataContext.jsx';
import * as H from '../../../services/helpers.js';
import ResourceCost from '../../../components/requirements/ResourceCost.jsx';
import ConfirmModal from '../../../components/ConfirmModal.jsx';
import { useAnimalManager } from '../../../hooks/useAnimalManager.jsx';

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

function AnimalPurchaseRow({ def, defs, aniId, availableHealthCap, animalsToBuy, setQty }) {
  // brug healthUnitUsage hvis def har det, ellers fallback til animal_cap
  const unitCost = Math.abs(def.stats?.healthUnitUsage ?? def.stats?.animal_cap ?? 1);

  // hvor meget health-units forbruger andre valgte dyr?
  const capUsedByOthers = useMemo(() => {
    return Object.entries(animalsToBuy).reduce((sum, [id, qty]) => {
      if (id === aniId) return sum;
      const otherDef = defs.ani?.[id.replace(/^ani\./, '')];
      const otherUnit = Math.abs(otherDef?.stats?.healthUnitUsage ?? otherDef?.stats?.animal_cap ?? 1);
      return sum + (otherUnit * (qty || 0));
    }, 0);
  }, [animalsToBuy, aniId, defs]);

  const remainingCap = (typeof availableHealthCap !== 'undefined') ? availableHealthCap - capUsedByOthers : 0;
  const maxVal = Math.floor(Math.max(0, remainingCap / unitCost));
  const currentVal = Math.min(animalsToBuy[aniId] || 0, maxVal);

  return (
    <div className="item">
      <div className="icon">{def.emoji || '🩺'}</div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub"><ResourceCost cost={def.cost} /></div>
        <div className="sub">Kræver {unitCost} health‑unit{unitCost !== 1 ? 's' : ''}</div>
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
    state, defs, cap,
    // forventede health-relaterede værdier fra hook (tilføj i useAnimalManager)
    availableHealthCap, healthToUse, totalHealthCost, canAffordHealth, hasHealthCapacity, totalHealthQty,
    // eksisterende animal-cap fallback værdier
    availableCap, capToUse, totalCost, canAfford, hasCapacity, totalQty
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

  // --- køb (åbn modal) --- uses health totals if available
  const openBuyConfirm = () => {
    const finalQty = (typeof totalHealthQty !== 'undefined') ? totalHealthQty : totalQty;
    if (!finalQty) return; // intet valgt
    const costText = renderCostInline((typeof totalHealthCost !== 'undefined') ? totalHealthCost : totalCost, defs);
    setConfirm({
      isOpen: true,
      title: 'Bekræft køb',
      body: `Du køber ${finalQty} dyr.<br/><div style="margin-top:8px;">Pris: ${costText || '(ukendt)'}</div>`,
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

  // salg kode uændret...

  return (
    <>

        <div className="section-head">Dine Dyr</div>
        <div className="section-body">
          {ownedAnimals.map(([aniId, animalData]) => {
            const key = aniId.replace(/^ani\./, '');
            const def = defs.ani[key];
            const unitUsed = Math.abs(def.stats?.healthUnitUsage ?? def.stats?.animal_cap ?? 1);
            return (
              <div className="item" key={aniId}>
                <div className="icon">{def.emoji || '🩺'}</div>
                <div>
                  <div className="title">
                    {def.name} (x{H.fmt(animalData.quantity)})
                  </div>
                  <div className="sub">Optager {unitUsed} health‑unit{unitUsed !== 1 ? 's' : ''}</div>
                </div>
                <div className="right">
                  <button className="btn" onClick={() => openSellConfirm(aniId, 1)}>Sælg 1</button>
                  <button className="btn" onClick={() => openSellConfirm(aniId, animalData.quantity)}>Sælg alle</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="section-head">Køb Dyr</div>
        <div className="section-body">
          {availableAnimals.map(([key, def]) => (
            <AnimalPurchaseRow
              key={key}
              def={def}
              defs={defs}
              aniId={`ani.${key}`}
              availableHealthCap={(typeof availableHealthCap !== 'undefined') ? availableHealthCap : availableCap}
              animalsToBuy={animalsToBuy}
              setQty={setQty}
            />
          ))}
          <div className="actions-bar" style={{ marginTop: '16px' }}>
            <div>
              <strong>Total:</strong> <ResourceCost cost={(typeof totalHealthCost !== 'undefined') ? totalHealthCost : totalCost} /> &nbsp;
              <strong style={{ marginLeft: '1em' }}>Health‑units:</strong>
              <span className={!((typeof hasHealthCapacity !== 'undefined') ? hasHealthCapacity : hasCapacity) ? 'price-bad' : ''}>
                {(cap?.used || 0) + (healthToUse ?? capToUse ?? 0)}
              </span> / {(typeof cap?.healthUnitCapacity !== 'undefined') ? cap.healthUnitCapacity : (cap?.total ?? 0)}
            </div>
            <button
              className="btn primary"
              disabled={((typeof totalHealthQty !== 'undefined') ? totalHealthQty === 0 : totalQty === 0) || !((typeof canAffordHealth !== 'undefined') ? canAffordHealth : canAfford) || !((typeof hasHealthCapacity !== 'undefined') ? hasHealthCapacity : hasCapacity)}
              onClick={openBuyConfirm}
            >
              Køb valgte dyr
            </button>
          </div>
        </div>

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