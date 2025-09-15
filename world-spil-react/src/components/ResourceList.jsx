import React from 'react';
import ItemRow from './ItemRow.jsx';
import { fmt } from '../services/helpers.js';

/**
 * En specialiseret komponent, der kan vise en liste af ressourcer
 * i to forskellige formater: 'simple' (for sidebar) og 'detailed' (for inventory).
 */
export default function ResourceList({ items, defs, format = 'detailed' }) {
    const sortedItems = Object.entries(items || {}).sort();

    if (sortedItems.length === 0) {
        return <div className="sub">Ingen</div>;
    }

    return sortedItems.map(([id, amount]) => {
        const def = defs[id];
        if (!def) return null;

        // =====================================================================
        // NY LOGIK: Vælger det korrekte layout baseret på `format`-proppen.
        // =====================================================================
        if (format === 'simple') {
            // Den simple visning, som bruges i sidebaren
            return (
                <div className="row" key={id}>
                    <div className="left"><span>{def.emoji}</span><span>{def.name}</span></div>
                    <div className="right"><strong>{fmt(amount)}</strong></div>
                </div>
            );
        }
        
        if (format === 'detailed') {
            // Den detaljerede visning, som bruges på inventory-siden (uændret)
            const space = (def.unitSpace || 0) * amount;
            const unit = def.unit ? ` ${def.unit}` : "";

            return (
                <ItemRow
                    key={id}
                    icon={def.emoji}
                    title={def.name}
                    subtitle={`Fylder pr. enhed: ${def.unitSpace || 0}`}
                    value={`${fmt(amount)}${unit} / Fylder: ${fmt(space)} ialt`}
                />
            );
        }

        return null;
    });
}