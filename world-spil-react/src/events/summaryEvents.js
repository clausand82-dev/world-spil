const listeners = new Set();
export function addSummaryRefreshListener(cb) { listeners.add(cb); }
export function removeSummaryRefreshListener(cb) { listeners.delete(cb); }
// sørg for at dispatch er asynkron
export function triggerSummaryRefresh() {
  setTimeout(() => {
    for (const cb of Array.from(listeners)) {
      try { cb(); } catch (e) { console.error('summaryEvents listener failed', e); }
    }
  }, 0);
}