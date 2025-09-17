import React, { useMemo } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import RecipeRow from '../components/building/rows/RecipeRow.jsx';
import { computeOwnedMap, collectActiveBuffs, computeResearchOwned } from '../services/requirements.js';

function selectHighestRecipes(recipeDefs, currentStage, ownedBuildings) {
  const grouped = new Map();
  for (const [key, def] of Object.entries(recipeDefs)) {
    const match = key.match(/^(.+)\.l(\d+)$/);
    const series = match ? match[1] : key;
    const level = match ? Number(match[2]) : Number(def?.lvl ?? 1);
    if (!grouped.has(series)) grouped.set(series, []);
    grouped.get(series).push({ key, def, level });
  }

  const results = [];
  for (const [series, items] of grouped.entries()) {
    items.sort((a, b) => a.level - b.level);
    const accessible = items.filter((item) => {
      const stageReq = Number(item.def?.stage ?? item.def?.stage_required ?? 0);
      return stageReq <= currentStage;
    });
    if (!accessible.length) continue;
    const pick = accessible[accessible.length - 1];
    const stageReq = Number(pick.def?.stage ?? pick.def?.stage_required ?? 0);
    const familyRaw = String(pick.def?.family || '').split(',').map((x) => x.trim()).filter(Boolean);
    const primaryFamily = familyRaw[0] || '';
    const baseSeries = primaryFamily ? `bld.${primaryFamily}` : null;
    const baseOwned = baseSeries ? (ownedBuildings[baseSeries] || 0) > 0 : true;

    results.push({
      def: pick.def,
      fullId: `rcp.${pick.key}`,
      level: pick.level,
      stageReq,
      stageOk: stageReq <= currentStage,
      family: primaryFamily,
      baseOwned,
    });
  }

  results.sort((a, b) => (a.def?.name || a.fullId).localeCompare(b.def?.name || b.fullId));
  return results;
}

function RecipesPage() {
  const { data } = useGameData();
  if (!data) return null;

  const { defs, state } = data;
  const recipeDefs = defs?.rcp || {};
  const currentStage = Number(state.user?.currentstage ?? state.user?.stage ?? 0);
  const ownedBuildings = useMemo(() => computeOwnedMap(state.bld), [state.bld]);
  const ownedAddons = useMemo(() => computeOwnedMap(state.add), [state.add]);
  const ownedResearch = useMemo(() => computeResearchOwned(state), [state]);
  const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);
  const requirementCaches = useMemo(
    () => ({ ownedBuildings, ownedAddons, ownedResearch, activeBuffs }),
    [ownedBuildings, ownedAddons, ownedResearch, activeBuffs]
  );

  const entries = useMemo(
    () => selectHighestRecipes(recipeDefs, currentStage, ownedBuildings),
    [recipeDefs, currentStage, ownedBuildings]
  );

  return (
    <section className="panel section">
      <div className="section-head">?? Available Recipes</div>
      <div className="section-body">
        {entries.length ? (
          entries.map((entry) => (
            <RecipeRow
              key={entry.fullId}
              entry={entry}
              defs={defs}
              state={state}
              baseOwned={entry.baseOwned}
              requirementCaches={requirementCaches}
            />
          ))
        ) : (
          <div className="sub">Ingen opskrifter tilgængelige endnu.</div>
        )}
      </div>
    </section>
  );
}

export default RecipesPage;


