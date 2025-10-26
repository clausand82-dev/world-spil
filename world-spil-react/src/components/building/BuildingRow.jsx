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

/*
  BuildingRow.jsx
  - Uses .item and .item-right classes; left content unchanged.
  - RequirementSummary provides the consistent layout; BuildProgress and ActionButton keep their placeholder behavior.
*/

function BuildingRowInner({ bld, state, defs, requirementCaches }) {
  const def = bld?.def || (defs?.bld ? (defs.bld[(bld.id || '').replace(/^bld\./, '')] || null) : null);

  const { allOk, Component: ReqLine } = useReqAgg(bld);

  const { data } = useGameData();
  const translations = data?.i18n?.current ?? {};

  const hoverContent = useMemo(() => (
    <div style={{ minWidth: 300 }}>
      <StatsEffectsTooltip def={def || bld} translations={translations} />
      <div style={{ height: 8 }} />
      {bld.isMax ? (
        <div style={{ padding: 8, fontWeight: 600 }}>{'Bygningen kan ikke opgraderes mere'}</div>
      ) : (
        <RequirementPanel def={def || bld} defs={defs} state={state} requirementCaches={requirementCaches} isMax={bld.isMax} />
      )}
    </div>
  ), [def, bld, translations, defs, state, requirementCaches]);

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
  const footprint = Number(def?.stats?.footprint ?? 0);

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
            duration={durationVal}
            durationBase={durationBase}
            footprint={footprint}
            footprintOk
          />
        </div>
      </div>

      <div className="item-right">
        <ActionButton item={bld} allOk={allOk} />
        <BuildProgress bldId={bld.id} />
      </div>
    </div>
  ), [bld, image, allOk, price, reqString, durationVal, durationBase, footprint]);

  return (
    <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
      {row}
    </DockHoverCard>
  );
}

export default React.memo(BuildingRowInner);