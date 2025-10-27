/* Entire file - GameDataContext with normalization for res/ani/bld/add/rsd and lazy non-enumerable icon getter
 *
 * Revisions in this version:
 * - Ensures that any cached alldata body loaded from localStorage (used when server returns 304)
 *   is normalized with normalizeDefsForIcons before being returned to the app.
 * - Deduce baseIconPath dynamically to handle apps hosted under a subpath (e.g. /world-spil).
 * - Keeps ETag/If-None-Match conditional fetch logic and localStorage cache.
 *
 * After replacing this file:
 * - Clear the cache keys in DevTools console:
 *     localStorage.removeItem('ws:alldata:etag');
 *     localStorage.removeItem('ws:alldata:body');
 * - Then reload the page.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const GameDataContext = createContext(null);

function isFileLike(v) {
  if (!v) return false;
  const s = String(v).trim();
  return s !== '' && (s.startsWith('/') || /^https?:\/\//i.test(s) || /\.(png|jpe?g|gif|svg|webp)$/i.test(s));
}

/**
 * deduceBaseIconPath()
 * - Tries to guess the correct base path for assets from window.location.pathname.
 * - If the app runs under '/world-spil/...' this will return '/world-spil/assets/icons/'.
 */
function deduceBaseIconPath() {
  try {
    if (typeof window === 'undefined' || !window.location || !window.location.pathname) return '/assets/icons/';
    const segments = window.location.pathname.split('/').filter(Boolean);
    const prefix = segments.length > 0 ? `/${segments[0]}` : '';
    return `${prefix}/assets/icons/`;
  } catch (e) {
    return '/assets/icons/';
  }
}

/*
  Normalization: assume <emoji> tag contains a filename (png). Convert to iconUrl/iconFilename.
  Create non-enumerable `icon` getter for backwards compatibility (returns <img> or emoji string).
*/
export function normalizeDefsForIcons(defs, { baseIconPath = null } = {}) {
  if (!defs) return defs;

  if (!baseIconPath) baseIconPath = deduceBaseIconPath();

  const makeSafeBucket = (bucket = {}) => {
    const out = {};
    Object.entries(bucket).forEach(([key, d]) => {
      if (!d) return;
      const nd = { ...d };
      const raw = (d.emoji || '').toString().trim();

      // If raw looks like a filename/path or there is already an iconUrl, produce absolute iconUrl
      if (raw && isFileLike(raw)) {
        let src = raw;
        // If raw is relative (no leading slash, no http), prefix with baseIconPath
        if (!src.startsWith('/') && !/^https?:\/\//i.test(src)) {
          src = (baseIconPath.endsWith('/') ? baseIconPath : `${baseIconPath}/`) + src;
        }
        nd.iconUrl = src;
        nd.iconFilename = raw;
      } else if (nd.iconUrl) {
        // ensure iconUrl is a string and absolute (if not absolute, prefix)
        nd.iconUrl = String(nd.iconUrl);
        if (!nd.iconUrl.startsWith('/') && !/^https?:\/\//i.test(nd.iconUrl)) {
          nd.iconUrl = (baseIconPath.endsWith('/') ? baseIconPath : `${baseIconPath}/`) + nd.iconUrl;
        }
        nd.iconFilename = nd.iconUrl.split('/').pop();
      } else {
        // no file-like emoji and no iconUrl -> keep raw in iconFilename for reference
        nd.iconUrl = undefined;
        nd.iconFilename = raw || '';
      }

      // preserve if upstream provided a React element
      if (d && React.isValidElement(d.icon)) {
        nd.icon = d.icon;
      } else {
        try {
          Object.defineProperty(nd, 'icon', {
            enumerable: false,
            configurable: true,
            get: function () {
              try {
                const src = this.iconUrl;
                const finalSrc = src || (baseIconPath.endsWith('/') ? baseIconPath : `${baseIconPath}/`) + 'default.png';
                return React.createElement('img', {
                  src: finalSrc,
                  alt: this.name || key,
                  style: { width: '1em', height: '1em', objectFit: 'contain', verticalAlign: '-0.15em' },
                  className: 'res-icon-inline'
                });
              } catch (e) {
                return '';
              }
            }
          });
        } catch (e) {
          nd.icon = nd.iconUrl || (baseIconPath.endsWith('/') ? baseIconPath : `${baseIconPath}/`) + 'default.png';
        }
      }

      out[key] = nd;
    });
    return out;
  };

  const newDefs = { ...defs };
  // Normalize common buckets that contain icons
  newDefs.res = makeSafeBucket(defs.res || {});
  newDefs.ani = makeSafeBucket(defs.ani || {});
  newDefs.bld = makeSafeBucket(defs.bld || {});
  newDefs.add = makeSafeBucket(defs.add || {});
  newDefs.rsd = makeSafeBucket(defs.rsd || {});
  // leave other buckets untouched

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

  const { data, error, isLoading, refetch } = useQuery({
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

  // --- NYT: updateState(patch) - merge en lille patch ind i query cache uden at overskrive alt ---
  const deepMergeObj = useCallback((target, patch) => {
    if (!patch || typeof patch !== 'object') return target;
    if (!target || typeof target !== 'object') {
      return Array.isArray(patch) ? patch.slice() : { ...patch };
    }
    const out = Array.isArray(target) ? target.slice() : { ...target };
    for (const key of Object.keys(patch)) {
      const pv = patch[key];
      const tv = out[key];
      if (
        pv &&
        typeof pv === 'object' &&
        !Array.isArray(pv) &&
        tv &&
        typeof tv === 'object' &&
        !Array.isArray(tv)
      ) {
        out[key] = deepMergeObj(tv, pv);
      } else {
        out[key] = pv;
      }
    }
    return out;
  }, []);

  const updateState = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return;
    try {
      queryClient.setQueryData(['alldata'], (prev) => {
        if (!prev) return prev;
        const merged = deepMergeObj(prev, patch);
        // ensure lastUpdated changes so listeners can react
        merged.meta = { ...(merged.meta || {}), lastUpdated: Date.now() };
        return merged;
      });
      broadcastUpdate();
    } catch (e) {
      // defensive: if merge fails, fall back to a full refresh (caller can choose)
      // removed console.warn per cleanup request
    }
  }, [queryClient, deepMergeObj, broadcastUpdate]);
  // --- /NYT ---

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
    // eksporter updateState så komponenter kan anvende kompakte patches
    updateState,
  }), [isLoading, data, artManifest, error, refreshData, ensureFreshData, applyLockedCostsDelta, applyResourceDeltaMap, removeActiveBuild, normalizeDefsForIcons, updateState]);

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);

