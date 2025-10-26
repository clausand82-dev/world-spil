import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';
import ActiveJobRow from './ActiveJobRow.jsx';

// detectScope helper kept for cancel payload (kan også flyttes ind i useCancelJob hvis du vil samle)
function detectScope(id) {
  if (String(id).startsWith('rsd.')) return 'research';
  if (String(id).startsWith('add.')) return 'addon';
  if (String(id).startsWith('rcp.')) return 'recipe';
  return 'building';
}

export default function ActiveJobsList({ type, title, currentTime }) {
  // foretræk data fra GameDataContext hvis muligt, ellers fallback til legacy global
  const { data } = useGameData();
  const activeJobs = (data && data.state && data.state.activeBuilds) ? data.state.activeBuilds : (window.ActiveBuilds || {});
  const jobsOfType = Object.entries(activeJobs).filter(([jobId]) => jobId.startsWith(`${type}.`));

  if (jobsOfType.length === 0) {
    return <div className="sub">Ingen aktive {title.toLowerCase()}-jobs.</div>;
  }

  return (
    <>
      {jobsOfType.map(([jobId, job]) => (
        <ActiveJobRow
          key={jobId}
          jobId={jobId}
          job={job}
          currentTime={currentTime}
          detectScope={detectScope}
        />
      ))}
    </>
  );
}