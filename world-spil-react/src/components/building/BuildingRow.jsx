import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';
import GameImage from '../GameImage.jsx';
import ActionButton from '../ActionButton.jsx';
import BuildProgress from '../BuildProgress.jsx';
import LevelStatus from '../requirements/LevelStatus.jsx';
import { useRequirements as useReqAgg } from '../requirements/Requirements.jsx';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../ui/StatsEffectsTooltip.jsx';
import RequirementPanel from '../requirements/RequirementPanel.jsx';
import RequirementSummary from './RequirementSummary.jsx';
import { requirementInfo, collectActiveBuffs } from '../../services/requirements.js';

/*
  BuildingRow.jsx
  - Use propState first (if provided) then fallback to global game state.
  - footprint semantics:
      * positive footprint => gives space (OK)
      * negative footprint => consumes space (need to check used + |footprint| <= total)
*/

function BuildingRowInner({ bld, state: propState, defs, requirementCaches }) {
  const def = bld?.def || (defs?.bld ? (defs.bld[(bld.id || '').replace(/^bld\./, '')] || null) : null);

  const { allOk } = useReqAgg(bld);

  const { data } = useGameData();
  // prefer caller-provided state (fresh on page) then fallback to global
  const gameState = propState || data?.state || {};

  const translations = data?.i18n?.current ?? {};

  const hoverContent = useMemo(() => (
    <div style={{ minWidth: 300 }}>
      <StatsEffectsTooltip def={def || bld} translations={translations} />
      <div style={{ height: 8 }} />
      {bld.isMax ? (
        <div style={{ padding: 8, fontWeight: 600 }}>{'Bygningen kan ikke opgraderes mere'}</div>
      ) : (
        <RequirementPanel def={def || bld} defs={defs} state={gameState} requirementCaches={requirementCaches} isMax={bld.isMax} />
      )}
    </div>
  ), [def, bld, translations, defs, gameState, requirementCaches]);

  const imgKey = String(bld.id || '').replace(/^bld\./, '').replace(/\.l\d+$/i, '');
  const image = useMemo(() => (
    <GameImage
      src={`/assets/art/${imgKey}.png`}
      fallback="/assets/art/placeholder.medium.png"
      className="bld-thumb"
      width={50}
      height={50}
      style={{ width: 50, height: 50 }}
      loading="lazy"
    />
  ), [imgKey]);

  const price = bld.price || bld.cost || def?.cost || {};
  const reqString = bld.req || bld.require || def?.require || def?.requirements || '';
  const durationVal = Number(bld.duration_s ?? bld.build_time_s ?? def?.duration_s ?? def?.build_time_s ?? 0) || null;
  const durationBase = durationVal;
  const footprint = Number(def?.stats?.footprint ?? def?.footprint ?? 0);

  // compute requirement info using the authoritative gameState (propState preferred)
  const reqInfo = useMemo(() => {
    try {
      const id = bld.id || def?.id || '';
      const caches = { activeBuffs: collectActiveBuffs(defs) };
      return requirementInfo(
        {
          id,
          price: price || {},
          req: reqString || '',
          duration_s: durationVal || 0,
        },
        gameState,
        caches
      );
    } catch (e) {
      console.warn('reqInfo compute failed', e);
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bld.id, def?.id, price, reqString, durationVal, gameState, defs]);

  // FOOTPRINT check now respects sign semantics:
  //  - footprint >= 0  => gives space (OK)
  //  - footprint < 0   => requires space: check used + |footprint| <= total
  const footprintOk = useMemo(() => {
    try {
      const totalFP = Number(data?.cap?.footprint?.total ?? 0);
      const usedFP = Number(data?.cap?.footprint?.used ?? 0);
      if (Number.isNaN(totalFP) || Number.isNaN(usedFP)) return true;
      if (footprint >= 0) {
        // positive footprint gives space -> OK
        return true;
      } else {
        const needed = Math.abs(footprint);
        return (usedFP + needed) <= totalFP;
      }
    } catch (e) {
      return true;
    }
  }, [data?.cap?.footprint?.total, data?.cap?.footprint?.used, footprint]);

  const row = useMemo(() => (
    <div className="item" data-bld-id={bld.id}>
      <div className="icon">{image}</div>
      <div>
        <div className="title">
          <a href={`#/building/${bld.displayLinkId}`} className="link">{bld.displayName}</a>
        </div>
        {bld.displayDesc ? <div className="sub">🛈 {bld.displayDesc}</div> : null}
        <div className="sub" style={{ marginTop: '6px', display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <LevelStatus isOwned={bld.owned} isUpgrade={bld.isUpgrade} ownedMax={bld.ownedMax} stageLocked={bld.stageLocked} stageReq={bld.stageReq} />
          <span> • </span>
          <RequirementSummary
            price={price}
            reqString={reqString}
            duration={reqInfo?.duration?.final_s ?? durationVal}
            durationBase={durationBase}
            footprint={footprint}
            footprintOk={footprintOk}
            // yieldPrice={def?.yield || null}
          />
        </div>
      </div>

      <div className="item-right">
        <ActionButton item={bld} allOk={allOk} />
        <BuildProgress bldId={bld.id} />
      </div>
    </div>
  ), [bld, image, allOk, price, reqString, reqInfo, durationVal, durationBase, footprint, footprintOk]);

  return (
    <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
      {row}
    </DockHoverCard>
  );
}

export default React.memo(BuildingRowInner);