import React from 'react';
import PureResourceCost from '../requirements/ResourceCost.base.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';

/*
  BuffedResourceCost
  - Wrapper around ResourceCost.base (PureResourceCost) that injects a transform()
    to apply cost-buffs (discounts/multipliers) without changing all existing calls.
  - Fixed: accept `extra` prop and forward it to PureResourceCost so the "yield" extra
    entries provided by RequirementSummary/RecipeRow are shown and transformed.
*/

export default function BuffedResourceCost({ cost, extra = null, ctx = 'all' }) {
  const { data } = useGameData();

  // Collect active buff definitions once per defs snapshot.
  const activeBuffs = React.useMemo(() => {
    const out = [];
    const push = arr => Array.isArray(arr) && arr.forEach(b => out.push(b));
    for (const m of ['bld', 'add', 'rsd']) {
      const bag = data?.defs?.[m] || {};
      Object.values(bag).forEach(def => push(def?.buffs));
    }
    return out;
  }, [data?.defs]);

  // transform callback applied to each item (both cost and extra) by PureResourceCost
  const transform = React.useCallback((id, baseAmount) => {
    if (!id || typeof baseAmount !== 'number' && isNaN(Number(baseAmount))) return Number(baseAmount || 0);

    // Normalize id to canonical form (res.* or ani.* etc.)
    const effectiveId = String(id).startsWith('res.')
      ? String(id)
      : (String(id).startsWith('ani.') ? String(id) : (String(id) in (data?.defs?.res || {}) ? `res.${String(id)}` : String(id)));

    // Only apply cost-buffs to resource ids (res.*). Others return base amount unchanged.
    if (!String(effectiveId).startsWith('res.')) return Number(baseAmount || 0);

    const v = applyCostBuffsToAmount(Number(baseAmount || 0), effectiveId, { appliesToCtx: ctx, activeBuffs });
    return v;
  }, [ctx, activeBuffs, data?.defs?.res]);

  // IMPORTANT: forward `extra` as well as `cost` so ResourceCost.base can render → extra tiles.
  // PureResourceCost (ResourceCost.base.jsx) already applies the transform to both cost and extra lists
  // when transform is supplied, so we don't need to handle extra separately here.
  return <PureResourceCost cost={cost} extra={extra} transform={transform} />;
}