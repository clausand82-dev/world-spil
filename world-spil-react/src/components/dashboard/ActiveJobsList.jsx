import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';

function detectScope(id) {
  if (String(id).startsWith('rsd.')) return 'research';
  if (String(id).startsWith('add.')) return 'addon';
  if (String(id).startsWith('rcp.')) return 'recipe';
  return 'building';
}

// Denne komponent opdateres visuelt af dashboardTick (progress mm.)
function ActiveJobRow({ jobId, job }) {
  const { data, refreshData, applyLockedCostsDelta } = useGameData();
  const type = jobId.split('.')[0];
  const key = jobId.replace(new RegExp(`^${type}\\.`), '');
  const def = data?.defs?.[type]?.[key];
  if (!def) return null;

  const linkHref = type === 'rsd' ? '#/research' : `#/building/${H.parseBldKey(jobId)?.family}.l1`;

  const handleCancel = async (ev) => {
    ev.preventDefault();

    let alreadyGone = false;
    try {
      if (window.BuildJobs?.cancel) {
        // Brug eksisterende legacy-funktion, hvis den er indlæst
        await window.BuildJobs.cancel(jobId);
      } else {
        // Fallback: kald backend direkte
        const scope = detectScope(jobId);
        const effectiveJobId = job?.jobId || window.ActiveBuilds?.[jobId]?.jobId || 0;
        if (!effectiveJobId) {
          alreadyGone = true;
        } else {
          const resp = await fetch('/world-spil/backend/api/actions/build_cancel.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: jobId, job_id: effectiveJobId, scope })
          });
          const text = await resp.text();
          let payload = null;
          if (text) { try { payload = JSON.parse(text); } catch {} }
          const ok = resp.ok && payload?.ok !== false;
          const message = payload?.message || `HTTP ${resp.status}`;

          if (!ok) {
            if (/job (not running|not found)/i.test(message)) {
              alreadyGone = true;
            } else {
              throw new Error(message || 'Cancel failed');
            }
          } else {
            // Refund ressource-locks hvis sendt fra backend
            if (Array.isArray(payload?.locked_costs) && payload.locked_costs.length) {
              applyLockedCostsDelta && applyLockedCostsDelta(payload.locked_costs, +1);
            }
          }
        }
      }
    } catch (e) {
      if (!alreadyGone) {
        console.error('Cancel failed', e);
        return;
      }
    }

    // Oprydning lokalt: fjern job og persistér (legacy nøgle)
    try {
      if (window.ActiveBuilds) {
        delete window.ActiveBuilds[jobId];
        // Brug samme nøgle som øvrige React-UI dele bruger (legacy): ActiveBuilds_v1
        localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds));
      }
    } catch {}

    // Tving re-render og hent friske data
    refreshData && refreshData();
  };

  return (
    <div className="item">
      <div className="icon">{def.icon || '⏱️'}</div>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="title"><a href={linkHref} className="link">{def.name}</a></div>
        <div className="build-progress" data-pb-for={jobId} style={{ display: 'block', width: '100%', marginTop: 8 }}>
          <div className="pb-track" style={{ position: 'relative', height: 12, background: 'var(--border,#ddd)', borderRadius: 6, overflow: 'hidden' }}>
            <div className="pb-fill" style={{ height: '100%', width: '0%', background: 'var(--primary,#4aa)' }}></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            <span id={`time-remaining-${jobId.replace(/\./g, '-')}`}></span>
            <span className="pb-label">0%</span>
          </div>
        </div>
      </div>
      <div className="right">
        <button className="btn" onClick={handleCancel} data-cancel-build={jobId}>Cancel</button>
      </div>
    </div>
  );
}

export default function ActiveJobsList({ type, title }) {
  const activeJobs = window.ActiveBuilds || {};
  const jobsOfType = Object.entries(activeJobs).filter(([jobId]) => jobId.startsWith(`${type}.`));

  if (jobsOfType.length === 0) {
    return <div className="sub">Ingen aktive {title.toLowerCase()}-jobs.</div>;
  }

  return jobsOfType.map(([jobId, job]) => (
    <ActiveJobRow key={jobId} jobId={jobId} job={job} />
  ));
}