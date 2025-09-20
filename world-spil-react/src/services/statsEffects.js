// Samler effekter for stats.* fra defs (bld/add/rsd) for ting spilleren ejer i state.
// Understøtter metrics: footprint, animal (→ animal_cap), solid (→ storageSolidCap), liquid (→ storageLiquidCap)
// Indeholder buildStatsTitle, som bygger en title-tekst med sektioner: Positiv, Negative og TOTAL.

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
  const naked = defKey.replace(/^(?:bld\.|add\.|rsd\.)/i, '');
  const withPref = pref + naked;

  if (b[withPref]) return true;
  if (b[pref + naked]) return true;

  // fallback scanning
  try {
    for (const [k, v] of Object.entries(b)) {
      if (k === withPref || k === pref + naked) return true;
      const id = v?.bld_id || v?.add_id || v?.rsd_id || v?.id;
      if (typeof id === 'string' && (id === withPref || id === pref + naked)) return true;
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

// Læs base-cap fra state for en given canonical metric
function readBaseCapForMetric(state, canonicalMetric) {
  const cap = state?.cap || {};
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  switch (canonicalMetric) {
    case 'footprint':
      return toNum(cap?.footprint?.base);
    case 'animal_cap':
      return toNum(cap?.animal_cap?.base);
    case 'storageSolidCap':
      return toNum(cap?.solid?.base ?? cap?.storageSolidCap?.base);
    case 'storageLiquidCap':
      return toNum(cap?.liquid?.base ?? cap?.storageLiquidCap?.base);
    default:
      return null;
  }
}

// Injektér animals-forbrug på animal_cap: state.ani[*] * defs.ani.*.stats.animal_cap
function injectAnimalCapUsage({ defs, state, modeLc, positiveByMetric, negativeByMetric, selected }) {
  if (!selected.includes('animal_cap')) return;

  const aniBag = state?.ani || state?.animals || state?.animal;
  if (!aniBag || typeof aniBag !== 'object') return;

  for (const [rawKey, v] of Object.entries(aniBag)) {
    // Antal dyr
    const count = typeof v === 'number'
      ? v
      : Number(v?.count ?? v?.qty ?? v?.quantity ?? 0);
    if (!Number.isFinite(count) || count <= 0) continue;

    // Slå def op
    const key = String(rawKey || '');
    const naked = key.replace(/^ani\./i, '');
    const def = defs?.ani?.[naked] ?? defs?.animals?.[naked];
    const perUnit = readStat(def?.stats || {}, 'animal_cap');
    if (perUnit == null || !Number.isFinite(perUnit) || perUnit === 0) continue;

    const total = perUnit * count;

    const entry = {
      metric: 'animal_cap',
      amount: total,
      sourceType: 'ani',
      sourceId: `ani.${naked}`,
      name: def?.name || naked,
      meta: { count, perUnit },
    };

    const sign = Math.sign(entry.amount);
    if (sign > 0) {
      if (modeLc !== 'take') positiveByMetric['animal_cap'].push(entry);
    } else if (sign < 0) {
      if (modeLc !== 'give') negativeByMetric['animal_cap'].push(entry);
    }
  }
}

// Hoved-API: beregn effekter
// mode: 'give' | 'take' | 'both'
export function computeStatsEffects({ defs, state, metrics, mode = 'both' } = {}) {
  const sel = resolveSelectedMetrics(metrics);
  const modeLc = String(mode || 'both').toLowerCase();

  const positiveByMetric = {};
  const negativeByMetric = {};
  for (const m of sel) { positiveByMetric[m] = []; negativeByMetric[m] = []; }

  // Kilder fra bld/add/rsd
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

  // Injektér Base fra state.cap.*.base
  for (const m of sel) {
    const baseVal = readBaseCapForMetric(state, m);
    if (baseVal != null && baseVal !== 0) {
      const entry = {
        metric: m,
        amount: baseVal,
        sourceType: 'base',
        sourceId: `state.cap.${m === 'storageSolidCap' ? 'solid' : m === 'storageLiquidCap' ? 'liquid' : m}.base`,
        name: 'Base',
      };
      const sign = Math.sign(entry.amount);
      if (sign > 0) {
        if (modeLc !== 'take') positiveByMetric[m].push(entry);
      } else if (sign < 0) {
        if (modeLc !== 'give') negativeByMetric[m].push(entry);
      }
    }
  }

  // Injektér dyreforbrug (animal_cap)
  injectAnimalCapUsage({ defs, state, modeLc, positiveByMetric, negativeByMetric, selected: sel });

  // Sortér efter absolut værdi
  const sortFn = (a, b) => Math.abs(b.amount) - Math.abs(a.amount);
  for (const m of sel) {
    positiveByMetric[m].sort(sortFn);
    negativeByMetric[m].sort(sortFn);
  }

  return { positiveByMetric, negativeByMetric, selected: sel, mode: modeLc };
}

function labelMetric(m) {
  return ({
    footprint: 'Footprint',
    animal_cap: 'Animal cap',
    storageSolidCap: 'Solid cap',
    storageLiquidCap: 'Liquid cap',
  }[m] || m);
}

function round2(n) {
  const v = Number(n ?? 0);
  return Math.round(v * 100) / 100;
}
function fmtSigned(n) {
  const v = round2(n);
  return (v > 0 ? `+${v}` : `${v}`);
}

/**
 * Byg en title med sektioner:
 * [Heading]
 * (valgfrit) [Metric label]
 * Positiv:
 * - TYPE: Name [id] (+X)
 * Negative:
 * - TYPE: Name [id] (-Y)
 * TOTAL: +P, -N, Netto: Z
 *
 * Options:
 * - showId: default true (viser [sourceId])
 * - showTotals: default true
 * - showMetricLabels: default false (undgå “dobbeltheader” når du selv sætter heading)
 * Animal-specifik formatter: for sourceType === "ani" vises "Name x<count>".
 */
export function buildStatsTitle({
  defs,
  state,
  metrics,
  mode = 'both',
  heading = '',
  showId = true,
  showTotals = true,
  showMetricLabels = false,
}) {
  const { positiveByMetric, negativeByMetric, selected } =
    computeStatsEffects({ defs, state, metrics, mode });

  const lines = [];
  if (heading) lines.push(heading);

  for (const m of selected) {
    const pos = positiveByMetric[m] || [];
    const neg = negativeByMetric[m] || [];

    const addMetricLabel = !!showMetricLabels || (selected.length > 1 && !heading);
    if (addMetricLabel) {
      lines.push(labelMetric(m));
    }

    // Positiv
    if (mode !== 'take') {
      lines.push('\n Positiv:');
      if (pos.length === 0) {
        lines.push('- Ingen');
      } else {
        for (const it of pos) {
          const idPart = showId ? ` [${it.sourceId}]` : '';
          const nameWithCount = it.sourceType === 'ani' && it.meta?.count
            ? `${it.name || it.sourceId} x${it.meta.count}`
            : (it.name || it.sourceId);
          lines.push(`- ${it.sourceType.toUpperCase()}: ${nameWithCount} (${fmtSigned(it.amount)})`);
        }
      }
    }

    // Negative
    if (mode !== 'give') {
      lines.push('\n Negative:');
      if (neg.length === 0) {
        lines.push('- Ingen');
      } else {
        for (const it of neg) {
          const idPart = showId ? ` [${it.sourceId}]` : '';
          const nameWithCount = it.sourceType === 'ani' && it.meta?.count
            ? `${it.name || it.sourceId} x${it.meta.count}`
            : (it.name || it.sourceId);
          lines.push(`- ${it.sourceType.toUpperCase()}: ${nameWithCount} (${fmtSigned(it.amount)})`);
        }
      }
    }

    // TOTAL
    if (showTotals) {
      const posSum = pos.reduce((a, e) => a + (e.amount ?? 0), 0);
      const negSum = neg.reduce((a, e) => a + (e.amount ?? 0), 0);
      const net = posSum + negSum;
      const posTxt = `+${round2(posSum)}`;
      const negTxt = `-${round2(Math.abs(negSum))}`;
      const netTxt = `${net >= 0 ? '+' : ''}${round2(net)}`;
      const totalLine = (mode === 'both')
        ? `\n TOTAL: ${posTxt}, ${negTxt}, Netto: ${netTxt}`
        : `\n TOTAL: ${mode === 'give' ? posTxt : negTxt}`;
      lines.push(totalLine);
    }
  }

  return lines.join('\n');
}