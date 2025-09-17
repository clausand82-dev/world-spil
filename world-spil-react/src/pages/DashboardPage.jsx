import React, { useEffect } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ActiveJobsList from '../components/dashboard/ActiveJobsList.jsx';
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';
import * as H from '../services/helpers.js';

// 1:1 KOPI AF DIN GAMLE, FUNGERENDE `dashboardTick`-LOGIK
function dashboardTick() {
    const now = Date.now();
    for (const jobId in (window.ActiveBuilds || {})) {
        const job = window.ActiveBuilds[jobId];
        const timeElement = document.getElementById(`time-remaining-${jobId.replace(/\./g, '-')}`);
        if(timeElement) timeElement.textContent = H.prettyTime((job.endTs - now) / 1000);
        const progressWrapper = document.querySelector(`.build-progress[data-pb-for="${jobId}"]`);
        if(progressWrapper){
            const fill = progressWrapper.querySelector(".pb-fill");
            const label = progressWrapper.querySelector(".pb-label");
            if(fill && label){
                const pct=Math.min(100,Math.round(Math.max(0,(now-job.startTs)/(job.endTs-job.startTs))*100));
                fill.style.width=`${pct}%`;label.textContent=`${pct}%`
            }
        }
    }
}

export default function DashboardPage() {
    const { isLoading, error } = useGameData();

    // Sæt en timer op, der kører, så længe dashboardet er vist
    useEffect(() => {
        dashboardTick(); // Kør med det samme
        const timerId = setInterval(dashboardTick, 1000);
        // Ryd op, når man forlader siden
        return () => clearInterval(timerId);
    }, []);


    if (isLoading) return <div className="sub">Indlæser dashboard...</div>;
    if (error) return <div className="sub">Fejl ved indlæsning af data.</div>;

    return (
        <>
            <section className="panel section">
                <div className="section-head">🏗️ Aktive Bygge-jobs</div>
                <div className="section-body"><ActiveJobsList type="bld" title="Bygge" /></div>
            </section>
            <section className="panel section">
                <div className="section-head">➕ Aktive Addon-jobs</div>
                <div className="section-body"><ActiveJobsList type="add" title="Addon" /></div>
            </section>
            <section className="panel section">
                <div className="section-head">🔬 Igangværende Forskning</div>
                <div className="section-body"><ActiveJobsList type="rsd" title="Forsker" /></div>
            </section>
            <section className="panel section">
                <div className="section-head">🍲 Aktive Opskrifter</div>
                <div className="section-body"><ActiveJobsList type="rcp" title="Opskrift" /></div>
            </section>
            <section className="panel section">
                <div className="section-head">📊 Passiv Produktion</div>
                <div className="section-body"><PassiveYieldList /></div>
            </section>
        </>
    );
}