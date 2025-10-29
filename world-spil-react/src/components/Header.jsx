import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { fmt } from '../services/helpers.js';
import TopbarAuth from './TopbarAuth.jsx';
import HeaderCitizensBadge from './header/HeaderCitizensBadge.jsx';
import HeaderHappinessBadge from './header/HeaderHappinessBadge.jsx';
import HoverCard from './ui/HoverCard.jsx';
import CapHoverContent from './ui/CapHoverContent.jsx';
import Icon from './ui/Icon.jsx';
import HeaderPopularityBadge from './header/HeaderPopularityBadge.jsx'; // NY
import HeaderCrimeBadge from './header/HeaderCrimeBadge.jsx';
import HeaderBudgetBadge from './header/HeaderBudgetBadge.jsx';
import HeaderLangSelector from './header/HeaderLangSelector.jsx';
import StageUnlockAnnouncer from './stage/StageUnlockAnnouncer.jsx';

export default function Header() {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const state = data?.state || {};
  // About-modal state
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutText, setAboutText] = useState(null);
  const [aboutLoading, setAboutLoading] = useState(false);

  // valgfri: læs filnavn fra serverens config (fx data.config.about_file)
  const ABOUT_PATH = data?.config?.game_data?.historyfile ?? '/history.txt';
  
  const openAbout = () => {
    setAboutOpen(true);
    if (aboutText !== null) return;
    setAboutLoading(true);
    // Fetch plain text from public folder (place a file e.g. public/about.txt)
    fetch(ABOUT_PATH)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((txt) => setAboutText(txt))
      .catch(() => setAboutText('Kunne ikke indlæse filen.'))
      .finally(() => setAboutLoading(false));
  };
  const closeAbout = () => setAboutOpen(false);

  const solid = state?.inv?.solid ?? {};
  const liquid = state?.inv?.liquid ?? {};
  const footprint = state?.cap?.footprint ?? {};
  const animal_cap = state?.cap?.animal_cap ?? {};
  const resDefs = defs?.res ?? {};
  // Keep last-known non-empty values to avoid flicker when backend updates
  const animalCapRef = useRef(animal_cap);
  const footprintRef = useRef(footprint);
  useEffect(() => { if (animal_cap && (animal_cap.used !== undefined || animal_cap.total !== undefined)) animalCapRef.current = animal_cap; }, [animal_cap]);
  useEffect(() => { if (footprint && (footprint.used !== undefined || footprint.total !== undefined)) footprintRef.current = footprint; }, [footprint]);
  const animalUsed = (animal_cap?.used ?? animalCapRef.current?.used) ?? 0;
  const animalTotal = (animal_cap?.total ?? animalCapRef.current?.total) ?? 0;
  const footprintUsed = (footprint?.used ?? footprintRef.current?.used) ?? 0;
  const footprintTotal = (footprint?.total ?? footprintRef.current?.total) ?? 0;

  // stages config (fra serverens config.ini via alldata.php)
  const stageCfg = data?.config?.stagemanagement || data?.config?.stageManagement || {};
  const currentStage = Number(state?.user?.currentstage || 0);
  const turnOnTax = Number(stageCfg.turnOnTax ?? 0);
  const turnOnCrime = Number(stageCfg.turnOnCrime ?? 0);
  const turnOnHappiness = Number(stageCfg.turnOnHappiness ?? 0);
  const turnOnPopularity = Number(stageCfg.turnOnPopularity ?? 0);
  const turnOnCitizens = Number(stageCfg.turnOnCitizensLite ?? 0);

  const showBudget = currentStage >= turnOnTax;
  const showCrime = currentStage >= turnOnCrime;
  const showPopularity = currentStage >= turnOnPopularity;
  const showHappiness = currentStage >= turnOnHappiness;
  const showCitizens = currentStage >= turnOnCitizens;

  // Nye hover-contents for cap-chips
  const animalCapHover = (
    <CapHoverContent title="Staldplads" metric="animal_cap" capObj={animal_cap} />
  );
  const footprintHover = (
    <CapHoverContent title="Byggepoint" metric="footprint" capObj={footprint} />
  );

  return (
    <header className="topbar">
      <div
        className="brand"
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        // open modal when clicking brand or version
        onClick={openAbout}
        title="Vis info"
      >
        <span className="brand-emoji" style={{ fontSize: 20 }}>🌍</span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span className="brand-name" style={{ fontWeight: 700 }}>World</span>
          <span className="brand-version" style={{ fontSize: 12, color: '#9ca3af' }}>{data?.config?.game_data?.version}</span>
        </div>
      </div>

      <div className="header-resources">
        <div className={`badge-wrap ${showCrime ? 'visible' : 'hidden'}`} style={{ transition: 'opacity 180ms', opacity: showCrime ? 1 : 0, pointerEvents: showCrime ? 'auto' : 'none' }}>
          <HeaderCrimeBadge />
        </div>
        <div className={`badge-wrap ${showBudget ? 'visible' : 'hidden'}`} style={{ transition: 'opacity 180ms', opacity: showBudget ? 1 : 0, pointerEvents: showBudget ? 'auto' : 'none' }}>
          <HeaderBudgetBadge />
        </div>
        <div className={`badge-wrap ${showPopularity ? 'visible' : 'hidden'}`} style={{ transition: 'opacity 180ms', opacity: showPopularity ? 1 : 0, pointerEvents: showPopularity ? 'auto' : 'none' }}>
          <HeaderPopularityBadge />
        </div>
        <div className={`badge-wrap ${showHappiness ? 'visible' : 'hidden'}`} style={{ transition: 'opacity 180ms', opacity: showHappiness ? 1 : 0, pointerEvents: showHappiness ? 'auto' : 'none' }}>
          <HeaderHappinessBadge />
        </div>
        <StageUnlockAnnouncer />

        {/* Fjern ekstra wrapper for at undgå dobbelt chip-indpakning */}
        <div className={`badge-wrap ${showCitizens ? 'visible' : 'hidden'}`} style={{ transition: 'opacity 180ms', opacity: showCitizens ? 1 : 0, pointerEvents: showCitizens ? 'auto' : 'none' }}>
          <HeaderCitizensBadge />
        </div>

        <HoverCard content={animalCapHover}>
          <span className="res-chip">
            <Icon src="/assets/icons/stats_animalcap.png" size={18} alt="Staldplads" /> {fmt(animalUsed)}<span className="max">/{fmt(animalTotal)}</span>
          </span>
        </HoverCard>

        <HoverCard content={footprintHover}>
          <span className="res-chip">
            <Icon src="/assets/icons/symbol_footprint.png" size={18} alt="Byggepoint" /> {fmt(Math.abs(footprintUsed) || 0)}<span className="max">/{fmt(footprintTotal)}</span>
          </span>
        </HoverCard>
      </div>

      <div className="header-tools" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        STAGE: {state?.user?.currentstage || '0'}

        {/* Hjælp-knap: linker til help-overlay via hash */}
        <button className="icon-btn" onClick={() => window.location.hash = '#/help?topic=intro'} title="Hjælp">❓Hjælp</button>

        <TopbarAuth onAuthChange={() => window.location.reload()} />
          <HeaderLangSelector />
          
      </div>
      {/* About modal */}
      {aboutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', zIndex: 1200,
          }}
          onClick={closeAbout}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 720, width: '90%', maxHeight: '80%', overflow: 'auto', background: '#fff', borderRadius: 8, padding: 18 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Information</strong>
              <button className="icon-btn" onClick={closeAbout} aria-label="Luk">✕</button>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13, color: '#111' }}>
              {aboutLoading ? 'Indlæser…' : (aboutText ?? 'Ingen information tilgængelig.')}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}