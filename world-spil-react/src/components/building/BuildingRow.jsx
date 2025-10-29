import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { normalizeFootprintState } from '../../services/helpers.js';
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

  // hoverContent oprettes senere (efter footprint/footprintOk) så vi kan sende de samme værdier som rækken

  const imgKey = String(bld.id || '').replace(/^bld\./, '').replace(/\.l\d+$/i, '');
  const image = useMemo(() => (
    <GameImage
      src={`/assets/art/${imgKey}.png`}
      fallback="/assets/art/placeholder.medium.png"
      className="bld-thumb"
      width={32}
      height={32}
      style={{ width: 32, height: 32 }}
      loading="lazy"
    />
  ), [imgKey]);

  const price = bld.price || bld.cost || def?.cost || {};
  const reqString = bld.req || bld.require || def?.require || def?.requirements || '';
  const durationVal = Number(bld.duration_s ?? bld.build_time_s ?? def?.duration_s ?? def?.build_time_s ?? 0) || null;
  const durationBase = durationVal;
  // footprint: fallback bld override -> def.stats -> def. Semantik: + gives space, - consumes space
  const footprint = Number(bld?.footprint ?? def?.stats?.footprint ?? def?.footprint ?? 0);

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

  // normaliser cap-objektet (brug backend state-objekt direkte)
  const { total, usedRaw, consumed, available } = normalizeFootprintState(gameState?.cap?.footprint ?? {});

  const footprintOk = useMemo(() => {
    if (Number(footprint) >= 0) return true;
    const needed = Math.abs(Number(footprint));
    return (consumed + needed) <= total;
  }, [total, consumed, footprint]);

  const footprintDebug = `RawTotal: ${gameState?.cap?.footprint?.total} • RawUsed: ${usedRaw} • Total: ${total} • Consumed: ${consumed} • Available: ${available} • Footprint: ${footprint} • Needed: ${Math.abs(footprint)} • OK: ${footprintOk ? 'yes' : 'no'}`;

  // hoverContent defineres nu efter footprint/footprintOk så samme tjek bruges i hover
  const hoverContent = useMemo(() => (
    <div style={{ minWidth: 300 }}>
      <StatsEffectsTooltip def={def || bld} translations={translations} />
      <div style={{ height: 8 }} />
      {bld.isMax ? (
        <div style={{ padding: 8, fontWeight: 600 }}>{'Bygningen kan ikke opgraderes mere'}</div>
      ) : (
        <RequirementPanel
          def={def || bld}
          defs={defs}
          state={gameState}
          requirementCaches={requirementCaches}
          isMax={bld.isMax}
          footprint={footprint}
          footprintOk={footprintOk}
          footprintDebug={footprintDebug}
        />
      )}
    </div>
  ), [def, bld, translations, defs, gameState, requirementCaches, footprint, footprintOk, footprintDebug]);

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
            footprintDebug={footprintDebug}
            isMaxBuilt={!!bld.isMax}
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