import React, { useState, useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';


// En lille under-komponent til at håndtere én enkelt række
function YieldRow({ resId, data }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { defs } = useGameData().data;

    const resDef = defs.res?.[resId.replace(/^res\./, '')];
    if (!resDef) return null;

    return (
        <>
            <div className="item collapsible-item" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="icon">{resDef.emoji}</div>
                <div className="grow"><div className="title">{resDef.name}</div></div>
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
                                <span>{source.icon} {source.name} {qty > 1 ? `(x${qty})`:''}</span>
                                <span>+{H.fmt(sourceYieldPerHour)} / time</span>
                            </div>
                         );
                    })}
                </div>
            )}
        </>
    );
}

export default function PassiveYieldList() {
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
                    const qty = itemData.quantity || 1;
                    def.yield.forEach(y => {
                        const yieldPerHour = (y.amount / def.yield_period_s) * 3600 * qty;
                        pushSource(y.id, yieldPerHour, {
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

        // Base stage bonus
        const user = data.state?.user || {};
        const stageId =
            user.currentstage ??
            user.stage ??
            data.state?.currentstage ??
            data.state?.stage ??
            1;

        const rules = defs.stage_bonus_rules?.[stageId] || {};

        // Fallbacks: bonus_* eller legacy felter
        const bonuses = {
            forest: Number(user.bonus_forest ?? user.forest ?? 0),
            mining: Number(user.bonus_mining ?? user.mining ?? 0),
            field:  Number(user.bonus_field  ?? user.field  ?? 0),
            water:  Number(user.bonus_water  ?? user.water  ?? 0),
        };

        const label = {
            forest: 'Base bonus (Forest)',
            mining: 'Base bonus (Mining)',
            field:  'Base bonus (Field)',
            water:  'Base bonus (Water)',
        };
        const icon = { forest:'🌲', mining:'⛏️', field:'🌾', water:'💧' };

        for (const [key, amt] of Object.entries(bonuses)) {
            if (!amt) continue;
            for (const resId of rules[key] || []) {
                // +N/time → modelér som amount=N per 3600s
                pushSource(resId, amt, {
                    name: label[key],
                    icon: icon[key],
                    amount: amt,
                    period_s: 3600,
                    quantity: 1,
                });
            }
        }

        return aggregated;
    }, [data]);

    const sortedYields = Object.entries(aggregatedYields).sort();

    return sortedYields.map(([resId, yieldData]) => (
        <YieldRow key={resId} resId={resId} data={yieldData} />
    ));
}