import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { useT } from "../services/i18n.js";
import { getEmojiForId } from "../services/requirements.js";
//import './sidebar-log.css';

// Inkluder yield_lost, så tabte linjer vises i loggen
const DEFAULT_SHOW_TYPES = ['yield_paid', 'yield_lost', 'build_completed', 'build_canceled'];

/* ----------------------------- helper utils ----------------------------- */
function z(n) { return (n < 10 ? '0' : '') + n; }

function utcNowMinus(ms) {
  const d = new Date(Date.now() - ms);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function formatLocal(ts, assumeUtc = true) {
  if (!ts) return '';
  try {
    const d = assumeUtc ? new Date(ts + 'Z') : new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  } catch (e) {
    return ts;
  }
}

// parse tidspunkt til millisekunder med samme logik som formatLocal
function parseTimestampMillis(ts, assumeUtc = true) {
  if (!ts) return 0;
  try {
    return (assumeUtc ? new Date(ts + 'Z') : new Date(ts)).getTime();
  } catch (e) {
    return 0;
  }
}

function stripPrefix(id, pref) {
  if (!id) return id;
  const p = pref + '.';
  return id.startsWith(p) ? id.slice(p.length) : id;
}

function getSubjectName(defs, scope, key) {
  if (!defs || !scope || !key) return key || '';
  const s = scope === 'res' ? (defs.res || {}) : (defs[scope] || {});
  const k = stripPrefix(key, scope);
  return (s[k] && (s[k].name || s[k].label)) || key;
}

function resName(defs, resId) {
  if (!resId) return '';
  const key = String(resId).replace(/^res\./, '');
  return (defs?.res?.[key]?.name) || key;
}

function getEmojiForIdSafe(id, defs) {
  try {
    return getEmojiForId(id, defs) || '';
  } catch (e) {
    return '';
  }
}

/* ----------------------------- SidebarLog ----------------------------- */
/*
  Improvements implemented:
  - Incremental fetch: we keep the timestamp of the newest event and request only newer events.
  - Conditional request support using ETag (If-None-Match / 304) if server supports it.
  - Adaptive polling/backoff: if no new events we slowly back off up to a max interval.
  - Pause polling while the tab is hidden (document.visibilityState) to avoid unnecessary work.
  - Fixed layout so the log list scrolls internally (prevents losing the scroll bar).
    The component uses a column flex layout and makes the ul.sl-list a flex:1 scroll container.
*/
export default function SidebarLog({
  endpoint = '/world-spil/backend/api/user_log.php',
  initialSinceMs = 24 * 3600 * 1000,
  pollMs = 30000,
  limit = 200,
  maxRender = 60,
  showTypes = DEFAULT_SHOW_TYPES,
  timesAreUTC = true,               // API returnerer nu altid UTC
}) {
  const { data } = useGameData();
  const defs = data?.defs || null;
  const t = useT();

  const [sinceMs, setSinceMs] = useState(initialSinceMs);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Refs for incremental/fetch control
  const timerRef = useRef(null);
  const runningRef = useRef(false);
  const lastTsRef = useRef(null);      // ISO string or millis of latest event we've seen
  const etagRef = useRef(null);        // optional ETag from server
  const adaptiveRef = useRef({ current: pollMs, base: pollMs, max: 5 * 60 * 1000 }); // base and max backoff

  // Compute initial 'from' if we have no lastTs: use sinceMs window
  function computeFromParam() {
    if (lastTsRef.current) {
      const v = lastTsRef.current;
      if (typeof v === 'number') {
        return new Date(v).toISOString().replace(/\.\d+Z$/, 'Z');
      }
      return v;
    }
    return utcNowMinus(sinceMs);
  }

  // parse/normalize incoming list, compute newest timestamp
  function normalizeIncoming(list) {
    const out = Array.isArray(list) ? list.map(ev => {
      const assumeUtc = eventTimesAreUTC(ev);
      ev._ts = parseTimestampMillis(ev.event_time, assumeUtc);
      return ev;
    }) : [];
    out.sort((a, b) => (b._ts || 0) - (a._ts || 0));
    return out;
  }

  // Merge newEvents into items state (keeping newest first, and limit)
  function mergeItems(newEvents) {
    if (!Array.isArray(newEvents) || newEvents.length === 0) return false;
    const existing = [...items];
    const map = new Map();
    for (const ev of existing) {
      map.set(ev.id ?? `${ev.event_type}#${ev._ts}`, ev);
    }
    let added = 0;
    for (const ev of newEvents) {
      const key = ev.id ?? `${ev.event_type}#${ev._ts}`;
      if (!map.has(key)) {
        map.set(key, ev);
        added++;
      }
    }
    if (added === 0) return false;
    const merged = Array.from(map.values()).sort((a, b) => (b._ts || 0) - (a._ts || 0)).slice(0, maxRender);
    setItems(merged);
    return true;
  }

  // decide whether an event's time is UTC or local (keeps legacy behaviour)
  function eventTimesAreUTC(ev) {
    if (!ev) return timesAreUTC;
    if (ev.event_type && ev.event_type.startsWith('build')) return false;
    return timesAreUTC;
  }

  // Format a line for display (kept compatible with original function)
  function formatLine(ev) {
    const scope = ev.subject_scope;
    const key = (ev.subject_key || '').split('.').slice(1).join('.') || ev.subject_key;
    const name = getSubjectName(defs, scope, key);

    if (ev.event_type === 'yield_paid') {
      const rows = Array.isArray(ev.payload) ? ev.payload : [];
      const parts = rows.map((r, i) => {
        const rn = resName(defs, r.res_id);
        const emoji = getEmojiForIdSafe(r.res_id, defs) || '';
        const amtNum = Number(r.amount);
        const amt = (amtNum % 1 === 0) ? amtNum : amtNum.toFixed(2);
        return <span key={i}>&nbsp;{amt}× <span className="res-emoji">{emoji}</span> {rn}</span>;
      });
      const who = (scope === 'ani') ? `Dit ${name}` : name;
      return { text: <>{<>💰</>} {who} gav {parts.reduce((acc, cur, idx) => acc === null ? cur : <>{acc}, {cur}</>, null)}</>, className: 'sl-yield' };
    }

    if (ev.event_type === 'yield_lost') {
      const rows = Array.isArray(ev.payload) ? ev.payload : [];
      const parts = rows.map((r, i) => {
        const rn = resName(defs, r.res_id);
        const emoji = getEmojiForIdSafe(r.res_id, defs) || '';
        const amtNum = Number(r.amount);
        const amt = (amtNum % 1 === 0) ? amtNum : amtNum.toFixed(2);
        return <span key={i}>&nbsp;{amt}× <span className="res-emoji">{emoji}</span> {rn}</span>;
      });
      const who = (scope === 'ani') ? `Dit ${name}` : name;
      return { text: <>{<>🚨</>} {who} tabte {parts.reduce((acc, cur, idx) => acc === null ? cur : <>{acc}, {cur}</>, null)} (ingen plads)</>, className: 'sl-yield-lost' };
    }

    if (ev.event_type === 'build_completed') {
      if ((ev.mode || '').toLowerCase().includes('upgrade') || ev.mode === 'upgrade') {
        return { text: `Opgradering af ${name} færdig`, className: 'sl-completed' };
      }
      const typeLabel = typeLabelFromScope(scope);
      return { text: `${typeLabel} ${name} færdig`, className: 'sl-completed' };
    }

    if (ev.event_type === 'build_canceled') {
      const typeLabel = typeLabelFromScope(scope);
      return { text: `${t("ui.emoji.cancel.h1")} ${t("ui.text.cancel.h1")} ${typeLabel} ${name}`, className: 'sl-canceled' };
    }

    // fallback
    return { text: `${ev.event_type}: ${scope}.${key}`, className: '' };
  }

  function typeLabelFromScope(scope) {
    switch (scope) {
      case 'bld': return '🔨 ' + t("ui.text.building.h1");
      case 'add': return '🧩 ' + t("ui.text.addon.h1");
      case 'rcp': return '🧾 ' + t("ui.text.recipe.h1");
      case 'rsd': return ' 🧪 ' + t("ui.text.research.h1");
      case 'ani': return '🐾 ' + t("ui.text.unit.h1");
      default: return scope || 'Emne';
    }
  }

  // The core fetch function: incremental, conditional (ETag), and safe
  async function fetchLogOnce() {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsLoading(true);
    setErr(null);

    try {
      const params = new URLSearchParams();
      const fromParam = computeFromParam();
      params.set('from', fromParam);
      params.set('limit', String(limit));
      const url = `${endpoint}?${params.toString()}`;

      const headers = {};
      if (etagRef.current) headers['If-None-Match'] = etagRef.current;

      const resp = await fetch(url, { credentials: 'include', headers });
      if (resp.status === 304) {
        adaptiveRef.current.current = Math.min(adaptiveRef.current.current * 1.5, adaptiveRef.current.max);
        return;
      }

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const respEtag = resp.headers.get('ETag') || resp.headers.get('etag') || null;
      if (respEtag) etagRef.current = respEtag;

      const json = await resp.json();
      const list = Array.isArray(json.items) ? json.items : [];

      const normalized = normalizeIncoming(list);

      if (normalized.length > 0) {
        const newestMs = normalized[0]._ts || Date.now();
        lastTsRef.current = new Date(newestMs).toISOString().replace(/\.\d+Z$/, 'Z');

        mergeItems(normalized);

        adaptiveRef.current.current = adaptiveRef.current.base;
      } else {
        adaptiveRef.current.current = Math.min(adaptiveRef.current.current * 1.5, adaptiveRef.current.max);
      }
    } catch (e) {
      setErr(String(e?.message || e));
      adaptiveRef.current.current = Math.min(adaptiveRef.current.current * 2, adaptiveRef.current.max);
    } finally {
      setIsLoading(false);
      runningRef.current = false;
    }
  }

  // Scheduling loop: uses adaptiveRef.current.current as delay and respects page visibility
  useEffect(() => {
    let cancelled = false;

    async function scheduleLoop() {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timerRef.current = setTimeout(scheduleLoop, 1000);
        return;
      }

      await fetchLogOnce();

      if (cancelled) return;
      const next = Math.max(1000, Math.floor(adaptiveRef.current.current));
      timerRef.current = setTimeout(scheduleLoop, next);
    }

    if (!lastTsRef.current && items.length > 0) {
      lastTsRef.current = new Date(items[0]._ts || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
    }

    scheduleLoop();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        adaptiveRef.current.current = adaptiveRef.current.base;
        fetchLogOnce();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [endpoint, limit, JSON.stringify(showTypes), sinceMs]);

  // Initial fetch triggered on mount and when sinceMs changes (keeps previous items if any)
  useEffect(() => {
    lastTsRef.current = null;
    etagRef.current = null;
    adaptiveRef.current.current = adaptiveRef.current.base;
    fetchLogOnce();
  }, [sinceMs, endpoint]);

  // UI render
  // NOTE: key layout fix: we make the component a column flex container and the .sl-list a flex:1 scroll container.
  // This ensures the scrollbar is internal to the log panel and not lost due to parent layout changes.
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    height: '100%', /* allow parent to size it; parent .section-body should set a height */
  };
  const headerStyle = { display: 'flex', gap: 8, alignItems: 'center' };
  const listStyle = {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    flex: 1,
    minHeight: 60,
  };

  return (
    <div className="sidebar-log" style={containerStyle}>
      <div className="sl-header" style={headerStyle}>
        <div className="sl-title">Aktivitet</div>
        <select
          value={String(sinceMs)}
          onChange={(e) => setSinceMs(parseInt(e.target.value, 10))}
        >
          {useMemo(() => ([
            { label: '1t',  value: 1 * 3600 * 1000 },
            { label: '6t',  value: 6 * 3600 * 1000 },
            { label: '24t', value: 24 * 3600 * 1000 },
            { label: '7d',  value: 7 * 24 * 3600 * 1000 },
            { label: '30d', value: 30 * 24 * 3600 * 1000 },
          ]), []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button onClick={() => { lastTsRef.current = null; etagRef.current = null; fetchLogOnce(); }}>Opdatér</button>
      </div>

      {err && <div className="sl-error">Fejl: {err}</div>}
      {isLoading && <div className="sl-loading">Henter...</div>}

      <ul className="sl-list" style={listStyle}>
        {items.map((ev, idx) => {
          const { text, className } = formatLine(ev);
          return (
            <li className="sl-item" key={ev.id ?? `${ev.event_type}#${ev._ts}#${idx}`}>
              <span className="sl-time">{formatLocal(ev.event_time, eventTimesAreUTC(ev))}:</span>
              <span className={`sl-body ${className}`}>{text}</span>
            </li>
          );
        })}
        {!items.length && !isLoading && !err && (
          <li className="sl-item sl-empty">Ingen hændelser i valgt periode</li>
        )}
      </ul>
    </div>
  );
}