import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'ws:lang';
const DEFAULT_LANGS = [
  { code: 'da', label: 'Dansk' },
  { code: 'en', label: 'English' },
];

export default function HeaderLangSelector({ langs = DEFAULT_LANGS, onChange }) {
  const initial = (() => {
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (ls) return ls;
    } catch {}
    return langs[0]?.code || 'da';
  })();

  const [lang, setLang] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  }, [lang]);

  const setServerLang = async (code) => {
    try {
      const res = await fetch('/world-spil/backend/api/actions/set-language.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: code }), // gem i session (og evt. DB)
      });
      if (!res.ok) return false;
      const j = await res.json();
      return !!j?.ok;
    } catch (e) {
      console.error('setServerLang error', e);
      return false;
    }
  };

  const handleChange = async (e) => {
    const code = e.target.value;
    setLang(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
    if (typeof onChange === 'function') { try { onChange(code); } catch {} }

    setBusy(true);
    await setServerLang(code);
    setBusy(false);

    // Reload så alldata.php læser $_SESSION['lang'] og loader lang.{code}.xml
    window.location.reload();
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