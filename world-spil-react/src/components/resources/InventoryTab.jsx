import React, { useState, useEffect } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { addMarketRefreshListener, removeMarketRefreshListener } from '../../events/marketEvents.js';
import ResourceList from '../../components/ResourceList.jsx';
import AnimalList from '../../components/AnimalList.jsx';
import { fmt } from '../../services/helpers.js';
import HoverCard from '../../components/ui/HoverCard.jsx';
import CapHoverContent from '../../components/ui/CapHoverContent.jsx';
import ResourceCapacityModal from './ResourceCapacityModal.jsx';

export default function InventoryPage() {
  const { data, isLoading, error, refetch, updateState } = useGameData();
  // fallback tick for callers where refetch isn't present
  const [, setTick] = useState(0);

  // Re-fetch when market signals change, and when window regains focus / becomes visible
  useEffect(() => {
    const refresh = async (payload = null) => {
      try {
        // Hvis event kom med en delta fra markedet, patch global state i stedet for at refetche hele payload
        // Hvis event har en delta, anvend den generisk (dæmper race og gør UI instant)
        if (payload && payload.delta) {
          try {
            updateState(payload.delta);
            return;
          } catch (e) {
            console.warn('InventoryTab apply payload failed', e);
            // fallback til refetch
          }
        }

        // For andre markeds-events uden delta, refetch kun hvis fanen er synlig
        if (payload && payload.type && !payload.delta) {
          if (document.visibilityState === 'visible') {
            if (typeof refetch === 'function') await refetch();
            else setTick(t => t + 1);
          }
          return;
        }

        if (document.visibilityState !== 'visible') return;
        if (typeof refetch === 'function') {
          await refetch();
        } else {
          // trigger a local rerender if no refetch available
          setTick(t => t + 1);
        }
      } catch (e) {
        // ignore
      }
    };

    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    addMarketRefreshListener(refresh);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      removeMarketRefreshListener(refresh);
    };
  }, [refetch, updateState]);

  if (isLoading) return <div className="sub">Indlæser beholdning...</div>;
  if (error) return <div className="sub">Fejl: Kunne ikke hente data.</div>;

  const { defs, state } = data || {};
  const { cap = {}, inv = {} } = state || {};

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
          <ResourceList items={inv?.liquid} defs={defs?.res} />
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
          <ResourceList items={inv?.solid} defs={defs?.res} />
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
        resDefs={defs?.res || {}}
        totalCapacity={Number(liquidCap.total || 0)}
      />

      <ResourceCapacityModal
        open={activeModal === 'solid'}
        onClose={closeModal}
        title="Faste ressourcer – fordeling"
        items={inv?.solid}
        resDefs={defs?.res || {}}
        totalCapacity={Number(solidCap.total || 0)}
      />
    </>
  );
}