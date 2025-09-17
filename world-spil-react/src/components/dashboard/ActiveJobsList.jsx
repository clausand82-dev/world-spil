import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';

// Denne komponent vil nu blive opdateret af den nye `dashboardTick`
function ActiveJobRow({ jobId, job }) {
    const { data } = useGameData();
    const type = jobId.split('.')[0];
    const key = jobId.replace(new RegExp(`^${type}\\.`), '');
    const def = data.defs[type]?.[key];
    if (!def) return null;

    const linkHref = type === 'rsd' ? '#/research' : `#/building/${H.parseBldKey(jobId)?.family}.l1`;

    return (
        <div className="item">
            <div className="icon">{def.icon || '⏱️'}</div>
            <div className="grow">
                <div className="title"><a href={linkHref} className="link">{def.name}</a></div>
                <div className="build-progress" data-pb-for={jobId} style={{ width: '100%' }}>
                    <div className="pb-track" style={{ height: '12px' }}>
                        <div className="pb-fill" style={{ width: `0%` }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', opacity: '0.8' }}>
                        <span id={`time-remaining-${jobId.replace(/\./g, '-')}`}></span>
                        <span className="pb-label">0%</span>
                    </div>
                </div>
            </div>
            <div className="right">
                <button className="btn" data-cancel-build={jobId}>Cancel</button>
            </div>
        </div>
    );
}

export default function ActiveJobsList({ type, title }) {
    const activeJobs = window.ActiveBuilds || {}; // Læser direkte fra den globale variabel
    const jobsOfType = Object.entries(activeJobs).filter(([jobId, job]) => jobId.startsWith(`${type}.`));

    if (jobsOfType.length === 0) {
        return <div className="sub">Ingen aktive {title.toLowerCase()}-jobs.</div>;
    }

    return jobsOfType.map(([jobId, job]) => (
        <ActiveJobRow key={jobId} jobId={jobId} job={job} />
    ));
}