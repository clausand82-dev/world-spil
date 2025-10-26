import { useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

// Centraliseret cancel-hook. Returnerer en cancel-funktion du kan kalde fra UI.
// Den forsøger window.BuildJobs.cancel hvis tilgængelig, ellers POSTer til backend.
// Efter succes kaldes refreshData() fra context og eventuelle locked-costs refunderes.
export default function useCancelJob() {
  const { refreshData, applyLockedCostsDelta } = useGameData();

  // detectScope helper (samme logic som tidligere)
  const detectScope = (id) => {
    if (String(id).startsWith('rsd.')) return 'research';
    if (String(id).startsWith('add.')) return 'addon';
    if (String(id).startsWith('rcp.')) return 'recipe';
    return 'building';
  };

  const cancel = useCallback(async (jobId, job = {}) => {
    let alreadyGone = false;

    try {
      if (window.BuildJobs?.cancel) {
        await window.BuildJobs.cancel(jobId);
      } else {
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
            if (Array.isArray(payload?.locked_costs) && payload.locked_costs.length) {
              applyLockedCostsDelta && applyLockedCostsDelta(payload.locked_costs, +1);
            }
          }
        }
      }
    } catch (e) {
      if (!alreadyGone) {
        console.error('Cancel failed', e);
        throw e;
      }
    }

    // Local cleanup: fjern job og persistér (legacy nøgle)
    try {
      if (window.ActiveBuilds) {
        delete window.ActiveBuilds[jobId];
        localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds));
      }
    } catch {}

    // Force refresh
    try {
      await refreshData();
    } catch (e) {
      // log & rethrow hvis nødvendigt
      console.warn('refreshData after cancel failed', e);
    }

    return { ok: true, alreadyGone };
  }, [refreshData, applyLockedCostsDelta]);

  return cancel;
}