import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applySpeedBuffsToDuration } from '../../services/calcEngine-lite.js';
import { collectActiveBuffs } from '../../services/requirements.js';

/*
  BuffedTime: Vis sluttid efter speed buffs.
  - Bruger collectActiveBuffs(defs, state, data) så server-sats-buffs inkluderes.
  - Console-debug: window.WS_DEBUG_SPEED = true
*/
export default function BuffedTime({ baseS, action, ctx = 'all' }) {
  const { data } = useGameData();

  // Merge lokale defs-buffs og server-provided activeBuffs (data.activeBuffs)
  const activeBuffs = React.useMemo(() => {
    const defs = data?.defs || {};
    const state = data?.state || {};
    return collectActiveBuffs(defs, state, data);
    // JSON.stringify fanger mutationer uden ref-ændring
  }, [data?.defs, data?.state, JSON.stringify(data?.activeBuffs || [])]);

  // Debug: log speed buffs (brug kun i dev)
  React.useEffect(() => {
    const debugFlag = (typeof window !== 'undefined' && !!window.WS_DEBUG_SPEED) ||
                      (typeof localStorage !== 'undefined' && localStorage.getItem('WS_DEBUG_SPEED'));
    if (!debugFlag) return;

    console.log('[BuffedTime] data.activeBuffs (server):', data?.activeBuffs);
    console.log('[BuffedTime] data.state.buffs (state):', data?.state?.buffs ?? data?.state?.activeBuffs);
    console.log('[BuffedTime] merged activeBuffs:', activeBuffs);
    console.log('[BuffedTime] merged source_ids:', (activeBuffs||[]).map((b,i)=>({i, source_id: b.source_id, kind: b.kind, amount: b.amount, actions: b.actions ?? b.target, applies_to: b.applies_to, name: b.name})));
  }, [data, activeBuffs]);

  // Normalisér action/ctx for stabile og konsistente matches
  const actionId = React.useMemo(() => String(action ?? 'all').trim().toLowerCase(), [action]);
  const ctxId = React.useMemo(() => {
    if (Array.isArray(ctx)) return ctx.map(s => String(s ?? '').trim().toLowerCase());
    return String(ctx ?? 'all').trim().toLowerCase();
  }, [ctx]);

  const finalS = React.useMemo(() => {
    return applySpeedBuffsToDuration(baseS, actionId, { appliesToCtx: ctxId, activeBuffs });
  }, [baseS, actionId, ctxId, activeBuffs]);

  // Ensartet afrunding: ceil (undgår for optimistisk visning og flimmer)
  return <>{Math.ceil(finalS)}s</>;
}