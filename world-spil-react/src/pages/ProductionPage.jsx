import React from "react";
import { useGameData } from "../context/GameDataContext.jsx";
import RequirementSummary from "../components/building/RequirementSummary.jsx";
import RecipeRow from "../components/building/rows/RecipeRow.jsx";
import BuildProgress from "../components/BuildProgress.jsx";
import ActionButton from "../components/ActionButton.jsx";
import { computeOwnedMap } from "../services/requirements.js";
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';
import ActiveRecipes from '../components/production/ActiveRecipes.jsx';
import Board from '../components/ui/Board.jsx';

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

       
                        <ActiveRecipes />
      

        <section className="panel section">
          <div className="section-head">🏗️ Passive Yields</div>
          <div className="section-body"><PassiveYieldList /></div>
        </section>
        
   </div>
  );
}

/* EKSEMPEL PÅ BRUG AF BOARDS DER KAN FLYTTES RUNDT (OG ÆNDRE STØRRELSE PÅ) MED SNAP TIL GRID:
<Board
  id="active-recipes"
  title="📜 Aktive Opskrifter"
  popup
  initialOpen
  width={600}
  defaultX={24}
  defaultY={24}
  minWidth={360}
  containerSelector="#main"
  snap
  snapRows={6}
  minRows={2}
  allowHeightResize
>
  <ActiveRecipes />
</Board>

*/



/*EKSEMPEL PÅ BRUG AF BOARDS DER KAN FLYTTES RUNDT (OG ÆNDRE STØRRELSE PÅ):
<Board
  id="active-recipes"
  title="📜 Aktive Opskrifter"
  popup
  initialOpen
  width={600}
  defaultX={24}
  defaultY={24}
  minWidth={360}
><ActiveRecipes />
</Board>*/


/*
EKSEMPEL PÅ BRUG AF BOARDS DER KAN FOLDES UD/IND:
      <Board id="passive-yields" title="📊 Passiv Produktion" initialOpen>
        <PassiveYieldList />
      </Board>

      <Board id="active-recipes" title="🏗️ Aktive Opskrifter" initialOpen>
        <ActiveRecipes />
      </Board>
      */