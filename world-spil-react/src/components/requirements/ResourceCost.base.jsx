import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { fmt, normalizePrice } from '../../services/helpers.js';
import Icon from '../common/Icon.jsx';

/*
  ResourceCost.base.jsx
  - Pure/basic rendering of a price object (no buffing)
  - New layout: icon occupies two rows:
      [ ICON ]  [ NAME (bold) ]
      [ ICON ]  [ HAVE / NEED (colored) ]
*/

function CostItem({ id, needAmount = 0 }) {
  const { data } = useGameData();
  const defs = data?.defs || {};
  let haveAmount = 0;
  let def = null;
  let displayName = id;

  if (!id) return null;

  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    def = defs.ani?.[key] ?? { emoji: '🐾', name: key };
    haveAmount = data?.state?.ani?.[id]?.quantity ?? 0;
    displayName = def?.name || key;
  } else {
    const key = id.replace(/^res\./, '');
    def = defs.res?.[key] ?? { emoji: '❓', name: key };
    haveAmount = data?.state?.inv?.solid?.[key] ?? data?.state?.inv?.liquid?.[key] ?? 0;
    displayName = def?.name || key;
  }

  const ok = Number(haveAmount || 0) >= Number(needAmount || 0);
  const color = ok ? '#0a0' : '#c33';

  // Resolve icon candidate: prefer def.iconUrl, then def.iconFilename, then def.emoji
  const iconUrl = def?.iconUrl || undefined;
  const value = def?.iconFilename || def?.emoji || undefined;

  const title = `${def?.name || displayName}: ${fmt(haveAmount)} / ${fmt(needAmount)}`;

  // Grid layout with icon in left column spanning two rows
  return (
    <span title={title} style={{ display: 'inline-block', minWidth: 100, marginBottom: 6 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr',
        gridTemplateRows: 'auto auto',
        gap: '2px 8px',
        alignItems: 'center'
      }}>
        <div style={{ gridRow: '1 / span 2', display: 'grid', placeItems: 'center' }}>
          <Icon iconUrl={iconUrl} value={value} size={28} alt={displayName} />
        </div>

        <div style={{ gridColumn: '2 / 3', gridRow: '1 / 2', fontWeight: 700, lineHeight: 1.1 }}>
          {displayName}
        </div>

        <div style={{ gridColumn: '2 / 3', gridRow: '2 / 3', fontSize: 13, color }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(haveAmount)}</span>
          <span className="sub" style={{ marginLeft: 8 }}>/ {fmt(needAmount)}</span>
          <span style={{ marginLeft: 10, opacity: 0.85 }}>{ok ? '✓' : '✕'}</span>
        </div>
      </div>
    </span>
  );
}

export default function ResourceCost({ cost = {}, transform } = {}) {
  // transform?: (id:string, base:number) => number
  const items = Object.values(normalizePrice(cost || {}));
  const costItems = transform
    ? items.map(it => {
        const id = (it.id || '').startsWith('res.') || (it.id || '').startsWith('ani.')
          ? it.id
          : (it.id in (window?.data?.defs?.res || {}) ? `res.${it.id}` : it.id);
        const amt = transform(id, it.amount);
        return { ...it, id, amount: amt };
      })
    : items;

  if (!costItems.length) return null;

  return (
    <>
      {costItems.map((item, i) => (
        <React.Fragment key={`${item.id}-${i}`}>
          {i > 0 && <div style={{ height: 6 }} />}
          <CostItem id={item.id} needAmount={item.amount} />
        </React.Fragment>
      ))}
    </>
  );
}