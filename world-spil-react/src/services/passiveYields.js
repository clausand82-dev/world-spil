// Passive yields helpers — compute passive per-hour yields for defs/state.
// Exports:
// - computePassiveYields({ defs, state, resource, mode = 'both', serverData = null })
// - buildPassiveYieldTitle({ defs, state, resource, mode = 'both', heading = '' })

import { applyYieldBuffsToAmount } from './yieldBuffs.js';
import { collectActiveBuffs } from './requirements.js';

// Normaliseringer
function normResId(s) {
  const v = String(s || '').trim().toLowerCase();
  return v.startsWith('res.') ? v : `res.${v}`;
}
function sameRes(a, b) {
  return normResId(a) === normResId(b);
}
function isOwned(bucket, defKey, state) {
  const bag = state?.[bucket];
  if (!bag || typeof bag !== 'object') return false;
  const pref = bucket === 'bld' ? 'bld.' : bucket === 'add' ? 'add.' : bucket === 'rsd' ? 'rsd.' : 'ani.';
  const naked = String(defKey).replace(/^(?:bld\.|add\.|rsd\.|ani\.)/i, '');
  const full = pref + naked;
  if (bag[full]) return true;
  if (bag[pref + naked]) return true;
  for (const k of Object.keys(bag)) {
    if (k === full || k === pref + naked) return true;
  }
  return false;
}

// Udlæs yields fra defs (per cyklus) og giv perHour via period
function readPeriodSeconds(def) {
  const d = def || {};
  const stats = d.stats || {};
  const cands = ['yield_period_s','yieldPeriodS','production_period_s','period_s'];
  for (const k of cands) {
    if (typeof d[k] === 'number' && d[k] > 0) return d[k];
    if (typeof stats[k] === 'number' && stats[k] > 0) return stats[k];
  }
  return 3600;
}
function extractNormalizedYields(def) {
  const out = [];
  if (!def) return out;
  const raw = def.yield ?? def.yields ?? null;
  const periodS = readPeriodSeconds(def);
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    const rid = row.id ?? row.res ?? null;
    const amt = row.amount ?? row.qty ?? null;
    if (rid == null || amt == null) continue;
    const perHour = Number(amt) * (3600 / (periodS || 3600));
    out.push({ resourceId: String(rid), perHour, period_s: periodS, amount_per_cycle: Number(amt) });
  }
  return out;
}

// Stage-basebonus (forest/field/mining/water)
function injectBaseStageBonusForResource({ defs, state, resourceResId, positive, modeLc }) {
  const user = state?.user || {};
  const stageId =
    user.currentstage ?? user.stage ?? state?.currentstage ?? state?.stage ?? 1;

  const rules = defs?.stage_bonus_rules?.[stageId] || {};
  const bonuses = {
    forest: Number(user.mul_forest ?? user.bonus_forest ?? 0),
    mining: Number(user.mul_mining ?? user.bonus_mining ?? 0),
    field:  Number(user.mul_field  ?? user.bonus_field  ?? 0),
    water:  Number(user.mul_water  ?? user.bonus_water  ?? 0),
  };

  const labels = { forest: 'Basebonus (Skov)', mining: 'Basebonus (Mine)', field: 'Basebonus (Mark)', water: 'Basebonus (Vand)' };

  for (const [key, lst] of Object.entries(rules)) {
    const amt = bonuses[key] || 0;
    if (amt <= 0) continue;
    const hit = (lst || []).some((rid) => sameRes(rid, resourceResId));
    if (!hit) continue;
    const entry = { sourceType: 'base', sourceId: `stage.${stageId}.${key}`, name: labels[key], perHour: Number(amt) };
    if (entry.perHour > 0 && modeLc !== 'cost') positive.push(entry);
  }
}

/**
 * computePassiveYields
 * - defs: game defs (defs.bld, defs.add, defs.rsd, defs.ani, defs.res, etc.)
 * - state: game state (state.bld, state.add, state.rsd, state.ani, state.user, state.inv, state.cap, ...)
 * - resource: resource id (e.g. 'res.money' or 'money' or 'wood')
 * - mode: 'both'|'cost'|'give' — filters what to include in positive/negative lists
 * - serverData: optional alldata response object (if provided, serverData.activeBuffs will be merged in)
 *
 * Returns: { positive: [...], negative: [...], meta: { resource, mode } }
 */
export function computePassiveYields({ defs, state, resource, mode = 'both', serverData = null } = {}) {
  const resKey = String(resource || '').trim();
  if (!resKey) return { positive: [], negative: [], meta: { resource: resKey, mode } };

  const modeLc = String(mode || 'both').toLowerCase();
  const positive = [];
  const negative = [];

  // Use central collectActiveBuffs and optionally include serverData
  const activeBuffs = collectActiveBuffs(defs, state, serverData);

  for (const bucket of ['bld','add','rsd','ani']) {
    const group = defs?.[bucket] || {};
    for (const [defKey, def] of Object.entries(group)) {
      if (!isOwned(bucket, defKey, state)) continue;
      const ctxId =
        (bucket === 'bld' ? 'bld.' :
         bucket === 'add' ? 'add.' :
         bucket === 'rsd' ? 'rsd.' : 'ani.') +
        String(defKey).replace(/^(?:bld\.|add\.|rsd\.|ani\.)/i, '');

      const yields = extractNormalizedYields(def);
      for (const y of yields) {
        if (!sameRes(y.resourceId, resKey)) continue;

        // Apply yield-buffs (uses merged activeBuffs)
        let perHour = y.perHour;
        perHour = applyYieldBuffsToAmount(perHour, normResId(resKey), { appliesToCtx: ctxId, activeBuffs });

        const entry = { sourceType: bucket, sourceId: ctxId, name: def?.name || defKey, perHour };
        if (perHour > 0) {
          if (modeLc !== 'cost') positive.push(entry);
        } else if (perHour < 0) {
          if (modeLc !== 'give') negative.push(entry);
        }
      }
    }
  }

  // Inject base stage-bonus entries
  injectBaseStageBonusForResource({ defs, state, resourceResId: resKey, positive, modeLc });

  const sortFn = (a, b) => Math.abs(b.perHour) - Math.abs(a.perHour);
  positive.sort(sortFn);
  negative.sort(sortFn);

  return { positive, negative, meta: { resource: resKey, mode: modeLc } };
}

/**
 * buildPassiveYieldTitle
 * - Convenience: build a compact multi-line title string describing the positive/negative yield sources.
 * - Uses computePassiveYields (without serverData). If you want serverData included, call computePassiveYields yourself.
 */
export function buildPassiveYieldTitle({ defs, state, resource, mode = 'both', heading = '' } = {}) {
  const { positive, negative } = computePassiveYields({ defs, state, resource, mode });
  const lines = [];
  if (heading) lines.push(heading);

  if (mode !== 'cost') for (const it of positive) lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (+${round2(it.perHour)}/t)`);
  if (mode !== 'give')  for (const it of negative) lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (${round2(it.perHour)}/t)`);

  return lines.length ? lines.join('\n') : (heading || '');
}

function round2(n) { return Math.round((n ?? 0) * 100) / 100; }