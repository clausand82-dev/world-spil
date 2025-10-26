import React, { useEffect, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ActiveJobsList from '../components/dashboard/ActiveJobsList.jsx';
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';
import * as H from '../services/helpers.js';
import useInterval from '../hooks/useInterval.js';

export default function DashboardPage() {
  const { isLoading, error } = useGameData();
  // tick state for re-rendering progress/time every second while the page is mounted
  const [now, setNow] = useState(Date.now());

  // run an interval that updates now every second while this component is mounted
  useInterval(() => setNow(Date.now()), 1000);

  if (isLoading) return <div className="sub">Indlæser dashboard...</div>;
  if (error) return <div className="sub">Fejl ved indlæsning af data.</div>;

  return (
    <>
      <section className="panel section">
        <div className="section-head">🏗️ Aktive Bygge-jobs</div>
        <div className="section-body"><ActiveJobsList type="bld" title="Bygge" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">➕ Aktive Addon-jobs</div>
        <div className="section-body"><ActiveJobsList type="add" title="Addon" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">🔬 Igangværende Forskning</div>
        <div className="section-body"><ActiveJobsList type="rsd" title="Forsker" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">🧾 Aktive Opskrifter</div>
        <div className="section-body"><ActiveJobsList type="rcp" title="Opskrift" currentTime={now} /></div>
      </section>
      <section className="panel section">
        <div className="section-head">📊 Passiv Produktion</div>
        <div className="section-body"><PassiveYieldList now={now} /></div>
      </section>
    </>
  );
}