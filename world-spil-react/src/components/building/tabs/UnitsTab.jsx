import React from 'react';
import UnitPage from '../../../pages/UnitPage.jsx';

// Units-tab under en byggedetail skal vise præcist samme layout som på UnitPage,
// men kun for den aktuelle building family og uden top-tabs.
export default function UnitsTab({ family }) {
  if (!family) {
    return (
      <section className="panel section">
        <div className="section-head">Units</div>
        <div className="section-body">
          <div className="sub">Ukendt building family.</div>
        </div>
      </section>
    );
  }
  return <UnitPage embedFamily={family} embed />;
}