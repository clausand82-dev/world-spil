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
                         const sourceYieldPerHour = (source.amount / source.period_s) * 3600 * source.quantity;
                         return (
                            <div className="yield-source-item" key={index}>
                                <span>{source.icon} {source.name} {source.quantity > 1 ? `(x${source.quantity})`:''}</span>
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
        const process = (items, defs, type) => {
            for (const [id, itemData] of Object.entries(items || {})) {
                const key = id.replace(new RegExp(`^${type}\\.`), '');
                const def = defs[key];
                if (def?.yield && def.yield_period_s > 0) {
                    const qty = itemData.quantity || 1;
                    def.yield.forEach(y => {
                        const yieldPerHour = (y.amount / def.yield_period_s) * 3600 * qty;
                        if (!aggregated[y.id]) aggregated[y.id] = { total: 0, sources: [] };
                        aggregated[y.id].total += yieldPerHour;
                        aggregated[y.id].sources.push({ name: def.name, icon: def.emoji || def.icon, amount: y.amount, period_s: def.yield_period_s, quantity: qty });
                    });
                }
            }
        };
        process(data.state.bld, data.defs.bld, 'bld');
        process(data.state.add, data.defs.add, 'add');
        process(data.state.ani, data.defs.ani, 'ani');
        return aggregated;
    }, [data]);

    const sortedYields = Object.entries(aggregatedYields).sort();

    return sortedYields.map(([resId, yieldData]) => (
        <YieldRow key={resId} resId={resId} data={yieldData} />
    ));
}