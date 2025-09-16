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
   if (id.startsWith('ani.')) {
     return <span className={colorClass} title={`${def.name}: ${fmt(haveAmount)} / ${fmt(needAmount)}`}>{fmt(haveAmount)} / {fmt(needAmount)} {def.emoji || ''}</span>;
   }
   return <><span className={colorClass}>{def.emoji} {fmt(haveAmount)}</span><span className="sub">/ {fmt(needAmount)}</span></>;
 }

export default function ResourceCost({ cost, transform }) {
  // transform?: (id:string, base:number) => number
  const items = Object.values(normalizePrice(cost));
  const costItems = transform
    ? items.map(it => {
        // sikring: hvis nogen steder bruger "money" uden "res.", så prefix
        const id = it.id.startsWith('res.') || it.id.startsWith('ani.')
          ? it.id
          : (it.id in (window?.data?.defs?.res||{}) ? `res.${it.id}` : it.id);
        const amt = transform(id, it.amount);
        return { ...it, id, amount: amt };
      })
    : items;
  if (costItems.length === 0) return null;
  return costItems.map((item, i) => (
    <React.Fragment key={`${item.id}-${i}`}>
      {i > 0 && ' • '}
      <CostItem id={item.id} needAmount={item.amount} />
    </React.Fragment>
  ));
}