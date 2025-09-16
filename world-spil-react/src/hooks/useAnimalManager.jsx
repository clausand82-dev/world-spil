import { useState, useMemo, useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import { postJSON } from '../services/api.js';

export function useAnimalManager() {
  const { data, refreshData } = useGameData();
  const [animalsToBuy, setAnimalsToBuy] = useState({}); // { 'ani.ko': 2, ... }

  // Udledninger (kapacitet, pris, m.m.)
  const details = useMemo(() => {
    if (!data) return null;

    const { state, defs } = data;

    const cap = state.cap?.animal_cap || { total: 0, used: 0 };
    let capToUse = 0;
    let totalCost = {}; // { 'res.money': {id, amount}, ... }

    for (const [aniId, qty] of Object.entries(animalsToBuy)) {
      if (!qty) continue;
      const key = aniId.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) continue;

      // Kapacitet
      capToUse += Math.abs(def.stats?.animal_cap || 1) * qty;

      // Pris
      const costs = H.normalizePrice(def.cost || {});
      for (const c of Object.values(costs)) {
        totalCost[c.id] = { id: c.id, amount: (totalCost[c.id]?.amount || 0) + c.amount * qty };
      }
    }

    // “Har råd?”
    let canAfford = true;
    for (const c of Object.values(totalCost)) {
      let have = 0;
      if (c.id.startsWith('ani.')) {
        have = state.ani?.[c.id]?.quantity ?? 0;
      } else {
        const k = c.id.replace(/^res\./, '');
        have = state.inv?.solid?.[k] ?? state.inv?.liquid?.[k] ?? 0;
      }
      if (have < c.amount) { canAfford = false; break; }
    }

    const availableCap = Math.max(0, cap.total - cap.used);
    const hasCapacity = capToUse <= availableCap;
    const totalQty = Object.values(animalsToBuy).reduce((s, q) => s + (q || 0), 0);

    return { state, defs, cap, availableCap, capToUse, totalCost, canAfford, hasCapacity, totalQty };
  }, [data, animalsToBuy]);

  // Sliderændring
  const setQty = useCallback((aniId, value) => {
    setAnimalsToBuy((prev) => {
      const next = { ...prev };
      if (value > 0) next[aniId] = value;
      else delete next[aniId];
      return next;
    });
  }, []);

  // KØB: én samlet request: { action: 'buy', animals: { ani.ko: 2, ... } }
  const handleBuy = useCallback(async () => {
    if (!details) return;
    const { canAfford, hasCapacity, totalQty } = details;

    // Filtrér kun >0
    const animals = Object.fromEntries(
      Object.entries(animalsToBuy).filter(([, qty]) => Number(qty) > 0)
    );

    if (!Object.keys(animals).length || totalQty <= 0) {
      throw new Error('No animals selected for purchase.');
    }
    if (!hasCapacity) throw new Error('Not enough stall capacity.');
    if (!canAfford) throw new Error('Insufficient resources.');

    const resp = await postJSON('/world-spil/backend/api/actions/animal.php', {
      action: 'buy',
      animals,
    });
    // For god ordens skyld
    if (resp && resp.ok === false) {
      throw new Error(resp.message || 'Server refused purchase.');
    }

    setAnimalsToBuy({});
    await refreshData();
    return resp;
  }, [animalsToBuy, details, refreshData]);

  // SALG: samme som før (det virkede) pr. enkelt dyr
  const handleSell = useCallback(async (aniId, quantity) => {
    if (!aniId || !quantity) return;
    const resp = await postJSON('/world-spil/backend/api/actions/animal.php', {
      action: 'sell',
      animal_id: aniId,
      quantity,
    });
    if (resp && resp.ok === false) {
      throw new Error(resp.message || 'Server refused sale.');
    }
    await refreshData();
    return resp;
  }, [refreshData]);

  return {
    animalsToBuy,
    setAnimalsToBuy,
    setQty,
    handleBuy,
    handleSell,
    ...(details || {}),
  };
}
