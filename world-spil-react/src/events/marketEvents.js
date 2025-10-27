// Market events helper: lyttere kan modtage et valgfrit payload (fx delta)
// Replace or create this file at src/events/marketEvents.js

const listeners = new Set();

export function addMarketRefreshListener(fn) {
  if (typeof fn !== 'function') return;
  listeners.add(fn);
}
export function removeMarketRefreshListener(fn) {
  listeners.delete(fn);
}

// triggerMarketRefresh kan nu sende en valgfri payload (fx { type:'market_buy', delta: {...} })
// Lyttere bestemmer selv om de anvender payload. Vi kalder dem synkront (som før).
export function triggerMarketRefresh(payload = null) {
  for (const fn of Array.from(listeners)) {
    try {
      try { fn(payload); } catch (inner) { console.warn('marketRefresh listener failed', inner); }
    } catch (e) {
      console.warn('marketEvents trigger failed', e);
    }
  }
}