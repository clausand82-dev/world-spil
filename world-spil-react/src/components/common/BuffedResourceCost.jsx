import React from 'react';
import PureResourceCost from '../requirements/ResourceCost.base.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';
import { applyYieldBuffsToAmount } from '../../services/yieldBuffs.js';
import { collectActiveBuffs } from '../../services/requirements.js';

export default function BuffedResourceCost({ cost, extra = null, ctx = 'all' }) {
   const { data } = useGameData();
 
   const activeBuffs = React.useMemo(() => {
  // merge local defs-buffs and server-provided activeBuffs
  return collectActiveBuffs(data?.defs || {}, data?.state || {}, data);
}, [data?.defs, data?.state, data?.activeBuffs]);

   const transform = React.useCallback((id, baseAmount) => {
    // Ensret id: nogle costs kan være "money" → lav til "res.money"
    const effectiveId = String(id).startsWith('res.') ? String(id)
      : (String(id) in (data?.defs?.res||{}) ? `res.${String(id)}` : String(id));
    if (!effectiveId.startsWith('res.')) return Number(baseAmount || 0);
    const v = applyCostBuffsToAmount(Number(baseAmount || 0), effectiveId, { appliesToCtx: ctx, activeBuffs });
    return v;
   }, [ctx, activeBuffs, data?.defs?.res]);

   // NEW: extraTransform applies yield-buffs (not cost-buffs) to the `extra` items (yields)
   const extraTransform = React.useCallback((id, baseAmount) => {
    const effectiveId = String(id).startsWith('res.') ? String(id)
      : (String(id) in (data?.defs?.res||{}) ? `res.${String(id)}` : String(id));
    if (!effectiveId.startsWith('res.')) return Number(baseAmount || 0);
    const v = applyYieldBuffsToAmount(Number(baseAmount || 0), effectiveId, { appliesToCtx: ctx, activeBuffs });
    return v;
   }, [ctx, activeBuffs, data?.defs?.res]);

   // Forward both cost and extra plus transforms to PureResourceCost (ResourceCost.base.jsx)
   return <PureResourceCost cost={cost} extra={extra} transform={transform} extraTransform={extraTransform} />;
 }