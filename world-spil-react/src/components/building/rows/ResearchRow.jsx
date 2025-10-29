import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo } from '../../../services/requirements.js';
import DockHoverCard from '../../../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../../ui/StatsEffectsTooltip.jsx';
import Icon from '../../ui/Icon.jsx';
import { useT } from "../../../services/i18n.js";
import { useGameData } from '../../../context/GameDataContext.jsx';
import RequirementPanel from '../../../components/requirements/RequirementPanel.jsx';

/*
  ResearchRow

  - Matcher systemet som addon/recipe/building rows:
    * Vi RENDERER ActionButton + BuildProgress for research-items (når item ikke er 'owned').
    * ActionButton internt håndterer 'active' (Cancel) via useActiveBuildFlag og lokal optimisme,
      så ResearchRow behøver ikke importere activeBuildsStore.js direkte.
    * Requirement-beregninger og RequirementPanel er uændrede.
  - Fordel: samme adfærd som addon/recipe — efter et start-kald vil ActionButton/ActiveBuilds sørge
    for at vise Cancel + progress, og UI vil ikke flippe til "Need more" selvom ressourcer blev trukket.
*/

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

  // allOk: hvad vi sender til ActionButton (samme contract som andre rækker)
  const allOk = Boolean(requirement.allOk && stageOk);

  return (
    <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
      <div className="item" data-research-row={fullId}>
        <div className="icon" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundImage: "url('/assets/icons/rsd_bg.png')",
              backgroundSize: '36px 36px',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          >
            {def?.iconUrl ? (
              <div style={{ position: 'absolute', zIndex: 2, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon src={def.iconUrl} size={32} alt={def?.name || fullId} />
              </div>
            ) : (
              <div style={{ position: 'absolute', zIndex: 2, fontSize: 18 }}>
                {t("ui.emoji.research.h1")}
              </div>
            )}
          </div>
        </div>

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
            footprintOverrideWhenIrrelevant={'Ikke relevant'}
          />
        </div>

        <div className="right">
          {/* Prioritering: owned badge først (som før) */}
          {actionItem.owned ? (
            <span className="badge owned" title={t("ui.text.research.completed.h1") || 'Fuldført'}>✓ {t("ui.text.owned.h1") || 'Ejet'}</span>
          ) : (
            /*
              Her følger samme rendering som addon/recipe/building rows:
              - ActionButton får allOk (så den internt kan vise Cancel, stage-locked, owned, osv.)
              - BuildProgress vises ved siden af (den er en placeholder når ikke-aktiv, så layout er stabilt)
              Dette sikrer Cancel-knap og konsistent adfærd uden at importere activeBuildsStore direkte.
            */
            <>
              <ActionButton item={actionItem} allOk={allOk} />
              <BuildProgress bldId={fullId} />
            </>
          )}
        </div>
      </div>
    </DockHoverCard>
  );
}

export default ResearchRow;