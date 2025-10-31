import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applySpeedBuffsToDuration } from '../../services/calcEngine-lite.js';
import { collectActiveBuffs } from '../../services/requirements.js';

/*
  BuffedTime: Vis sluttid efter speed buffs.
  - Bruger collectActiveBuffs(defs, state, data) så server-sats-buffs inkluderes.
  - Console-debug output kan aktiveres ved at sætte window.WS_DEBUG_SPEED = true i browser console.
*/
export default function BuffedTime({ baseS, action, ctx = 'all' }) {
  const { data } = useGameData();

  // Merge lokale defs-buffs og server-provided activeBuffs (data.activeBuffs)
  const activeBuffs = React.useMemo(() => {
    const defs = data?.defs || {};
    const state = data?.state || {};
    // collectActiveBuffs håndterer lokalt defs-buffs + data.activeBuffs når serverData gives
    return collectActiveBuffs(defs, state, data);
  }, [data?.defs, data?.state, data?.activeBuffs]);

  // Debug: log speed buffs (brug kun i dev)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.WS_DEBUG_SPEED) {
      const speedBuffs = (activeBuffs || []).filter(b => (b?.kind || '') === 'speed');
      console.debug('[BuffedTime] baseS=', baseS, 'action=', action, 'ctx=', ctx);
      console.debug('[BuffedTime] speedBuffs matched:', speedBuffs);
    }
  }, [activeBuffs, baseS, action, ctx]);

  const finalS = React.useMemo(() => {
    return applySpeedBuffsToDuration(baseS, action, { appliesToCtx: ctx, activeBuffs });
  }, [baseS, action, ctx, activeBuffs]);

  return <>{Math.round(finalS)}s</>;
}