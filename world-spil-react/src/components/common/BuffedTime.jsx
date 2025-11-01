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
    // NOTE: brug JSON.stringify på server-array for at fange mutations der ikke ændrer reference
  }, [data?.defs, data?.state, JSON.stringify(data?.activeBuffs || [])]);

  // Debug: log speed buffs (brug kun i dev)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.WS_DEBUG_SPEED) {
      const debugFlag = (typeof window !== 'undefined' && !!window.WS_DEBUG_SPEED) || (typeof localStorage !== 'undefined' && localStorage.getItem('WS_DEBUG_SPEED'));
if (!debugFlag) return;

console.log('[BuffedTime] data.activeBuffs (server):', data?.activeBuffs);
console.log('[BuffedTime] data.state.buffs (state):', data?.state?.buffs ?? data?.state?.activeBuffs);
console.log('[BuffedTime] merged activeBuffs:', activeBuffs);
console.log('[BuffedTime] merged source_ids:', (activeBuffs||[]).map((b,i)=>({i, source_id: b.source_id, kind: b.kind, amount: b.amount, actions: b.actions ?? b.target, applies_to: b.applies_to, name: b.name})));
console.log('[BuffedTime] has stat.pop_under_50?', (activeBuffs||[]).some(b => b.source_id === 'stat.pop_under_50' || b.source_id === 'stat:popularity' || String(b.source_id).includes('pop_under')));
    }
  }, [activeBuffs, baseS, action, ctx]);

  const finalS = React.useMemo(() => {
    return applySpeedBuffsToDuration(baseS, action, { appliesToCtx: ctx, activeBuffs });
  }, [baseS, action, ctx, activeBuffs]);

  return <>{Math.round(finalS)}s</>;
}