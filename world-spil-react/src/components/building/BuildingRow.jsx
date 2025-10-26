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

function BuildingRowInner({ bld, state, defs, requirementCaches }) {
  // prefer def included on bld object
  const def = bld?.def || (defs?.bld ? (defs.bld[(bld.id || '').replace(/^bld\./, '')] || null) : null);

  const { allOk, Component: ReqLine } = useReqAgg(bld);

  // translations for tooltip labels if available
  const { data } = useGameData();
  const translations = data?.i18n?.current ?? {};

  // memoize hover content so it's stable across parent renders
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

  // memoize image element for this row
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

  const row = useMemo(() => (
    <div className="item" data-bld-id={bld.id}>
      <div className="icon">{image}</div>
      <div>
        <div className="title"><a href={`#/building/${bld.displayLinkId}`} className="link">{bld.displayName}</a></div>
        {bld.displayDesc ? <div className="sub">🛈 {bld.displayDesc}</div> : null}
        <div className="sub" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <LevelStatus isOwned={bld.owned} isUpgrade={bld.isUpgrade} ownedMax={bld.ownedMax} stageLocked={bld.stageLocked} stageReq={bld.stageReq} />
          <span> • </span>
          {!bld.isMax ? <ReqLine showLabels={true} inline={true} /> : null}
        </div>
      </div>
      <div className="right">
        <ActionButton item={bld} allOk={allOk} />
        <BuildProgress bldId={bld.id} />
      </div>
    </div>
  ), [bld, image, allOk, ReqLine]);

  return (
    <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
      {row}
    </DockHoverCard>
  );
}

export default React.memo(BuildingRowInner);