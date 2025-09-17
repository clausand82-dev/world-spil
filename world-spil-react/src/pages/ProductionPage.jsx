import React from "react";
import { useGameData } from "../context/GameDataContext.jsx";
import RequirementSummary from "../components/building/RequirementSummary.jsx";
import RecipeRow from "../components/building/rows/RecipeRow.jsx";
import BuildProgress from "../components/BuildProgress.jsx";
import ActionButton from "../components/ActionButton.jsx";
import { computeOwnedMap } from "../services/requirements.js";
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';

// Passive sektion: finder igangværende jobs for opskrifter med mode="passive"
            <section className="panel section">
                <div className="section-head">📊 Passiv Produktion</div>
                <div className="section-body"><PassiveYieldList /></div>
            </section>



// Aktive sektion: alle recipes der kan startes manuelt (mode="active")
function ActiveRecipeList() {
  const { data } = useGameData();
  const defs = data?.defs?.rcp || {};
  const owned = computeOwnedMap(data.state?.bld);

  const activeDefs = Object.entries(defs)
    .filter(([id, def]) => def.mode === "active")
    .map(([id, def]) => ({ ...def, id: `rcp.${id}` }))
    .filter((def) => {
      // kræver at base-building er ejet
      const base = def.group?.split(".")[0]; // fx "mill" fra "mill.recipes"
      return owned[base] > 0;
    });

  if (activeDefs.length === 0) {
    return <p>Ingen aktive opskrifter tilgængelige.</p>;
  }

  return (
    <div className="list">
      {activeDefs.map((def) => (
        <RecipeRow key={def.id} def={def} />
      ))}
    </div>
  );
}

export default function ProductionPage() {
  return (
    <div className="page">
             <section className="panel section">
            <div className="section-head">🏗️ Passive Yields</div>
            <div className="section-body"><PassiveYieldList /></div>
        </section>

          <section className="panel section">
            <div className="section-head">🏗️ Aktive Opskrifter</div>
            <div className="section-body"><ActiveRecipeList /></div>
        </section>

   </div>
  );
}
