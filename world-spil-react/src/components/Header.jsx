import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { fmt } from '../services/helpers.js';

export default function Header() {
    const { data } = useGameData();
    if (!data) return <header className="topbar"><div>Indlæser...</div></header>;

    const { solid = {}, liquid = {} } = data.state.inv || {};
    const { footprint = {}, animal_cap = {} } = data.state.cap || {};
    const resDefs = data.defs.res || {};

    return (
        <header className="topbar">
            <div className="brand">
                <span className="brand-emoji">🌍</span>
                <span className="brand-name">World</span>
            </div>
            <div className="header-resources">
                <span className="res-chip" title={resDefs.wood?.name}>{resDefs.wood?.emoji} {fmt(solid.wood || 0)}</span>
                <span className="res-chip" title={resDefs.stone?.name}>{resDefs.stone?.emoji} {fmt(solid.stone || 0)}</span>
                <span className="res-chip" title={resDefs.water?.name}>{resDefs.water?.emoji} {fmt(liquid.water || 0)}</span>
                <span className="res-chip" title="Kr">💰 {fmt(solid.money || 0)}</span>
                <span className="res-chip" title="Staldplads">🐾 {fmt(animal_cap.used || 0)}<span className="max">/{fmt(animal_cap.total || 0)}</span></span>
                <span className="res-chip" title="Byggepoint">⬛ {fmt(Math.abs(footprint.used) || 0)}<span className="max">/{fmt(footprint.total || 0)}</span></span>
            </div>
            <div className="header-tools">
                {/* Login/bruger-info kan tilføjes her senere */}
            </div>
        </header>
    );
}