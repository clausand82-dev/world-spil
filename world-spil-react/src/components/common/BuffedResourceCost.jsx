import React from 'react';
import PureResourceCost from '../requirements/ResourceCost.base.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';

export default function BuffedResourceCost({ cost, ctx = 'all' }) {
   const { data } = useGameData();
 
   const activeBuffs = React.useMemo(() => {
     const out = [];
     const push = arr => Array.isArray(arr) && arr.forEach(b => out.push(b));
     for (const m of ['bld','add','rsd']) {
       const bag = data?.defs?.[m] || {};
       Object.values(bag).forEach(def => push(def.buffs));
     }
     return out;
   }, [data?.defs]);
 
   const transform = React.useCallback((id, baseAmount) => {
    // Ensret id: nogle costs kan være "money" → lav til "res.money"
    const effectiveId = id.startsWith('res.') ? id
      : (id in (data?.defs?.res||{}) ? `res.${id}` : id);
    if (!effectiveId.startsWith('res.')) return baseAmount;
    const v = applyCostBuffsToAmount(baseAmount, effectiveId, { appliesToCtx: ctx, activeBuffs });
    // DEBUG (midlertidigt): se i konsollen hvad der sker
    // console.log('[BuffedCost]', { id, effectiveId, baseAmount, out:v, ctx, activeBuffs });
    return v;
   }, [ctx, activeBuffs, data?.defs?.res]);
 
   return <PureResourceCost cost={cost} transform={transform} />;
 }
