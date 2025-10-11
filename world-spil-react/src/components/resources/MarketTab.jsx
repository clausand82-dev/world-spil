import React from 'react';
import { useT } from '../../services/i18n.js';

export default function MarketTab() {
  const t = useT();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>{t('ui.market.title', 'Handelsplads')}</h2>

      <div style={{ display: 'grid', gap: 8 }}>
        <section style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>{t('ui.market.buy.title', 'Køb')}</h3>
          <div style={{ color: '#6b7280' }}>{t('ui.market.buy.placeholder', 'Købsfunktion kommer her...')}</div>
        </section>

        <section style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>{t('ui.market.sell.title', 'Sælg')}</h3>
          <div style={{ color: '#6b7280' }}>{t('ui.market.sell.placeholder', 'Salgsfunktion kommer her...')}</div>
        </section>
      </div>
    </div>
  );
}