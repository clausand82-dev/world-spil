import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const GameDataContext = createContext(null);

function isFileLikeEmoji(v) {
  if (!v) return false;
  const s = String(v).trim();
  return /\.(png|jpe?g|gif|svg|webp)$/i.test(s) || /^https?:\/\//i.test(s) || s.startsWith('/');
}

// Normalize defs so emoji file‑navne bliver omdannet til image elements / iconUrl
export function normalizeDefsForIcons(defs, { baseIconPath = '/assets/icons/' } = {}) {
  if (!defs) return defs;

  const makeSafeBucket = (bucket) => {
    if (!bucket) return {};
    const out = {};
    Object.entries(bucket).forEach(([key, d]) => {
      if (!d) return;
      const nd = { ...d };
      const raw = (d.emoji || '').toString().trim();

      if (nd.iconUrl) {
        const src = nd.iconUrl;
        const el = React.createElement('img', {
          src,
          alt: nd.name || key,
          style: { width: '1em', height: '1em', objectFit: 'contain', verticalAlign: '-0.15em' },
          className: 'res-icon-inline'
        });
        nd.emoji = el;
        nd.emojiText = `<img src="${src}" alt="${(nd.name || key).replace(/"/g, '&quot;')}" style="width:1em;height:1em;vertical-align:-0.15em;object-fit:contain;display:inline-block" />`;
        out[key] = nd;
        return;
      }

      if (!raw) {
        nd.emoji = '';
        nd.emojiText = '';
        out[key] = nd;
        return;
      }

      if (isFileLikeEmoji(raw)) {
        const src = raw.startsWith('/') || /^https?:\/\//i.test(raw) ? raw : (baseIconPath + raw);
        nd.iconUrl = src;
        const el = React.createElement('img', {
          src,
          alt: nd.name || key,
          style: { width: '1em', height: '1em', objectFit: 'contain', verticalAlign: '-0.15em' },
          className: 'res-icon-inline'
        });
        nd.emoji = el;
        nd.emojiText = `<img src="${src}" alt="${(nd.name || key).replace(/"/g, '&quot;')}" style="width:1em;height:1em;vertical-align:-0.15em;object-fit:contain;display:inline-block" />`;
        out[key] = nd;
      } else {
        nd.emoji = raw;
        nd.emojiText = raw;
        out[key] = nd;
      }
    });
    return out;
  };

  const newDefs = { ...defs };
  newDefs.res = makeSafeBucket(defs.res);
  newDefs.ani = makeSafeBucket(defs.ani);
  // other buckets unchanged to avoid surprising mutations
  return newDefs;
}

