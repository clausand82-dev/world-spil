import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo } from '../../../services/requirements.js';
import DockHoverCard from '../../../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../../ui/StatsEffectsTooltip.jsx';
import { useT } from "../../../services/i18n.js";
import { useGameData } from '../../../context/GameDataContext.jsx';
import RequirementPanel from '../../../components/requirements/RequirementPanel.jsx';

function ResearchRow({ entry, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk, ownedLevel, displayLevel, isMax } = entry;
  const t = useT();

  const { data } = useGameData();
  const defs = data?.defs || {};
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
    duration_s: Number(def.duration_s ?? 0),
    isUpgrade: displayLevel > 1,
    isOwned: ownedLevel >= displayLevel,
    owned: ownedLevel >= displayLevel,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  const durationValue = requirement.duration?.final_s ?? null;
  const durationBase = requirement.duration?.base_s ?? null;
  const hasBuff = durationValue != null && durationBase != null && Math.round(durationValue) !== Math.round(durationBase);
  const durationText = hasBuff ? null : (def.time_str || def.duration_text || null);

  // Hover: show StatsEffectsTooltip + RequirementPanel (or max-text if isMax)
  const hoverContent = (
    <div style={{ minWidth: 300 }}>
      <StatsEffectsTooltip def={def} translations={translations} />
      <div style={{ height: 8 }} />
      {isMax ? (
        <div style={{ padding: 8, fontWeight: 600 }}>{t("ui.text.maxlevel.h1") || 'Forskningen kan ikke opgraderes mere'}</div>
      ) : (
        <RequirementPanel def={def} defs={defs} state={state} requirementCaches={requirementCaches} />
      )}
    </div>
  );

  const row = (
    <div className="item" data-research-row={fullId}>
      <div className="icon">{t("ui.emoji.research.h1")}</div>
      <div className="grow">
        <div className="title">
          {def.name || fullId}
          {!stageOk && (
            <span
              className="badge stage-locked price-bad"
              title={`${t("ui.text.demandingstage.h1")} ${stageReq}`}
              style={{ marginLeft: 8 }}
            >
              {t("ui.text.stagelocked.h1")}
            </span>
          )}
        </div>
        {def.desc ? <div className="sub">{t("ui.emoji.info.h1")} {def.desc}</div> : null}
        <RequirementSummary
          price={def.cost || {}}
          reqString={requirement.reqString}
          duration={durationValue}
          durationBase={durationBase}
          durationText={durationText}
          footprint={0}
          footprintOk
        />
      </div>
      <div className="right">
        {/* NY LOGIK: hvis allerede ejet, vis Ejet-badge først */}
        {actionItem.owned ? (
          <span className="badge owned" title={t("ui.text.research.completed.h1") || 'Fuldført'}>✓ {t("ui.text.owned.h1") || 'Ejet'}</span>
        ) : (requirement.allOk && stageOk) ? (
          <>
            <ActionButton item={actionItem} allOk={true} />
            <BuildProgress bldId={fullId} />
          </>
        ) : (
          <button
            className="btn"
            disabled
            title={requirement.reqString || t("ui.btn.needmore.h1")}
          >
            {t("ui.btn.needmore.h1")}
          </button>
        )}
      </div>
    </div>
  );

  // Docked hover nederst højre – fylder hele rækken
  return (
    <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
      {row}
    </DockHoverCard>
  );
}

export default ResearchRow;