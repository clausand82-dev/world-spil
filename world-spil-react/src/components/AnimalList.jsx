import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import ItemRow from './ItemRow.jsx';
import { fmt } from '../services/helpers.js';

/**
 * En specialiseret komponent, der kan vise en liste af ejede dyr
 * i to forskellige formater: 'simple' (for sidebar) og 'detailed' (for inventory).
 */
export default function AnimalList({ format = 'simple' }) {
    const { data } = useGameData();
    if (!data) return null;

    const ownedAnimals = Object.entries(data.state.ani || {})
        .filter(([id, a]) => (a?.quantity || 0) > 0)
        .sort();

    if (ownedAnimals.length === 0) {
        return <div className="sub">Ingen</div>;
    }

    return ownedAnimals.map(([id, animalData]) => {
        const key = id.replace(/^ani\./, '');
        const def = data.defs.ani?.[key];
        if (!def) return null;

        if (format === 'simple') {
            // Simpel visning til sidebaren
            return (
                <div className="row" key={id}>
                    <div className="left"><span>{def.emoji}</span><span>{def.name}</span></div>
                    <div className="right"><strong>{fmt(animalData.quantity)}</strong></div>
                </div>
            );
        }

        if (format === 'detailed') {
            // Detaljeret visning til inventory-siden
            return (
                <ItemRow
                    key={id}
                    icon={def.emoji}
                    title={def.name}
                    subtitle={`Optager ${Math.abs(def.stats?.animal_cap) || 0} staldplads pr stk`}
                    value={`${fmt(animalData.quantity)} stk / Fylder ${Math.abs(def.stats?.animal_cap) * fmt(animalData.quantity)} staldpladser ialt`}
                />
            );
        }
        
        return null;
    });
}