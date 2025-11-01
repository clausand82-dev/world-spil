import React, { useState, useMemo } from 'react';
import Overview from './Overview.jsx';
import Activity from './Activity.jsx';
import Achievements from './Achievements.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import Icon from '../ui/Icon.jsx';

function TabsBar({ tabs, active, onChange }) {
  return (
    <div role="tablist" aria-label="User stats tabs" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {tabs.map(t => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`tab ${active === t.key ? 'active' : ''}`}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: active === t.key ? `1px solid var(--panel-border, #ccc)` : '1px solid transparent',
            background: active === t.key ? 'var(--panel-active-bg, rgba(0,0,0,0.03))' : 'transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-color, inherit)'
          }}
        >
          {t.icon ? <Icon src={t.icon} size={14} alt={t.label} /> : null}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function UserStatsTabs() {
  const [tab, setTab] = useState('overview');
  const { data } = useGameData();

  const activity = useMemo(() => data?.userActivity || [
    { title: 'Logget ind', when: 'for 2 timer siden' },
    { title: 'Afsluttet mission', when: 'i går' },
  ], [data]);

  const achievements = useMemo(() => data?.achievements || [
    { id: 'a1', title: 'Velkommen', date: '2025-10-01', icon: '/assets/icons/medal_gold.png' }
  ], [data]);

  const tabs = [
    { key: 'overview', label: 'Oversigt', icon: '/assets/icons/stats_overview.png' },
    { key: 'activity', label: 'Aktivitet', icon: '/assets/icons/activity.png' },
    { key: 'achievements', label: 'Achievements', icon: '/assets/icons/medal.png' },
  ];

  return (
    <div>
      <TabsBar tabs={tabs} active={tab} onChange={setTab} />

      <div style={{ minHeight: 120 }}>
        {tab === 'overview' && <Overview />}
        {tab === 'activity' && <Activity activity={activity} />}
        {tab === 'achievements' && <Achievements items={achievements} />}
      </div>
    </div>
  );
}