const listeners = new Set();
export function addSummaryRefreshListener(cb) { listeners.add(cb); }
export function removeSummaryRefreshListener(cb) { listeners.delete(cb); }

// Asynkron dispatch så vi ikke risikerer at trigge hooks midt i render
export function triggerSummaryRefresh() {
  setTimeout(() => {
    for (const cb of Array.from(listeners)) {
      try { cb(); } catch (e) { console.error('summaryEvents listener failed', e); }
    }
  }, 0);
}