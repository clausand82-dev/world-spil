import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applySpeedBuffsToDuration } from '../../services/calcEngine-lite.js';

export default function BuffedTime({ baseS, action, ctx = 'all' }) {
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

  const finalS = React.useMemo(() =>
    applySpeedBuffsToDuration(baseS, action, { appliesToCtx: ctx, activeBuffs }),
    [baseS, action, ctx, activeBuffs]
  );

  return <>{Math.round(finalS)}s</>;
}