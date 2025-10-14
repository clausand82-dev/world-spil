import React from 'react';
import ManagementFamilyPanel from '../../management/ManagementFamilyPanel.jsx';

export default function SpecialTab({ family }) {
  if (!family) {
    return (
      <section className="panel section">
        <div className="section-head">Special</div>
        <div className="section-body"><div className="sub">Ukendt building family.</div></div>
      </section>
    );
  }
  return <ManagementFamilyPanel family={family} />;
}