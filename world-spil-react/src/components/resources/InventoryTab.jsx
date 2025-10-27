import React, { useState, useEffect } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { addMarketRefreshListener, removeMarketRefreshListener } from '../../events/marketEvents.js';
import ResourceList from '../../components/ResourceList.jsx';
import AnimalList from '../../components/AnimalList.jsx';
import { fmt } from '../../services/helpers.js';
import HoverCard from '../../components/ui/HoverCard.jsx';
import CapHoverContent from '../../components/ui/CapHoverContent.jsx';
import ResourceCapacityModal from './ResourceCapacityModal.jsx';

/**
 * InventoryTab.jsx
 *
 * Ændringer i denne version:
 * - Fjernede alle console.* logs (som ønsket).
 * - Tilføjede håndtering af 'batched' payloads fra marketEvents (hvis marketEvents sender en batch).
 * - Beholder tidligere fallback-mekanismer: hvis delta findes, prøver vi updateState; ellers refetch eller lokal rerender.
 * - Kommentarer er tilføjet for at gøre adfærden tydelig.
 *
 * Bemærk: eksport-navn er uændret (InventoryPage) for at matche tidligere filindhold og undgå at bryde imports.
 */

export default function InventoryPage() {
  const { data, isLoading, error, refetch, updateState } = useGameData();
  // fallback tick for callers where refetch isn't present
  const [, setTick] = useState(0);

  // Re-fetch when market signals change, and when window regains focus / becomes visible
  useEffect(() => {
    /**
     * processSinglePayload(payload)
     * - Håndterer et enkelt payload objekt fra marketEvents.
     * - Hvis payload indeholder en kompakt delta, forsøger vi at apply'e den via updateState.
     * - Hvis payload er et markeds-event uden delta, refetches kun når fanen er synlig.
     */
    const processSinglePayload = async (payload = null) => {
      try {
        if (payload && payload.delta) {
          // Hvis event kom med en delta fra markedet, patch global state i stedet for at refetche hele payload.
          // Dette giver mere instant UI og reducerer race-conditions.
          try {
            updateState?.(payload.delta);
            return;
          } catch (e) {
            // updateState kan fejle hvis deltashape ikke stemmer overens.
            // Vi logger ikke til console i produktion per ønsket; vi fallback'er blot til refetch nedenfor.
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

        // Hvis ingen payload eller payload uden delta og fanen er synlig, refetch/gør lokal rerender
        if (document.visibilityState !== 'visible') return;
        if (typeof refetch === 'function') {
          await refetch();
        } else {
          // trigger a local rerender if no refetch available
          setTick(t => t + 1);
        }
      } catch (e) {
        // Intentionelt ingen console.logs her — fejl håndteres stille.
        // Hvis du vil have synlig fejl-telemetri, kan vi sende til en central logger/telemetri-tjeneste her.
      }
    };

    /**
     * refresh(payload)
     * - Entrypoint for marketEvents-listener.
     * - Understøtter både enkelt-payload og batched payloads (type === 'batched' with .events array).
     * - Hvis batched: behandler events sekventielt (bevarer order).
     */
    const refresh = async (payload = null) => {
      try {
        if (payload && payload.type === 'batched' && Array.isArray(payload.events)) {
          // Hvis vi får en batch, anvend hver event efter hinanden.
          for (const ev of payload.events) {
            // processSinglePayload tager højde for delta/refetch fallback
            await processSinglePayload(ev);
          }
          return;
        }
        // Ellers behandler enkelt-payload normalt
        await processSinglePayload(payload);
      } catch (e) {
        // Ignorer - vi undgår console logs i produktionskoden som ønsket.
      }
    };

    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    // marketEvents kan trigge refresh med payload; lytteren registreres her
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