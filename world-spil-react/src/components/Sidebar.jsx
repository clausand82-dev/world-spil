import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ResourceList from './ResourceList.jsx'; // Importerer den opgraderede komponent
import AnimalList from './AnimalList.jsx';
import SidebarLog from './SidebarLog.jsx';
import { fmt } from '../services/helpers.js';
import { useT } from "../services/i18n.js";

export default function Sidebar() {
    const { data } = useGameData();
    const t = useT(); // bruges til sprog
    if (!data) return <aside id="sidebar"></aside>;

    const { defs, state } = data;
    const capSolid = state?.cap?.solid?.total || {};
    const capLiquid = state?.cap?.liquid?.total || {};
    const usedSolid = state?.cap?.solid?.used || {};
    const usedLiquid = state?.cap?.liquid?.used || {};

    return (
        <aside id="sidebar">
            <section className="panel section res-panel">
                <div className="section-head">💧 {t("ui.liquid.h1")}: {fmt(usedLiquid)}/{capLiquid}</div>
                <div className="section-body">
                    <ResourceList items={state.inv?.liquid} defs={defs.res} format="simple" />
                </div>
            </section>
            <section className="panel section res-panel">
                <div className="section-head">🧱 {t('ui.solid.h1')}: {fmt(usedSolid)}/{capSolid}</div>
                <div className="section-body">
                    <ResourceList items={state.inv?.solid} defs={defs.res} format="simple" />
                </div>
            </section>
            <section className="panel section res-panel">
                <div className="section-head">🐾 Dyr</div>
                <div className="section-body">
                    <AnimalList format="simple" />
                </div>
            </section>
                        <section className="panel section res-panel">
                <div className="section-head">🐾 Log</div>
                <div className="section-body">
                    <SidebarLog />
                </div>
            </section>
        </aside>
    );
}