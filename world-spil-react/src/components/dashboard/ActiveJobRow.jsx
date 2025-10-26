import React, { useCallback, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';
import ProgressBar from '../ui/ProgressBar.jsx';
import useCancelJob from '../../hooks/useCancelJob.js';
import Icon from '../ui/Icon.jsx';

function parsePercent(startTs, endTs, now) {
  if (!startTs || !endTs || endTs <= startTs) return 0;
  const pct = Math.round(Math.max(0, Math.min(100, ((now - startTs) / (endTs - startTs)) * 100)));
  return pct;
}

export default function ActiveJobRow({ jobId, job = {}, currentTime = Date.now() }) {
  const { data } = useGameData();
  const cancelJob = useCancelJob();
  const [isCancelling, setIsCancelling] = useState(false);

  const type = jobId.split('.')[0];
  const key = jobId.replace(new RegExp(`^${type}\\.`), '');
  const def = data?.defs?.[type]?.[key];
  if (!def) return null;

  const linkHref = type === 'rsd' ? '#/research' : `#/building/${H.parseBldKey(jobId)?.family}.l1`;

  const pct = parsePercent(job.startTs, job.endTs, currentTime);
  const remaining = job.endTs ? H.prettyTime((job.endTs - currentTime) / 1000) : '';

  const handleCancel = useCallback(async (ev) => {
    ev && ev.preventDefault();
    try {
      setIsCancelling(true);
      await cancelJob(jobId, job);
    } catch (e) {
      // Already logged in hook; show UI feedback if desired
    } finally {
      setIsCancelling(false);
    }
  }, [jobId, job, cancelJob]);

  return (
    <div className="item">
      <div className="icon">
        <Icon def={def} alt={def.name} size="md" />
      </div>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="title"><a href={linkHref} className="link">{def.name}</a></div>
        <div style={{ marginTop: 8 }}>
          <ProgressBar percent={pct} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            <span>{remaining}</span>
            <span className="pb-label">{pct}%</span>
          </div>
        </div>
      </div>
      <div className="right">
        <button className="btn" onClick={handleCancel} data-cancel-build={jobId} disabled={isCancelling}>
          {isCancelling ? 'Annulerer...' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}