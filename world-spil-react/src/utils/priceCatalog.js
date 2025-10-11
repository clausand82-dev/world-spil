// Simple priskatalog (kan senere hentes fra backend)
// Base prisen er pr "enhed". Justér efter behov.
const BASE = {
  'res.wood': 2,
  'res.stone': 3,
  'res.iron': 5,
  'res.water': 1,
  'res.food': 4,
  'res.money': 1, // reference
};

export function getBasePrice(resId) {
  return BASE[resId] ?? 1;
}

// Lokal salgspris (oftest dårligere end global)
export function getLocalSellPrice(resId) {
  const b = getBasePrice(resId);
  return Math.max(0.1, +(b * 0.85).toFixed(2)); // 15% under base
}

// Global referencepris (til sammenligning)
export function getGlobalRefPrice(resId) {
  const b = getBasePrice(resId);
  return +(b * 1.0).toFixed(2);
}