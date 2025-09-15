import React, { useEffect, useMemo, useRef, useState } from 'react';

function toTs(utcStr) {
  if (!utcStr) return 0;
  const m = String(utcStr).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const [_, Y, M, D, h, mn, sc] = m.map(Number);
  return Date.UTC(Y, M - 1, D, h, mn, sc);
}

import { useGameData } from '../context/GameDataContext.jsx';

export default function BuildProgress({ bldId, style }) {
  const { refreshData, applyResourceDeltaMap } = useGameData() || {};
  const [pct, setPct] = useState(0);
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState('0%');
  const intervalRef = useRef(null);
  const [completedOnce, setCompletedOnce] = useState(false);
  const completingRef = useRef(false);
  const lastAttemptRef = useRef(0);

  const getActive = () => {
    const job = window.ActiveBuilds?.[bldId];
    if (!job) return null;
    let startTs = job.startTs ?? toTs(job.start_utc);
    let endTs = job.endTs ?? toTs(job.end_utc);
    if ((!startTs || !endTs) && job.durationS) {
      // derive end from duration if only start is present
      if (startTs) endTs = startTs + job.durationS * 1000;
    }
    return { startTs, endTs };
  };

  useEffect(() => {
    async function tick() {
      const a = getActive();
      if (!a || !a.startTs || !a.endTs) {
        setActive(false);
        setPct(0);
        setLabel('0%');
        return;
      }
      const now = Date.now();
      const span = Math.max(1, a.endTs - a.startTs);
      const p = Math.max(0, Math.min(1, (now - a.startTs) / span));
      setActive(true);
      setPct(p * 100);
      setLabel(`${Math.round(p * 100)}%`);
      if (p >= 1 && !completedOnce) {
        const overMs = now - a.endTs;
        // Grace period to align with server's TIMESTAMPDIFF logic and clock skew
        if (overMs < 2000) return;
        if (completingRef.current) return;
        if (now - lastAttemptRef.current < 1500) return;
        completingRef.current = true;
        lastAttemptRef.current = now;
        try {
          const jobId = window.ActiveBuilds?.[bldId]?.jobId;
          if (jobId) {
            const resp = await fetch('/world-spil/backend/api/actions/build_complete.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ job_id: jobId })
            });
            if (resp.ok) {
              const json = await resp.json();
              if (json.ok) {
                setCompletedOnce(true);
                if (window.ActiveBuilds) delete window.ActiveBuilds[bldId];
                try { localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds)); } catch {}
                if (json.delta && json.delta.resources) {
                  applyResourceDeltaMap && applyResourceDeltaMap(json.delta.resources);
                }
                refreshData && refreshData();
              } else {
                // Not finished yet or other server-side deferral; try later
                completingRef.current = false;
              }
            } else {
              // 400 Not finished yet -> back off and retry later
              completingRef.current = false;
            }
          } else {
            completingRef.current = false;
          }
        } catch (e) {
          // transient errors; allow retry later
          completingRef.current = false;
        }
      }
    }
    tick();
    intervalRef.current = setInterval(tick, 250);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [bldId]);

  if (!active) return null;

  return (
    <div className="build-progress" data-pb-for={bldId} style={{ display: '', marginTop: 8, width: 160, ...(style || {}) }}>
      <div className="pb-track" style={{ position: 'relative', height: 10, background: 'var(--border,#ddd)', borderRadius: 6, overflow: 'hidden' }}>
        <div className="pb-fill" style={{ height: '100%', width: `${pct}%`, background: 'var(--primary,#4aa)' }} />
      </div>
      <div className="pb-label" style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{label}</div>
    </div>
  );
}
