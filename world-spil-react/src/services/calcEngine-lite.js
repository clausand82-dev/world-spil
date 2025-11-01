export function normResId(id) {
  const s = String(id || '').trim();
  return s.startsWith('res.') ? s.toLowerCase() : `res.${s.toLowerCase()}`;
}

/**
 * Hierarkisk og case-insensitiv match af applies_to mod ctx-listen.
 * - 'all' matcher alt
 * - Array eller komma/semikolon-separeret streng understøttes
 * - Hierarki: applies_to 'bld' matcher 'bld.family.l2' (prefix på dot-grænser)
 */
function appliesToMatch(applies_to, ctxList) {
  // Normaliser ctx’er til lower-case strenge
  const ctxs = (Array.isArray(ctxList) ? ctxList : [ctxList])
    .map(s => String(s ?? '').trim().toLowerCase())
    .filter(Boolean);

  if (!applies_to || ctxs.length === 0) return false;

  // Normaliser applies_to til en liste af tokens
  let arr;
  if (applies_to === 'all') return true;
  if (Array.isArray(applies_to)) {
    arr = applies_to.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
  } else {
    arr = String(applies_to)
      .split(/[,;]/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }
  if (arr.length === 0) return false;
  if (arr.includes('all')) return true;

  // Hierarkisk prefix-match: 'bld' matcher 'bld.family.l2'
  const ctxPrefixes = (s) => {
    const parts = s.split('.');
    const res = [];
    for (let i = 1; i <= parts.length; i++) {
      res.push(parts.slice(0, i).join('.'));
    }
    return res;
  };

  for (const ctx of ctxs) {
    const prefixes = ctxPrefixes(ctx);
    // hvis applies_to indeholder en af prefix’ene, er der match
    if (arr.some(a => prefixes.includes(a))) return true;
  }
  return false;
}

export function applyCostBuffsToAmount(baseAmount, resId, { appliesToCtx, activeBuffs } = {}) {
  const ctxList = Array.isArray(appliesToCtx) ? appliesToCtx : [appliesToCtx];
  const normRid = normResId(resId);

  let add = 0, sub = 0, mult = 1;

  for (const b of (activeBuffs || [])) {
    if (b.kind !== 'res') continue;
    if (!(b.mode === 'cost' || b.mode === 'both')) continue;

    const scope = String(b.scope ?? 'all');
    const scopeNorm = scope === 'all' ? 'all' : normResId(scope);
    const scopeOk =
      scopeNorm === 'all' ||
      scopeNorm === normRid ||
      (scope === 'solid' && normRid.startsWith('res.')) ||
      (scope === 'liquid' && normRid.startsWith('res.'));
    if (!scopeOk) continue;

    if (!appliesToMatch(b.applies_to, ctxList)) continue;

    if (b.op === 'adds') add += Number(b.amount || 0);
    else if (b.op === 'subt') sub += Number(b.amount || 0);
    else if (b.op === 'mult') {
      const amt = Number(b.amount || 0);
      if (!Number.isFinite(amt)) continue;
      mult *= (1 - amt / 100); // 10 => 10% billigere
    }
  }

  mult = Math.max(0, mult);
  return Math.max(0, (baseAmount + add - sub) * mult);
}

/**
 * Ensartet speed-beregning:
 * - Case-insensitiv actions-match (array, komma-streng, 'all')
 * - Hierarkisk applies_to-match (se appliesToMatch)
 * - Beholder 80%-cap (mult >= 0.2)
 */
export function applySpeedBuffsToDuration(baseS, action, { appliesToCtx, activeBuffs } = {}) {
  const ctxList = Array.isArray(appliesToCtx) ? appliesToCtx : [appliesToCtx];

  // normalisér action til lower-case streng
  const actionId = String(action ?? 'all').trim().toLowerCase();

  let mult = 1;

  const debug = (typeof window !== 'undefined' && !!window.WS_DEBUG_SPEED) ||
                (typeof localStorage !== 'undefined' && localStorage.getItem('WS_DEBUG_SPEED'));
  if (debug) {
    console.log('[applySpeedBuffsToDuration] start', { baseS, action: actionId, ctxList, activeBuffsLength: (activeBuffs||[]).length });
  }

  for (const b of (activeBuffs || [])) {
    try {
      const kind = (b?.kind || '').toLowerCase();
      if (kind !== 'speed') {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(kind)', kind, b?.source_id);
        continue;
      }

      const op = (b?.op ?? b?.type ?? '') ? String(b?.op ?? b?.type).toLowerCase() : null;
      if (!op) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(no op/type)', b?.source_id);
        continue;
      }

      if (op !== 'mult' && op !== 'add' && op !== 'subt') {
        if (debug) console.log('[applySpeedBuffsToDuration] unknown op (ignored)', op, b?.source_id);
      }

      // actions-match (array/komma-streng/'all'), case-insensitiv
      const actsRaw = b.actions ?? b.target ?? 'all';
      let actionOk = false;
      if (actsRaw === 'all') {
        actionOk = true;
      } else if (Array.isArray(actsRaw)) {
        const set = new Set(actsRaw.map(x => String(x ?? '').trim().toLowerCase()));
        actionOk = set.has(actionId);
      } else if (typeof actsRaw === 'string') {
        const parts = actsRaw.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        actionOk = parts.includes('all') || parts.includes(actionId);
      } else {
        actionOk = !!actsRaw;
      }
      if (!actionOk) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(actions)', { actsRaw, action: actionId, source: b.source_id });
        continue;
      }

      // applies_to (hierarkisk)
      if (!appliesToMatch(b.applies_to, ctxList)) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(applies_to)', { applies_to: b.applies_to, ctxList, source: b.source_id });
        continue;
      }

      const rawAmt = b.amount ?? 0;
      const amt = Number(rawAmt);
      if (!Number.isFinite(amt) || amt === 0) {
        if (debug) console.log('[applySpeedBuffsToDuration] skip(amount invalid/zero)', { rawAmt, source: b.source_id });
        continue;
      }

      if (op === 'mult') {
        const factor = (1 - amt / 100); // +10 => 0.9 (hurtigere)
        if (debug) console.log('[applySpeedBuffsToDuration] apply mult', { amt, factor, beforeMult: mult, source: b.source_id });
        mult *= factor;
        if (debug) console.log('[applySpeedBuffsToDuration] after mult', mult);
      } else {
        if (debug) console.log('[applySpeedBuffsToDuration] op not implemented for speed (ignored)', op, b.source_id);
      }
    } catch (err) {
      if (debug) console.error('[applySpeedBuffsToDuration] exception for buff', b, err);
    }
  }

  // cap (max 80% hurtigere) + clamp
  mult = Math.max(0.2, mult);

  if (debug) console.log('[applySpeedBuffsToDuration] final mult=', mult, 'finalSeconds=', Math.max(0, baseS * mult));
  return Math.max(0, baseS * mult);
}