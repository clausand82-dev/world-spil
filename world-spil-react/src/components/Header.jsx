import React, { useMemo } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { fmt } from '../services/helpers.js';
import TopbarAuth from './TopbarAuth.jsx';
import { buildStatsTitle } from '../services/statsEffects.js';


export default function Header() {
  const { data } = useGameData();
    const defs = data?.defs || {};
  const state = data?.state || {};

  // Safe defaults når data ikke er indlæst
  const solid = data?.state?.inv?.solid ?? {};
  const liquid = data?.state?.inv?.liquid ?? {};
  const footprint = data?.state?.cap?.footprint ?? {};
  const animal_cap = data?.state?.cap?.animal_cap ?? {};
  const resDefs = data?.defs?.res ?? {};

  const footprintTitle = useMemo(() => buildStatsTitle({
    defs,
    state,
    metrics: 'footprint', // kun footprint
    mode: 'give',         // kun positive kilder
    heading: 'Byggepoint'
  }), [defs, state]);

    const animalcapTitle = useMemo(() => buildStatsTitle({
    defs,
    state,
    metrics: 'animal', // kun animal
    mode: 'give',         // kun positive kilder
    heading: 'Staldplads'
  }), [defs, state]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-emoji">🌍</span>
        <span className="brand-name">World</span>
      </div>

      <div className="header-resources">
        <span className="res-chip" title={resDefs.wood?.name}>{resDefs.wood?.emoji || '🪵'} {fmt(solid.wood || 0)}</span>
        <span className="res-chip" title={resDefs.stone?.name}>{resDefs.stone?.emoji || '🪨'} {fmt(solid.stone || 0)}</span>
        <span className="res-chip" title={resDefs.water?.name}>{resDefs.water?.emoji || '💧'} {fmt(liquid.water || 0)}</span>
        <span className="res-chip" title="Kr">💰 {fmt(solid.money || 0)}</span>
        <span className="res-chip" title={animalcapTitle}>🐾 {fmt(animal_cap.used || 0)}<span className="max">/{fmt(animal_cap.total || 0)}</span></span>
        <span className="res-chip" title={footprintTitle}>⬛ {fmt(Math.abs(footprint.used) || 0)}<span className="max">/{fmt(footprint.total || 0)}</span></span>
      </div>

      <div className="header-tools" style={{ marginLeft: 'auto' }}>
        {/* Login / Logout vises altid */}
        <TopbarAuth onAuthChange={() => window.location.reload()} />
      </div>
    </header>
  );
}