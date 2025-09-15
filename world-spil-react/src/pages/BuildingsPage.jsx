import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import GameImage from '../components/GameImage.jsx';
import ActionButton from '../components/ActionButton.jsx';

/**
 * En "Wrapper"-komponent, der kalder den globale `window.renderReqLine`
 * og viser den rå HTML, den returnerer. Dette garanterer 100% visuel
 * og logisk paritet med din gamle kode.
 */
function LegacyReqLine({ item, options }) {
    if (typeof window.renderReqLine !== 'function') {
        return <div style={{ color: 'red' }}>Fejl: window.renderReqLine mangler.</div>;
    }
    const htmlString = window.renderReqLine(item, options);
    return <span dangerouslySetInnerHTML={{ __html: htmlString }} />;
}

export default function BuildingsPage() {
    const { data, isLoading, error } = useGameData();

    if (isLoading) return <div className="sub">Indlæser bygninger...</div>;
    if (error) return <div className="sub">Fejl ved indlæsning af data.</div>;

    const { defs, state } = data;
    const currentStage = Number(state.user?.currentstage || 0);

    const ownedMaxBySeries = H.computeOwnedMaxBySeries('bld');
    const groups = H.groupDefsBySeriesInStage(defs.bld, currentStage, 'bld');

    return (
        <section className="panel section">
            <div className="section-head">🏗️ Buildings</div>
            <div className="section-body">
                {Object.entries(groups).map(([series, items]) => {
                    // =====================================================================
                    // START: 1:1 OVERSÆTTELSE AF DIN ORIGINALE `buildings.js`-LOGIK
                    // =====================================================================
                    const ownedMax = ownedMaxBySeries[series] || 0;
                    const target = H.pickNextTargetInSeries(items, ownedMax);
                    const family = series.replace(/^bld\./, '');

                    let displayItem, isOwned, isUpgrade, stageLocked = false, displayLevelText = '';
                    let highestOwnedDef = ownedMax > 0 ? items.find(i => i.level === ownedMax)?.def : null;
                    let l1Def = items.find(i => i.level === 1)?.def;

                    // Bestem display navn og link ID baseret på, hvad der findes
                    const displayName = highestOwnedDef?.name || l1Def?.name || family;
                    const displayLinkId = ownedMax > 0 ? `${family}.l${ownedMax}` : `${family}.l1`;

                    if (target) {
                        displayItem = target;
                        isOwned = false;
                        isUpgrade = ownedMax > 0;

                        const nextStageReq = Number(target.def.stage || 0);
                        stageLocked = nextStageReq > currentStage;
                        
                        if (stageLocked) {
                            displayLevelText = `Level ${ownedMax} (<span class="price-bad" title="Kræver Stage ${nextStageReq}">stage låst</span>)`;
                        } else {
                            displayLevelText = ownedMax > 0 ? `Level ${ownedMax} → Level ${ownedMax + 1}` : 'Ikke bygget';
                        }
                    } else {
                        displayItem = items.find(i => i.level === ownedMax) || items[items.length - 1];
                        isOwned = true;
                        isUpgrade = false;
                        displayLevelText = `Level ${ownedMax} (maks)`;
                    }

                    if (!displayItem) return null;

                    // Byg det `item`-objekt, som `renderReqLine` og `ActionButton` forventer
                    const itemForRender = {
                        id: `bld.${displayItem.key}`,
                        def: displayItem.def,
                        level: displayItem.level,
                        price: displayItem.def.cost,
                        req: displayItem.def.require,
                        duration_s: displayItem.def.duration_s,
                        footprintDelta: displayItem.def.stats?.footprint,
                        isOwned, isUpgrade, stageLocked
                    };

                    const reqLineParts = window.renderReqLine ? window.renderReqLine(itemForRender, { returnParts: true }) : { allOk: false };
                    // =====================================================================
                    // SLUT: 1:1 OVERSÆTTELSE
                    // =====================================================================

                    return (
                        <div className="item" key={itemForRender.id}>
                            <div className="icon">
                                <GameImage 
                                    src={`/assets/art/bld.${displayItem.key}.medium.png`}
                                    fallback="/assets/art/placeholder.medium.png"
                                    className="bld-thumb"
                                />
                            </div>
                            <div>
                                <div className="title">
                                    <a href={`#/building/${displayLinkId}`} className="link">{displayName}</a>
                                </div>
                                <div className="sub">{highestOwnedDef?.desc || l1Def?.desc || ''}</div>
                                <div className="sub" style={{marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span dangerouslySetInnerHTML={{ __html: displayLevelText }} />
                                    <LegacyReqLine item={itemForRender} options={{ context: "list", compact: true, showLabels: true }} />
                                </div>
                            </div>
                            <div className="right">
                                <ActionButton item={itemForRender} allOk={reqLineParts.allOk} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}