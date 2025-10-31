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
  if (!Number.isFinite(result) || !activeBuffs?.length) return baseAmount;

  const rid = normResId(resId);

  // adds/subt (respekter scope + applies_to)
  for (const b of activeBuffs) {
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
  for (const b of activeBuffs) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if ((b?.op || b?.type) !== 'mult') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    const scope = b?.scope ?? b?.id ?? 'all';
    if (!resScopeMatches(scope, rid)) continue;
    const pct = Number(b?.amount || 0);
    if (!Number.isFinite(pct) || pct === 0) continue;
    // frontend expects pct meaning: 10 => +10%, -50 => -50%
    mul *= (1 + pct / 100);
  }
  result *= mul;

  return result < 0 ? 0 : result;
}

// Wrapper som foretrækker server-data hvis tilgængelig
export function applyYieldBuffsWithServer(baseAmount, resId, { appliesToCtx = 'all', activeBuffs = [], serverData = null } = {}) {
  // Hvis server leverer yields_preview for denne kontekst, brug den (hurtig path)
  // NOTE: yields_preview er keyed by ctxId (fx 'bld.foo') — hvis du kan bestemme ctxId fra appliesToCtx, brug det.
  // Hvis ikke, foretræk serverData.activeBuffs hvis tilgængelig.
  const buffs = (serverData && Array.isArray(serverData.activeBuffs) && serverData.activeBuffs.length > 0)
    ? serverData.activeBuffs
    : activeBuffs;
  return applyYieldBuffsToAmount(baseAmount, resId, { appliesToCtx, activeBuffs: buffs });
}