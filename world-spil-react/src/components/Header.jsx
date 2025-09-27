import React, { useMemo } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { fmt } from '../services/helpers.js';
import TopbarAuth from './TopbarAuth.jsx';
import { buildStatsTitle } from '../services/statsEffects.js';
import { buildPassiveYieldTitle } from '../services/passiveYields.js';
import HeaderCitizensBadge from './header/HeaderCitizensBadge.jsx';
import HeaderHappinessBadge from './header/HeaderHappinessBadge.jsx';



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

  const waterTitle = useMemo(() => buildPassiveYieldTitle({
  defs, state, resource: 'res.water', mode: 'give', heading: 'Vand'
}), [defs, state]);

const moneyTitle = useMemo(() => buildPassiveYieldTitle({
  defs, state, resource: 'res.money', mode: 'give', heading: 'Kr'
}), [defs, state]);

const woodTitle = useMemo(() => buildPassiveYieldTitle({
  defs, state, resource: 'res.wood', mode: 'give', heading: 'Træ'
}), [defs, state]);

const stoneTitle = useMemo(() => buildPassiveYieldTitle({
  defs, state, resource: 'res.stone', mode: 'give', heading: 'Sten'
}), [defs, state]);

const foodTitle = useMemo(() => buildPassiveYieldTitle({
  defs, state, resource: 'res.food', mode: 'give', heading: 'Mad'
}), [defs, state]);

  const footprintTitle = useMemo(() => buildStatsTitle({
    defs, state, metrics: 'footprint', mode: 'both', heading: 'Byggepoint'
  }), [defs, state]);

    const animalcapTitle = useMemo(() => buildStatsTitle({
    defs, state, metrics: 'animal', mode: 'both', heading: 'Staldplads'
  }), [defs, state]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-emoji">🌍</span>
        <span className="brand-name">World</span>
        <span className="brand-name">{data?.config?.game_data?.version}</span>
      </div>

      <div className="header-resources">
        <HeaderHappinessBadge />
        <span className="res-chip" ><HeaderCitizensBadge /></span>
        <span className="res-chip" title={animalcapTitle}>🐾 {fmt(animal_cap.used || 0)}<span className="max">/{fmt(animal_cap.total || 0)}</span></span>
        <span className="res-chip" title={footprintTitle}>⬛ {fmt(Math.abs(footprint.used) || 0)}<span className="max">/{fmt(footprint.total || 0)}</span></span>
      </div>

      <div className="header-tools" style={{ marginLeft: 'auto' }}>
        {/* Login / Logout vises altid */}
        STAGE: {data?.state?.user?.currentstage || '0'}
        <TopbarAuth onAuthChange={() => window.location.reload()} />
      </div>
    </header>
  );
}

/*<span className="res-chip" ><HappinessBadge happiness={data.happiness?.happiness} /></span>*/

/*
  <span className="res-chip" title={foodTitle}>{resDefs.food?.emoji || '🪵'} {fmt(solid.food || 0)}</span>
        <span className="res-chip" title={woodTitle}>{resDefs.wood?.emoji || '🪵'} {fmt(solid.wood || 0)}</span>
        <span className="res-chip" title={stoneTitle}>{resDefs.stone?.emoji || '🪨'} {fmt(solid.stone || 0)}</span>
        <span className="res-chip" title={waterTitle}>{resDefs.water?.emoji || '💧'} {fmt(liquid.water || 0)}</span>
        <span className="res-chip" title={moneyTitle}>💰 {fmt(solid.money || 0)}</span>
*/