import React from 'react';
import UnitGroupPanel from '../../units/UnitGroupPanel.jsx';

// Units-tab under en byggedetail skal vise præcis samme layout som på UnitPage,
// men kun for den aktuelle building family. Ingen egne tabs her.
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
  return <UnitGroupPanel family={family} />;
}