import React, { useEffect, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ActiveJobsList from '../components/dashboard/ActiveJobsList.jsx';
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';
import * as H from '../services/helpers.js';
import useInterval from '../hooks/useInterval.js';
import Icon from '../components/ui/Icon.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function DashboardPage() {
  const { isLoading, error } = useGameData();
  // tick state for re-rendering progress/time every second while the page is mounted
  const [now, setNow] = useState(Date.now());

  // run an interval that updates now every second while this component is mounted
  useInterval(() => setNow(Date.now()), 1000);

  if (isLoading) {
    return (
      <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <LoadingSpinner size={48} />
        <div className="sub">Indlæser dashboard...</div>
      </div>
    );
  }
  if (error) return <div className="sub">Fejl ved indlæsning af data.</div>;

  return (
    <>
      <section className="panel section">
        <div className="section-head">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon src="/assets/icons/symbol_building.png" size={18} alt="Bygge-jobs" />
            <span>Aktive Bygge-jobs</span>
          </span>
        </div>
        <div className="section-body"><ActiveJobsList type="bld" title="Bygge" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon src="/assets/icons/symbol_addon.png" size={18} alt="Addon-jobs" />
            <span>Aktive Addon-jobs</span>
          </span>
        </div>
        <div className="section-body"><ActiveJobsList type="add" title="Addon" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon src="/assets/icons/symbol_research.png" size={18} alt="Forskning" />
            <span>Igangværende Forskning</span>
          </span>
        </div>
        <div className="section-body"><ActiveJobsList type="rsd" title="Forsker" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon src="/assets/icons/menu_production.png" size={18} alt="Opskrifter" />
            <span>Aktive Opskrifter</span>
          </span>
        </div>
        <div className="section-body"><ActiveJobsList type="rcp" title="Opskrift" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon src="/assets/icons/menu_resources.png" size={18} alt="Passiv Produktion" />
            <span>Passiv Produktion</span>
          </span>
        </div>
        <div className="section-body"><PassiveYieldList now={now} /></div>
      </section>
    </>
  );
}