// Frontend helper til at anvende yield-buffs på en mængde (typisk perHour/perSec)
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
  const id = String(resId || '');
  const sc = scope || 'all';
  if (sc === 'all') return true;
  if (sc === 'solid') return id.startsWith('res.') && !id.startsWith('res.water') && !id.startsWith('res.oil');
  if (sc === 'liquid') return id.startsWith('res.water') || id.startsWith('res.oil');
  const s = String(sc);
  if (s.startsWith('res.') && id.startsWith('res.')) return s === id;
  return false;
}

export function applyYieldBuffsToAmount(baseAmount, resId, { appliesToCtx = 'all', activeBuffs = [] } = {}) {
  let result = Number(baseAmount || 0);
  if (!Number.isFinite(result) || !activeBuffs?.length) return baseAmount;

  for (const b of activeBuffs) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    const scope = b?.scope ?? b?.id ?? 'all';
    const op = b?.op || b?.type;
    const amt = Number(b?.amount || 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (op === 'adds') result += amt;
    if (op === 'subt') result = Math.max(0, result - amt);
  }

  let mul = 1;
  for (const b of activeBuffs) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if ((b?.op || b?.type) !== 'mult') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    const scope = b?.scope ?? b?.id ?? 'all';
    if (!resScopeMatches(scope, resId)) continue;
    const pct = Number(b?.amount || 0);
    if (!Number.isFinite(pct) || pct === 0) continue;
    mul *= (1 + pct / 100);
  }
  result *= mul;

  return result < 0 ? 0 : result;
}