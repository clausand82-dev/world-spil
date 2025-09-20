// Finder passive yields for en given resource fra defs (bld/add/rsd/ani) for ting spilleren ejer.
// Inkluderer base stage-bonus OG anvender yield-buffs, så visningen matcher forventet output.
import { applyYieldBuffsToAmount } from './yieldBuffs.js';

function normResId(s) {
  const v = String(s || '').trim().toLowerCase();
  return v.replace(/^res\./, '');
}
function sameRes(a, b) {
  return normResId(a) === normResId(b);
}

// Ejer-check i state – matcher både med/uden prefix og håndterer ani
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

  // Direkte nøgler
  if (bag[withPref]) {
    if (bucket === 'ani') {
      const qty = typeof bag[withPref] === 'number' ? bag[withPref] : Number(bag[withPref]?.quantity ?? 0);
      return Number.isFinite(qty) && qty > 0;
    }
    return true;
  }
  if (bag[pref + naked]) {
    if (bucket === 'ani') {
      const v = bag[pref + naked];
      const qty = typeof v === 'number' ? v : Number(v?.quantity ?? 0);
      return Number.isFinite(qty) && qty > 0;
    }
    return true;
  }

  // Fallback scanning
  try {
    for (const [k, v] of Object.entries(bag)) {
      if (k === withPref || k === pref + naked) {
        if (bucket === 'ani') {
          const qty = typeof v === 'number' ? v : Number(v?.quantity ?? 0);
          return Number.isFinite(qty) && qty > 0;
        }
        return true;
      }
      const id = v?.bld_id || v?.add_id || v?.rsd_id || v?.ani_id || v?.id;
      if (typeof id === 'string' && (id === withPref || id === pref + naked)) {
        if (bucket === 'ani') {
          const qty = typeof v === 'number' ? v : Number(v?.quantity ?? 0);
          return Number.isFinite(qty) && qty > 0;
        }
        return true;
      }
    }
  } catch {}
  return false;
}

function readPeriodSeconds(def) {
  const d = def || {};
  const stats = d.stats || {};
  const cands = [
    d.yield_period_s, d.yieldPeriodS, d.production_period_s, d.period_s, stats.yield_period_s,
  ];
  for (const v of cands) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return 3600;
}

// Normaliser forskellige yield-formater fra defs til [{resourceId, perHour}]
function extractNormalizedYields(def) {
  const out = [];
  if (!def) return out;

  const raw =
    def.yield ?? def.yields ?? def.output ?? def.outputs ?? def.produce ?? def.produces ?? null;

  const periodS = readPeriodSeconds(def);
  const k = 3600 / (periodS || 3600);

  const pushEntry = (resourceId, amount, perHourOverride) => {
    if (resourceId == null || amount == null) return;
    const rid = String(resourceId);
    if (!rid) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) return;
    const perHour =
      typeof perHourOverride === 'number' && Number.isFinite(perHourOverride)
        ? perHourOverride
        : amt * k;

    out.push({ resourceId: rid, perHour });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item == null) continue;
      const rid = item.res ?? item.resource ?? item.id ?? item.key ?? item.name;
      const perHourDirect = item.per_hour ?? item.perHour ?? null;
      const amount = item.amount ?? item.qty ?? item.quantity ?? item.value ?? item.val ?? null;
      pushEntry(rid, amount, perHourDirect);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [rid, amount] of Object.entries(raw)) {
      pushEntry(rid, amount, null);
    }
  }

  return out;
}

// Injektér base stage-bonus for den efterspurgte resource som en "positiv" kilde.
function injectBaseStageBonusForResource({ defs, state, resourceResId, positive, modeLc }) {
  if (!defs || !state || !resourceResId) return;
  const user = state?.user ?? {};
  const stageId = user.currentstage ?? user.stage ?? 1;

  const rulesByStage = defs?.stage_bonus_rules ?? {};
  const rules =
    rulesByStage[stageId] ??
    rulesByStage[String(stageId)] ??
    {};

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
    const hit = lst.some((rid) => sameRes(rid, resKey));
    if (!hit) continue;

    const entry = {
      sourceType: 'base',
      sourceId: `stage.${stageId}.${key}`,
      name: labels[key],
      perHour: Number(amt),
    };
    if (Math.sign(entry.perHour) > 0) {
      if (modeLc !== 'cost') positive.push(entry);
    }
  }
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

/**
 * Beregn passive yields for en given resource.
 *  - defs, state
 *  - resource: "res.water" eller "water"
 *  - mode: "give" | "cost" | "both"
 * return:
 *  {
 *    positive: [{ sourceType, sourceId, name, perHour }],
 *    negative: [{ ... }],
 *    meta: { resource, mode }
 *  }
 */
export function computePassiveYields({ defs, state, resource, mode = 'both' } = {}) {
  const resKey = String(resource || '').trim();
  if (!resKey) return { positive: [], negative: [], meta: { resource: resKey, mode } };

  const modeLc = String(mode || 'both').toLowerCase(); // give|cost|both

  const positive = [];
  const negative = [];
  const activeBuffs = collectActiveBuffs(defs);

  // Kilder fra bld/add/rsd/ani
  const buckets = ['bld', 'add', 'rsd', 'ani'];
  for (const bucket of buckets) {
    const group = defs?.[bucket] || {};
    for (const [defKey, def] of Object.entries(group)) {
      if (!isOwned(bucket, defKey, state)) continue;

      const yields = extractNormalizedYields(def);
      if (!yields.length) continue;

      for (const y of yields) {
        if (!sameRes(y.resourceId, resKey)) continue;

        const ctxId =
          (bucket === 'bld' ? 'bld.' :
           bucket === 'add' ? 'add.' :
           bucket === 'rsd' ? 'rsd.' :
           bucket === 'ani' ? 'ani.' : '') +
          String(defKey).replace(/^(?:bld\.|add\.|rsd\.|ani\.)/i, '');

        let perHour = y.perHour;
        // Anvend yield-buffs
        perHour = applyYieldBuffsToAmount(perHour, resKey.startsWith('res.') ? resKey : `res.${resKey}`, {
          appliesToCtx: ctxId,
          activeBuffs,
        });

        const entry = {
          sourceType: bucket,
          sourceId: ctxId,
          name: def?.name || defKey,
          perHour,
        };

        const sign = Math.sign(entry.perHour);
        if (sign > 0) {
          if (modeLc !== 'cost') positive.push(entry);
        } else if (sign < 0) {
          if (modeLc !== 'give') negative.push(entry);
        }
      }
    }
  }

  // Injektér base stage-bonus for denne resource
  injectBaseStageBonusForResource({ defs, state, resourceResId: resKey, positive, modeLc });

  const sortFn = (a, b) => Math.abs(b.perHour) - Math.abs(a.perHour);
  positive.sort(sortFn);
  negative.sort(sortFn);

  return { positive, negative, meta: { resource: resKey, mode: modeLc } };
}

export function buildPassiveYieldTitle({ defs, state, resource, mode = 'both', heading = '' }) {
  const { positive, negative } = computePassiveYields({ defs, state, resource, mode });
  const lines = [];
  if (heading) lines.push(heading);

  if (mode !== 'cost') {
    for (const it of positive) {
      lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (+${round2(it.perHour)}/t)`);
    }
  }
  if (mode !== 'give') {
    for (const it of negative) {
      lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (${round2(it.perHour)}/t)`);
    }
  }
  return lines.length ? lines.join('\n') : (heading || '');
}

function round2(n) {
  return Math.round((n ?? 0) * 100) / 100;
}