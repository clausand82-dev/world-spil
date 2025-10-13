import { evalExpr } from './policyExpr.js';

// Map 'xxxUsage' -> 'useXxx' (samme regel som backend)
function mapUsageKey(key) {
  if (key.startsWith('use')) return key;
  if (key.endsWith('Usage')) {
    const base = key.slice(0, -'Usage'.length);
    return 'use' + base.charAt(0).toUpperCase() + base.slice(1);
  }
  return key;
}

export function projectSummaryWithChoices(schema, choices, baseSummary) {
  if (!schema || !schema.fields) return baseSummary;
  const summary = JSON.parse(JSON.stringify(baseSummary || {}));
  summary.capacities = summary.capacities || {};
  summary.usages     = summary.usages     || {};

  // Saml overrides (kun ændringer vs default)
  const overrides = {};
  for (const [id, def] of Object.entries(schema.fields)) {
    const defVal = def?.control?.default ?? null;
    const curVal = choices?.[id];
    if (JSON.stringify(curVal) !== JSON.stringify(defVal)) {
      overrides[id] = curVal;
    }
  }
  if (!Object.keys(overrides).length) return summary;

  // Evaluer effekter per ændret felt
  const accCaps = {};
  const accMul  = {}; // per capKey multiplier produkt
  const accUse  = {};

  const ctx = { summary, choices: overrides };

  for (const [id, def] of Object.entries(schema.fields)) {
    if (!(id in overrides)) continue;
    const effects = Array.isArray(def.effects) ? def.effects : [];
    for (const eff of effects) {
      const stat = String(eff?.stat || '');
      if (!stat) continue;
      const op = String(eff?.op || 'add').toLowerCase();
      const v = eff?.value && typeof eff.value === 'object' && 'expr' in eff.value
        ? evalExpr(String(eff.value.expr), ctx)
        : Number(eff?.value ?? 0);

      const isUsage = stat.endsWith('Usage') || stat.startsWith('use');
      if (isUsage) {
        const key = mapUsageKey(stat);
        accUse[key] = accUse[key] || { add: 0, mul: 1 };
        if (op === 'add') accUse[key].add += v;
        else if (op === 'sub') accUse[key].add -= v;
        else if (op === 'mul') accUse[key].mul *= (v || 1);
        else if (op === 'div') accUse[key].mul /= (v || 1);
      } else {
        if (op === 'mul' || op === 'div') {
          accMul[stat] = accMul[stat] || 1;
          accMul[stat] = op === 'mul' ? accMul[stat] * (v || 1) : accMul[stat] / (v || 1);
        } else {
          accCaps[stat] = (accCaps[stat] ?? 0) + (op === 'sub' ? -v : v);
        }
      }
    }
  }

  // Anvend add/sub på capacities
  for (const [k, add] of Object.entries(accCaps)) {
    summary.capacities[k] = (Number(summary.capacities[k] || 0) + Number(add));
  }
  // Anvend multipliers
  for (const [k, mul] of Object.entries(accMul)) {
    summary.capacities[k] = Number(summary.capacities[k] || 0) * Number(mul || 1);
  }
  // Anvend usage
  for (const [k, { add, mul }] of Object.entries(accUse)) {
    const total = (Number(summary.usages[k]?.total || 0) + Number(add || 0)) * Number(mul || 1);
    summary.usages[k] = { ...(summary.usages[k] || {}), total };
  }

  return summary;
}