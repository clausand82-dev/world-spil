import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo, formatCost } from '../../../services/requirements.js';
import * as H from '../../../services/helpers.js';
import { useT } from "../../../services/i18n.js";

function computeYieldSpace(def, defs) {
  // Summer samlet pladsbehov pr. type ud fra recipe-yield
  const map = H.normalizePrice(def?.yield || {});
  let solid = 0, liquid = 0;

  for (const entry of Object.values(map)) {
    const id = String(entry.id || '');
    if (!id.startsWith('res.')) continue;

    const key = id.replace(/^res\./, '');
    const rDef = defs.res?.[key];
    if (!rDef) continue;

    const unitSpace = Number(rDef.unitSpace || 0);
    if (unitSpace <= 0) continue; // gratis, fylder ikke

    const amount = Number(entry.amount || 0);
    if (amount <= 0) continue;

    const unit = String(rDef.unit || '').toLowerCase();
    const addSpace = unitSpace * amount;
    if (unit === 'l') liquid += addSpace;
    else solid += addSpace;
  }

  return { solid, liquid };
}

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

  // NYT: Pladstjek for outputs
  const { solid: needSolid, liquid: needLiquid } = computeYieldSpace(def, defs);
  const capSolid = state?.cap?.solid || { total: 0, used: 0 };
  const capLiquid = state?.cap?.liquid || { total: 0, used: 0 };
  const availSolid = Math.max(0, (capSolid.total || 0) - (capSolid.used || 0));
  const availLiquid = Math.max(0, (capLiquid.total || 0) - (capLiquid.used || 0));

  const spaceOk = (needSolid <= availSolid) && (needLiquid <= availLiquid);
  const allOk = requirement.allOk && stageOk && spaceOk;

  // Hjælpetekst når pladsen mangler (valgfrit)
  const spaceTitle = !spaceOk
    ? `Mangler plads: Solid +${needSolid} (tilgængelig ${availSolid}), Liquid +${needLiquid} (tilgængelig ${availLiquid})`
    : undefined;

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
        <div className="sub">{t("ui.emoji.recipe.h1")} {t("ui.text.recipe.h1")}: {inputs || '-'} · {outputs || '-'}</div>
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
        ) : !spaceOk ? (
          <>
            <button className="btn" disabled title={spaceTitle}>Mangler plads</button>
            <BuildProgress bldId={fullId} />
          </>
        ) : (
          <>
            <ActionButton item={actionItem} allOk={allOk} />
            <BuildProgress bldId={fullId} />
          </>
        )}
      </div>
    </div>
  );
}

export default RecipeRow;