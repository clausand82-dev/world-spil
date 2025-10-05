import React, { useState, useMemo, useCallback } from 'react';

/**
 * Simple Tabs Page template
 *
 * Props:
 * - tabs: [{ key, label, icon?, Component?, element? }]  // Component = React component (function/class), element = JSX node
 * - defaultKey: optional initial key
 * - className: optional class for outer wrapper
 * - preserve: if true, keep mounted content for inactive tabs (hidden) to preserve state
 *
 * Usage:
 * <TabsTemplatePage
 *   defaultKey="animals"
 *   tabs={[
 *     { key: 'animals', label: 'Dyr', icon: '🐄', Component: AnimalsPage },
 *     { key: 'units', label: 'Units', icon: '🏥', Component: UnitPage },
 *   ]}
 * />
 */
export default function TabsTemplatePage({
  tabs = [],
  defaultKey = null,
  className = '',
  preserve = false,
}) {
  const firstKey = useMemo(() => defaultKey || (tabs[0] && tabs[0].key) || null, [defaultKey, tabs]);
  const [activeKey, setActiveKey] = useState(firstKey);

  const activeIndex = useMemo(() => tabs.findIndex((t) => t.key === activeKey), [tabs, activeKey]);

  const onKeyDown = useCallback(
    (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      if (tabs.length === 0) return;
      let idx = activeIndex;
      if (e.key === 'ArrowLeft') idx = (idx > 0 ? idx - 1 : tabs.length - 1);
      if (e.key === 'ArrowRight') idx = (idx < tabs.length - 1 ? idx + 1 : 0);
      if (e.key === 'Home') idx = 0;
      if (e.key === 'End') idx = tabs.length - 1;
      const next = tabs[idx];
      if (next) setActiveKey(next.key);
    },
    [activeIndex, tabs]
  );

  if (!tabs || !tabs.length) {
    return (
      <section className={`panel section ${className}`}>
        <div className="section-head">Tabs</div>
        <div className="section-body">
          <div className="sub">Ingen faner konfigureret.</div>
        </div>
      </section>
    );
  }

  return (
    <section className={`panel section ${className}`}>
      <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Side med faner</div>
        <div
          className="tabs"
          role="tablist"
          aria-label="Side faner"
          style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}
          onKeyDown={onKeyDown}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === activeKey}
              tabIndex={t.key === activeKey ? 0 : -1}
              className={`tab ${t.key === activeKey ? 'active' : ''}`}
              onClick={() => setActiveKey(t.key)}
              title={t.label}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {t.icon ? <span aria-hidden style={{ marginRight: 4 }}>{t.icon}</span> : null}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-body" style={{ paddingTop: 12 }}>
        {tabs.map((t) => {
          const isActive = t.key === activeKey;
          // render priority: element (JSX node) -> Component (React component)
          if (preserve) {
            // keep mounted, toggle visibility
            return (
              <div
                key={t.key}
                role="tabpanel"
                aria-hidden={!isActive}
                style={{ display: isActive ? 'block' : 'none' }}
              >
                {t.element ? t.element : t.Component ? <t.Component /> : null}
              </div>
            );
          }

          // not preserving: only render active
          if (!isActive) return null;
          return (
            <div key={t.key} role="tabpanel">
              {t.element ? t.element : t.Component ? <t.Component /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ===== Example usage (commented) =====

import AnimalsPage from './AnimalsPage.jsx';
import UnitPage from './UnitPage.jsx';

export default function MyUnitsHub() {
  const tabs = [
    { key: 'animals', label: 'Dyr', icon: '🐄', Component: AnimalsPage },
    { key: 'units', label: 'Units', icon: '🏥', Component: UnitPage },
    // or pass pre-created JSX:
    // { key: 'help', label: 'Hjælp', icon: '❓', element: <div>Hjælpeindhold</div> }
  ];

  return <TabsTemplatePage tabs={tabs} defaultKey="animals" preserve={false} />;
}
*/