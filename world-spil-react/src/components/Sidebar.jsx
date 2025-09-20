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

    // Sørg for at alle cap/used værdier er tal (ikke objekter)
    const capSolid  = Number(state?.cap?.solid?.total  ?? 0);
    const capLiquid = Number(state?.cap?.liquid?.total ?? 0);
    const usedSolid  = Number(state?.cap?.solid?.used  ?? 0);
    const usedLiquid = Number(state?.cap?.liquid?.used ?? 0);

    return (
        <aside id="sidebar">
            <section className="panel section res-panel">
                <div className="section-head">💧 {t("ui.liquid.h1")}: {fmt(usedLiquid)}/{fmt(capLiquid)}</div>
                <div className="section-body">
                    <ResourceList items={state.inv?.liquid} defs={defs.res} format="simple" />
                </div>
            </section>
            <section className="panel section res-panel">
                <div className="section-head">🧱 {t('ui.solid.h1')}: {fmt(usedSolid)}/{fmt(capSolid)}</div>
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
                <div className="section-head">📰 Log</div>
                <div className="section-body">
                    <SidebarLog />
                </div>
            </section>
        </aside>
    );
}