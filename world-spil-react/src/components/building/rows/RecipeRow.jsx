import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo, formatCost } from '../../../services/requirements.js';

function RecipeRow({ entry, defs, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk } = entry;

  const requirement = requirementInfo(
    {
      id: fullId,
      price: def.cost || {},
      req: def.require || def.req || '',
      duration_s: Number(def.duration_s ?? 0),
    },
    state,
    requirementCaches,
  );

  const actionItem = {
    id: fullId,
    price: def.cost || {},
    req: def.require || def.req || '',
    duration_s: Number(def.duration_s ?? 0),
    isUpgrade: entry.level > 1,
    isOwned: false,
    owned: false,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  const inputs = formatCost(def.cost || {}, defs, '-');
  const outputs = formatCost(def.yield || {}, defs, '+');
  const durationValue = requirement.duration?.final_s ?? null;
  const durationBase = requirement.duration?.base_s ?? null;

  return (
    <div className="item" data-recipe-row={fullId}>
      <div className="icon">🧪</div>
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
        <div className="sub">🧾 Recipe: {inputs || '-'} ? {outputs || '-'}</div>
        <RequirementSummary
          price={def.cost || {}}
          reqString={requirement.reqString}
          duration={durationValue}
          durationBase={durationBase}
          footprint={0}
          footprintOk
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

export default RecipeRow;
