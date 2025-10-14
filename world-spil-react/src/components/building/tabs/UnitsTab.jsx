import React from 'react';
import AnimalPage from './SpecialTabAnimal.jsx';
import SpecialTabHealthUnits from './SpecialTabHealthUnits.jsx';

export default function UnitsTab() {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const m = hash.match(/#\/building\/([^\/\?]+)/);
  const id = m ? decodeURIComponent(m[1]) : '';
  const isFarm = id.startsWith('bld.farm.');
  const isHealth = id.startsWith('bld.health.');

  const headTitle = isFarm ? '🐄 Animal' : isHealth ? '🩺 Health' : '✨ Special';

  return (
    <section className="panel section">
      <div className="section-head">{headTitle}</div>
      <div className="section-body">
        {isFarm ? (
          <AnimalPage />
        ) : isHealth ? (
          <SpecialTabHealthUnits />
        ) : (
          <div className="sub">Ingen specielle funktioner. Aktuel id: <code>{id || 'ingen'}</code></div>
        )}
      </div>
    </section>
  );
}