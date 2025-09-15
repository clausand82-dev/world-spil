import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { fmt, normalizePrice } from '../../services/helpers.js';

function CostItem({ id, needAmount }) {
    const { data } = useGameData();
    let haveAmount = 0; let def = null;
    if (id.startsWith('ani.')) {
        const key=id.replace(/^ani\./,''); def=data.defs.ani?.[key]??{emoji:'🐾',name:key}; haveAmount=data.state.ani?.[id]?.quantity??0;
    } else {
        const key=id.replace(/^res\./,''); def=data.defs.res?.[key]??{emoji:'❓',name:key}; haveAmount=data.state.inv?.solid?.[key]??data.state.inv?.liquid?.[key]??0;
    }
    const ok = haveAmount >= needAmount;
    const colorClass = ok ? 'price-ok' : 'price-bad';
    return <span className={colorClass} title={`${def.name}: ${fmt(haveAmount)} / ${fmt(needAmount)}`}>{def.emoji} {fmt(needAmount)}</span>;
}
export default function ResourceCost({ cost }) {
    const costItems = Object.values(normalizePrice(cost));
    if (costItems.length === 0) return null;
    return costItems.map((item, i) => <React.Fragment key={item.id}>{i > 0 && ' • '}<CostItem id={item.id} needAmount={item.amount} /></React.Fragment>);
}