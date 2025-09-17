import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import GameImage from '../components/GameImage.jsx';
import ActionButton from '../components/ActionButton.jsx';
import BuildProgress from '../components/BuildProgress.jsx';
import LevelStatus from '../components/requirements/LevelStatus.jsx';
import { useRequirements as useReqAgg } from '../components/requirements/Requirements.jsx';

/*function _page_canAfford(price, state) {
    for (const item of Object.values(H.normalizePrice(price))) {
        let have = 0;
        if (item.id.startsWith('ani.')) have = state.ani?.[item.id]?.quantity ?? 0;
        else { const key = item.id.replace(/^res\./, ''); have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0; }
        if (have < item.amount) return { ok: false };
    }
    return { ok: true };
}*/
function hasResearchInState(state, rsdIdFull) {
    if (!rsdIdFull) return false;
    const key = String(rsdIdFull).replace(/^rsd\./, '');
    return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[rsdIdFull]);
}
/*function _page_isReqSatisfied(reqId, state) {
    if (reqId.startsWith('bld.')) { const p = H.parseBldKey(reqId); return p ? (computeOwnedMaxBySeriesFromState(state, 'bld')[p.series] || 0) >= p.level : false; }
    if (reqId.startsWith('rsd.')) return hasResearchInState(state, reqId);
    if (reqId.startsWith('add.')) { const m = reqId.match(/^add\.(.+)\.l(\d+)$/); return m ? (computeOwnedMaxBySeriesFromState(state, 'add')[`add.${m[1]}`] || 0) >= Number(m[2]) : false; }
    return false;
}*/

// Compute owned max per series from provided state (not window)
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

function BuildingRow({ bld, state }) {
    const { allOk, Component: ReqLine } = useReqAgg(bld);

    return (
        <div className="item" data-bld-id={bld.id}>
            <div className="icon">
                <GameImage src={`/assets/art/${bld.id}.medium.png`} fallback="/assets/art/placeholder.medium.png" className="bld-thumb" width={50} height={50} style={{ width: 50, height: 50, borderRadius: '6px', border: '1px solid var(--border)' }} />
            </div>
            <div>
                <div className="title"><a href={`#/building/${bld.displayLinkId}`} className="link">{bld.displayName}</a></div>
                {bld.displayDesc ? <div className="sub">🛈 {bld.displayDesc}</div> : null}
                <div className="sub" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <LevelStatus isOwned={bld.owned} isUpgrade={bld.isUpgrade} ownedMax={bld.ownedMax} stageLocked={bld.stageLocked} stageReq={bld.stageReq} />
                    <span> • </span>
                    <ReqLine showLabels={true} inline={true} />
                </div>
            </div>
            <div className="right">
                <ActionButton item={bld} allOk={allOk} />
                <BuildProgress bldId={bld.id} />
            </div>
        </div>
    );
}

export default function BuildingsPage() {
    const { data, isLoading, error } = useGameData();
    if (isLoading) return <div className="sub">Indlæser...</div>;
    if (error) return <div className="sub">Fejl.</div>;
    const { defs, state } = data;
    const currentStage = Number(state.user?.currentstage || state.user?.stage || 0);
    const ownedMaxBySeries = computeOwnedMaxBySeriesFromState(state, 'bld');
    const groups = H.groupDefsBySeriesInStage(defs.bld, currentStage, 'bld');

    const bldList = [];
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
            bldList.push({
                id: `bld.${top.key}`,
                name: target?.def?.name || top?.def?.name || family,
                level: Math.max(ownedMax, top.level),
                owned: true,
                isUpgrade: false,
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
                ownedMax
            });
            continue;
        }

        const fullId = `bld.${target.key}`;
        const price = H.normalizePrice(target.def?.cost || target.def?.price || {});
        const stageOk = !nextReqStage || nextReqStage <= currentStage;

        bldList.push({
            id: fullId,
            name: target.def?.name || target.key,
            level: target.level,
            owned: false,
            isUpgrade: ownedMax > 0,
            price,
            req: target.def?.require || '',
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
            ownedMax
        });
    }

    return (
        <section className="panel section">
            <div className="section-head">🧱 Buildings</div>
            <div className="section-body">
                {bldList.map((bld) => (
                    <BuildingRow key={bld.id} bld={bld} state={state} />
                ))}
            </div>
        </section>
    );
}
