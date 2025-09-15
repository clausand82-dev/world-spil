import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ResourceList from '../components/ResourceList.jsx';
import AnimalList from '../components/AnimalList.jsx';
import { fmt } from '../services/helpers.js';

export default function InventoryPage() {
    const { data, isLoading, error } = useGameData();

    if (isLoading) return <div className="sub">Indlæser beholdning...</div>;
    if (error) return <div className="sub">Fejl: Kunne ikke hente data.</div>;

    const { defs, state } = data;
    const { cap = {} } = state;

    return (
        <>
            <section className="panel section res-panel">
                <div className="section-head">
                    💧 Flydende Ressourcer
                    <span style={{ marginLeft: 'auto', fontWeight: '600' }}>
                        {fmt(cap.liquid?.used || 0)} / {fmt(cap.liquid?.total || 0)}
                    </span>
                </div>
                <div className="section-body"><ResourceList items={state.inv?.liquid} defs={defs.res} /></div>
            </section>
            <section className="panel section res-panel">
                <div className="section-head">
                    🧱 Faste Ressourcer
                    <span style={{ marginLeft: 'auto', fontWeight: '600' }}>
                        {fmt(cap.solid?.used || 0)} / {fmt(cap.solid?.total || 0)}
                    </span>
                </div>
                <div className="section-body"><ResourceList items={state.inv?.solid} defs={defs.res} /></div>
            </section>
            <section className="panel section res-panel">
                <div className="section-head">
                    🐾 Dyr
                    <span style={{ marginLeft: 'auto', fontWeight: '600' }}>
                        {fmt(cap.animal_cap?.used || 0)} / {fmt(cap.animal_cap?.total || 0)}
                    </span>
                </div>
                <div className="section-body">
                    <AnimalList format="detailed" />
                </div>
            </section>
        </>
    );
}