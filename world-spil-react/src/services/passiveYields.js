// Finder passive yields pr. resource for ting spilleren ejer.
// Inkluderer base stage-bonus OG yield-buffs i per-hour beregningerne.
import { applyYieldBuffsToAmount } from './yieldBuffs.js';

function normResId(s) { return String(s || '').trim().toLowerCase().replace(/^res\./,''); }
function sameRes(a,b){ return normResId(a) === normRes(b); }
function normRes(s){ return String(s||'').startsWith('res.') ? String(s) : `res.${String(s||'')}`; }

function isOwned(bucket, defKey, state) {
  if (!state) return false;
  const bag = state[bucket];
  if (!bag || typeof bag !== 'object') return false;

  const pref =
    bucket === 'bld' ? 'bld.' :
    bucket === 'add' ? 'add.' :
    bucket === 'rsd' ? 'rsd.' :
    bucket === 'ani' ? 'ani.' : '';

  const naked = String(defKey).replace(/^(?:bld\.|add\.|rsd\.|ani\.)/i, '');
  const withPref = pref + naked;

  const v1 = bag[withPref];
  if (v1) {
    if (bucket === 'ani') {
      const qty = typeof v1 === 'number' ? v1 : Number(v1?.quantity ?? 0);
      return Number.isFinite(qty) && qty > 0;
    }
    return true;
  }
  const v2 = bag[pref + naked];
  if (v2) {
    if (bucket === 'ani') {
      const qty = typeof v2 === 'number' ? v2 : Number(v2?.quantity ?? 0);
      return Number.isFinite(qty) && qty > 0;
    }
    return true;
  }
  return false;
}

function readPeriodSeconds(def) {
  const d = def || {};
  const stats = d.stats || {};
  const cands = [d.yield_period_s, d.yieldPeriodS, d.production_period_s, d.period_s, stats.yield_period_s];
  for (const v of cands) if (typeof v === 'number' && v > 0) return v;
  return 3600;
}

function extractNormalizedYields(def) {
  const out = [];
  const raw = def?.yield ?? null;
  if (!Array.isArray(raw)) return out;
  const k = 3600 / readPeriodSeconds(def);
  for (const row of raw) {
    const rid = row?.id ?? row?.res;
    const amt = row?.amount ?? row?.qty ?? row?.quantity;
    if (rid && amt != null) out.push({ resourceId: String(rid), perHour: Number(amt) * k });
  }
  return out;
}

function collectActiveBuffs(defs) {
  const out = [];
  const push = arr => Array.isArray(arr) && arr.forEach(b => out.push(b));
  for (const key of ['bld','add','rsd']) {
    const bag = defs?.[key] || {};
    Object.values(bag).forEach(def => push(def?.buffs));
  }
  return out;
}

function injectBaseStageBonusForResource({ defs, state, resourceResId, positive, modeLc }) {
  if (!defs || !state || !resourceResId) return;
  const user = state?.user ?? {};
  const stageId = user.currentstage ?? user.stage ?? 1;

  const rulesByStage = defs?.stage_bonus_rules ?? {};
  const rules = rulesByStage[stageId] ?? rulesByStage[String(stageId)] ?? {};

  const bonuses = {
    forest: Number(user.bonus_forest ?? user.mul_forest ?? 0),
    mining: Number(user.bonus_mining ?? user.mul_mining ?? 0),
    field:  Number(user.bonus_field  ?? user.mul_field  ?? 0),
    water:  Number(user.bonus_water  ?? user.mul_water  ?? 0),
  };

  const labels = {
    forest: 'Base bonus (Forest)',
    mining: 'Base bonus (Mining)',
    field:  'Base bonus (Field)',
    water:  'Base bonus (Water)',
  };

  const resKey = String(resourceResId);
  for (const [key, amt] of Object.entries(bonuses)) {
    if (!amt) continue;
    const lst = rules[key] ?? [];
    const hit = lst.some((rid) => normResId(rid) === normResId(resKey));
    if (!hit) continue;
    const entry = { sourceType: 'base', sourceId: `stage.${stageId}.${key}`, name: labels[key], perHour: Number(amt) };
    if (entry.perHour > 0 && modeLc !== 'cost') positive.push(entry);
  }
}

export function computePassiveYields({ defs, state, resource, mode = 'both' } = {}) {
  const resKey = String(resource || '').trim();
  if (!resKey) return { positive: [], negative: [], meta: { resource: resKey, mode } };

  const modeLc = String(mode || 'both').toLowerCase();
  const positive = [];
  const negative = [];
  const activeBuffs = collectActiveBuffs(defs);

  for (const bucket of ['bld','add','rsd','ani']) {
    const group = defs?.[bucket] || {};
    for (const [defKey, def] of Object.entries(group)) {
      if (!isOwned(bucket, defKey, state)) continue;
      const ctxId =
        (bucket === 'bld' ? 'bld.' :
         bucket === 'add' ? 'add.' :
         bucket === 'rsd' ? 'rsd.' :
         bucket === 'ani' ? 'ani.' : '') +
        String(defKey).replace(/^(?:bld\.|add\.|rsd\.|ani\.)/i, '');

      const yields = extractNormalizedYields(def);
      for (const y of yields) {
        if (normResId(y.resourceId) !== normResId(resKey)) continue;
        let perHour = y.perHour;
        perHour = applyYieldBuffsToAmount(perHour, normRes(resKey), { appliesToCtx: ctxId, activeBuffs });

        const entry = { sourceType: bucket, sourceId: ctxId, name: def?.name || defKey, perHour };
        if (perHour > 0) {
          if (modeLc !== 'cost') positive.push(entry);
        } else if (perHour < 0) {
          if (modeLc !== 'give') negative.push(entry);
        }
      }
    }
  }

  injectBaseStageBonusForResource({ defs, state, resourceResId: resKey, positive, modeLc });

  const sortFn = (a, b) => Math.abs(b.perHour) - Math.abs(a.perHour);
  positive.sort(sortFn); negative.sort(sortFn);

  return { positive, negative, meta: { resource: resKey, mode: modeLc } };
}

export function buildPassiveYieldTitle({ defs, state, resource, mode = 'both', heading = '' }) {
  const { positive, negative } = computePassiveYields({ defs, state, resource, mode });
  const lines = [];
  if (heading) lines.push(heading);

  if (mode !== 'cost') for (const it of positive) lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (+${round2(it.perHour)}/t)`);
  if (mode !== 'give') for (const it of negative) lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (${round2(it.perHour)}/t)`);
  return lines.length ? lines.join('\n') : (heading || '');
}

function round2(n) { return Math.round((n ?? 0) * 100) / 100; }