/**
 * fetchAllData
 *
 * Reworked to:
 * - Use If-None-Match header with ETag stored in localStorage to avoid re-downloading full payload when unchanged.
 * - Store parsed data.data in localStorage for reuse when server responds 304.
 * - IMPORTANT: Normalize defs (normalizeDefsForIcons) on any cached body before returning.
 *
 * LocalStorage keys used:
 * - ws:alldata:etag  => stored ETag string (including quotes if server includes them)
 * - ws:alldata:body  => JSON.stringify(data) where `data` is json.data from the server response
 *
 * Important: the server must emit ETag header and honor If-None-Match -> return 304 Not Modified.
 */
async function fetchAllData() {
  const etagKey = 'ws:alldata:etag';
  const bodyKey = 'ws:alldata:body';
  const url = `/world-spil/backend/api/alldata.php`;

  // Read stored ETag (if any)
  let storedETag = null;
  try {
    storedETag = localStorage.getItem(etagKey);
  } catch (e) {
    storedETag = null;
  }

  const headers = {};
  if (storedETag) headers['If-None-Match'] = storedETag;

  // Perform conditional request. credentials: 'include' so session cookies travel.
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', headers, credentials: 'include' });
  } catch (err) {
    // Network error -> try to return cached copy if available
    try {
      const raw = localStorage.getItem(bodyKey);
      if (raw) {
        let cached = JSON.parse(raw);
        // ensure defs are normalized before returning cached data
        if (cached?.defs) {
          try {
            cached.defs = normalizeDefsForIcons(cached.defs, { baseIconPath: deduceBaseIconPath() });
            try { if (!window.data) window.data = cached; } catch (e) { /* ignore */ }
          } catch (e) { /* ignore */ }
        }
        try { cached.meta = { ...(cached.meta || {}), lastUpdated: Date.now() }; } catch (e) { /* ignore */ }
        return cached;
      }
    } catch (e) { /* ignore */ }
    throw new Error('Network error while fetching alldata');
  }

  // If server says 304 Not Modified -> use cached body
  if (res.status === 304) {
    try {
      const raw = localStorage.getItem(bodyKey);
      if (raw) {
        let cached = JSON.parse(raw);
        // IMPORTANT: normalize defs here as well — JSON.parse won't create icon getters
        if (cached?.defs) {
          try {
            cached.defs = normalizeDefsForIcons(cached.defs, { baseIconPath: deduceBaseIconPath() });
            try { if (!window.data) window.data = cached; } catch (e) { /* ignore */ }
          } catch (e) { /* ignore */ }
        }
        try { cached.meta = { ...(cached.meta || {}), lastUpdated: Date.now() }; } catch (e) { /* ignore */ }
        return cached;
      } else {
        // No cached body available; perform a full fetch
        const freshRes = await fetch(url, { cache: 'no-store', credentials: 'include' });
        if (!freshRes.ok) throw new Error(`API error: ${freshRes.status}`);
        const freshJson = await freshRes.json();
        if (!freshJson?.ok) throw new Error(freshJson?.error?.message || 'API data error');
        const data = freshJson.data;
        // store and normalize
        const respETag = freshRes.headers.get('ETag') || null;
        try {
          if (respETag) localStorage.setItem(etagKey, respETag);
          localStorage.setItem(bodyKey, JSON.stringify(data));
        } catch (e) { /* ignore storage errors */ }
        if (data?.defs) {
          data.defs = normalizeDefsForIcons(data.defs, { baseIconPath: deduceBaseIconPath() });
          try { if (!window.data) window.data = data; } catch (e) { /* ignore */ }
        }
        try { data.meta = { ...(data.meta || {}), lastUpdated: Date.now() }; } catch (e) { /* ignore */ }
        return data;
      }
    } catch (e) {
      // If reading cache fails -> attempt a full fetch
      const freshRes = await fetch(url, { cache: 'no-store', credentials: 'include' });
      if (!freshRes.ok) throw new Error(`API error: ${freshRes.status}`);
      const freshJson = await freshRes.json();
      if (!freshJson?.ok) throw new Error(freshJson?.error?.message || 'API data error');
      const data = freshJson.data;
      const respETag = freshRes.headers.get('ETag') || null;
      try {
        if (respETag) localStorage.setItem(etagKey, respETag);
        localStorage.setItem(bodyKey, JSON.stringify(data));
      } catch (e) { /* ignore storage errors */ }
      if (data?.defs) {
        data.defs = normalizeDefsForIcons(data.defs, { baseIconPath: deduceBaseIconPath() });
        try { if (!window.data) window.data = data; } catch (e) { /* ignore */ }
      }
      try { data.meta = { ...(data.meta || {}), lastUpdated: Date.now() }; } catch (e) { /* ignore */ }
      return data;
    }
  }

  // For 200 responses, parse JSON and store ETag + body
  if (!res.ok) {
    // allow callers to see HTTP error
    throw new Error(`API error: ${res.status}`);
  }

  const jsonText = await res.text();
  let json = null;
  try {
    json = jsonText ? JSON.parse(jsonText) : null;
  } catch (e) {
    throw new Error('Invalid JSON from alldata');
  }

  if (!json?.ok) throw new Error(json?.error?.message || 'API data error');

  const data = json.data;

  // store ETag + body (store json.data, not the entire envelope)
  try {
    const respETag = res.headers.get('ETag') || null;
    if (respETag) localStorage.setItem(etagKey, respETag);
    localStorage.setItem(bodyKey, JSON.stringify(data));
  } catch (e) {
    // ignore storage errors
  }

  // Normalize defs to include icon helper
  try {
    if (data?.defs) {
      const normalized = normalizeDefsForIcons(data.defs, { baseIconPath: deduceBaseIconPath() });
      data.defs = normalized;
      try { if (!window.data) window.data = data; } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // noop - normalization failing should not break the entire fetch
  }

  try {
    data.meta = { ...(data.meta || {}), lastUpdated: Date.now() };
  } catch (e) { /* ignore */ }

  return data;
}