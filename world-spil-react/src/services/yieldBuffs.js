// Frontend helper til at anvende yield-buffs på en mængde (typisk perHour/perSec)

function normResId(id) {
  const s = String(id || '').trim();
  return s.startsWith('res.') ? s.toLowerCase() : `res.${s.toLowerCase()}`;
}

function ctxMatches(appliesTo, ctxId) {
  if (!appliesTo) return false;
  if (appliesTo === 'all') return true;
  const arr = Array.isArray(appliesTo)
    ? appliesTo
    : String(appliesTo).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!arr.length) return false;
  if (arr.includes('all')) return true;
  if (ctxId.startsWith('bld.') && arr.includes('buildings')) return true;
  if (ctxId.startsWith('add.') && arr.includes('addons')) return true;
  if (ctxId.startsWith('rsd.') && arr.includes('research')) return true;
  return arr.includes(ctxId);
}

function resScopeMatches(scope, resId) {
  const sc = (scope ?? 'all');
  const rid = normResId(resId);

  if (sc === 'all') return true;
  if (sc === 'solid')
    return rid.startsWith('res.') && !rid.startsWith('res.water') && !rid.startsWith('res.oil');
  if (sc === 'liquid')
    return rid.startsWith('res.water') || rid.startsWith('res.oil');

  // Specifik ressource – tillad både "wood" og "res.wood"
  const scoped = normResId(sc);
  return scoped === rid;
}

export function applyYieldBuffsToAmount(baseAmount, resId, { appliesToCtx = 'all', activeBuffs = [] } = {}) {
  let result = Number(baseAmount || 0);
  // Hvis result ikke er tal, returner baseAmount — men undlad at returnere blot fordi activeBuffs er tom,
  // så statsModifiers stadig kan anvendes.
  if (!Number.isFinite(result)) return baseAmount;

  const rid = normResId(resId);

  // adds/subt (respekter scope + applies_to)
  for (const b of activeBuffs || []) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    const scope = b?.scope ?? b?.id ?? 'all';
    const op = b?.op || b?.type;
    const amt = Number(b?.amount || 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (!resScopeMatches(scope, rid)) continue;

    if (op === 'adds') result += amt;
    if (op === 'subt') result = Math.max(0, result - amt);
  }

  // mult (respekter scope + applies_to)
  let mul = 1;
  for (const b of activeBuffs || []) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if ((b?.op || b?.type) !== 'mult') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    const scope = b?.scope ?? b?.id ?? 'all';
    if (!resScopeMatches(scope, rid)) continue;
    const pct = Number(b?.amount || 0);
    if (!Number.isFinite(pct) || pct === 0) continue;
    mul *= (1 + pct / 100);
  }
  result *= mul;

  // --- Stats modifiers: anvend selv hvis der ingen activeBuffs er ---
  try {
    const statsMods = (typeof window !== 'undefined' && window.data && window.data.statsModifiers && window.data.statsModifiers.global)
      ? window.data.statsModifiers.global
      : null;
    const sm = statsMods && typeof statsMods.yield_mult === 'number' ? Number(statsMods.yield_mult) : 1;
    result = result * sm;
  } catch (e) {
    // ignore
  }

  return result < 0 ? 0 : result;
}