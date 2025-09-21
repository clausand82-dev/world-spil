import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

const GameDataContext = createContext(null);

export function GameDataProvider({ children }) {
  const [gameState, setGameState] = useState({ 
    isLoading: true, 
    data: null, 
    artManifest: new Set(), // Initialiser som et tomt Set
    error: null 
  });

  const fetchData = useCallback(async () => {
    try {
      setGameState(prev => ({ ...prev, isLoading: !prev?.data, error: null }));
      
      // 1. Hent primær spildata
      const API_BASE = import.meta.env.VITE_API_BASE ?? '';
      const dataUrl = `${API_BASE}/backend/api/alldata.php?ts=${Date.now()}`;
      //const dataUrl = `/world-spil/backend/api/alldata.php?ts=${Date.now()}`;
      const gameDataResponse = await fetch(dataUrl, { cache: 'no-store' });
      if (!gameDataResponse.ok) throw new Error(`API error: ${gameDataResponse.status}`);
      const gameDataResult = await gameDataResponse.json();
      if (!gameDataResult.ok) throw new Error(gameDataResult.error?.message || 'API data error');

      // 2. Hent billed-manifest (fra /public/assets/art/manifest.json)
      let artManifestSet = new Set();
      try {
        const manifestResponse = await fetch('/assets/art/manifest.json', { cache: 'no-store' });
        if (manifestResponse.ok) {
          const manifestArray = await manifestResponse.json();
          if (Array.isArray(manifestArray)) {
            artManifestSet = new Set(manifestArray);
          }
        }
      } catch (manifestError) {
        console.warn("Could not load art manifest. Placeholders may be used.", manifestError);
      }

      setGameState(prev => ({
        ...prev,
        isLoading: false,
        data: gameDataResult.data,
        artManifest: artManifestSet,
        error: null
      }));

    } catch (error) {
      console.error("Failed to fetch game data:", error);
      setGameState(prev => ({ ...prev, isLoading: false, error }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Optimistic resource updates for locks/refunds/yields
  const applyLockedCostsDelta = useCallback((lockedList = [], sign = -1) => {
    if (!Array.isArray(lockedList) || lockedList.length === 0) return;
    setGameState(prev => {
      if (!prev?.data) return prev;
      const next = { ...prev, data: { ...prev.data, state: { ...prev.data.state, inv: { ...(prev.data.state?.inv || {}), solid: { ...(prev.data.state?.inv?.solid || {}) }, liquid: { ...(prev.data.state?.inv?.liquid || {}) } }, ani: { ...(prev.data.state?.ani || {}) } } } };
      for (const row of lockedList) {
        const rid = String(row.res_id || '');
        const amt = Number(row.amount || 0) * sign;
        if (!rid || !amt) continue;
        if (rid.startsWith('ani.')) {
          const cur = next.data.state.ani[rid]?.quantity || 0;
          next.data.state.ani[rid] = { ...(next.data.state.ani[rid] || {}), quantity: cur + amt };
        } else {
          const key = rid.replace(/^res\./, '');
          if (key in next.data.state.inv.solid) {
            next.data.state.inv.solid[key] = (next.data.state.inv.solid[key] || 0) + amt;
          } else if (key in next.data.state.inv.liquid) {
            next.data.state.inv.liquid[key] = (next.data.state.inv.liquid[key] || 0) + amt;
          } else {
            next.data.state.inv.solid[key] = (next.data.state.inv.solid[key] || 0) + amt;
          }
        }
      }
      return next;
    });
  }, []);

  const applyResourceDeltaMap = useCallback((resources = {}) => {
    if (!resources || typeof resources !== 'object') return;
    setGameState(prev => {
      if (!prev?.data) return prev;
      const next = { ...prev, data: { ...prev.data, state: { ...prev.data.state, inv: { ...(prev.data.state?.inv || {}), solid: { ...(prev.data.state?.inv?.solid || {}) }, liquid: { ...(prev.data.state?.inv?.liquid || {}) } } } } };
      for (const [rid, delta] of Object.entries(resources)) {
        const amt = Number(delta || 0);
        if (!amt) continue;
        const key = String(rid).replace(/^res\./, '');
        if (key in next.data.state.inv.solid) next.data.state.inv.solid[key] = (next.data.state.inv.solid[key] || 0) + amt;
        else if (key in next.data.state.inv.liquid) next.data.state.inv.liquid[key] = (next.data.state.inv.liquid[key] || 0) + amt;
        else next.data.state.inv.solid[key] = (next.data.state.inv.solid[key] || 0) + amt;
      }
      return next;
    });
  }, []);

  const value = { ...gameState, refreshData: fetchData, applyLockedCostsDelta, applyResourceDeltaMap };

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);






