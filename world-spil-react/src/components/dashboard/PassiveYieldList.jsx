import React, { useMemo, useState } from 'react';
import * as H from '../../services/helpers.js';
import { useGameData } from '../../context/GameDataContext.jsx';
import { applyYieldBuffsToAmount } from '../../services/yieldBuffs.js';
import Icon from '../ui/Icon.jsx';

function collectActiveBuffs(defs, state) {
  const out = [];
  const push = (arr) => Array.isArray(arr) && arr.forEach((b) => out.push(b));
  for (const bucket of ['bld','add','rsd']) {
    const bag = defs?.[bucket] || {};
    for (const [key, def] of Object.entries(bag || {})) {
      const owned =
        bucket === 'bld' ? !!state?.bld?.[`bld.${key}`] :
        bucket === 'add' ? !!state?.add?.[`add.${key}`] :
        !!(state?.rsd?.[key] || state?.rsd?.[`rsd.${key}`]);
      if (!owned) continue;
      push(def?.buffs);
    }
  }
  return out;
}

function YieldResourceInner({ resId, data, defs }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const bareId = resId.replace(/^res\./, '');
  const resDef = defs.res?.[bareId];
  if (!resDef) return null;

  // Use Icon component: it handles url, emoji or React element
  const emojiDef = { iconUrl: resDef.iconUrl, emoji: resDef.emoji, name: resDef.name };

  return (
    <>
      <div className="item collapsible-item" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="icon" style={{ fontSize: '2em' }}>
          <Icon def={emojiDef} alt={resDef.name} size={24} />
        </div>
        <div className="grow"><div className="title">{resDef.name || bareId}</div></div>
        <div className="right">
          <strong>+{H.fmt(Math.round(data.total))} / time</strong>
          <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>▶</span>
        </div>
      </div>
      {isExpanded && (
        <div className="collapsible-content expanded">
          {data.sources.map((source, index) => {
            const qty = source.quantity ?? 1;
            const period = Number(source.period_s) || 0;
            const perHour = period > 0 ? (source.amount / period) * 3600 * qty : 0;
            // source.icon may be emoji text or URL string; let Icon handle it via src prop
            return (
              <div className="yield-source-item" key={`${source.name ?? 'src'}_${index}`} >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon src={source.icon} alt={source.name} size="sm" />
                  <span>{source.name} {qty > 1 ? `(x${qty})` : ''}</span>
                </span>
                <span>+{H.fmt(perHour)} / time</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
const YieldResource = React.memo(YieldResourceInner);

export default function PassiveYieldList({ now }) {
  const currentTime = now ?? Date.now();
  const { data } = useGameData();

  const aggregatedYields = useMemo(() => {
    if (!data) return {};
    const aggregated = {};

    const defs = data.defs || {};
    const state = data.state || {};
    const activeBuffs = collectActiveBuffs(defs, state);

    const pushSource = (resId, amountPerHour, source) => {
      if (!aggregated[resId]) aggregated[resId] = { total: 0, sources: [] };
      aggregated[resId].total += amountPerHour;
      aggregated[resId].sources.push(source);
    };

    const ctxFor = (type, key) =>
      (type === 'bld' ? 'bld.' : type === 'add' ? 'add.' : type === 'rsd' ? 'rsd.' : 'ani.') + key;

    const process = (items = {}, groupDefs = {}, type) => {
      for (const [id, itemData] of Object.entries(items || {})) {
        const key = id.replace(new RegExp(`^${type}\\.`), '');
        const def = groupDefs?.[key];
        if (!def?.yield || !(def.yield_period_s > 0)) continue;

        const qty = Number(itemData.quantity || 1);
        const ctxId = ctxFor(type, key);

        for (const y of def.yield) {
          const baseAmt = Number(y.amount ?? y.qty ?? 0);
          const resId = String(y.id ?? y.res_id ?? '');
          if (!resId) continue;

          const period_s = Number(def.yield_period_s) || 0;
          if (period_s <= 0) continue;

          const basePerHour = baseAmt * (3600 / period_s);
          const buffedPerHour = applyYieldBuffsToAmount(basePerHour, resId.startsWith('res.') ? resId : `res.${resId}`, { appliesToCtx: ctxId, activeBuffs });
          const buffedPerCycle = buffedPerHour * (period_s / 3600);

          pushSource(resId, buffedPerHour * qty, {
            name: def.name,
            icon: def.emoji || def.iconUrl || def.icon || '🏠',
            amount: buffedPerCycle,
            period_s: period_s,
            quantity: qty,
          });
        }
      }
    };

    process(state?.bld, defs.bld || {}, 'bld');
    process(state?.add, defs.add || {}, 'add');
    process(state?.ani, defs.ani || {}, 'ani');

    // Base stage bonus
    const user = state?.user || {};
    const stageId =
      user.currentstage ?? user.stage ?? state?.currentstage ?? state?.stage ?? 1;
    const rules = defs.stage_bonus_rules?.[stageId] || {};
    const bonuses = {
      forest: Number(user.mul_forest ?? user.bonus_forest ?? 0),
      mining: Number(user.mul_mining ?? user.bonus_mining ?? 0),
      field:  Number(user.mul_field  ?? user.bonus_field  ?? 0),
      water:  Number(user.mul_water  ?? user.bonus_water  ?? 0),
    };
    const label = (k) => ({forest:'Basebonus (Skov)', mining:'Basebonus (Mine)', field:'Basebonus (Mark)', water:'Basebonus (Vand)'}[k] || 'Basebonus');

    for (const [key, lst] of Object.entries(rules || {})) {
      const amt = bonuses[key] || 0;
      if (amt <= 0) continue;
      for (const rid of (lst || [])) {
        const resId = String(rid);
        const perHour = amt;
        pushSource(resId, perHour, {
          name: label(key),
          icon: '✨',
          amount: perHour,
          period_s: 3600,
          quantity: 1,
        });
      }
    }

    return aggregated;
  }, [data?.defs, data?.state, currentTime]);

  const defs = data?.defs || {};
  const sortedYields = Object.entries(aggregatedYields).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));

  return sortedYields.map(([resId, yieldData]) => (
    <YieldResource key={resId} resId={resId} data={yieldData} defs={defs} />
  ));
}