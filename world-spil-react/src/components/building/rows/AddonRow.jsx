import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo } from '../../../services/requirements.js';

function AddonRow({ entry, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk, ownedLevel, displayLevel } = entry;

  const requirement = requirementInfo(
    {
      id: fullId,
      price: def.cost || {},
      req: def.require || def.req || '',
      duration_s: Number(def.duration_s ?? 0),
      footprintDelta: Number(def.stats?.footprint ?? 0),
    },
    state,
    requirementCaches,
  );

  const actionItem = {
    id: fullId,
    price: def.cost || {},
    req: def.require || def.req || '',
    duration_s: Number(def.duration_s ?? 0),
    footprintDelta: Number(def.stats?.footprint ?? 0),
    isUpgrade: ownedLevel > 0,
    isOwned: ownedLevel >= displayLevel,
    owned: ownedLevel >= displayLevel,
    ownedMax: ownedLevel,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  const durationValue = requirement.duration?.final_s ?? null;
  const durationBase = requirement.duration?.base_s ?? null;
  const hasBuff = durationValue != null && durationBase != null && Math.round(durationValue) !== Math.round(durationBase);
  const durationText = hasBuff ? null : (def.time_str || def.duration_text || null);

  return (
    <div className="item" data-addon-row={fullId}>
      <div className="icon">{def.icon || '🧩'}</div>
      <div className="grow">
        <div className="title">
          {def.name || fullId}
          {!stageOk && (
            <span className="badge stage-locked price-bad" title={`Kræver Stage ${stageReq}`} style={{ marginLeft: 8 }}>
              Stage locked
            </span>
          )}
        </div>
        {def.desc ? <div className="sub">🔍 {def.desc}</div> : null}
        <RequirementSummary
          price={def.cost || {}}
          reqString={requirement.reqString}
          duration={durationValue}
          durationBase={durationBase}
          durationText={durationText}
          footprint={Number(def.stats?.footprint ?? 0)}
          footprintOk={requirement.footprintOk}
        />
      </div>
      <div className="right">
        {!baseOwned ? (
          <button className="btn" disabled>Kræver bygning</button>
        ) : (
          <>
            <ActionButton item={actionItem} allOk={requirement.allOk && stageOk} />
            <BuildProgress bldId={fullId} />
          </>
        )}
      </div>
    </div>
  );
}

export default AddonRow;