export function GameDataProvider({ children }) {
  const queryClient = useQueryClient();

  const [artManifest, setArtManifest] = useState(() => new Set());
  const broadcastRef = useRef(null);
  const tabIdRef = useRef(Math.random().toString(36).slice(2));
  const incomingDebounceRef = useRef(null);

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
        // ignore
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
    // ResourceAutoRefresh (ekstern) styrer polling hvis nødvendigt
  });

  // BroadcastChannel + localStorage fallback: lyt til opdateringer fra andre faner
  useEffect(() => {
    // setup broadcast channel if available
    try {
      const bc = new BroadcastChannel('ws-game-data');
      broadcastRef.current = bc;
      bc.onmessage = (ev) => {
        try {
          const msg = ev.data || {};
          if (msg.source === tabIdRef.current) return; // ignore our own messages
          if (msg.type === 'alldata-updated') {
            const incomingTs = Number(msg.ts || 0);
            const lastLocal = Number(data?.meta?.lastUpdated || 0);
            if (incomingTs <= lastLocal) return;
            // debounce refetch to avoid storms
            if (incomingDebounceRef.current) clearTimeout(incomingDebounceRef.current);
            incomingDebounceRef.current = setTimeout(() => {
              refetch();
            }, 200);
          }
        } catch (e) { /* ignore */ }
      };
    } catch (e) {
      broadcastRef.current = null;
    }

    // storage fallback (other tabs may write to this key)
    const onStorage = (ev) => {
      try {
        if (ev.key !== '__ws_data_update') return;
        const msg = ev.newValue ? JSON.parse(ev.newValue) : null;
        if (!msg || msg.source === tabIdRef.current) return;
        if (msg.type === 'alldata-updated') {
          const incomingTs = Number(msg.ts || 0);
          const lastLocal = Number(data?.meta?.lastUpdated || 0);
          if (incomingTs <= lastLocal) return;
          if (incomingDebounceRef.current) clearTimeout(incomingDebounceRef.current);
          incomingDebounceRef.current = setTimeout(() => {
            refetch();
          }, 200);
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      try { if (broadcastRef.current) broadcastRef.current.close(); } catch {}
      window.removeEventListener('storage', onStorage);
      if (incomingDebounceRef.current) clearTimeout(incomingDebounceRef.current);
    };
    // NOTE: we purposely don't include data in deps to avoid repeated rebind; refetch is stable from react-query
  }, [refetch]);

  // Helper: broadcast an update to other tabs
  const broadcastUpdate = useCallback((ts = Date.now()) => {
    const payload = { type: 'alldata-updated', ts, source: tabIdRef.current };
    try {
      if (broadcastRef.current) broadcastRef.current.postMessage(payload);
      else localStorage.setItem('__ws_data_update', JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }, []);

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
        meta: { ...(prev.meta || {}), lastUpdated: Date.now() },
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
    broadcastUpdate();
  }, [queryClient, broadcastUpdate]);

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
        meta: { ...(prev.meta || {}), lastUpdated: Date.now() },
      };
      for (const [rid, delta] of Object.entries(resources)) {
        const amt = Number(delta || 0);
        if (!amt) continue;
        const key = String(rid).replace(/^res\./, '');
        if (key in next.state.inv.solid) next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
        else if (key in next.state.inv.liquid) next.state.inv.liquid[key] = (next.state.inv.liquid || 0) + amt;
        else next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
      }
      return next;
    });
    broadcastUpdate();
  }, [queryClient, broadcastUpdate]);

  // Wrapped refreshData that uses react-query refetch and broadcasts update afterward.
  const refreshData = useCallback(async (...args) => {
    // call react-query refetch
    try {
      const res = await refetch(...args);
      // react-query's refetch returns an object with data; update meta timestamp in cache
      const ts = Date.now();
      queryClient.setQueryData(['alldata'], (prev) => {
        if (!prev) return prev;
        return { ...prev, meta: { ...(prev.meta || {}), lastUpdated: ts } };
      });
      broadcastUpdate(ts);
      return res;
    } catch (e) {
      throw e;
    }
  }, [refetch, queryClient, broadcastUpdate]);

  // ensureFreshData helper: kan kaldes før kritiske mutationer
  const ensureFreshData = useCallback(async (ttlMs = 5000) => {
    const last = Number(data?.meta?.lastUpdated || 0);
    if (Date.now() - last > ttlMs) {
      await refreshData();
    }
    return data;
  }, [data, refreshData]);

  // Expose context value
  const value = useMemo(() => ({
    isLoading,
    data,
    artManifest,
    error,
    refreshData,
    ensureFreshData,
    applyLockedCostsDelta,
    applyResourceDeltaMap,
  }), [isLoading, data, artManifest, error, refreshData, ensureFreshData, applyLockedCostsDelta, applyResourceDeltaMap]);

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);

// --- fetchAllData: sørg for at sætte meta.lastUpdated og window.data som før ---
async function fetchAllData() {
  const dataUrl = `/world-spil/backend/api/alldata.php?ts=${Date.now()}`;
  const res = await fetch(dataUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error?.message || 'API data error');

  try {
    if (json?.data?.defs) {
      const normalized = normalizeDefsForIcons(json.data.defs, { baseIconPath: '/assets/icons/' });
      json.data.defs = normalized;
      try { window.data = json.data; } catch (e) { /* ignore */ }
      try {
        const sampleKey = Object.keys(normalized.res || {})[0];
        console.debug('[fetchAllData] normalized.defs.sample:', sampleKey, normalized.res?.[sampleKey]);
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.warn('normalizeDefsForIcons failed', e);
  }

  // sæt meta (lastUpdated) så context kan vurdere friskhed
  try {
    json.data.meta = { ...(json.data.meta || {}), lastUpdated: Date.now() };
  } catch (e) { /* ignore */ }

  return json.data;
}