// services/requirements.js
import { parseBldKey, normalizePrice } from './helpers.js';
import { applySpeedBuffsToDuration } from './calcEngine-lite.js';
import Icon from '../components/common/Icon.jsx'; // sti efter din struktur

// G+t action ud fra item
function inferAction(item) {
  const id = String(item?.id || '');
  if (id.startsWith('rsd.')) return 'produce';            // research behandles som produce
  if (item?.isUpgrade || (item?.ownedMax ?? 0) > 0) return 'upgrade';
  return 'build';
}

// Saml aktive buffs fra defs (bld/add/rsd). Kan kaldes fra UI og gives via caches.
export function collectActiveBuffs(defs) {
  const out = [];
  const push = arr => Array.isArray(arr) && arr.forEach(b => out.push(b));
  for (const key of ['bld','add','rsd']) {
    const bag = defs?.[key] || {};
    Object.values(bag).forEach(def => push(def?.buffs));
  }
  return out;
}

/** Map { "bld.family.l2": {...}, "add.something.l1": {...} } -> { "bld.family": 2, "add.something": 1 } */
export function computeOwnedMap(stateSection = {}) {
  const result = {};
  for (const key of Object.keys(stateSection || {})) {
    const match = key.match(/^(\w+)\.(.+)\.l(\d+)$/);
    if (!match) continue;
    const [, prefix, family, level] = match;
    const series = `${prefix}.${family}`;
    result[series] = Math.max(result[series] || 0, Number(level));
  }
  return result;
}

export function computeResearchOwned(state) {
  const owned = {};
  const legacy = state?.rsd || {};
  for (const key of Object.keys(legacy)) {
    const match = key.match(/^rsd\.(.+)\.l(\d+)$/);
    if (!match) continue;
    const [, family, level] = match;
    const series = `rsd.${family}`;
    owned[series] = Math.max(owned[series] || 0, Number(level));
  }
  const modernCompleted = state?.research?.completed;
  if (modernCompleted) {
    const items = modernCompleted instanceof Set ? Array.from(modernCompleted) : Object.keys(modernCompleted);
    for (const entry of items) {
      const match = String(entry).match(/^rsd\.(.+)\.l(\d+)$/);
      if (!match) continue;
      const [, family, level] = match;
      const series = `rsd.${family}`;
      owned[series] = Math.max(owned[series] || 0, Number(level));
    }
  }
  return owned;
}

function normalizeReq(entry) {
  if (!entry) return { array: [], text: '' };
  if (Array.isArray(entry)) {
    const arr = entry.map((x) => String(x)).filter(Boolean);
    return { array: arr, text: arr.join(', ') };
  }
  const arr = String(entry)
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return { array: arr, text: arr.join(', ') };
}

