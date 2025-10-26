

export function applyCostBuffsToAmount(baseAmount, resId, { appliesToCtx, activeBuffs }) {
  const ctxList = Array.isArray(appliesToCtx) ? appliesToCtx : [appliesToCtx];

  let add = 0, sub = 0, mult = 1;

  for (const b of activeBuffs || []) {
    if (b.kind !== 'res') continue;
    // kun cost/both
    if (!(b.mode === 'cost' || b.mode === 'both')) continue;

    // scope matcher resId? (all/solid/liquid/res.xxx)
    const scopeOk =
      b.scope === 'all' ||
      b.scope === resId ||
      (b.scope === 'solid' && resId.startsWith('res.') /* && isSolid(resId) */) ||
      (b.scope === 'liquid' && resId.startsWith('res.') /* && isLiquid(resId) */);
    if (!scopeOk) continue;

    // applies_to matcher konteksten?
    const appliesAll = b.applies_to === 'all';
    const appliesSome = Array.isArray(b.applies_to) && ctxList.some(x => b.applies_to.includes(x));
    if (!appliesAll && !appliesSome) continue;

    if (b.op === 'adds') add += b.amount;
    else if (b.op === 'subt') sub += b.amount;
    else if (b.op === 'mult') {
      // VIGTIG REGL: cost-buff 10 => 10% BILLIGERE
      mult *= (1 - b.amount / 100);
    }
  }

  // clamp – ingen negative multipliers eller negative priser
  mult = Math.max(0, mult);
  return Math.max(0, (baseAmount + add - sub) * mult);
}

// Tilføj denne
export function applySpeedBuffsToDuration(baseS, action, { appliesToCtx, activeBuffs }) {
  const ctxList = Array.isArray(appliesToCtx) ? appliesToCtx : [appliesToCtx];
  let mult = 1;

  for (const b of activeBuffs || []) {
    if (b.kind !== 'speed') continue;
    const actionOk = b.actions === 'all' || (Array.isArray(b.actions) && b.actions.includes(action));
    if (!actionOk) continue;

    const appliesAll = b.applies_to === 'all';
    const appliesSome = Array.isArray(b.applies_to) && ctxList.some(x => b.applies_to.includes(x));
    if (!appliesAll && !appliesSome) continue;

    if (b.op === 'mult') mult *= (1 - b.amount / 100); // 10 => 10% hurtigere
  }

  // cap (max 80% hurtigere) + clamp
  mult = Math.max(0.2, mult); // max 80% hurtigere - NORMAL CAP

try {
  const statsMods = (typeof window !== 'undefined' && window.data && window.data.statsModifiers && window.data.statsModifiers.global)
    ? window.data.statsModifiers.global
    : null;
  const sm = statsMods && typeof statsMods.speed_mult === 'number' ? Number(statsMods.speed_mult) : 1;
  mult = mult * sm;
} catch (e) {}
// then return Math.max(0, baseS * mult);


  return Math.max(0, baseS * mult);
}
