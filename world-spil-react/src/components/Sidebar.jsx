import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ResourceList from './ResourceList.jsx'; // Importerer den opgraderede komponent
import AnimalList from './AnimalList.jsx';

export default function Sidebar() {
    const { data } = useGameData();
    if (!data) return <aside id="sidebar"></aside>;

    const { defs, state } = data;

    return (
        <aside id="sidebar">
            <section className="panel section res-panel">
                <div className="section-head">💧 Flydende Ressourcer</div>
                <div className="section-body">
                    <ResourceList items={state.inv?.liquid} defs={defs.res} format="simple" />
                </div>
            </section>
            <section className="panel section res-panel">
                <div className="section-head">🧱 Faste Ressourcer</div>
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
        </aside>
    );
}