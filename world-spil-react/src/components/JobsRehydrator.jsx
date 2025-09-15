import React, { useEffect } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

function parseUTC(s) {
  if (!s) return 0;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const [_, Y, M, D, h, mn, sc] = m.map(Number);
  return Date.UTC(Y, M - 1, D, h, mn, sc);
}

export default function JobsRehydrator() {
  const { data } = useGameData() || {};
  const runningJobs = data?.state?.jobs?.running;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ActiveBuilds_v1');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          window.ActiveBuilds = obj;
        }
      } else {
        window.ActiveBuilds = window.ActiveBuilds || {};
      }
    } catch {
      window.ActiveBuilds = window.ActiveBuilds || {};
    }
    // Coerce timestamps if missing
    for (const [id, job] of Object.entries(window.ActiveBuilds || {})) {
      if (job && !job.startTs && job.start_utc) job.startTs = parseUTC(job.start_utc);
      if (job && !job.endTs && job.end_utc) {
        job.endTs = parseUTC(job.end_utc);
        if (!job.endTs && job.startTs && job.durationS) job.endTs = job.startTs + job.durationS * 1000;
      }
    }
    const save = () => {
      try {
        localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds || {}));
      } catch {}
    };
    const timer = setInterval(save, 5000);
    window.addEventListener('beforeunload', save);
    window.addEventListener('storage', (e) => {
      if (e.key === 'ActiveBuilds_v1' && e.newValue) {
        try {
          window.ActiveBuilds = JSON.parse(e.newValue) || {};
        } catch {}
      }
    });
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', save);
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(runningJobs)) return;
    window.ActiveBuilds = window.ActiveBuilds || {};
    const existing = window.ActiveBuilds;
    const next = {};
    for (const job of runningJobs) {
      if (!job || !job.bld_id) continue;
      const startUtc = job.start_utc || '';
      const startTs = parseUTC(startUtc);
      const duration = Number(job.duration_s || 0);
      let endUtc = job.end_utc || '';
      let endTs = parseUTC(endUtc);
      if (!endTs && startTs && duration > 0) {
        endTs = startTs + duration * 1000;
        if (!endUtc && endTs) {
          const endDate = new Date(endTs);
          const iso = endDate.toISOString();
          endUtc = `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
        }
      }
      next[job.bld_id] = {
        ...(existing[job.bld_id] || {}),
        jobId: job.id,
        start_utc: startUtc,
        end_utc: endUtc,
        durationS: duration,
        startTs: startTs || undefined,
        endTs: endTs || undefined,
      };
    }
    window.ActiveBuilds = next;
    try {
      localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds));
    } catch {}
  }, [runningJobs]);

  return null;
}
