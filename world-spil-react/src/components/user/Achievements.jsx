import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import Icon from '../ui/Icon.jsx';

export default function Achievements({ items: itemsProp }) {
  const { data } = useGameData();
  const items = useMemo(() => itemsProp || data?.achievements || [
    { id: 'a1', title: 'Velkommen', date: '2025-10-01', icon: '/assets/icons/medal_gold.png' }
  ], [data, itemsProp]);

  if (!items.length) return <div className="muted">Ingen achievements</div>;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map(it => (
        <div
          key={it.id}
          style={{
            width: 120,
            padding: 8,
            borderRadius: 8,
            background: 'var(--accent-surface, #fff7e6)',
            border: `1px solid var(--accent-border, #ffe7b0)`,
            color: 'var(--text-color, inherit)'
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon src={it.icon} size={24} alt={it.title} />
            <div>
              <div style={{ fontSize: 13 }}>{it.title}</div>
              <div className="sub" style={{ fontSize: 12, color: 'var(--muted-color, #666)' }}>{it.date}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}