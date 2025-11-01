import React, { useState, useMemo } from 'react'
import Overview from './Overview.jsx'
import { useGameData } from '../../context/GameDataContext.jsx'
import Icon from '../ui/Icon.jsx'
import './UserPage.css' // tabs uses some shared classes

function TabsBar({ tabs, active, onChange }) {
  return (
    <div role="tablist" aria-label="User stats tabs" className="user-tabsbar">
      {tabs.map((t, idx) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          aria-controls={`tabpanel-${t.key}`}
          id={`tab-${t.key}`}
          onClick={() => onChange(t.key)}
          className={`tab ${active === t.key ? 'active' : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              const next = (idx + 1) % tabs.length
              onChange(tabs[next].key)
            } else if (e.key === 'ArrowLeft') {
              const prev = (idx - 1 + tabs.length) % tabs.length
              onChange(tabs[prev].key)
            }
          }}
        >
          {t.icon ? <Icon src={t.icon} size={14} alt={t.label} /> : null}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

// Demo placeholders for now
function DemoA() {
  return (
    <div className="demo-panel">
      <h3>Demo: Aktivitet (fjernet fra faner)</h3>
      <p>Her kan du vise et demo-oversigtselement eller et lille widget.</p>
    </div>
  )
}
function DemoB() {
  return (
    <div className="demo-panel">
      <h3>Demo: Statistik 2</h3>
      <p>Eksempelindhold til ny tab - byttes ud med reelt indhold senere.</p>
    </div>
  )
}

export default function UserStatsTabs() {
  const [tab, setTab] = useState('overview')
  const { data } = useGameData()

  const activity = useMemo(
    () =>
      data?.userActivity || [
        { title: 'Logget ind', when: 'for 2 timer siden' },
        { title: 'Afsluttet mission', when: 'i går' }
      ],
    [data]
  )

  // achievements er flyttet til sidebar (UserAchievementsBox), men vi bevarer data her hvis nødvendigt
  const achievements = useMemo(
    () =>
      data?.achievements || [{ id: 'a1', title: 'Velkommen', date: '2025-10-01', icon: '/assets/icons/medal_gold.png' }],
    [data]
  )

  const tabs = [
    { key: 'overview', label: 'Oversigt', icon: '/assets/icons/stats_overview.png' },
    // aktivitet-tab er fjernet efter ønske
    { key: 'demoA', label: 'Demo A', icon: '/assets/icons/activity.png' },
    { key: 'demoB', label: 'Demo B', icon: '/assets/icons/medal.png' }
  ]

  return (
    <div>
      <TabsBar tabs={tabs} active={tab} onChange={setTab} />

      <div style={{ minHeight: 120 }}>
        {tab === 'overview' && <Overview />}
        {tab === 'demoA' && <DemoA activity={activity} />}
        {tab === 'demoB' && <DemoB achievements={achievements} />}
      </div>
    </div>
  )
}