import React, { useEffect, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';

const DEFAULT_LANGS = [
  { code: 'da', label: 'Dansk' },
  { code: 'en', label: 'English' },
];

export default function HeaderLangSelector({ langs = DEFAULT_LANGS, onChange }) {
  const { lang: ctxLang, setLang: ctxSetLang, refreshData } = useGameData() || {};
  // initial value: prefer context lang, fallback to localStorage or navigator
  const initial = ctxLang
    || (() => { try { return localStorage.getItem('ws_lang') } catch { return null } })()
    || (navigator?.language || '').slice(0,2)
    || (langs[0]?.code || 'da');

  const [lang, setLang] = useState(initial);
  const [busy, setBusy] = useState(false);

  // keep local input in sync when context changes (cross-tab or programmatic)
  useEffect(() => {
    if (ctxLang && ctxLang !== lang) setLang(ctxLang);
  }, [ctxLang]);

  // Persist selection locally as a fallback (context.setLang also persists)
  useEffect(() => {
    try { localStorage.setItem('ws_lang', lang); } catch (e) { /* ignore */ }
  }, [lang]);

  const setServerLang = async (code) => {
    try {
      const res = await fetch('/world-spil/backend/api/actions/set-language.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: code }),
      });
      if (!res.ok) return false;
      const j = await res.json().catch(() => null);
      return !!j?.ok;
    } catch (e) {
      console.error('setServerLang error', e);
      return false;
    }
  };

  const handleChange = async (e) => {
    const code = e.target.value;
    setLang(code);
    setBusy(true);

    // 1) Persist to server session if possible (non-blocking)
    try { await setServerLang(code); } catch (e) { /* ignore */ }

    // 2) Notify GameDataContext so it updates localStorage keys, clears language-scoped ETag/body and invalidates fetch
    try {
      if (typeof ctxSetLang === 'function') {
        ctxSetLang(code);
      } else {
        // fallback: write localStorage key that GameDataContext looks at and force refresh
        try { localStorage.setItem('ws_lang', code); } catch {}
        try { (await refreshData?.()) } catch {}
      }
    } catch (err) {
      // ignore
    }

    // 3) Trigger data refresh for immediate effect (GameDataContext.refreshData will refetch as needed)
    try { await refreshData?.(); } catch (e) { /* ignore */ }

    setBusy(false);
    if (typeof onChange === 'function') {
      try { onChange(code); } catch (e) { /* ignore */ }
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <label htmlFor="ws-lang-select" style={{ fontSize: 12, color: 'var(--color-muted,#6b7280)' }}>
        Sprog
      </label>
      <select
        id="ws-lang-select"
        value={lang}
        onChange={handleChange}
        disabled={busy}
        aria-label="Vælg sprog"
        style={{
          fontSize: 13,
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          background: busy ? '#f9fafb' : '#fff',
          cursor: 'pointer'
        }}
      >
        {langs.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </div>
  );
}