import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo, /*formatCost,*/ getCostTokens } from '../../../services/requirements.js';
import Icon from '../../common/Icon.jsx';
import * as H from '../../../services/helpers.js';
import { useT } from "../../../services/i18n.js";
import DockHoverCard from '../../../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../../ui/StatsEffectsTooltip.jsx';
import RequirementPanel from '../../../components/requirements/RequirementPanel.jsx';
import { useGameData } from '../../../context/GameDataContext.jsx';

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

function renderTokensAsNodes(tokens) {
  if (!tokens || !tokens.length) return null;
  return tokens.map((t, idx) => (
    <span key={`${t.id}-${idx}`} style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.prefix}{t.amount}</span>
      {t.icon?.iconUrl ? (
        <Icon iconUrl={t.icon.iconUrl} alt={t.icon.name} size="0.95em" />
      ) : t.icon?.emoji ? (
        <span style={{ fontSize: '0.95em', lineHeight: 1 }}>{t.icon.emoji}</span>
      ) : null}
      {idx < tokens.length - 1 ? <span style={{ marginLeft: 6, marginRight: 6, opacity: 0.65 }}>•</span> : null}
    </span>
  ));
}

function RecipeRow({ entry, defs: passedDefs, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk } = entry;
  const t = useT();
  const { data } = useGameData();
  const defs = passedDefs || data?.defs || {};
  const translations = data?.i18n?.current ?? {};

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
    // Use buffed/final duration from requirementInfo when available
    duration_s: Number(requirement?.duration?.final_s ?? Number(def.duration_s ?? 0)),
    isUpgrade: entry.level > 1,
    isOwned: false,
    owned: false,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  // NY: brug tokens + JSX i stedet for tekst-formatteren
  const inputTokens = getCostTokens(def.cost || {}, defs, '-');
  const outputTokens = getCostTokens(def.yield || {}, defs, '+');

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

  // Hover content: Stats + RequirementPanel
  const hoverContent = (
    <div style={{ minWidth: 300 }}>
      <StatsEffectsTooltip def={def} translations={translations} />
      <div style={{ height: 8 }} />
      <RequirementPanel def={def} defs={defs} state={state} requirementCaches={requirementCaches} />
    </div>
  );

  const row = (

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
          <div className="sub">
            {t("ui.emoji.recipe.h1")} {t("ui.text.recipe.h1")}:&nbsp;
            {renderTokensAsNodes(inputTokens) || <em>-</em>}
            &nbsp;·&nbsp;
            {renderTokensAsNodes(outputTokens) || <em>-</em>}
          </div>
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

   return (
      <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
        {row}
      </DockHoverCard>
    );

}

export default RecipeRow;