import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { useT } from "../services/i18n.js";
import { getEmojiForId } from "../services/requirements.js";
//import './sidebar-log.css';

// Inkluder yield_lost, så tabte linjer vises i loggen
const DEFAULT_SHOW_TYPES = ['yield_paid', 'yield_lost', 'build_completed', 'build_canceled'];

function z(n) { return n < 10 ? '0' + n : '' + n; }

function utcNowMinus(ms) {
  const d = new Date(Date.now() - ms);
  const yyyy = d.getUTCFullYear();
  const mm   = z(d.getUTCMonth() + 1);
  const dd   = z(d.getUTCDate());
  const hh   = z(d.getUTCHours());
  const mi   = z(d.getUTCMinutes());
  const ss   = z(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatLocal(ts, assumeUtc = true) {
  // Robust parsing:
  // - If ts already contains timezone info (Z or +HH[:MM]/-HH[:MM]) or 'T' use it as-is.
  // - If not and assumeUtc=true, append 'Z' to treat it as UTC.
  // - Otherwise treat as local time.
  if (!ts) return '';
  let s = String(ts).trim();
  // If already ISO-like or contains explicit timezone offset -> use directly
  const hasTZ = /[Tt]/.test(s) || /Z$|[+\-]\d{2}(:?\d{2})?$/.test(s);
  const iso = s.replace(' ', 'T');
  const d = hasTZ ? new Date(iso) : (assumeUtc ? new Date(iso + 'Z') : new Date(iso));

  const yyyy = d.getFullYear();
  const mm   = z(d.getMonth() + 1);
  const dd   = z(d.getDate());
  const hh   = z(d.getHours());
  const mi   = z(d.getMinutes());
  const ss   = z(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Ny hjælpefunktion: parse tidspunkt til millisekunder med samme logik som formatLocal
function parseTimestampMillis(ts, assumeUtc = true) {
  if (!ts) return 0;
  const s = String(ts).trim();
  const hasTZ = /[Tt]/.test(s) || /Z$|[+\-]\d{2}(:?\d{2})?$/.test(s);
  const iso = s.replace(' ', 'T');
  const d = hasTZ ? new Date(iso) : (assumeUtc ? new Date(iso + 'Z') : new Date(iso));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function stripPrefix(id, pref) {
  if (!id) return id;
  return String(id).startsWith(pref) ? String(id).slice(pref.length) : String(id);
}

function getSubjectName(defs, scope, key) {
  if (!defs) return `${scope}.${key}`;
  const bucket = ({ bld: 'bld', add: 'add', rcp: 'rcp', rsd: 'rsd', ani: 'ani' })[scope];
  if (!bucket || !defs[bucket]) return `${scope}.${key}`;
  const obj = defs[bucket][key];
  return (obj && (obj.display_name || obj.name || obj.title)) || `${scope}.${key}`;
}

function resName(defs, resId) {
  const id = stripPrefix(resId, 'res.');
  if (!defs || !defs.res || !defs.res[id]) return resId;
  return defs.res[id].name || defs.res[id].display_name || resId;
}

function isUpgrade(mode) {
  if (!mode) return false;
  const m = String(mode).toLowerCase();
  return m.includes('upg') || m === 'upgrade' || m === 'opgrade' || m === 'opgradering';
}

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
  const timerRef = useRef(null);

  const options = useMemo(() => ([
    { label: '1t',  value: 1 * 3600 * 1000 },
    { label: '6t',  value: 6 * 3600 * 1000 },
    { label: '24t', value: 24 * 3600 * 1000 },
    { label: '7d',  value: 7 * 24 * 3600 * 1000 },
    { label: '30d', value: 30 * 24 * 3600 * 1000 },
  ]), []);

  async function fetchLog() {
    setIsLoading(true);
    setErr(null);
    try {
      const from = utcNowMinus(sinceMs);
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('limit', String(limit));
      const url = `${endpoint}?${params.toString()}`;

      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const list = Array.isArray(json.items) ? json.items : [];

      // filtrer de typer vi vil se i sidebaren og sorter nyeste først
      const filtered = list.filter(ev => showTypes.includes(ev.event_type));

      // Beregn en millisekund‑timestamp for hver event ud fra samme UTC/local logik som visningen
      filtered.forEach(ev => {
        const assumeUtc = eventTimesAreUTC(ev);
        ev._ts = parseTimestampMillis(ev.event_time, assumeUtc);
      });

      // Sortér efter parsed tid (nyeste først). Fald tilbage til strengsort hvis tider er lige.
      filtered.sort((a, b) => {
        if (b._ts !== a._ts) return b._ts - a._ts;
        // fallback: bruk raw string som siste utvei
        return b.event_time < a.event_time ? -1 : (b.event_time > a.event_time ? 1 : 0);
      });

      setItems(filtered.slice(0, maxRender));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // initial fetch + polling
    fetchLog();
    if (pollMs > 0) {
      timerRef.current = setInterval(fetchLog, pollMs);
      return () => clearInterval(timerRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceMs, endpoint, pollMs, limit, maxRender, JSON.stringify(showTypes)]);

  function formatLine(ev) {
    const scope = ev.subject_scope;
    const key = (ev.subject_key || '').split('.').slice(1).join('.') || ev.subject_key;
    const name = getSubjectName(defs, scope, key);

    if (ev.event_type === 'yield_paid') {
      const rows = Array.isArray(ev.payload) ? ev.payload : [];
      const parts = rows.map((r, i) => {
        const rn = resName(defs, r.res_id);
        const emoji = getEmojiForId(r.res_id, defs) || '';
        const amtNum = Number(r.amount);
        const amt = (amtNum % 1 === 0) ? amtNum : amtNum.toFixed(2);
        return <span key={i}>&nbsp;{amt}× <span className="res-emoji">{emoji}</span> {rn}</span>;
      });
      const who = (scope === 'ani') ? `Dit ${name}` : name;
      return { text: <>{<>💰</>} {who} gav {parts.reduce((acc, cur, idx) => acc === null ? cur : <>{acc}, {cur}</>, null)}</>, className: 'sl-yield' };
    }
    
    // NY: vis hvilke ressourcer og mængder der gik tabt
    if (ev.event_type === 'yield_lost') {
      const rows = Array.isArray(ev.payload) ? ev.payload : [];
      const parts = rows.map((r, i) => {
        const rn = resName(defs, r.res_id);
        const emoji = getEmojiForId(r.res_id, defs) || '';
        const amtNum = Number(r.amount);
        const amt = (amtNum % 1 === 0) ? amtNum : amtNum.toFixed(2);
        return <span key={i}>&nbsp;{amt}× <span className="res-emoji">{emoji}</span> {rn}</span>;
      });
      const who = (scope === 'ani') ? `Dit ${name}` : name;
      return { text: <>{<>🚨</>} {who} tabte {parts.reduce((acc, cur, idx) => acc === null ? cur : <>{acc}, {cur}</>, null)} (ingen plads)</>, className: 'sl-yield-lost' };
    }

    if (ev.event_type === 'build_completed') {
      if (isUpgrade(ev.mode)) {
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

  // beslutter om et event's tid skal tolkes som UTC eller lokal tid
  function eventTimesAreUTC(ev) {
    // default fra prop
    if (!ev) return timesAreUTC;
    // treat build events as local timestamps (undo the +1h issue)
    if (ev.event_type && ev.event_type.startsWith('build')) return false;
    // ellers brug komponentens indstilling
    return timesAreUTC;
  }

  return (
    <div className="sidebar-log">
      <div className="sl-header">
        <div className="sl-title">Aktivitet</div>
        <select
          value={String(sinceMs)}
          onChange={(e) => setSinceMs(parseInt(e.target.value, 10))}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button onClick={fetchLog}>Opdatér</button>
      </div>

      {err && <div className="sl-error">Fejl: {err}</div>}
      {isLoading && <div className="sl-loading">Henter...</div>}

      <ul className="sl-list">
        {items.map((ev, idx) => {
          const { text, className } = formatLine(ev);
          return (
            <li className="sl-item" key={idx}>
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