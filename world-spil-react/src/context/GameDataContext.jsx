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

  // Language state: keep in React state so changes trigger useQuery refresh via queryKey
  const initialLang = (() => {
    try {
      if (typeof window === 'undefined') return 'da';
      return localStorage.getItem('ws_lang') || (navigator?.language || '').slice(0,2) || 'da';
    } catch (e) {
      return 'da';
    }
  })();
  const [lang, setLangState] = useState(initialLang);

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

  // Keep lang in sync with localStorage changes from other tabs
  useEffect(() => {
    const onStorage = (ev) => {
      try {
        if (!ev) return;
        if (ev.key === 'ws_lang') {
          const newLang = ev.newValue || (navigator?.language || '').slice(0,2) || 'da';
          if (newLang && newLang !== lang) setLangState(newLang);
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lang]);

  // Expose a setter that persists selection, clears language-specific ETag/body cache for that lang
  const setLang = useCallback((newLang) => {
    if (!newLang) return;
    try { localStorage.setItem('ws_lang', newLang); } catch (e) {}
    // Remove cached ETag/body for the selected language to force fresh download
    try {
      localStorage.removeItem(`ws:alldata:etag:${newLang}`);
      localStorage.removeItem(`ws:alldata:body:${newLang}`);
    } catch (e) { /* ignore */ }
    setLangState(newLang);
    // Invalidate queries for the new lang so useQuery will fetch fresh
    try { queryClient.invalidateQueries({ queryKey: ['alldata', newLang] }); } catch (e) {}
  }, [queryClient]);

  const fetchAllData = useCallback(async () => {
    // Use current lang state for language-scoped caching
    const curLang = lang || 'da';
    const etagKey = `ws:alldata:etag:${curLang}`;
    const bodyKey = `ws:alldata:body:${curLang}`;
    // Prefer sending Accept-Language header and include lang param to be explicit
    const url = `/world-spil/backend/api/alldata.php?lang=${encodeURIComponent(curLang)}`;

    // Read stored ETag (if any)
    let storedETag = null;
    try {
      storedETag = localStorage.getItem(etagKey);
    } catch (e) {
      storedETag = null;
    }

    const headers = {};
    if (storedETag) headers['If-None-Match'] = storedETag;
    headers['Accept-Language'] = curLang;

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
          if (cached?.defs) cached.defs = normalizeDefsForIcons(cached.defs, { baseIconPath: deduceBaseIconPath() });
          try { cached.meta = { ...(cached.meta || {}), lastUpdated: Date.now() }; } catch (e) {}
          return cached;
        }
      } catch (e) { /* ignore */ }
      throw err;
    }

    // If server responded 304 (Not Modified) -> reuse cached body
    if (res.status === 304) {
      try {
        const raw = localStorage.getItem(bodyKey);
        if (raw) {
          let cached = JSON.parse(raw);
          if (cached?.defs) cached.defs = normalizeDefsForIcons(cached.defs, { baseIconPath: deduceBaseIconPath() });
          try { cached.meta = { ...(cached.meta || {}), lastUpdated: Date.now() }; } catch (e) {}
          return cached;
        }
        // No cached body present despite 304 -> fallthrough to fetch fresh copy
      } catch (e) {
        // ignore parse error and fallthrough
      }
    }

    if (!res.ok) {
      // try to return cached copy if available
      try {
        const raw = localStorage.getItem(bodyKey);
        if (raw) {
          let cached = JSON.parse(raw);
          if (cached?.defs) cached.defs = normalizeDefsForIcons(cached.defs, { baseIconPath: deduceBaseIconPath() });
          try { cached.meta = { ...(cached.meta || {}), lastUpdated: Date.now() }; } catch (e) {}
          return cached;
        }
      } catch (e) { /* ignore */ }
      const text = await res.text().catch(() => null);
      let json = null;
      if (text) {
        try { json = JSON.parse(text); } catch {}
      }
      throw new Error(json?.error?.message || `HTTP ${res.status}`);
    }

    // If we get here: we have a 200 response with fresh body
    try {
      const freshJson = await res.json();
      if (!freshJson?.ok) throw new Error(freshJson?.error?.message || 'API data error');
      const data = freshJson.data;
      const respETag = res.headers.get('ETag') || null;
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
    } catch (e) {
      // If parsing failed, try to serve cached copy if present
      try {
        const raw = localStorage.getItem(bodyKey);
        if (raw) {
          let cached = JSON.parse(raw);
          if (cached?.defs) cached.defs = normalizeDefsForIcons(cached.defs, { baseIconPath: deduceBaseIconPath() });
          try { cached.meta = { ...(cached.meta || {}), lastUpdated: Date.now() }; } catch (e) {}
          return cached;
        }
      } catch (er) { /* ignore */ }
      throw e;
    }
  }, [lang]);

  // useQuery keyed by lang so switching language triggers a new fetch
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['alldata', lang],
    queryFn: fetchAllData,
    // keep previous data briefly while refetching
    keepPreviousData: true,
    // stale time short so refreshData will work predictably
    staleTime: 1000 * 3,
  });

React.useEffect(() => {
  try {
    if (typeof window !== 'undefined') {
      // Gem en let-tilgængelig reference til den seneste game-data så collectActiveBuffs
      // kan bruge den som fallback hvis en caller ikke sender serverData.
      // Dette er kun en læse-reference; vi ændrer ikke data her.
      window.__WORLD_SPIL_GAME_DATA = data || null;
    }
  } catch (e) {
    // ignore
  }
}, [data]);

  // BroadcastChannel / storage listeners for cross-tab updates
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
    queryClient.setQueryData(['alldata', lang], (prev) => {
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
  }, [queryClient, broadcastUpdate, lang]);

  const applyResourceDeltaMap = useCallback((resources = {}) => {
    if (!resources || typeof resources !== 'object') return;
    queryClient.setQueryData(['alldata', lang], (prev) => {
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
  }, [queryClient, broadcastUpdate, lang]);

  const removeActiveBuild = useCallback((jobId) => {
    queryClient.setQueryData(['alldata', lang], (prev) => {
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
  }, [queryClient, broadcastUpdate, lang]);

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
      queryClient.setQueryData(['alldata', lang], (prev) => {
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
  }, [queryClient, deepMergeObj, broadcastUpdate, lang]);
  // --- /NYT ---

  const refreshData = useCallback(async (...args) => {
    try {
      // ensure we invalidate the keyed query so fetchAllData runs for current lang
      await queryClient.invalidateQueries({ queryKey: ['alldata', lang], refetchType: 'all' });
      const res = await refetch(...args);
      const ts = Date.now();
      queryClient.setQueryData(['alldata', lang], (prev) => {
        if (!prev) return prev;
        return { ...prev, meta: { ...(prev.meta || {}), lastUpdated: ts } };
      });
      broadcastUpdate(ts);
      return res;
    } catch (e) {
      throw e;
    }
  }, [refetch, queryClient, broadcastUpdate, lang]);

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
    lang,
    setLang, // expose setter so HeaderLangSelector can call it
    refreshData,
    ensureFreshData,
    applyLockedCostsDelta,
    applyResourceDeltaMap,
    removeActiveBuild,
    normalizeDefsForIcons,
    // eksporter updateState så komponenter kan anvende kompakte patches
    updateState,
  }), [isLoading, data, artManifest, error, lang, setLang, refreshData, ensureFreshData, applyLockedCostsDelta, applyResourceDeltaMap, removeActiveBuild, normalizeDefsForIcons, updateState]);

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);