const EVT = 'market:refresh';

export function triggerMarketRefresh() {
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
}

export function addMarketRefreshListener(fn) {
  try { window.addEventListener(EVT, fn); } catch {}
}

export function removeMarketRefreshListener(fn) {
  try { window.removeEventListener(EVT, fn); } catch {}
}