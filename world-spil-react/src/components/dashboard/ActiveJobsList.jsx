import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ActiveJobRow from './ActiveJobRow.jsx';

export default function ActiveJobsList({ type, title, currentTime }) {
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
        />
      ))}
    </>
  );
}