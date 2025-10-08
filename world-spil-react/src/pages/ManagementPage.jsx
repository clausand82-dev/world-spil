import React, { useEffect, useMemo, useState } from 'react';
import TrafficTab from '../components/management/TrafficTab.jsx';
import PoliceTab from '../components/management/PoliceTab.jsx';
import PublicTab from '../components/management/PublicTab.jsx';
import HealthTab from '../components/management/HealthTab.jsx';

const LS_KEY = 'ws.management.choices.v1';

function loadChoices() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveChoices(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
}

// Standardværdier – ret frit
const DEFAULTS = {
  // Traffic
  traffic_lights_control: false,
  traffic_speed_limit_pct: 50,
  traffic_signal_density: 5,
  traffic_free_parking_zones: [],
  traffic_mode: 'balanced',

  // Police
  police_salary: 30000,
  police_campaign_traffic: false,
  police_patrol_strategy: 'mixed',
  police_priority_areas: [],

  // Public
  free_dentist_children: false,
  free_dentist_young: false,
  public_health_subsidy_pct: 0,
  public_benefit_mode: 'none',
};

export default function ManagementPage() {
  const [activeKey, setActiveKey] = useState('traffic');
  const [choices, setChoices] = useState(() => ({ ...DEFAULTS, ...(loadChoices() || {}) }));
  const [savedToast, setSavedToast] = useState('');
  const snapshot = useMemo(() => loadChoices() || {}, []);

  const dirty = useMemo(
    () => JSON.stringify(snapshot) !== JSON.stringify(choices),
    [snapshot, choices]
  );

  const setChoice = (key, val) => {
    setChoices(prev => ({ ...prev, [key]: val }));
  };

  const saveAll = () => {
    saveChoices(choices);
    setSavedToast('Valg gemt');
    setTimeout(() => setSavedToast(''), 1500);
  };
  const revert = () => setChoices({ ...DEFAULTS, ...(loadChoices() || {}) });
  const resetDefaults = () => setChoices({ ...DEFAULTS });

  const tabs = [
    { key: 'health', label: 'Sundhed',  emoji: '🩺' },
    { key: 'traffic', label: 'Trafik',  emoji: '🚦' },
    { key: 'police',  label: 'Politi',  emoji: '👮' },
    { key: 'public',  label: 'Offentlig', emoji: '🏛️' },
  ];

  return (
    <section className="panel section" style={{ display: 'flex', flexDirection: 'column', minHeight: '40vh' }}>
      <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>🛠️</span> Management
        </div>

        <div className="tabs" style={{ marginLeft: 'auto' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              className={`tab ${activeKey === t.key ? 'active' : ''}`}
              onClick={() => setActiveKey(t.key)}
              title={t.label}
            >
              <span aria-hidden style={{ marginRight: 6 }}>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-body" style={{ display: 'grid', gap: 12 }}>
        {/* Action bar (øverst i body som på flere andre sider) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="tab" onClick={saveAll} disabled={!dirty} title="Gem alle ændringer">Gem alle</button>
          <button className="tab" onClick={revert} title="Fortryd ikke-gemte ændringer">Fortryd</button>
          <button className="tab" onClick={resetDefaults} title="Nulstil til standard">Nulstil</button>
          {savedToast && <span style={{ marginLeft: 8, color: '#2dd4bf' }}>{savedToast}</span>}
        </div>

        {/* Faner – simpelt switch, matcher stil fra OverviewPage */}
        {activeKey === 'health' && (
          <HealthTab choices={choices} setChoice={setChoice} />
        )}
        {activeKey === 'traffic' && (
          <TrafficTab choices={choices} setChoice={setChoice} />
        )}
        {activeKey === 'police' && (
          <PoliceTab choices={choices} setChoice={setChoice} />
        )}
        {activeKey === 'public' && (
          <PublicTab choices={choices} setChoice={setChoice} />
        )}
      </div>
    </section>
  );
}