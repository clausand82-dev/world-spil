import React, { useEffect, useRef } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

function parseUTC(s) {
  if (!s) return 0;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const [_, Y, M, D, h, mn, sc] = m.map(Number);
  return Date.UTC(Y, M - 1, D, h, mn, sc);
}

export default function GlobalJobsTicker() {
  const { refreshData, applyResourceDeltaMap } = useGameData() || {};
  const timerRef = useRef(null);

  useEffect(() => {
    function ensureMap() {
      window.ActiveBuilds = window.ActiveBuilds || {};
      try {
        const raw = localStorage.getItem('ActiveBuilds_v1');
        if (raw && !Object.keys(window.ActiveBuilds).length) {
          window.ActiveBuilds = JSON.parse(raw) || {};
        }
      } catch {}
    }
    ensureMap();

    async function tryComplete(id, job) {
      const now = Date.now();
      if (!job) return;
      if (!job.startTs && job.start_utc) job.startTs = parseUTC(job.start_utc);
      if (!job.endTs && job.end_utc) job.endTs = parseUTC(job.end_utc);
      if (!job.endTs) return;
      const graceMs = 2000;
      if ((now - job.endTs) < graceMs) return;
      if (job._completing) return;
      if (job.nextCheckTs && now < job.nextCheckTs) return;
      job._completing = true;
      try {
        const resp = await fetch('/world-spil/backend/api/actions/build_complete.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.jobId })
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json.ok) {
            delete window.ActiveBuilds[id];
            try { localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds)); } catch {}
            if (json.delta && json.delta.resources) {
              applyResourceDeltaMap && applyResourceDeltaMap(json.delta.resources);
            }
            refreshData && refreshData();
          } else {
            // backoff
            job._completing = false;
            job.nextCheckTs = now + 1500;
          }
        } else {
          // likely Not finished yet
          job._completing = false;
          job.nextCheckTs = now + 1500;
        }
      } catch {
        job._completing = false;
        job.nextCheckTs = Date.now() + 3000;
      }
    }

    function tick() {
      try {
        ensureMap();
        for (const [id, job] of Object.entries(window.ActiveBuilds || {})) {
          tryComplete(id, job);
        }
        try { localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds)); } catch {}
      } catch {}
    }

    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [applyResourceDeltaMap, refreshData]);

  return null;
}

