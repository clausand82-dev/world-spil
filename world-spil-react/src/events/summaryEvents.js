const listeners = new Set();
export function addSummaryRefreshListener(cb) { listeners.add(cb); }
export function removeSummaryRefreshListener(cb) { listeners.delete(cb); }

// Dispatch er asynkron for at undgå hook-order / render-race problemer.
export function triggerSummaryRefresh(payload = {}) {
  console.debug('summaryEvents: triggerSummaryRefresh called', { payload, listeners: listeners.size });
  setTimeout(() => {
    for (const cb of Array.from(listeners)) {
      try { cb(payload); } catch (e) { console.error('summaryEvents listener failed', e); }
    }
    console.debug('summaryEvents: dispatched to listeners', { payload });
  }, 0);
}