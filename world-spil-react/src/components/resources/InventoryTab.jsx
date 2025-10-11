import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceList from '../../components/ResourceList.jsx';
import AnimalList from '../../components/AnimalList.jsx';
import { fmt } from '../../services/helpers.js';
import HoverCard from '../../components/ui/HoverCard.jsx';
import CapHoverContent from '../../components/ui/CapHoverContent.jsx';

export default function InventoryPage() {
  const { data, isLoading, error } = useGameData();

  if (isLoading) return <div className="sub">Indlæser beholdning...</div>;
  if (error) return <div className="sub">Fejl: Kunne ikke hente data.</div>;

  const { defs, state } = data;
  const { cap = {} } = state;

  const liquidCap = cap.liquid || cap.storageLiquidCap || {};
  const solidCap  = cap.solid  || cap.storageSolidCap  || {};
  const aniCap    = cap.animal_cap || {};

  return (
    <>
      <section className="panel section res-panel">
        <div className="section-head">
          <span>💧 Flydende Ressourcer</span>
          <span style={{ marginLeft: 'auto', fontWeight: '600' }}>
            <HoverCard content={<CapHoverContent title="Flydende kapacitet" metric="storageLiquidCap" capObj={liquidCap} />}>
              <span>{fmt(liquidCap.used || 0)} / {fmt(liquidCap.total || 0)}</span>
            </HoverCard>
          </span>
        </div>
        <div className="section-body"><ResourceList items={state.inv?.liquid} defs={defs.res} /></div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">
          <span>🧱 Faste Ressourcer</span>
          <span style={{ marginLeft: 'auto', fontWeight: '600' }}>
            <HoverCard content={<CapHoverContent title="Faste kapacitet" metric="storageSolidCap" capObj={solidCap} />}>
              <span>{fmt(solidCap.used || 0)} / {fmt(solidCap.total || 0)}</span>
            </HoverCard>
          </span>
        </div>
        <div className="section-body"><ResourceList items={state.inv?.solid} defs={defs.res} /></div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">
          <span>🐾 Dyr</span>
          <span style={{ marginLeft: 'auto', fontWeight: '600' }}>
            <HoverCard content={<CapHoverContent title="Staldplads" metric="animal_cap" capObj={aniCap} />}>
              <span>{fmt(aniCap.used || 0)} / {fmt(aniCap.total || 0)}</span>
            </HoverCard>
          </span>
        </div>
        <div className="section-body">
          <AnimalList format="detailed" />
        </div>
      </section>
    </>
  );
}