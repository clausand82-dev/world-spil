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
// Nu: optional serverData parameter bruges til at flette serverens data.activeBuffs.
export function collectActiveBuffs(defs, state, serverData) {
  const out = [];
  const push = arr => Array.isArray(arr) && arr.forEach(b => out.push(b));

  // 1) Lokal defs-buffs
  for (const key of ['bld','add','rsd']) {
    const bag = defs?.[key] || {};
    Object.values(bag).forEach(def => push(def?.buffs));
  }

  // 2) Server-data (hvis givet) — fletter ind
  let sd = serverData;
  // Fallback til global cache kun hvis caller ikke gav serverData
  if (!sd) {
    try {
      if (typeof window !== 'undefined' && window.__WORLD_SPIL_GAME_DATA) {
        sd = window.__WORLD_SPIL_GAME_DATA;
        const debugFlag = (typeof window !== 'undefined' && !!window.WS_DEBUG_SPEED) || (typeof localStorage !== 'undefined' && localStorage.getItem('WS_DEBUG_SPEED'));
        if (debugFlag) console.log('[collectActiveBuffs] serverData missing — using global cached game-data');
      }
    } catch (e) {}
  }

  const fromServer = (sd && Array.isArray(sd.activeBuffs)) ? sd.activeBuffs : [];
  if (fromServer.length) out.push(...fromServer.map(b => ({ ...b })));

  // 3) Deduplikér efter source_id (seneste vinder)
  const keyed = new Map();
  for (const b of out) {
    const sid = String(b?.source_id ?? b?.id ?? '') || `__anon_${Math.random().toString(36).slice(2,8)}`;
    keyed.set(sid, b);
  }
  const merged = Array.from(keyed.values());

  // 4) Normalisering (tolerant)
  function normalizeBuff(b) {
    if (!b || typeof b !== 'object') return b;
    const nb = { ...b };
    nb.kind = String(nb.kind ?? nb.type ?? '').toLowerCase();
    nb.op = (nb.op ?? nb.type ?? null) ? String(nb.op ?? nb.type).toLowerCase() : null;
    nb.applies_to = nb.applies_to ?? nb.appliesTo ?? nb.scope ?? 'all';

    // normalize actions
    if (nb.actions == null && nb.target != null) nb.actions = nb.target;
    if (Array.isArray(nb.actions)) {
      nb.actions = nb.actions.map(x => String(x ?? '').trim().toLowerCase());
    } else if (typeof nb.actions === 'string') {
      const s = nb.actions.trim();
      nb.actions = s === '' ? 'all' : s;
    } else {
      nb.actions = nb.actions ?? 'all';
    }

    // normalize amount — understøt calc.fixed_multiplier
    if (nb.amount != null && nb.amount !== '') {
      nb.amount = Number(nb.amount);
      if (!Number.isFinite(nb.amount)) nb.amount = 0;
    } else if (nb.calc && typeof nb.calc === 'object') {
      const c = nb.calc;
      if (c.type === 'fixed_multiplier' && typeof c.multiplier === 'number') {
        nb.amount = (Number(c.multiplier) - 1) * 100;
      } else {
        nb.amount = 0;
      }
    } else {
      nb.amount = Number(nb.amount || 0);
    }

    nb.applies_to = nb.applies_to ?? 'all';
    nb.actions = nb.actions ?? 'all';
    return nb;
  }

  const normalized = merged.map(normalizeBuff);

  // 5) Debug
  try {
    const debugFlag2 = (typeof window !== 'undefined' && !!window.WS_DEBUG_SPEED) || (typeof localStorage !== 'undefined' && localStorage.getItem('WS_DEBUG_SPEED'));
    if (debugFlag2) {
      console.log('[collectActiveBuffs] normalized buffs count=', normalized.length);
      console.log('[collectActiveBuffs] normalized speed entries=', JSON.stringify(normalized.filter(b => (b?.kind||'') === 'speed').map(b => ({
        source_id: b.source_id, name: b.name, op: b.op, amount: b.amount, actions: b.actions, applies_to: b.applies_to
      })), null, 2));
    }
  } catch (e) {}

  return normalized;
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

  // 1) Legacy/state.rsd - nøgler kan være 'rsd.family.l2' eller 'family.l2' eller 'rsd.family' => level som value
  const legacy = state?.rsd || {};
  for (const key of Object.keys(legacy)) {
    const k = String(key);
    // direkte 'rsd.family.l2'
    let match = k.match(/^rsd\.(.+)\.l(\d+)$/);
    if (!match) {
      // eller 'family.l2'
      match = k.match(/^(.+)\.l(\d+)$/);
    }
    if (match) {
      const [, family, level] = match;
      const series = `rsd.${family}`;
      owned[series] = Math.max(owned[series] || 0, Number(level));
      continue;
    }
    // hvis der er en nøgle 'rsd.family' og værdien er et tal -> brug det
    const matchSeries = k.match(/^rsd\.(.+)$/);
    if (matchSeries) {
      const [, family] = matchSeries;
      const val = legacy[key];
      if (typeof val === 'number') {
        const series = `rsd.${family}`;
        owned[series] = Math.max(owned[series] || 0, Number(val));
        continue;
      }
      // hvis værdien er truthy (fx true) så sæt level 1
      if (val) {
        const series = `rsd.${family}`;
        owned[series] = Math.max(owned[series] || 0, 1);
        continue;
      }
    }
    // også understøt nøgler som 'family' -> hvis truthy så niveau 1
    const plainMatch = k.match(/^(.+)$/);
    if (plainMatch) {
      const [, family] = plainMatch;
      const val = legacy[key];
      if (val) {
        const series = `rsd.${family}`;
        owned[series] = Math.max(owned[series] || 0, 1);
      }
    }
  }

  // 2) Moderne state.research / state.research.completed kan være Set, Array, Object eller map series->level
  const researchSection = state?.research || {};
  let modernCompleted = researchSection?.completed ?? researchSection;

  if (modernCompleted) {
    // Hvis det er et objekt der ser ud til at mappe series -> level (value numeric), håndter direkte
    if (typeof modernCompleted === 'object' && !Array.isArray(modernCompleted) && !(modernCompleted instanceof Set)) {
      const valuesAreNumeric = Object.values(modernCompleted).every(v => typeof v === 'number');
      if (valuesAreNumeric) {
        for (const [k, v] of Object.entries(modernCompleted)) {
          const keyStr = String(k);
          // hvis nøgle er 'rsd.family.l2' eller 'family.l2'
          let match = keyStr.match(/^rsd\.(.+)\.l(\d+)$/) || keyStr.match(/^(.+)\.l(\d+)$/);
          if (match) {
            const [, family, level] = match;
            const series = `rsd.${family}`;
            owned[series] = Math.max(owned[series] || 0, Number(level));
            continue;
          }
          // ellers hvis værdi er et tal, antag at nøgle er serien (fx 'rsd.family' eller 'family')
          const familyMatch = keyStr.match(/^rsd\.(.+)$/) || keyStr.match(/^(.+)$/);
          if (familyMatch) {
            const family = familyMatch[1];
            const series = `rsd.${family}`;
            owned[series] = Math.max(owned[series] || 0, Number(v));
          }
        }
      } else {
        // hvis det er et plain objekt med truthy keys (fx { 'rsd.family.l1': true } eller { 'sawmill': true })
        for (const [k, v] of Object.entries(modernCompleted)) {
          const keyStr = String(k);
          // 'rsd.family.l2' eller 'family.l2'
          let match = keyStr.match(/^rsd\.(.+)\.l(\d+)$/) || keyStr.match(/^(.+)\.l(\d+)$/);
          if (match) {
            const [, family, level] = match;
            const series = `rsd.${family}`;
            owned[series] = Math.max(owned[series] || 0, Number(level));
            continue;
          }
          // 'rsd.family' eller 'family' (værdi truthy => level 1)
          const familyMatch = keyStr.match(/^rsd\.(.+)$/) || keyStr.match(/^(.+)$/);
          if (familyMatch && v) {
            const family = familyMatch[1];
            const series = `rsd.${family}`;
            owned[series] = Math.max(owned[series] || 0, 1);
          }
        }
      }
    } else if (modernCompleted instanceof Set) {
      for (const entry of Array.from(modernCompleted)) {
        const s = String(entry);
        // 'rsd.family.l2' eller 'family.l2' eller 'rsd.family' eller 'family'
        let match = s.match(/^rsd\.(.+)\.l(\d+)$/) || s.match(/^(.+)\.l(\d+)$/);
        if (match) {
          const [, family, level] = match;
          const series = `rsd.${family}`;
          owned[series] = Math.max(owned[series] || 0, Number(level));
          continue;
        }
        const familyMatch = s.match(/^rsd\.(.+)$/) || s.match(/^(.+)$/);
        if (familyMatch) {
          const family = familyMatch[1];
          const series = `rsd.${family}`;
          owned[series] = Math.max(owned[series] || 0, 1);
        }
      }
    } else if (Array.isArray(modernCompleted)) {
      for (const entry of modernCompleted) {
        const s = String(entry);
        let match = s.match(/^rsd\.(.+)\.l(\d+)$/) || s.match(/^(.+)\.l(\d+)$/);
        if (match) {
          const [, family, level] = match;
          const series = `rsd.${family}`;
          owned[series] = Math.max(owned[series] || 0, Number(level));
          continue;
        }
        const familyMatch = s.match(/^rsd\.(.+)$/) || s.match(/^(.+)$/);
        if (familyMatch) {
          const family = familyMatch[1];
          const series = `rsd.${family}`;
          owned[series] = Math.max(owned[series] || 0, 1);
        }
      }
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
      // fuldt niveau-sjek først: 'rsd.family.l2'
      const match = ridStr.match(/^rsd\.(.+)\.l(\d+)$/);
      if (match) {
        const [, family, level] = match;
        const series = `rsd.${family}`;
        if ((ownedResearch[series] || 0) >= Number(level)) return true;
      } else {
        // hvis der er kun 'rsd.family' eller 'rsd.family' uden level: tjek om vi har nogen level > 0
        const series = `rsd.${ridStr.replace(/^rsd\./, '')}`;
        if ((ownedResearch[series] || 0) > 0) return true;
      }

      // Faldtilfælde: hvis state.research gemmer entries som keys (fx { 'rsd.family.l1': true })
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
    const emoji = getEmojiForId(id, defs) || '';
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