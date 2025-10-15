import React, { useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceList from '../../components/ResourceList.jsx';
import AnimalList from '../../components/AnimalList.jsx';
import { fmt } from '../../services/helpers.js';
import HoverCard from '../../components/ui/HoverCard.jsx';
import CapHoverContent from '../../components/ui/CapHoverContent.jsx';
import ResourceCapacityModal from './ResourceCapacityModal.jsx';

export default function InventoryPage() {
  const { data, isLoading, error } = useGameData();

  if (isLoading) return <div className="sub">Indlæser beholdning...</div>;
  if (error) return <div className="sub">Fejl: Kunne ikke hente data.</div>;

  const { defs, state } = data;
  const { cap = {}, inv = {} } = state;

  const liquidCap = cap.liquid || cap.storageLiquidCap || {};
  const solidCap = cap.solid || cap.storageSolidCap || {};
  const aniCap = cap.animal_cap || {};

  const [activeModal, setActiveModal] = useState(null);
  const openModal = (type) => setActiveModal(type);
  const closeModal = () => setActiveModal(null);

  const headerButtonStyle = {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };

  return (
    <>
      <section className="panel section res-panel">
        <div className="section-head">
          <button
            type="button"
            onClick={() => openModal('liquid')}
            style={headerButtonStyle}
            aria-haspopup="dialog"
          >
            <span role="img" aria-hidden>💧</span>
            <span>Flydende ressourcer</span>
          </button>
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            <HoverCard
              content={(
                <CapHoverContent
                  title="Flydende kapacitet"
                  metric="storageLiquidCap"
                  capObj={liquidCap}
                />
              )}
            >
              <span>{fmt(liquidCap.used || 0)} / {fmt(liquidCap.total || 0)}</span>
            </HoverCard>
          </span>
        </div>
        <div className="section-body">
          <ResourceList items={inv?.liquid} defs={defs.res} />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">
          <button
            type="button"
            onClick={() => openModal('solid')}
            style={headerButtonStyle}
            aria-haspopup="dialog"
          >
            <span role="img" aria-hidden>🧱</span>
            <span>Faste ressourcer</span>
          </button>
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            <HoverCard
              content={(
                <CapHoverContent
                  title="Faste kapacitet"
                  metric="storageSolidCap"
                  capObj={solidCap}
                />
              )}
            >
              <span>{fmt(solidCap.used || 0)} / {fmt(solidCap.total || 0)}</span>
            </HoverCard>
          </span>
        </div>
        <div className="section-body">
          <ResourceList items={inv?.solid} defs={defs.res} />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">
          <span>🐄 Dyr</span>
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            <HoverCard
              content={(
                <CapHoverContent
                  title="Staldplads"
                  metric="animal_cap"
                  capObj={aniCap}
                />
              )}
            >
              <span>{fmt(aniCap.used || 0)} / {fmt(aniCap.total || 0)}</span>
            </HoverCard>
          </span>
        </div>
        <div className="section-body">
          <AnimalList format="detailed" />
        </div>
      </section>

      <ResourceCapacityModal
        open={activeModal === 'liquid'}
        onClose={closeModal}
        title="Flydende ressourcer – fordeling"
        items={inv?.liquid}
        resDefs={defs.res || {}}
        totalCapacity={Number(liquidCap.total || 0)}
      />

      <ResourceCapacityModal
        open={activeModal === 'solid'}
        onClose={closeModal}
        title="Faste ressourcer – fordeling"
        items={inv?.solid}
        resDefs={defs.res || {}}
        totalCapacity={Number(solidCap.total || 0)}
      />
    </>
  );
}
