// Anvend frontend-yield-buffs på en mængde (typisk perHour)
// Buff-spec: kind="res", mode="yield|both", op="adds|subt|mult", amount=number
// scope: "all|solid|liquid|res.xxx"
// applies_to: "all" eller liste af ids (fx ["bld.basecamp.l1","buildings","research"]).
// ctx = id for den kilde, som yield kommer fra (fx "bld.basecamp.l1") eller "all".
function ctxMatches(appliesTo, ctxId) {
  if (!appliesTo) return false;
  if (appliesTo === 'all') return true;
  const arr = Array.isArray(appliesTo) ? appliesTo : String(appliesTo).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!arr.length) return false;
  if (arr.includes('all')) return true;
  // tillad generiske grupper
  if (ctxId.startsWith('bld.') && arr.includes('buildings')) return true;
  if (ctxId.startsWith('add.') && arr.includes('addons')) return true;
  if (ctxId.startsWith('rsd.') && arr.includes('research')) return true;
  return arr.includes(ctxId);
}

function resScopeMatches(scope, resId) {
  const id = String(resId || '');
  const sc = scope || 'all';
  if (sc === 'all') return true;
  if (sc === 'solid') return !id.startsWith('res.water') && !id.startsWith('res.oil') && id.startsWith('res.');
  if (sc === 'liquid') return (id.startsWith('res.water') || id.startsWith('res.oil'));
  // direkte match mod res.xxx
  const s = String(sc);
  if (s.startsWith('res.') && id.startsWith('res.')) return s === id;
  return false;
}

export function applyYieldBuffsToAmount(baseAmount, resId, { appliesToCtx = 'all', activeBuffs = [] } = {}) {
  let result = Number(baseAmount || 0);
  if (!Number.isFinite(result) || !activeBuffs?.length) return baseAmount;

  // Adds/Subt
  for (const b of activeBuffs) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    if (!resScopeMatches(b?.scope || b?.id || 'all', resId)) continue;
    const op = b?.op || b?.type;
    const amt = Number(b?.amount || 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (op === 'adds') result += amt;
    if (op === 'subt') result = Math.max(0, result - amt);
  }

  // Multiplikatorer (procenter)
  let mul = 1;
  for (const b of activeBuffs) {
    if ((b?.kind || '') !== 'res') continue;
    const mode = b?.mode || 'both';
    if (mode !== 'yield' && mode !== 'both') continue;
    if ((b?.op || b?.type) !== 'mult') continue;
    if (!ctxMatches(b?.applies_to || 'all', appliesToCtx)) continue;
    if (!resScopeMatches(b?.scope || b?.id || 'all', resId)) continue;
    const pct = Number(b?.amount || 0);
    if (!Number.isFinite(pct) || pct === 0) continue;
    mul *= (1 + pct / 100);
  }
  result *= mul;

  // Ingen negative yields
  if (result < 0) result = 0;
  return result;
}