export function requirementInfo(item, state, caches = {}) {
  if (!item) {
    return {
      normalizedPrice: {},
      priceOk: false,
      reqIds: [],
      reqString: '',
      footprintCost: 0,
      footprintBonus: 0,
      footprintDelta: 0,
      footprintOk: true,
      allOk: false,
      duration: { base_s: 0, final_s: 0, action: 'build' },
    };
  }

  const normalizedPrice = normalizePrice(item.price || {});
  let priceOk = true;
  for (const costItem of Object.values(normalizedPrice)) {
    let have = 0;
    if (costItem.id.startsWith('ani.')) {
      have = state.ani?.[costItem.id]?.quantity ?? 0;
    } else {
      const key = costItem.id.replace(/^res\./, '');
      have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0;
    }
    if (have < costItem.amount) {
      priceOk = false;
      break;
    }
  }

  const { array: reqIds, text: reqString } = normalizeReq(item.req);
  const ownedBuildings = caches.ownedBuildings || computeOwnedMap(state.bld);
  const ownedAddons = caches.ownedAddons || computeOwnedMap(state.add);
  const ownedResearch = caches.ownedResearch || computeResearchOwned(state);

  const hasResearch =
    caches.hasResearch ||
    ((rid) => {
      const ridStr = String(rid);
      const match = ridStr.match(/^rsd\.(.+)\.l(\d+)$/);
      if (match) {
        const [, family, level] = match;
        const series = `rsd.${family}`;
        if ((ownedResearch[series] || 0) >= Number(level)) return true;
      } else {
        const series = `rsd.${ridStr.replace(/^rsd\./, '')}`;
        if ((ownedResearch[series] || 0) > 0) return true;
      }
      const key = ridStr.replace(/^rsd\./, '');
      return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[ridStr]);
    });

  let reqOk = true;
  for (const reqId of reqIds) {
    let satisfied = false;
    if (reqId.startsWith('bld.')) {
      const parsed = parseBldKey(reqId);
      if (parsed) satisfied = (ownedBuildings[parsed.series] || 0) >= parsed.level;
    } else if (reqId.startsWith('add.')) {
      const match = reqId.match(/^add\.(.+)\.l(\d+)$/);
      if (match) satisfied = (ownedAddons[`add.${match[1]}`] || 0) >= Number(match[2]);
    } else if (reqId.startsWith('rsd.')) {
      satisfied = hasResearch(reqId);
    }
    if (!satisfied) {
      reqOk = false;
      break;
    }
  }

  const footprintDeltaVal = Number(item.footprintDelta ?? 0);
  const footprintCost = footprintDeltaVal < 0 ? Math.abs(footprintDeltaVal) : 0;
  const footprintBonus = footprintDeltaVal > 0 ? footprintDeltaVal : 0;
  let footprintOk = true;
  if (footprintCost > 0) {
    const cap = state.cap?.footprint || { total: 0, used: 0 };
    const available = (cap.total || 0) - Math.abs(cap.used || 0);
    footprintOk = available >= footprintCost;
  }

  const allOk = priceOk && reqOk && footprintOk;
  const baseS = Number(item.duration_s ?? 0);
  const action = inferAction(item);
  const activeBuffs = caches.activeBuffs || [];
  const finalS = baseS > 0
    ? applySpeedBuffsToDuration(baseS, action, { appliesToCtx: item.id, activeBuffs })
    : 0;

  return {
    normalizedPrice,
    reqIds,
    reqString,
    footprintCost,
    footprintBonus,
    footprintDelta: footprintDeltaVal,
    footprintOk,
    allOk,
    duration: { base_s: baseS, final_s: finalS, action },
  };
}
export function getEmojiForId(id, defs) {
  if (!id) return '';
  if (id.startsWith('res.')) {
    const key = id.replace(/^res\./, '');
    return defs.res?.[key]?.emoji || '';
  }
  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    return defs.ani?.[key]?.emoji || '';
  }
  return '';
}

export function formatProduction(def, defs) {
  const list = def?.yield;
  if (!Array.isArray(list) || list.length === 0) return '-';
  const parts = list.map((entry) => {
    const id = String(entry.id ?? entry.res_id ?? '');
    const amount = Number(entry.amount ?? entry.qty ?? 0);
    const sign = amount > 0 ? '+' : '';
    const emoji = 'getEmojiForId(id, defs)';
    return `${sign}${amount}${emoji}`;
  });
  const period = def?.yield_period_str;
  return period ? `${parts.join(' • ')} / ${period}` : parts.join(' • ');
}

export function formatCost(cost, defs, sign) {
  const map = normalizePrice(cost);
  if (!Object.keys(map).length) return sign === '+' ? '' : '-';
  return Object.values(map)
    .map((entry) => {
      const emoji = getEmojiForId(entry.id, defs) || '';
      const amount = Number(entry.amount || 0);
      const prefix = sign === '+' ? '+' : '-';
      return `${prefix}${amount}${emoji}`;
    })
    .join(' • ');
}

export function getIconMetaForId(id, defs) {
  if (!id) return null;
  if (id.startsWith('res.')) {
    const key = id.replace(/^res\./, '');
    const d = defs?.res?.[key];
    if (!d) return null;
    return { iconUrl: d.iconUrl || null, emoji: d.emoji || null, name: d.name || key };
  }
  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    const d = defs?.ani?.[key];
    if (!d) return null;
    return { iconUrl: d.iconUrl || null, emoji: d.emoji || null, name: d.name || key };
  }
  return null;
}

/**
 * Returnerer token-liste for et price/yield-objekt så calleren selv kan renderere.
 * Eksempel token: { id: 'res.wheat', amount: 10, prefix: '-', icon: { iconUrl, emoji, name } }
 */
export function getCostTokens(cost, defs, sign = '-') {
  const map = normalizePrice(cost); // antager eksisterende normalizePrice
  if (!Object.keys(map).length) return [];
  return Object.values(map).map((entry) => {
    const amount = Number(entry.amount || 0);
    const prefix = sign === '+' ? '+' : '-';
    const icon = getIconMetaForId(entry.id, defs);
    return {
      id: entry.id,
      amount,
      prefix,
      icon, // {iconUrl, emoji, name} eller null
    };
  });
}



