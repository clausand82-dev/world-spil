import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ResourceList from './ResourceList.jsx';
import AnimalList from './AnimalList.jsx';
import SidebarLog from './SidebarLog.jsx';
import { fmt } from '../services/helpers.js';
import { useT } from "../services/i18n.js";
import HeaderCapacities from './sidebar/SidebarCapacities.jsx';

export default function Sidebar() {
  const { data } = useGameData();
  const t = useT();
  if (!data) return <aside id="sidebar"></aside>;

  const { defs, state } = data;

  const capSolid  = Number(state?.cap?.solid?.total  ?? 0);
  const capLiquid = Number(state?.cap?.liquid?.total ?? 0);
  const usedSolid  = Number(state?.cap?.solid?.used  ?? 0);
  const usedLiquid = Number(state?.cap?.liquid?.used ?? 0);

  return (
    <aside id="sidebar">
      <section className="panel section res-panel">
        <div className="section-head">Stats:</div>
        <div className="section-body">
          <HeaderCapacities />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">💧 {t("ui.liquid.h1")}: {fmt(usedLiquid)}/{fmt(capLiquid)}</div>
        <div className="section-body">
          {/* 2 kolonner i sidebaren */}
          <ResourceList items={state.inv?.liquid} defs={defs.res} format="simple" columns={2} />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">🧱 {t('ui.solid.h1')}: {fmt(usedSolid)}/{fmt(capSolid)}</div>
        <div className="section-body">
          {/* 2 kolonner i sidebaren */}
          <ResourceList items={state.inv?.solid} defs={defs.res} format="simple" columns={2} />
        </div>
      </section>

      <section className="panel section res-panel">
        <div className="section-head">🐾 Dyr</div>
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
    </aside>
  );
}