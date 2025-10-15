import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useT } from '../services/i18n.js';
import Tabs from '../components/ui/Tabs.jsx';
import InventoryTab from '../components/resources/InventoryTab.jsx';
import MarketTab from '../components/resources/MarketTab.jsx';
import ResourceTradeController from '../components/resources/ResourceTradeController.jsx';

const TABS = [
  { key: 'inventory', label: 'Inventory', emoji: '🎒' },
  { key: 'market', label: 'Handel', emoji: '🛒' },
];
const LS_KEY = 'ws:resources:tab';

export default function ResourcesPage() {
  const t = useT();

  const initial = (() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const q = (sp.get('tab') || '').toLowerCase();
      if (['inventory','market'].includes(q)) return q;
    } catch {}
    try { return localStorage.getItem(LS_KEY) || 'inventory'; } catch { return 'inventory'; }
  })();

  const [tab, setTab] = useState(initial);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, tab); } catch {}
    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      if (tab) sp.set('tab', tab); else sp.delete('tab');
      // bevar eksisterende hash (fx #/dashboard) når vi opdaterer query
      const search = sp.toString() ? `?${sp.toString()}` : '';
      const newUrl = `${url.pathname}${search}${url.hash || ''}`;
      window.history.replaceState({}, '', newUrl);
    } catch {}
  }, [tab]);

  const content = useMemo(() => {
    if (tab === 'inventory') return <InventoryTab />;
    if (tab === 'market') return <MarketTab />;
    return null;
  }, [tab]);

  return (
    <section className="panel section" style={{ display: 'flex', flexDirection: 'column', minHeight: '40vh' }}>
      <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>🧰 Ressource siden</span>
        </div>

        {/* Tabs i samme stil som dine andre sider; showActions = false (ingen Gem/Fortryd) */}
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          persistKey={LS_KEY}
        />
      </div>

      <div className="section-body" style={{ display: 'grid', gap: 12 }}>
        {content}
      </div>
        <ResourceTradeController onChanged={() => {/* valgfrit: toast */}} />
    </section>
  );
}