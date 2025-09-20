// Samler effekter for stats.* fra defs (bld/add/rsd) for ting spilleren ejer i state.
// Understøtter metrics: footprint, animal (→ animal_cap), solid (→ storageSolidCap), liquid (→ storageLiquidCap)

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') {
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [v];
}

function canonMetric(m) {
  const s = String(m || '').toLowerCase().trim();
  if (!s) return '';
  if (s === 'animal' || s === 'animal_cap' || s === 'animalcap') return 'animal_cap';
  if (s === 'solid' || s === 'storagesolidcap' || s === 'storage_solid_cap' || s === 'solid_cap') return 'storageSolidCap';
  if (s === 'liquid' || s === 'storageliquidcap' || s === 'storage_liquid_cap' || s === 'liquid_cap') return 'storageLiquidCap';
  if (s === 'footprint') return 'footprint';
  return s;
}

export function resolveSelectedMetrics(metricsInput) {
  const arr = toArray(metricsInput);
  const out = [];
  for (const m of arr) {
    const c = canonMetric(m);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// Hent en stats-værdi fra et def-objekt på tværs af aliaser
function readStat(defStats, canonical) {
  if (!defStats || typeof defStats !== 'object') return null;
  const probesByMetric = {
    footprint: ['footprint'],
    animal_cap: ['animal_cap', 'animalCap'],
    storageSolidCap: ['storageSolidCap', 'storage_solid_cap', 'solid_cap', 'solidCap'],
    storageLiquidCap: ['storageLiquidCap', 'storage_liquid_cap', 'liquid_cap', 'liquidCap'],
  };
  const keys = probesByMetric[canonical] || [];
  for (const k of keys) {
    if (defStats[k] != null && typeof defStats[k] === 'number') {
      const v = Number(defStats[k]);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

// Ejer-check i state — matcher både med og uden prefix i defs
function isOwned(bucket, defKey, state) {
  if (!state) return false;
  const b = state[bucket];
  if (!b || typeof b !== 'object') return false;

  const pref = bucket === 'bld' ? 'bld.' : bucket === 'add' ? 'add.' : 'rsd.';
  const withPref = pref + defKey.replace(/^(?:bld\.|add\.|rsd\.)/i, '');
  const withoutPref = defKey.replace(/^(?:bld\.|add\.|rsd\.)/i, '');

  if (b[withPref]) return true;
  if (b[pref + withoutPref]) return true;

  // fallback scanning
  try {
    for (const [k, v] of Object.entries(b)) {
      if (k === withPref || k === pref + withoutPref) return true;
      const id = v?.bld_id || v?.add_id || v?.rsd_id || v?.id;
      if (typeof id === 'string' && (id === withPref || id === pref + withoutPref)) return true;
    }
  } catch {}
  return false;
}

// Ekstraher effekter fra én def
function extractFromDef(def, { bucket, defKey, name }, selectedCanonMetrics) {
  const stats = def?.stats || {};
  const out = [];
  for (const m of selectedCanonMetrics) {
    const val = readStat(stats, m);
    if (val == null || !Number.isFinite(val) || val === 0) continue;
    out.push({
      metric: m,
      amount: Number(val),
      sourceType: bucket,                 // 'bld' | 'add' | 'rsd'
      sourceId: (bucket === 'bld' ? 'bld.' : bucket === 'add' ? 'add.' : 'rsd.') +
                defKey.replace(/^(?:bld\.|add\.|rsd\.)/i, ''),
      name: name || def?.name || defKey,
    });
  }
  return out;
}

// Hoved-API: beregn effekter
// mode: 'give' | 'take' | 'both'
export function computeStatsEffects({ defs, state, metrics, mode = 'both' } = {}) {
  const sel = resolveSelectedMetrics(metrics);
  const modeLc = String(mode || 'both').toLowerCase();

  const positiveByMetric = {};
  const negativeByMetric = {};
  for (const m of sel) { positiveByMetric[m] = []; negativeByMetric[m] = []; }

  const buckets = ['bld', 'add', 'rsd'];
  for (const bucket of buckets) {
    const group = defs?.[bucket] || {};
    for (const [defKey, def] of Object.entries(group)) {
      if (!isOwned(bucket, defKey, state)) continue;
      const name = def?.name || defKey;
      const arr = extractFromDef(def, { bucket, defKey, name }, sel);
      for (const eff of arr) {
        const sign = Math.sign(eff.amount);
        if (sign > 0) {
          if (modeLc !== 'take') positiveByMetric[eff.metric].push(eff);
        } else if (sign < 0) {
          if (modeLc !== 'give') negativeByMetric[eff.metric].push(eff);
        }
      }
    }
  }

  const sortFn = (a, b) => Math.abs(b.amount) - Math.abs(a.amount);
  for (const m of sel) {
    positiveByMetric[m].sort(sortFn);
    negativeByMetric[m].sort(sortFn);
  }

  return { positiveByMetric, negativeByMetric, selected: sel, mode: modeLc };
}

/**
 * Lille formatter til title="" der genbruger computeStatsEffects.
 * heading: fx "Byggepoint"
 * metrics: fx "footprint" eller ["footprint","animal"]
 * mode: "give" | "take" | "both" (til din chip vil du bruge "give")
 */
export function buildStatsTitle({ defs, state, metrics, mode = 'both', heading = '' }) {
  const { positiveByMetric, negativeByMetric, selected } =
    computeStatsEffects({ defs, state, metrics, mode });

  const lines = [];
  if (heading) lines.push(heading);

  for (const m of selected) {
    if (mode !== 'take') {
      for (const it of positiveByMetric[m]) {
        lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (+${it.amount})`);
      }
    }
    if (mode !== 'give') {
      for (const it of negativeByMetric[m]) {
        lines.push(`${it.sourceType.toUpperCase()}: ${it.name} (${it.amount})`);
      }
    }
  }
  return lines.length ? lines.join('\n') : (heading || '');
}