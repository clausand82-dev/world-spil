import React, { useMemo } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { fmt } from '../services/helpers.js';
import TopbarAuth from './TopbarAuth.jsx';
import HeaderCitizensBadge from './header/HeaderCitizensBadge.jsx';
import HeaderHappinessBadge from './header/HeaderHappinessBadge.jsx';
import HoverCard from './ui/HoverCard.jsx';
import CapHoverContent from './ui/CapHoverContent.jsx';
import HeaderPopularityBadge from './header/HeaderPopularityBadge.jsx'; // NY

export default function Header() {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const state = data?.state || {};

  const solid = state?.inv?.solid ?? {};
  const liquid = state?.inv?.liquid ?? {};
  const footprint = state?.cap?.footprint ?? {};
  const animal_cap = state?.cap?.animal_cap ?? {};
  const resDefs = defs?.res ?? {};

  // Nye hover-contents for cap-chips
  const animalCapHover = (
    <CapHoverContent title="Staldplads" metric="animal_cap" capObj={animal_cap} />
  );
  const footprintHover = (
    <CapHoverContent title="Byggepoint" metric="footprint" capObj={footprint} />
  );

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-emoji">🌍</span>
        <span className="brand-name">World</span>
        <span className="brand-name">{data?.config?.game_data?.version}</span>
      </div>

      <div className="header-resources">
        <HeaderPopularityBadge />
        <HeaderHappinessBadge />
        <span className="res-chip"><HeaderCitizensBadge /></span>

        <HoverCard content={animalCapHover}>
          <span className="res-chip">
            🐾 {fmt(animal_cap.used || 0)}<span className="max">/{fmt(animal_cap.total || 0)}</span>
          </span>
        </HoverCard>

        <HoverCard content={footprintHover}>
          <span className="res-chip">
            ⬛ {fmt(Math.abs(footprint.used) || 0)}<span className="max">/{fmt(footprint.total || 0)}</span>
          </span>
        </HoverCard>
      </div>

      <div className="header-tools" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        STAGE: {state?.user?.currentstage || '0'}

        {/* Hjælp-knap: linker til help-overlay via hash */}
        <button className="icon-btn" onClick={() => window.location.hash = '#/help?topic=intro'} title="Hjælp">❓Hjælp</button>

        {/* <button className="icon-btn" onClick={() => setShowHelp(true)}>❓ Hjælp</button> */}

        <TopbarAuth onAuthChange={() => window.location.reload()} />
      </div>
    </header>
  );
}