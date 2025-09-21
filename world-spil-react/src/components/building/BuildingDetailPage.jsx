import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { parseBldKey } from '../../services/helpers.js';

import BuildingHero from './BuildingHero.jsx';
import BuildingActions from './BuildingActions.jsx';
import AddonsTab from './tabs/AddonsTab.jsx';
import ResearchTab from './tabs/ResearchTab.jsx';
import RecipesTab from './tabs/RecipesTab.jsx';
import SpecialTab from './tabs/SpecialTab.jsx';
import { useT } from "../../services/i18n.js";

import { computeOwnedMap, requirementInfo, collectActiveBuffs, computeResearchOwned } from '../../services/requirements.js';

const DETAIL_TABS = ['addons', 'research', 'recipes', 'special'];

function canonicalizeBuildingId(param) {
  if (!param) return null;
  return param.startsWith('bld.') ? param : `bld.${param}`;
}

function BuildingDetailPage({ buildingId }) {
  const { data } = useGameData();
  const t = useT();

  if (!data) {
    return <div className="panel section"><div className="section-body"><div className="sub">Loading…</div></div></div>;
  }

  const { defs, state } = data;

  const canonicalId = canonicalizeBuildingId(buildingId);
  const defKey = canonicalId ? canonicalId.replace(/^bld\./, '') : null;
  const heroDef = defKey ? defs.bld?.[defKey] : null;

  const parsed = canonicalId ? parseBldKey(canonicalId) : null;
  const family = parsed?.family ?? defKey?.replace(/\.l\d+$/, '');
  const series = parsed?.series ?? (family ? `bld.${family}` : null);

  const ownedBuildings = useMemo(() => computeOwnedMap(state.bld || {}), [state.bld]);
  const ownedAddons = useMemo(() => computeOwnedMap(state.add || {}), [state.add]);
  const ownedResearch = useMemo(() => computeResearchOwned(state), [state]);
  const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);

  const requirementCaches = useMemo(
    () => ({ ownedBuildings, ownedAddons, ownedResearch, activeBuffs }),
    [ownedBuildings, ownedAddons, ownedResearch, activeBuffs]
  );

  const activeJobs = useMemo(() => {
    const map = Object.create(null);
    const running = data?.state?.jobs?.running || [];
    for (const job of running) map[job.bld_id] = job;
    return map;
  }, [data?.state?.jobs?.running]);

  const currentStage = Number(state.user?.currentstage ?? state.user?.stage ?? 0);

  const ownedMax = series ? (ownedBuildings[series] || 0) : 0;
  const baseOwned = ownedMax > 0;

  const firstLevelKey = family ? `${family}.l1` : null;
  const nextLevelKey = family ? `${family}.l${ownedMax + 1}` : null;
  const actionKey = baseOwned ? nextLevelKey : firstLevelKey;
  const actionDef = actionKey ? defs.bld?.[actionKey] : null;
  const actionStageReq = Number(actionDef?.stage ?? actionDef?.stage_required ?? 0);
  const actionStageOk = !actionDef || actionStageReq <= currentStage;

  const actionRequirement = requirementInfo(
    actionDef
      ? {
          id: `bld.${actionKey}`,
          price: actionDef.cost || actionDef.price || {},
          req: actionDef.require || actionDef.req || '',
          duration_s: Number(actionDef.duration_s ?? actionDef.build_time_s ?? actionDef.stats?.build_time_s ?? 0),
          footprintDelta: Number(actionDef.stats?.footprint ?? 0),
        }
      : null,
    state,
    requirementCaches
  );

  const actionItem = actionDef
    ? {
        id: `bld.${actionKey}`,
        price: actionDef.cost || actionDef.price || {},
        req: actionDef.require || actionDef.req || '',
        duration_s: Number(actionDef.duration_s ?? actionDef.build_time_s ?? actionDef.stats?.build_time_s ?? 0),
        footprintDelta: Number(actionDef.stats?.footprint ?? 0),
        isUpgrade: baseOwned,
        isOwned: false,
        owned: false,
        ownedMax,
        stageLocked: !actionStageOk,
        stageReq: actionStageReq,
        def: actionDef,
      }
    : baseOwned
      ? { id: canonicalId, isOwned: true, owned: true, def: heroDef }
      : null;

  const stageFootprint = Number(actionDef?.stats?.footprint ?? 0);
  const heroId = canonicalId || (family ? `bld.${family}.l1` : 'unknown');

  // Nuværende level-id og række
  const ownedId = baseOwned ? `bld.${family}.l${ownedMax}` : (canonicalId || (family ? `bld.${family}.l1` : ''));
  const ownedRow = ownedId ? (state.bld?.[ownedId] || {}) : {};
  const durabilityMax = Number(heroDef?.durability ?? 0);
  const durabilityPctFromState = Number.isFinite(ownedRow?.durability_pct) ? Number(ownedRow.durability_pct) : null;
  const durabilityCurrentAbs = Number(ownedRow?.durability ?? NaN);

  // DURABILITY UDREGNING
  const durabilityPct = durabilityPctFromState != null
    ? durabilityPctFromState
    : (durabilityMax > 0 && Number.isFinite(durabilityCurrentAbs))
      ? Math.max(0, Math.min(100, Math.round((durabilityCurrentAbs / durabilityMax) * 100)))
      : 0;
      console.log(durabilityPct);

  const footprintText = `${((heroDef?.stats?.footprint ?? 0) >= 0 ? '+' : '')}${heroDef?.stats?.footprint ?? 0} Byggepoint`;
  const animalCapText = `${((heroDef?.stats?.animalCap ?? 0) >= 0 ? '+' : '')}${heroDef?.stats?.animalCap ?? 0} Staldplads`;

  const actionFullId = actionItem && actionItem.id.startsWith('bld.') ? actionItem.id : null;
  const currentFullId = ownedId || null;
  const jobActiveId = (actionFullId && activeJobs[actionFullId])
    ? actionFullId
    : (currentFullId && activeJobs[currentFullId] ? currentFullId : null);

  // Nuværende level-def til repair-estimat
  const currentLevelKey = baseOwned ? `${family}.l${ownedMax}` : null;
  const currentLevelDef = currentLevelKey ? defs.bld?.[currentLevelKey] : null;
  const repairBasePrice = currentLevelDef?.cost || currentLevelDef?.price || heroDef?.cost || heroDef?.price || {};

  const [activeTab, setActiveTab] = useState(DETAIL_TABS[0]);
  const [addonFilter, setAddonFilter] = useState('main');
  useEffect(() => { setActiveTab(DETAIL_TABS[0]); setAddonFilter('main'); }, [canonicalId]);

  if (!canonicalId || !heroDef || !family) {
    return <div className="panel section"><div className="section-body"><div className="sub">Building not found.</div></div></div>;
  }

  const actionTargetInfo = actionDef
    ? {
        price: actionDef.cost || actionDef.price || {},
        reqString: actionRequirement.reqString,
        duration: actionRequirement.duration?.final_s ?? Number(actionDef.duration_s ?? actionDef.build_time_s ?? actionDef.stats?.build_time_s ?? 0),
        durationBase: actionRequirement.duration?.base_s ?? Number(actionDef.duration_s ?? actionDef.build_time_s ?? actionDef.stats?.build_time_s ?? 0),
        footprint: stageFootprint,
      }
    : null;

  const canStart = !!actionDef && actionStageOk && !!actionRequirement.allOk;

  const tabContent = (() => {
    switch (activeTab) {
      case 'addons':
        return <AddonsTab family={family} defs={defs} state={state} stage={currentStage} baseOwned={baseOwned} requirementCaches={requirementCaches} filter={addonFilter} onFilterChange={setAddonFilter} />;
      case 'research':
        return <ResearchTab family={family} defs={defs} state={state} stage={currentStage} baseOwned={baseOwned} requirementCaches={requirementCaches} />;
      case 'recipes':
        return <RecipesTab family={family} defs={defs} state={state} stage={currentStage} baseOwned={baseOwned} requirementCaches={requirementCaches} />;
      default:
        return <SpecialTab />;
    }
  })();

  return (
    <section className="panel section">
      <div className="section-head">
        <a href="#/buildings" className="back">&larr;</a>
        {t("ui.building.h1")}
      </div>
      <div className="section-body">
        <BuildingHero
          heroDef={heroDef}
          heroId={heroId}
          durabilityPct={durabilityPct}
          jobActiveId={jobActiveId}
          footprintText={footprintText}
          animalCapText={animalCapText}
          actionTarget={actionTargetInfo}
          requirementState={actionRequirement}
        />
        <BuildingActions
          actionItem={actionItem}
          canStart={canStart}
          jobActiveId={jobActiveId}
          buildingId={canonicalId}
          repairBasePrice={repairBasePrice}
        />
        <div className="tabs">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div id="tabContent">
          {tabContent}
        </div>
      </div>
    </section>
  );
}

export default BuildingDetailPage;