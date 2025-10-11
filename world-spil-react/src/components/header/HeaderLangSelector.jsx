import React, { useEffect, useState } from 'react';
import * as i18n from '../../services/i18n.js';

const STORAGE_KEY = 'ws:lang';
const DEFAULT_LANGS = [
  { code: 'da', label: 'Dansk' },
  { code: 'en', label: 'English' },
];

export default function HeaderLangSelector({ langs = DEFAULT_LANGS, onChange }) {
  // initial value: localStorage -> detected gameData/lang fallback -> first lang
  const initial = (() => {
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (ls) return ls;
    } catch (e) { /* ignore */ }

    // try to pick up existing locale from i18n service if it has been loaded
    try {
      const active = (typeof i18n.getLocale === 'function') ? i18n.getLocale() : undefined;
      if (active) return active;
    } catch (e) { /* ignore */ }

    return langs[0].code;
  })();

  const [lang, setLang] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }, [lang]);

  // Listen to external locale changes (optional)
  useEffect(() => {
    const handler = (ev) => {
      const code = ev?.detail?.locale;
      if (code && code !== lang) setLang(code);
    };
    window.addEventListener('ws:localeChanged', handler);
    return () => window.removeEventListener('ws:localeChanged', handler);
  }, [lang]);

  const setServerLang = async (code) => {
    try {
      const res = await fetch('/world-spil/backend/api/actions/set-language.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: code, scope: 'user' }),
      });
      if (!res.ok) return false;
      const j = await res.json();
      return !!(j && j.ok);
    } catch (e) {
      console.error('setServerLang error', e);
      return false;
    }
  };

  const handleChange = async (e) => {
    const code = e.target.value;
    setLang(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}

    if (typeof onChange === 'function') {
      try { onChange(code); } catch (err) { /* ignore */ }
    }

    setBusy(true);
    // 1) persist preference on server (session + optional DB)
    await setServerLang(code);

    // 2) try to load client-side lang file (best-effort)
    const ok = (typeof i18n.loadLocale === 'function') ? await i18n.loadLocale(code).catch(() => false) : false;
    setBusy(false);

    if (!ok) {
      // fallback: reload so server-driven alldata/config lang is used
      window.location.reload();
    }
    // if ok -> components using useT() or services/i18n.t() will re-render via ws:localeChanged
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