import React, { useMemo, useState, useEffect } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { useActiveBuildFlag, updateActiveBuilds } from '../services/activeBuildsStore.js';
import useHeaderSummary from '../hooks/useHeaderSummary.js';

export default function ActionButton({ item, allOk }) {
  const { refreshData, applyLockedCostsDelta } = useGameData() || {};

  if (!item) return null;
  const { id, isUpgrade, isOwned, stageLocked, def } = item;
  const owned = (isOwned ?? item.owned) || false;
  const stageReq = item.stageReq ?? def?.stage ?? def?.stage_required;

  // Abonner på global aktiv-status for dette id
  const isActiveExternal = useActiveBuildFlag(id);

  // Lokal optimisme i det tilfælde ekstern starter ikke opdaterer ActiveBuilds med det samme
  const [localActive, setLocalActive] = useState(false);

  // Hvis ekstern status slukker (job færdigt/annulleret), ryd lokal optimisme
  useEffect(() => {
    if (!isActiveExternal && localActive) setLocalActive(false);
  }, [isActiveExternal, localActive]);

  const isActive = isActiveExternal || localActive;

  const scope = useMemo(() => (
    String(id).startsWith('rsd.') ? 'research'
    : String(id).startsWith('add.') ? 'addon'
    : String(id).startsWith('rcp.') ? 'recipe'
    : 'building'
  ), [id]);

  const parseUTC = (s) => {
    if(!s) return Date.now();
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return Date.now();
    const [_, Y, M, D, h, mn, sc] = m.map(Number);
    return Date.UTC(Y, M - 1, D, h, mn, sc);
  };

  // Hent opsummerede stats til stats-buffs (happiness/popularity)
  const { data: headerSummary } = useHeaderSummary() || {};
  const { data: gameData } = useGameData() || {};
  const currentStage = Number(gameData?.state?.user?.currentstage ?? gameData?.state?.user?.stage ?? 0) || 0;

  const toPct = (val) => {
    if (val == null) return null;
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    // hvis 0..1 → procentsats
    if (n >= 0 && n <= 1) return n * 100;
    return n;
  };

  // Tolerant udtræk af popularity/happiness fra headerSummary
  const popularity_percentage = (
    toPct(headerSummary?.popularity?.popularity) ??
    toPct(headerSummary?.popularity_percentage) ??
    toPct(headerSummary?.popularity?.effective) ??
    toPct(headerSummary?.popularity?.value) ??
    null
  );

  const happiness_percentage = (
    toPct(headerSummary?.happiness?.happiness) ??
    toPct(headerSummary?.happiness_percentage) ??
    toPct(headerSummary?.happiness?.value) ??
    null
  );

  // Byg userSummary kun med felter vi faktisk har
  const userSummary = useMemo(() => {
    const out = { stage: currentStage };
    if (Number.isFinite(popularity_percentage)) out.popularity_percentage = Number(popularity_percentage);
    if (Number.isFinite(happiness_percentage)) out.happiness_percentage = Number(happiness_percentage);
    return out;
  }, [currentStage, popularity_percentage, happiness_percentage]);

  const handleStart = async () => {
    try {
      if (window.BuildJobs?.start) {
        // Ekstern starter: giv scope + userSummary hvis den accepterer options
        const maybeJob = await window.BuildJobs.start(id, { scope, userSummary });
        if (maybeJob && maybeJob.job_id) {
          const job = maybeJob;
          updateActiveBuilds((map) => {
            map[id] = {
              jobId: job.job_id,
              start_utc: job.start_utc,
              end_utc: job.end_utc,
              durationS: job.duration_s,
              startTs: parseUTC(job.start_utc),
              endTs: parseUTC(job.end_utc)
            };
          });
          if (Array.isArray(job.locked_costs) && job.locked_costs.length) {
            applyLockedCostsDelta && applyLockedCostsDelta(job.locked_costs, -1);
          }
        } else {
          // Ukendt returværdi -> vis optimistisk indtil ActiveBuilds opdateres andetsteds
          setLocalActive(true);
        }
      } else {
        // Backend fallback: inkluder userSummary så stats-buffs aktiveres serverside
        const resp = await fetch('/world-spil/backend/api/actions/build_start.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, scope, userSummary })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.ok || !json.job_id) throw new Error(json.message || 'Start failed');
        const job = json;

        updateActiveBuilds((map) => {
          map[id] = {
            jobId: job.job_id,
            start_utc: job.start_utc,
            end_utc: job.end_utc,
            durationS: job.duration_s,
            startTs: parseUTC(job.start_utc),
            endTs: parseUTC(job.end_utc)
          };
        });

        if (Array.isArray(job.locked_costs) && job.locked_costs.length) {
          applyLockedCostsDelta && applyLockedCostsDelta(job.locked_costs, -1);
        }
      }
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
        // Sørg for at rydde ActiveBuilds for dette id
        updateActiveBuilds((map) => { delete map[id]; });
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
            // ensure UI is current
            refreshData && refreshData();
          }
          // Uanset hvad, prøv at rydde ActiveBuilds for dette id lokalt
          updateActiveBuilds((map) => { delete map[id]; });
        }
      }
    } catch (e) {
      if (!alreadyGone) {
        console.error('Cancel build failed', e);
        return;
      }
    }
    // Defensive cleanup hvis det allerede var væk
    if (alreadyGone) {
      updateActiveBuilds((map) => { delete map[id]; });
    }
    setLocalActive(false);
    refreshData && refreshData();
  };

  // Samme labels/tekster som før
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