import React, { useMemo, useState, useEffect } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

export default function ActionButton({ item, allOk }) {
  const { refreshData, applyLockedCostsDelta } = useGameData() || {};
  const [localActive, setLocalActive] = useState(false);

  if (!item) return null;
  const { id, isUpgrade, isOwned, stageLocked, def } = item;
  const owned = (isOwned ?? item.owned) || false;
  const stageReq = item.stageReq ?? def?.stage ?? def?.stage_required;
  const isActive = localActive || !!window.ActiveBuilds?.[id];

  useEffect(() => {
    // Sync down from window.ActiveBuilds if present
    if (window.ActiveBuilds && window.ActiveBuilds[id]) setLocalActive(true);
  }, [id]);

  const scope = useMemo(() => (
    String(id).startsWith('rsd.') ? 'research'
    : String(id).startsWith('add.') ? 'addon'
    : String(id).startsWith('rcp.') ? 'recipe'
    : 'building'
  ), [id]);

  const handleStart = async () => {
    try {
      if (window.BuildJobs?.start) {
        await window.BuildJobs.start(id);
      } else {
        const resp = await fetch('/world-spil/backend/api/actions/build_start.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, scope })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.ok || !json.job_id) throw new Error(json.message || 'Start failed');
        const job = json;
        window.ActiveBuilds = window.ActiveBuilds || {};
        const parseUTC = (s) => {
          if(!s) return Date.now();
          const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
          if (!m) return Date.now();
          const [_, Y, M, D, h, mn, sc] = m.map(Number);
          return Date.UTC(Y, M - 1, D, h, mn, sc);
        };
        window.ActiveBuilds[id] = {
          jobId: job.job_id,
          start_utc: job.start_utc,
          end_utc: job.end_utc,
          durationS: job.duration_s,
          startTs: parseUTC(job.start_utc),
          endTs: parseUTC(job.end_utc)
        };
        try { localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds)); } catch {}
        if (Array.isArray(job.locked_costs) && job.locked_costs.length) {
          applyLockedCostsDelta && applyLockedCostsDelta(job.locked_costs, -1);
        }
      }
      setLocalActive(true);
      refreshData && refreshData();
    } catch (e) {
      console.error('Start build failed', e);
    }
  };

  const handleCancel = async () => {
    let alreadyGone = false;
    try {
      if (window.BuildJobs?.cancel) {
        await window.BuildJobs.cancel(id);
      } else {
        const jobId = window.ActiveBuilds?.[id]?.jobId;
        if (!jobId) {
          alreadyGone = true;
        } else {
          const resp = await fetch('/world-spil/backend/api/actions/build_cancel.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, job_id: jobId, scope })
          });
          const text = await resp.text();
          let payload = null;
          if (text) {
            try { payload = JSON.parse(text); } catch {}
          }
          const ok = resp.ok && payload?.ok !== false;
          const message = payload?.message || `HTTP ${resp.status}`;
          if (!ok) {
            if (/job (not running|not found)/i.test(message)) {
              alreadyGone = true;
            } else {
              throw new Error(message || 'Cancel failed');
            }
          } else {
            if (Array.isArray(payload?.locked_costs) && payload.locked_costs.length) {
              applyLockedCostsDelta && applyLockedCostsDelta(payload.locked_costs, +1);
            }
          }
        }
      }
    } catch (e) {
      if (!alreadyGone) {
        console.error('Cancel build failed', e);
        return;
      }
    }
    if (window.ActiveBuilds) delete window.ActiveBuilds[id];
    try { localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds)); } catch {}
    setLocalActive(false);
    refreshData && refreshData();
  };

  // Order mirrors legacy: active -> stageLocked -> owned -> can buy -> disabled
  if (isActive) return <button className="btn" onClick={handleCancel} data-cancel-build={id}>Cancel</button>;
  if (stageLocked) return <span className="badge stage-locked price-bad" title={stageReq ? `Kræver Stage ${stageReq}` : undefined}>Stage locked</span>;
  if (owned) return <span className="badge owned">Owned</span>;
  if (allOk) {
    const label = isUpgrade ? 'Upgrade' : 'Build';
    return <button className="btn primary" onClick={handleStart} data-fakebuild-id={id} data-buildmode="timer">{label}</button>;
  }
  return <button className="btn" disabled>Need more</button>;
}


