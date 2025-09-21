import React from "react";
import ActiveRecipes from '../components/production/ActiveRecipes.jsx';
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';

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