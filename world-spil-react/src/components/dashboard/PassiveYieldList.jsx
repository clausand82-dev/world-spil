import React, { useState, useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';

/**
 * Læg base stage-bonus ind som ekstra kilde(r) i aggregated.
 * Forventer:
 * - defs.stage_bonus_rules[stageId] med nøgler: forest|mining|field|water -> array af resId'er (res.xxx)
 * - data.state.user.bonus_* (eller mul_* fallback) med heltal pr. kategori
 */
function injectBaseStageBonus(aggregated, data) {
  const defs = data?.defs ?? {};
  const user = data?.state?.user ?? {};

  // Stage id kan være tal eller streng
  const stageId = user.currentstage ?? user.stage ?? 1;
  const rulesByStage = defs.stage_bonus_rules ?? {};
  // slå både med tal og streng op for sikkerhed
  const rules =
    rulesByStage[stageId] ??
    rulesByStage[String(stageId)] ??
    {};

  // Backend eksporterer bonus_*; mul_* beholdes som fallback
  const bonuses = {
    forest: Number(user.bonus_forest ?? user.mul_forest ?? 0),
    mining: Number(user.bonus_mining ?? user.mul_mining ?? 0),
    field:  Number(user.bonus_field  ?? user.mul_field  ?? 0),
    water:  Number(user.bonus_water  ?? user.mul_water  ?? 0),
  };

  const label = {
    forest: 'Base bonus (Forest)',
    mining: 'Base bonus (Mining)',
    field:  'Base bonus (Field)',
    water:  'Base bonus (Water)',
  };
  const icon = { forest:'🌲', mining:'⛏️', field:'🌾', water:'💧' };

  const push = (resId, amountPerHour, source) => {
    if (!aggregated[resId]) aggregated[resId] = { total: 0, sources: [] };
    aggregated[resId].total += amountPerHour;
    aggregated[resId].sources.push(source);
  };

  for (const [key, amt] of Object.entries(bonuses)) {
    if (!amt) continue;
    const list = rules[key] ?? [];
    for (const resId of list) {
      // +N/time → modeller som amount=N per 3600s
      push(resId, amt, {
        name: label[key],
        icon: icon[key],
        amount: amt,
        period_s: 3600,
        quantity: 1,
      });
    }
  }
}

// En lille under-komponent til at håndtere én enkelt række
function YieldRow({ resId, data }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { defs } = useGameData().data;

  const bareId = resId.replace(/^res\./, '');
  const resDef = defs.res?.[bareId];
  if (!resDef) return null;

  const emoji = resDef.emoji || resDef.icon || '📦';

  return (
    <>
      <div className="item collapsible-item" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="icon">{emoji}</div>
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
            const sourceYieldPerHour = (source.amount / source.period_s) * 3600 * qty;
            return (
              <div className="yield-source-item" key={index}>
                <span>{source.icon} {source.name} {qty > 1 ? `(x${qty})` : ''}</span>
                <span>+{H.fmt(sourceYieldPerHour)} / time</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function PassivYieldsList() {
  const { data } = useGameData();

  const aggregatedYields = useMemo(() => {
    if (!data) return {};
    const aggregated = {};

    const pushSource = (resId, amountPerHour, source) => {
      if (!aggregated[resId]) aggregated[resId] = { total: 0, sources: [] };
      aggregated[resId].total += amountPerHour;
      aggregated[resId].sources.push(source);
    };

    // Eksisterende: buildings / addons / animals
    const process = (items, defs, type) => {
      for (const [id, itemData] of Object.entries(items || {})) {
        const key = id.replace(new RegExp(`^${type}\\.`), '');
        const def = defs[key];
        if (def?.yield && def.yield_period_s > 0) {
          const qty = itemData.quantity || 1; // bld/add = 1, ani = quantity
          def.yield.forEach(y => {
            const resId = String(y.id ?? y.res_id ?? '');
            if (!resId) return;
            const yieldPerHour = (y.amount / def.yield_period_s) * 3600 * qty;
            pushSource(resId, yieldPerHour, {
              name: def.name,
              icon: def.emoji || def.icon || '🏭',
              amount: y.amount,
              period_s: def.yield_period_s,
              quantity: qty,
            });
          });
        }
      }
    };

    const defs = data.defs || {};
    process(data.state?.bld, defs.bld || {}, 'bld');
    process(data.state?.add, defs.add || {}, 'add');
    process(data.state?.ani, defs.ani || {}, 'ani');

    // NYT: Base stage bonus fra defs.stage_bonus_rules + user.bonus_*
    injectBaseStageBonus(aggregated, data);

    return aggregated;
  }, [data]);

  // Sortér på resId
  const sortedYields = Object.entries(aggregatedYields).sort((a, b) => a[0].localeCompare(b[0]));

  return sortedYields.map(([resId, yieldData]) => (
    <YieldRow key={resId} resId={resId} data={yieldData} />
  ));
}