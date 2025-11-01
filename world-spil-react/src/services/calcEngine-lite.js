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

  const debug = (typeof window !== 'undefined' && !!window.WS_DEBUG_SPEED) || (typeof localStorage !== 'undefined' && localStorage.getItem('WS_DEBUG_SPEED'));
  if (debug) {
    console.log('[applySpeedBuffsToDuration] start', { baseS, action, ctxList, activeBuffsLength: (activeBuffs||[]).length });
  }

  for (const b of activeBuffs || []) {
    try {
      const kind = (b?.kind || '').toLowerCase();
      if (kind !== 'speed') {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(kind)', kind, b?.source_id);
        continue;
      }

      // op/type
      const op = (b?.op ?? b?.type ?? '') ? String(b?.op ?? b?.type).toLowerCase() : null;
      if (!op) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(no op/type)', b?.source_id);
        continue;
      }

      if (op !== 'mult' && op !== 'add' && op !== 'subt') {
        // only mult currently supported meaningfully; log otherwise
        if (debug) console.log('[applySpeedBuffsToDuration] unknown op (ignored)', op, b?.source_id);
      }

      // actions matching: support array, comma-string, 'all', or property target
      const actsRaw = b.actions ?? b.target ?? 'all';
      let actionOk = false;
      if (actsRaw === 'all') actionOk = true;
      else if (Array.isArray(actsRaw)) actionOk = actsRaw.includes(action);
      else if (typeof actsRaw === 'string') {
        const parts = actsRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        if (parts.includes('all')) actionOk = true;
        else actionOk = parts.includes(action);
      } else {
        actionOk = !!actsRaw; // fallback
      }
      if (!actionOk) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(actions)', { actsRaw, action, source: b.source_id });
        continue;
      }

      // applies_to matching (reuse appliesToMatch function present in this file)
      if (!appliesToMatch(b.applies_to, ctxList)) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(applies_to)', { applies_to: b.applies_to, ctxList, source: b.source_id });
        continue;
      }

      // amount numeric
      const rawAmt = b.amount ?? 0;
      const amt = Number(rawAmt);
      if (!Number.isFinite(amt) || amt === 0) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(amount invalid/zero)', { rawAmt, source: b.source_id });
        continue;
      }

      if (op === 'mult') {
        // Positive amt => faster (mult < 1). Negative amt => slower (mult > 1)
        const factor = (1 - amt / 100);
        if (debug) console.log('[applySpeedBuffsToDuration] apply mult', { amt, factor, beforeMult: mult, source: b.source_id });
        mult *= factor;
        if (debug) console.log('[applySpeedBuffsToDuration] after mult', mult);
      } else {
        // not used currently for speed but log it
        if (debug) console.log('[applySpeedBuffsToDuration] op not implemented for speed (ignored)', op, b.source_id);
      }
    } catch (err) {
      if (debug) console.error('[applySpeedBuffsToDuration] exception for buff', b, err);
    }
  }

  // cap (max 80% hurtigere) + clamp
  mult = Math.max(0.2, mult); // max 80% hurtigere - NORMAL CAP

  if (debug) console.log('[applySpeedBuffsToDuration] final mult=', mult, 'finalSeconds=', Math.max(0, baseS * mult));
  return Math.max(0, baseS * mult);
}