import React, { useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ResourceList from './ResourceList.jsx';
import AnimalList from './AnimalList.jsx';
import SidebarLog from './SidebarLog.jsx';
import { fmt } from '../services/helpers.js';
import { useT } from "../services/i18n.js";
import HeaderCapacities from './sidebar/SidebarCapacities.jsx';
import ResourceCapacityModal from './resources/ResourceCapacityModal.jsx';
import { StatsIcon } from '../components/common/Icon.jsx';


export default function Sidebar() {
  const { data } = useGameData();
  const t = useT();
  if (!data) return <aside id="sidebar"></aside>;

  const { defs, state } = data;

  const capSolid = Number(state?.cap?.solid?.total ?? 0);
  const capLiquid = Number(state?.cap?.liquid?.total ?? 0);
  const usedSolid = Number(state?.cap?.solid?.used ?? 0);
  const usedLiquid = Number(state?.cap?.liquid?.used ?? 0);

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
    <aside id="sidebar">
      <section className="panel section res-panel">
        <div className="section-head">
          Stats <span style={{ fontSize: 10, opacity: 0.7 }}>(klik på bar for flere informationer):</span>
        </div>
        <div className="section-body">
          <HeaderCapacities />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">
          <button
            type="button"
            onClick={() => openModal('liquid')}
            style={headerButtonStyle}
            aria-haspopup="dialog"
          >
            <span role="img" aria-hidden><StatsIcon name="stats_storageliquid.png"/></span>
            <span>{t("ui.liquid.h1")}</span>
          </button>
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            {fmt(usedLiquid)}/{fmt(capLiquid)}
          </span>
        </div>
        <div className="section-body">
          {/* 2 kolonner i sidebaren */}
          <ResourceList items={state.inv?.liquid} defs={defs.res} format="simple" columns={2} />
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
            <span role="img" aria-hidden><StatsIcon name="stats_storagesolid.png"/></span>
            <span>{t('ui.solid.h1')}</span>
          </button>
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            {fmt(usedSolid)}/{fmt(capSolid)}
          </span>
        </div>
        <div className="section-body">
          {/* 2 kolonner i sidebaren */}
          <ResourceList items={state.inv?.solid} defs={defs.res} format="simple" columns={2} />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">🐄 Dyr/Units</div>
        <div className="section-body">
          <AnimalList format="simple" />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">📰 Log</div>
        <div className="section-body">
          <SidebarLog />
        </div>
      </section>

      <ResourceCapacityModal
        open={activeModal === 'liquid'}
        onClose={closeModal}
        title={`${t("ui.liquid.h1")} – fordeling`}
        items={state.inv?.liquid}
        resDefs={defs.res || {}}
        totalCapacity={Number(state?.cap?.liquid?.total ?? 0)}
      />

      <ResourceCapacityModal
        open={activeModal === 'solid'}
        onClose={closeModal}
        title={`${t("ui.solid.h1")} – fordeling`}
        items={state.inv?.solid}
        resDefs={defs.res || {}}
        totalCapacity={Number(state?.cap?.solid?.total ?? 0)}
      />
    </aside>
  );
}
