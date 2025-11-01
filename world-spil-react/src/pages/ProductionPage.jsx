import React from "react";
import ActiveRecipes from '../components/production/ActiveRecipes.jsx';
import PassiveYieldList from '../components/dashboard/PassiveYieldList.jsx';
import Icon from '../components/ui/Icon.jsx';


export default function ProductionPage() {
  return (
    <div className="page">
      <ActiveRecipes />
      <section className="panel section">
        <div className="section-head"><Icon src="/assets/icons/menu_resources.png" size={18} alt="happiness" /> Passive Yields</div>
        <div className="section-body"><PassiveYieldList /></div>
      </section>
    </div>
  );
}