// Lille event-bus til at trigge opdatering af markedslister fra hvor som helst
const EVT = 'market:refresh';

const listeners = new Set();
export function addMarketRefreshListener(cb) { listeners.add(cb); }
export function removeMarketRefreshListener(cb) { listeners.delete(cb); }
export function dispatchMarketRefresh() { for (const cb of Array.from(listeners)) { try { cb(); } catch(e){} } }