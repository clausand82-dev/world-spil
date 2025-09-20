// Finder passive yields for en given resource fra defs (bld/add/rsd) for ting spilleren ejer.
// Output minder om statsEffects: positive/negative lister og en lille title-helper.

function normResId(s) {
  const v = String(s || '').trim().toLowerCase();
  return v.replace(/^res\./, '');
}
function sameRes(a, b) {
  return normResId(a) === normResId(b);
}

function isOwned(bucket, defKey, state) {
  if (!state) return false;
  const bag = state[bucket];
  if (!bag || typeof bag !== 'object') return false;

  const pref = bucket === 'bld' ? 'bld.' : bucket === 'add' ? 'add.' : 'rsd.';
  const naked = String(defKey).replace(/^(?:bld\.|add\.|rsd\.)/i, '');
  const withPref = pref + naked;

  if (bag[withPref]) return true;
  if (bag[pref + naked]) return true;

  try {
    for (const [k, v] of Object.entries(bag)) {
      if (k === withPref || k === pref + naked) return true;
      const id = v?.bld_id || v?.add_id || v?.rsd_id || v?.id;
      if (typeof id === 'string' && (id === withPref || id === pref + naked)) return true;
    }
  } catch {}
  return false;
}

function readPeriodSeconds(def) {
  const d = def || {};
  const stats = d.stats || {};
  // Primært felt set: yield_period_s
  const cands = [
    d.yield_period_s, d.yieldPeriodS, d.production_period_s, d.period_s, stats.yield_period_s,
  ];
  for (const v of cands) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return 3600; // fallback: per time
}

// Normaliser forskellige yield-formater fra defs til [{resourceId, amountPerHour}]
function extractNormalizedYields(def) {
  const out = [];
  if (!def) return out;

  // Hvor gemmer du outputs? Vi støtter flere aliaser defensivt
  const raw =
    def.yield ?? def.yields ?? def.output ?? def.outputs ?? def.produce ?? def.produces ?? null;

  const periodS = readPeriodSeconds(def);
  const k = 3600 / (periodS || 3600);

  // Hjælper til at pushe en enkelt entry
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
      // Støt både "amount"/"qty"/"value" og evt. per_hour direkte
      const perHourDirect = item.per_hour ?? item.perHour ?? null;
      const amount = item.amount ?? item.qty ?? item.quantity ?? item.value ?? item.val ?? null;
      pushEntry(rid, amount, perHourDirect);
    }
  } else if (raw && typeof raw === 'object') {
    // Objekt-map: { "res.water": 3, "res.bone": -1 }
    for (const [rid, amount] of Object.entries(raw)) {
      pushEntry(rid, amount, null);
    }
  }

  return out;
}

/**
 * Beregn passive yields for en given resource.
 * params:
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

  const buckets = ['bld', 'add', 'rsd'];
  for (const bucket of buckets) {
    const group = defs?.[bucket] || {};
    for (const [defKey, def] of Object.entries(group)) {
      if (!isOwned(bucket, defKey, state)) continue;

      const yields = extractNormalizedYields(def);
      if (!yields.length) continue;

      for (const y of yields) {
        if (!sameRes(y.resourceId, resKey)) continue;

        const entry = {
          sourceType: bucket,
          sourceId:
            (bucket === 'bld' ? 'bld.' : bucket === 'add' ? 'add.' : 'rsd.') +
            String(defKey).replace(/^(?:bld\.|add\.|rsd\.)/i, ''),
          name: def?.name || defKey,
          perHour: y.perHour,
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

  // Sortér efter absolut størst først
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