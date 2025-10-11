import React, { useEffect, useState } from 'react';

/**
 * Tabs UI matching the style used in ManagementPage:
 * - Renders a container <div className="tabs"> with buttons .tab and .active
 * - Props:
 *   - tabs: [{ key, label, emoji? }]
 *   - value, onChange (controlled) OR defaultValue (uncontrolled)
 *   - persistKey: string (optional localStorage key to persist active tab)
 *   - showActions: boolean (show Save/Fortryd buttons in tabs area)
 *   - onSave/onRevert: callbacks for the action buttons
 *   - dirty: boolean (shows small indicator and enables Save)
 *   - onBeforeChange: (fromKey, toKey) => boolean|Promise<boolean>
 */
export default function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  persistKey,
  showActions = false,
  onSave,
  onRevert,
  dirty = false,
  onBeforeChange,
}) {
  const [internal, setInternal] = useState(defaultValue ?? (tabs[0] && tabs[0].key) ?? null);
  const active = value !== undefined ? value : internal;

  // load persisted
  useEffect(() => {
    if (!persistKey) return;
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw && value === undefined) setInternal(raw);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey) return;
    if (!active) return;
    try { localStorage.setItem(persistKey, String(active)); } catch {}
  }, [persistKey, active]);

  const requestChange = async (toKey) => {
    if (toKey === active) return;
    if (typeof onBeforeChange === 'function') {
      try {
        const ok = await onBeforeChange(active, toKey);
        if (!ok) return;
      } catch {
        return;
      }
    }
    if (value === undefined) setInternal(toKey);
    onChange?.(toKey);
  };

  return (
    <div className="tabs" style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
      {tabs.map(t => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className={`tab ${isActive ? 'active' : ''}`}
            onClick={() => requestChange(t.key)}
            title={t.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {t.emoji ? <span aria-hidden style={{ marginRight: 6 }}>{t.emoji}</span> : null}
            {t.label}
            {dirty && isActive ? <span style={{ marginLeft: 8, width: 8, height: 8, borderRadius: 999, background: '#f59e0b', display: 'inline-block' }} /> : null}
          </button>
        );
      })}

      {showActions ? (
        <div style={{ marginLeft: 12, display: 'flex', gap: 8 }}>
          <button type="button" className="tab" onClick={() => onRevert?.()} title="Fortryd ikke-gemte ændringer">Fortryd</button>
          <button type="button" className="tab" onClick={() => onSave?.()} title="Gem ændringer" style={{ fontWeight: 700 }} disabled={!dirty}>
            {dirty ? 'Gem (ændringer)' : 'Gem'}
          </button>
        </div>
      ) : null}
    </div>
  );
}