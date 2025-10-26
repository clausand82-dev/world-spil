import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import { collectActiveBuffs } from '../services/requirements.js';
import BuildingRow from '../components/building/BuildingRow.jsx';

function computeOwnedMaxBySeriesFromState(state, stateKey = 'bld') {
    const bySeries = {};
    const source = state?.[stateKey] || {};
    for (const key of Object.keys(source)) {
        const m = key.match(new RegExp(`^${stateKey}\\.(.+)\\.l(\\\d+)$`));
        if (!m) continue;
        const series = `${stateKey}.${m[1]}`;
        const level = Number(m[2]);
        bySeries[series] = Math.max(bySeries[series] || 0, level);
    }
    return bySeries;
}

export default function BuildingsPage() {
    const { data, isLoading, error } = useGameData();
    if (isLoading) return <div className="sub">Indlæser...</div>;
    if (error) return <div className="sub">Fejl.</div>;
    const { defs, state } = data;

    // requirementCaches: memoize so we don't recompute active buffs on every render
    const requirementCaches = React.useMemo(() => ({ activeBuffs: collectActiveBuffs(defs) }), [defs]);

    const currentStage = Number(state.user?.currentstage || state.user?.stage || 0);
    const ownedMaxBySeries = React.useMemo(() => computeOwnedMaxBySeriesFromState(state, 'bld'), [state]);

    // groupDefsBySeriesInStage kan være tung; grupper og fabriker bldList kun når defs/state ændrer sig
    const bldList = React.useMemo(() => {
        const groups = H.groupDefsBySeriesInStage(defs.bld, currentStage, 'bld');
        const out = [];

        for (const [series, items] of Object.entries(groups)) {
            const ownedMax = ownedMaxBySeries[series] || 0;
            const target = H.pickNextTargetInSeries(items, ownedMax);
            const family = series.replace(/^bld\./, '');

            const ownedDef = ownedMax > 0
                ? (defs.bld[`${family}.l${ownedMax}`] || items.find(x => x.level === ownedMax)?.def)
                : null;
            const l1Def = defs.bld[`${family}.l1`];

            const displayName = (ownedDef?.name) || (l1Def?.name) || (target?.def?.name) || family;
            const displayDesc = (ownedDef?.desc) || (l1Def?.desc) || '';
            const displayLinkId = ownedMax > 0 ? `bld.${family}.l${ownedMax}` : `bld.${family}.l1`;

            const nextDefKey = `${family}.l${(ownedMax || 0) + 1}`;
            const nextDefAll = defs.bld[nextDefKey];
            const nextReqStage = Number(nextDefAll?.stage ?? nextDefAll?.stage_required ?? 0);

            let displayLevelText = '';
            let stageLocked = false;
            if (ownedMax <= 0) {
                displayLevelText = 'Ikke bygget';
            } else if (!nextDefAll) {
                displayLevelText = `Level ${ownedMax} (maks)`;
            } else {
                if (!nextReqStage || nextReqStage <= currentStage) {
                    displayLevelText = `Level ${ownedMax} → Level ${ownedMax + 1}`;
                } else {
                    stageLocked = true;
                    displayLevelText = `Level ${ownedMax} (stage låst)`;
                }
            }

            if (!target) {
                const top = items[items.length - 1];
                out.push({
                    id: `bld.${top.key}`,
                    name: target?.def?.name || top?.def?.name || family,
                    level: Math.max(ownedMax, top.level),
                    owned: true,
                    isUpgrade: false,
                    isMax: true,
                    price: {},
                    req: top.def?.require || '',
                    duration_s: Number(top.def?.duration_s ?? 0),
                    displayName,
                    displayDesc,
                    displayLinkId,
                    displayLevelText,
                    stageLocked,
                    stageReq: nextReqStage || 0,
                    desc: top.def?.desc || '',
                    yield: top.def?.yield || [],
                    durability: top.def?.durability || 0,
                    footprintDelta: top.def?.stats?.footprint || 0,
                    animalCapDelta: top.def?.stats?.animalCap || 0,
                    ownedMax,
                    def: top.def || null,
                });
                continue;
            }

            const fullId = `bld.${target.key}`;
            const price = H.normalizePrice(target.def?.cost || target.def?.price || {});
            const stageOk = !nextReqStage || nextReqStage <= currentStage;

            out.push({
                id: fullId,
                name: target.def?.name || target.key,
                level: target.level,
                owned: false,
                isUpgrade: ownedMax > 0,
                price,
                req: target.def?.require || target.def?.req || '',
                duration_s: Number(target.def?.duration_s ?? 10),
                displayName,
                displayDesc,
                displayLinkId,
                displayLevelText,
                stageLocked: !stageOk && !!nextReqStage,
                stageReq: nextReqStage || 0,
                desc: target.def?.desc || '',
                yield: target.def?.yield || [],
                durability: target.def?.durability || 0,
                footprintDelta: target.def?.stats?.footprint || 0,
                animalCapDelta: target.def?.stats?.animalCap || 0,
                ownedMax,
                def: target.def || null,
            });
        }

        return out;
    }, [defs, currentStage, ownedMaxBySeries]);

    return (
        <section className="panel section">
            <div className="section-head">🏗 Buildings</div>
            <div className="section-body">
                {bldList.map((bld) => (
                    <BuildingRow key={bld.id} bld={bld} state={state} defs={defs} requirementCaches={requirementCaches} />
                ))}
            </div>
        </section>
    );
}