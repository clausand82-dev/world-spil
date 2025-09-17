import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo, formatCost } from '../../../services/requirements.js';
import { useT } from "../../../services/i18n.js";

function RecipeRow({ entry, defs, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk } = entry;
  const t = useT();
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
      <div className="icon">{t("ui.emoji.research.h1")}</div>
      <div className="grow">
        <div className="title">
          {def.name || fullId}
          {!stageOk && (
            <span className="badge stage-locked price-bad" title={`${t("ui.text.demandingstage.h1")} ${stageReq}`} style={{ marginLeft: 8 }}>
              {t("ui.text.stagelocked.h1")}
            </span>
          )}
        </div>
        {def.desc ? <div className="sub">🔍 {def.desc}</div> : null}
        <div className="sub">{t("ui.emoji.recipe.h1")} {t("ui.text.recipe.h1")}: {inputs || '-'} ? {outputs || '-'}</div>
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
          <button className="btn" disabled>{t("ui.btn.demandbuilding.h1")}</button>
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
