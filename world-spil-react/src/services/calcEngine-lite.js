export function normResId(id) {
  const s = String(id || '').trim();
  return s.startsWith('res.') ? s.toLowerCase() : `res.${s.toLowerCase()}`;
}

function appliesToMatch(applies_to, ctxList) {
  if (applies_to === 'all') return true;
  if (!applies_to) return false;
  if (Array.isArray(applies_to)) {
    return ctxList.some(x => applies_to.includes(x));
  }
  const arr = String(applies_to).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!arr.length) return false;
  if (arr.includes('all')) return true;
  return ctxList.some(x => arr.includes(x));
}

export function applyCostBuffsToAmount(baseAmount, resId, { appliesToCtx, activeBuffs } = {}) {
  const ctxList = Array.isArray(appliesToCtx) ? appliesToCtx : [appliesToCtx];
  const normRid = normResId(resId);

  let add = 0, sub = 0, mult = 1;

  for (const b of activeBuffs || []) {
    if (b.kind !== 'res') continue;
    // kun cost/both
    if (!(b.mode === 'cost' || b.mode === 'both')) continue;

    // scope matcher resId? (all/solid/liquid/res.xxx)
    const scope = String(b.scope ?? 'all');
    const scopeNorm = scope === 'all' ? 'all' : normResId(scope);
    const scopeOk =
      scopeNorm === 'all' ||
      scopeNorm === normRid ||
      (scope === 'solid' && normRid.startsWith('res.') /* && isSolid(resId) */) ||
      (scope === 'liquid' && normRid.startsWith('res.') /* && isLiquid(resId) */);
    if (!scopeOk) continue;

    // applies_to matcher konteksten?
    const appliesAll = b.applies_to === 'all';
    const appliesSome = Array.isArray(b.applies_to) && ctxList.some(x => b.applies_to.includes(x));
    if (!appliesAll && !appliesSome) {
      if (!appliesToMatch(b.applies_to, ctxList)) continue;
    }

    if (b.op === 'adds') add += Number(b.amount || 0);
    else if (b.op === 'subt') sub += Number(b.amount || 0);
    else if (b.op === 'mult') {
      const amt = Number(b.amount || 0);
      if (!Number.isFinite(amt)) continue;
      // VIGTIG REGL: cost-buff 10 => 10% BILLIGERE
      mult *= (1 - amt / 100);
    }
  }

  // clamp – ingen negative multipliers eller negative priser
  mult = Math.max(0, mult);
  return Math.max(0, (baseAmount + add - sub) * mult);
}

// Tilføj denne
export function applySpeedBuffsToDuration(baseS, action, { appliesToCtx, activeBuffs } = {}) {
  const ctxList = Array.isArray(appliesToCtx) ? appliesToCtx : [appliesToCtx];
  let mult = 1;

  for (const b of activeBuffs || []) {
    if (b.kind !== 'speed') continue;
    const actionOk = b.actions === 'all' || (Array.isArray(b.actions) && b.actions.includes(action));
    if (!actionOk) continue;

    if (!appliesToMatch(b.applies_to, ctxList)) continue;

    const amt = Number(b.amount || 0);
    if (!Number.isFinite(amt)) continue;
    if (b.op === 'mult') mult *= (1 - amt / 100); // 10 => 10% hurtigere
  }

  // cap (max 80% hurtigere) + clamp
  mult = Math.max(0.2, mult); // max 80% hurtigere - NORMAL CAP
  return Math.max(0, baseS * mult);
}