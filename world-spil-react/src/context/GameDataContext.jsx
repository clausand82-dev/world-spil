import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const GameDataContext = createContext(null);

async function fetchAllData() {
  // Bevar dit eksisterende endpoint
  const dataUrl = `/world-spil/backend/api/alldata.php?ts=${Date.now()}`;
  const res = await fetch(dataUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error?.message || 'API data error');
  return json.data;
}

export function GameDataProvider({ children }) {
  const queryClient = useQueryClient();

  // Art manifest beholdes som separat state (som før)
  const [artManifest, setArtManifest] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resp = await fetch('/assets/art/manifest.json', { cache: 'no-store' });
        if (resp.ok) {
          const arr = await resp.json();
          if (active && Array.isArray(arr)) setArtManifest(new Set(arr));
        }
      } catch {
        // valgfrit: log
      }
    })();
    return () => { active = false; };
  }, []);

  // Hoveddata via React Query
  const {
    data,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['alldata'],
    queryFn: fetchAllData,
    // Vi lader ResourceAutoRefresh styre polling-frekvens, så ingen fast refetchInterval her
  });

  // Optimistiske delta-opdateringer (samme behavior som før, men via setQueryData)
  const applyLockedCostsDelta = useCallback((lockedList = [], sign = -1) => {
    if (!Array.isArray(lockedList) || lockedList.length === 0) return;
    queryClient.setQueryData(['alldata'], (prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        state: {
          ...prev.state,
          inv: {
            ...(prev.state?.inv || {}),
            solid: { ...(prev.state?.inv?.solid || {}) },
            liquid: { ...(prev.state?.inv?.liquid || {}) },
          },
          ani: { ...(prev.state?.ani || {}) },
        },
      };
      for (const row of lockedList) {
        const rid = String(row?.res_id || '');
        const amt = Number(row?.amount || 0) * sign;
        if (!rid || !amt) continue;
        if (rid.startsWith('ani.')) {
          const cur = next.state.ani[rid]?.quantity || 0;
          next.state.ani[rid] = { ...(next.state.ani[rid] || {}), quantity: cur + amt };
        } else {
          const key = rid.replace(/^res\./, '');
          if (key in next.state.inv.solid) next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
          else if (key in next.state.inv.liquid) next.state.inv.liquid[key] = (next.state.inv.liquid[key] || 0) + amt;
          else next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
        }
      }
      return next;
    });
  }, [queryClient]);

  const applyResourceDeltaMap = useCallback((resources = {}) => {
    if (!resources || typeof resources !== 'object') return;
    queryClient.setQueryData(['alldata'], (prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        state: {
          ...prev.state,
          inv: {
            ...(prev.state?.inv || {}),
            solid: { ...(prev.state?.inv?.solid || {}) },
            liquid: { ...(prev.state?.inv?.liquid || {}) },
          },
        },
      };
      for (const [rid, delta] of Object.entries(resources)) {
        const amt = Number(delta || 0);
        if (!amt) continue;
        const key = String(rid).replace(/^res\./, '');
        if (key in next.state.inv.solid) next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
        else if (key in next.state.inv.liquid) next.state.inv.liquid[key] = (next.state.inv.liquid[key] || 0) + amt;
        else next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
      }
      return next;
    });
  }, [queryClient]);

  const value = useMemo(() => ({
    isLoading,
    data,
    artManifest,
    error,
    refreshData: refetch,
    applyLockedCostsDelta,
    applyResourceDeltaMap,
  }), [isLoading, data, artManifest, error, refetch, applyLockedCostsDelta, applyResourceDeltaMap]);

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);