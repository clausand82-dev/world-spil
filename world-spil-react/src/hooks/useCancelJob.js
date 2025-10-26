import { useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

/*
  Fast, fetch-only useCancelJob (no axios/apiClient)

  - Prioritizes window.BuildJobs.cancel() if present (legacy).
  - Otherwise uses fetch() directly to POST to backend.
  - Performs optimistic removal via removeActiveBuild so UI updates immediately.
  - Starts refreshData() in background (fire-and-forget) to reconcile authoritative state.
  - ensureFreshMs is optional and default = 0 to avoid added latency.
*/

export default function useCancelJob() {
  const { refreshData, applyLockedCostsDelta, ensureFreshData, removeActiveBuild } = useGameData();

  const detectScope = (id) => {
    if (String(id).startsWith('rsd.')) return 'research';
    if (String(id).startsWith('add.')) return 'addon';
    if (String(id).startsWith('rcp.')) return 'recipe';
    return 'building';
  };

  const postViaFetch = async (endpoint, payload) => {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch (e) { body = text; }
    }
    return { status: resp.status, ok: resp.ok, body };
  };

  const cancel = useCallback(async (jobId, job = {}, options = { ensureFreshMs: 0 }) => {
    let alreadyGone = false;

    // Best-effort: ensure fresh data if caller wants it. Default 0 => skip (fast).
    if (options?.ensureFreshMs && typeof ensureFreshData === 'function') {
      try {
        await ensureFreshData(options.ensureFreshMs);
      } catch (e) {
        // continue anyway; backend is authoritative
        // eslint-disable-next-line no-console
        console.warn('[useCancelJob] ensureFreshData failed (continuing):', e);
      }
    }

    try {
      // Prefer legacy API if available
      if (window.BuildJobs?.cancel) {
        // eslint-disable-next-line no-console
        console.debug('[useCancelJob] Using window.BuildJobs.cancel for', jobId);
        await window.BuildJobs.cancel(jobId);
      } else {
        // Fallback: direct fetch (fast, no axios)
        const scope = detectScope(jobId);
        const effectiveJobId = job?.jobId || window.ActiveBuilds?.[jobId]?.jobId || 0;
        if (!effectiveJobId) {
          alreadyGone = true;
          // eslint-disable-next-line no-console
          console.debug('[useCancelJob] No effective jobId found; treating as already gone:', jobId);
        } else {
          const endpoint = '/world-spil/backend/api/actions/build_cancel.php';
          const payload = { id: jobId, job_id: effectiveJobId, scope };

          // eslint-disable-next-line no-console
          console.debug('[useCancelJob] POST (fetch) to', endpoint, payload);

          const fetchResp = await postViaFetch(endpoint, payload);

          // eslint-disable-next-line no-console
          console.debug('[useCancelJob] fetch response', fetchResp);

          const ok = fetchResp.ok && (fetchResp.body === null || fetchResp.body?.ok !== false);
          const msg = (fetchResp.body && fetchResp.body.message) ? fetchResp.body.message : `HTTP ${fetchResp.status}`;

          if (!ok) {
            if (/job (not running|not found)/i.test(String(msg))) {
              alreadyGone = true;
            } else {
              throw new Error(msg || 'Cancel failed (fetch)');
            }
          } else {
            if (fetchResp.body && Array.isArray(fetchResp.body.locked_costs) && fetchResp.body.locked_costs.length) {
              try { applyLockedCostsDelta && applyLockedCostsDelta(fetchResp.body.locked_costs, +1); } catch (e) { /* ignore */ }
            }
          }
        }
      }
    } catch (e) {
      if (!alreadyGone) {
        // eslint-disable-next-line no-console
        console.error('[useCancelJob] Cancel failed for', jobId, e);
        throw e;
      } else {
        // eslint-disable-next-line no-console
        console.debug('[useCancelJob] Cancel encountered already-gone situation for', jobId);
      }
    }

    // Lokal cleanup: fjern job fra legacy window.ActiveBuilds og persistér
    try {
      if (window.ActiveBuilds) {
        delete window.ActiveBuilds[jobId];
        try { localStorage.setItem('ActiveBuilds_v1', JSON.stringify(window.ActiveBuilds)); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[useCancelJob] Cleanup ActiveBuilds failed', e);
    }

    // Optimistisk UI: fjern job fra cache synkront
    try {
      if (typeof removeActiveBuild === 'function') {
        removeActiveBuild(jobId);
      } else {
        // defensive: if removeActiveBuild not present, do a lightweight cache update via window
        try {
          if (window.__removeActiveBuildSync) window.__removeActiveBuildSync(jobId);
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[useCancelJob] removeActiveBuild failed', e);
    }

    // Start background refresh (do not await) to reconcile with server
    try {
      refreshData().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[useCancelJob] background refreshData failed', err);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[useCancelJob] refreshData call failed', e);
    }

    return { ok: true, alreadyGone };
  }, [refreshData, applyLockedCostsDelta, ensureFreshData, removeActiveBuild]);

  return cancel;
}