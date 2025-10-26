import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { fmt, normalizePrice } from '../../services/helpers.js';
import Icon from '../common/Icon.jsx';

/*
  ResourceCost.base.jsx (updated)
  - Each resource is an independent tile (icon + name + need).
  - No ✓ / ✕ displayed any more — the color of the amount indicates ok (green) or missing (red).
  - A big "+" separator is placed between tiles when rendered inline.
  - Tiles wrap per-item (flex-wrap) so each tile drops to the next row individually if there isn't room.
  - Icon fallback: both iconUrl and value are passed to Icon so default.png will be used as fallback.
*/

function getHave(state, id) {
  if (!state) return 0;
  if (!id) return 0;
  if (String(id).startsWith('ani.')) {
    return state?.ani?.[id]?.quantity ?? 0;
  }
  const key = String(id).replace(/^res\./, '');
  const liquid = Number(state?.inv?.liquid?.[key] || 0);
  const solid = Number(state?.inv?.solid?.[key] || 0);
  return liquid + solid;
}

function CostItem({ id, needAmount = 0 }) {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const state = data?.state || {};
  let def = null;
  let displayName = id;

  if (!id) return null;

  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    def = defs.ani?.[key] ?? { emoji: '🐾', name: key };
    displayName = def?.name || key;
  } else {
    const key = id.replace(/^res\./, '');
    def = defs.res?.[key] ?? { emoji: '❓', name: key };
    displayName = def?.name || key;
  }

  const need = Number(needAmount || 0);
  const have = getHave(state, id);
  const ok = have >= need;
  const color = ok ? '#0a0' : '#c33';

  const iconUrl = def?.iconUrl || undefined;
  const value = def?.iconFilename || def?.emoji || undefined;
  const title = `${displayName}: behov ${fmt(need)}`;

  return (
    <div
      className="rc-tile"
      title={title}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr',
        gridTemplateRows: 'auto auto',
        gap: '4px 8px',
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 6,
        minWidth: 130,
        background: 'transparent',
      }}
    >
      <div style={{ gridRow: '1 / span 2', display: 'grid', placeItems: 'center' }}>
        <Icon iconUrl={iconUrl} value={value || 'default.png'} size={32} alt={displayName} />
      </div>

      <div style={{
        gridColumn: '2 / 3',
        gridRow: '1 / 2',
        fontWeight: 700,
        lineHeight: 1.05,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
      </div>

      <div style={{ gridColumn: '2 / 3', gridRow: '2 / 3', fontSize: 13, color }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(need)}</span>
      </div>
    </div>
  );
}

export default function ResourceCost({ cost = {}, transform } = {}) {
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
    <div
      className="rc-inline"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        width: '100%',
      }}
    >
      {costItems.map((item, i) => (
        <React.Fragment key={`${item.id}-${i}`}>
          <CostItem id={item.id} needAmount={item.amount} />
          {i < costItems.length - 1 && (
            <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.6)', marginLeft: -2, marginRight: -2 }}>+</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}