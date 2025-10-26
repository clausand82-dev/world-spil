import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mergeServerBuffs } from '../services/buffs';
import { collectActiveBuffs } from '../services/requirements'; // eksisterende funktion

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
      // copy the original def into a new object so we don't mutate frozen objects
      const nd = { ...d };

      const raw = (d.emoji || '').toString().trim();

      // prefer existing iconUrl if present
      if (nd.iconUrl) {
        const src = nd.iconUrl;
        // create React element but DON'T try to mutate it
        const el = React.createElement('img', {
          src,
          alt: nd.name || key,
          style: { width: '1em', height: '1em', objectFit: 'contain', verticalAlign: '-0.15em' },
          className: 'res-icon-inline'
        });
        // keep element and a separate string/html representation
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
        // DON'T set el.toString (non-extensible)
        nd.emoji = el;
        nd.emojiText = `<img src="${src}" alt="${(nd.name || key).replace(/"/g, '&quot;')}" style="width:1em;height:1em;vertical-align:-0.15em;object-fit:contain;display:inline-block" />`;
        out[key] = nd;
      } else {
        // unicode emoji
        nd.emoji = raw;
        nd.emojiText = raw;
        out[key] = nd;
      }
    });
    return out;
  };

  // build new defs object with safe copies
  const newDefs = { ...defs };
  newDefs.res = makeSafeBucket(defs.res);
  newDefs.ani = makeSafeBucket(defs.ani);
  // copy other buckets untouched (or add them similarly if you need)
  // e.g. newDefs.bld = makeSafeBucket(defs.bld);

  return newDefs;
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

  async function refreshData() {
    console.debug('refreshData: start');
    await doActualFetch();
    console.debug('refreshData: end');
  }

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

async function fetchAllData() {
  // Bevar dit eksisterende endpoint
  const dataUrl = `/world-spil/backend/api/alldata.php?ts=${Date.now()}`;
  const res = await fetch(dataUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error?.message || 'API data error');

  // --- NY: Normalize defs og skriv resultatet eksplicit tilbage + sæt global window.data for kompatibilitet ---
  try {
    if (json?.data?.defs) {
      // sikre at normalizeDefsForIcons returnerer/ændrer defs
      const normalized = normalizeDefsForIcons(json.data.defs, { baseIconPath: '/assets/icons/' });
      // skriv eksplicit tilbage (for at være sikker på at det er samme objekt brugt fremadrettet)
      json.data.defs = normalized;

      // Merge server-provided buffs with client-side computed buffs so frontend does not overwrite them.
      try {
        const serverBuffs = Array.isArray(json.data.activeBuffs) ? json.data.activeBuffs : (json.data.activeBuffs ? [json.data.activeBuffs] : []);
        const clientBuffs = (typeof collectActiveBuffs === 'function') ? collectActiveBuffs(normalized) : [];
        const merged = (typeof mergeServerBuffs === 'function')
          ? mergeServerBuffs(serverBuffs, clientBuffs)
          : (() => {
              const out = Array.isArray(clientBuffs) ? clientBuffs.slice() : [];
              const existing = new Set(out.map(b => (b && b.source_id) ? String(b.source_id) : Symbol()));
              for (const sb of (Array.isArray(serverBuffs) ? serverBuffs : [])) {
                if (!sb || typeof sb !== 'object') continue;
                const sid = sb.source_id ? String(sb.source_id) : null;
                if (sid && existing.has(sid)) continue;
                out.push(sb);
                if (sid) existing.add(sid);
              }
              return out;
            })();
        json.data.activeBuffs = merged;
      } catch (e) {
        console.warn('Failed to merge server/client buffs', e);
      }

      // Sæt global window.data fordi en del kode læser window.data.defs direkte
      try { window.data = json.data; } catch (e) { /* ignore if not allowed */ }

      // Log et par ting til konsollen så vi kan debugge hurtigt i browseren
      try {
        // vælg en konkret res-id som du har (fx 'straw' eller en du kender)
        const sampleKey = Object.keys(normalized.res || {})[0];
        console.debug('[fetchAllData] normalized.defs.sample:', sampleKey, normalized.res?.[sampleKey]);
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.warn('normalizeDefsForIcons failed', e);
  }

  return json.data;
}