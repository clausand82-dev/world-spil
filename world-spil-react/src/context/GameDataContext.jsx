import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const GameDataContext = createContext(null);

// Helper: check if string looks like a URL or image filename
function isFileLike(v) {
  if (!v) return false;
  const s = String(v).trim();
  return s !== '' && (s.startsWith('/') || /^https?:\/\//i.test(s) || /\.(png|jpe?g|gif|svg|webp)$/i.test(s));
}

/*
  Normalization: assume <emoji> tag ALWAYS contains a filename (e.g. "straw.png").
  We convert that filename into an iconUrl string (baseIconPath + filename) or keep absolute URL.
  We no longer try to support unicode emoji; all icons are files.
  We still create a non-enumerable `icon` getter so existing components that access def.icon
  continue to get a rendered <img> element (but the data object itself remains serializable).
*/
export function normalizeDefsForIcons(defs, { baseIconPath = '/assets/icons/' } = {}) {
  if (!defs) return defs;

  const makeSafeBucket = (bucket = {}) => {
    const out = {};
    Object.entries(bucket).forEach(([key, d]) => {
      if (!d) return;
      const nd = { ...d }; // shallow copy

      // TAKE ONLY FILE-NAME FROM d.emoji: treat it as filename or path
      const raw = (d.emoji || '').toString().trim();

      if (raw && isFileLike(raw)) {
        // raw could be 'foo.png', '/assets/icons/foo.png' or 'https://.../foo.png'
        const src = raw.startsWith('/') || /^https?:\/\//i.test(raw) ? raw : (baseIconPath + raw);
        nd.iconUrl = src;
        nd.iconFilename = raw;
      } else {
        // No valid file-like emoji found -> leave iconUrl undefined; components should use fallback
        nd.iconUrl = undefined;
        nd.iconFilename = raw || '';
      }

      // Provide a non-enumerable getter `icon` for backwards compatibility.
      // The getter returns a React <img> element using iconUrl or a fallback image.
      if (d && React.isValidElement(d.icon)) {
        // preserve existing React elements if upstream already provided one
        nd.icon = d.icon;
      } else {
        try {
          Object.defineProperty(nd, 'icon', {
            enumerable: false, // don't serialize or enumerate
            configurable: true,
            get: function () {
              try {
                const src = this.iconUrl;
                const finalSrc = src || (baseIconPath + 'default.png');
                return React.createElement('img', {
                  src: finalSrc,
                  alt: this.name || key,
                  style: { width: '1em', height: '1em', objectFit: 'contain', verticalAlign: '-0.15em' },
                  className: 'res-icon-inline'
                });
              } catch (e) {
                // fallback to empty string to avoid crashes
                return '';
              }
            }
          });
        } catch (e) {
          // If defineProperty fails, assign a string (defensive)
          nd.icon = nd.iconUrl || (baseIconPath + 'default.png');
        }
      }

      out[key] = nd;
    });
    return out;
  };

  const newDefs = { ...defs };
  // Normalize buckets that commonly hold resource/animal icons.
  newDefs.res = makeSafeBucket(defs.res || {});
  newDefs.ani = makeSafeBucket(defs.ani || {});
  // Keep other buckets unchanged (bld/add) to minimize work; you can normalize them on demand.
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

  const {
    data,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['alldata'],
    queryFn: fetchAllData,
  });

  useEffect(() => {
    try {
      const bc = new BroadcastChannel('ws-game-data');
      broadcastRef.current = bc;
      bc.onmessage = (ev) => {
        try {
          const msg = ev.data || {};
          if (msg.source === tabIdRef.current) return;
          if (msg.type === 'alldata-updated') {
            const incomingTs = Number(msg.ts || 0);
            const lastLocal = Number(data?.meta?.lastUpdated || 0);
            if (incomingTs <= lastLocal) return;
            if (incomingDebounceRef.current) clearTimeout(incomingDebounceRef.current);
            incomingDebounceRef.current = setTimeout(() => { refetch(); }, 250);
          }
        } catch (e) { /* ignore */ }
      };
    } catch (e) {
      broadcastRef.current = null;
    }

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
          incomingDebounceRef.current = setTimeout(() => { refetch(); }, 250);
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      try { if (broadcastRef.current) broadcastRef.current.close(); } catch {}
      window.removeEventListener('storage', onStorage);
      if (incomingDebounceRef.current) clearTimeout(incomingDebounceRef.current);
    };
  }, [refetch, data]);

  const broadcastUpdate = useCallback((ts = Date.now()) => {
    const payload = { type: 'alldata-updated', ts, source: tabIdRef.current };
    try {
      if (broadcastRef.current) broadcastRef.current.postMessage(payload);
      else localStorage.setItem('__ws_data_update', JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }, []);

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
        else if (key in next.state.inv.liquid) next.state.inv.liquid[key] = (next.state.inv.liquid[key] || 0) + amt;
        else next.state.inv.solid[key] = (next.state.inv.solid[key] || 0) + amt;
      }
      return next;
    });
    broadcastUpdate();
  }, [queryClient, broadcastUpdate]);

  const removeActiveBuild = useCallback((jobId) => {
    queryClient.setQueryData(['alldata'], (prev) => {
      if (!prev) return prev;
      const next = { ...prev, state: { ...(prev.state || {}) } };
      const active = { ...(next.state?.activeBuilds || {}) };
      if (active && jobId in active) {
        delete active[jobId];
        next.state = { ...next.state, activeBuilds: active, meta: { ...(next.meta || {}), lastUpdated: Date.now() } };
        return next;
      }
      return prev;
    });
    broadcastUpdate();
  }, [queryClient, broadcastUpdate]);

  const refreshData = useCallback(async (...args) => {
    try {
      const res = await refetch(...args);
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

  const ensureFreshData = useCallback(async (ttlMs = 5000) => {
    const last = Number(data?.meta?.lastUpdated || 0);
    if (Date.now() - last > ttlMs) {
      await refreshData();
    }
    return data;
  }, [data, refreshData]);

  const value = useMemo(() => ({
    isLoading,
    data,
    artManifest,
    error,
    refreshData,
    ensureFreshData,
    applyLockedCostsDelta,
    applyResourceDeltaMap,
    removeActiveBuild,
    normalizeDefsForIcons,
  }), [isLoading, data, artManifest, error, refreshData, ensureFreshData, applyLockedCostsDelta, applyResourceDeltaMap, removeActiveBuild]);

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);

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
      try { if (!window.data) window.data = json.data; } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('normalizeDefsForIcons failed', e);
  }

  try {
    json.data.meta = { ...(json.data.meta || {}), lastUpdated: Date.now() };
  } catch (e) { /* ignore */ }

  return json.data;
}