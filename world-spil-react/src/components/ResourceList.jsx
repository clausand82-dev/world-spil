import React from 'react';
import ItemRow from './ItemRow.jsx';
import HoverCard from './ui/HoverCard.jsx';
import { useGameData } from '../context/GameDataContext.jsx';
import { buildPassiveYieldTitle } from '../services/passiveYields.js';
import { fmt } from '../services/helpers.js';

/**
 * En specialiseret komponent, der kan vise en liste af ressourcer
 * i to forskellige formater: 'simple' (for sidebar) og 'detailed' (for inventory).
 *
 * Ekstra props:
 * - columns (kun for format="simple"): antal kolonner i grid (default 1)
 */
export default function ResourceList({ items, defs, format = 'detailed', columns = 1 }) {
  const { data } = useGameData();
  const gameDefs = data?.defs || {};
  const state = data?.state || {};

  // Behold kompatibilitet: hvis caller sender defs (res-defs), brug dem som fallback
  const resDefs = gameDefs.res || defs || {};

  const sortedItems = Object.entries(items || {}).sort();

  if (sortedItems.length === 0) {
    return <div className="sub">Ingen</div>;
  }

  // Simple layout (sidebar) som grid med N kolonner
  if (format === 'simple') {
    const cells = sortedItems.map(([id, amount]) => {
      const def = resDefs[id];
      if (!def) return null;

      // Byg hover-indhold – genbrug passive yield-title (give/take)
      const fullResId = `res.${id}`;
      let hoverText = '';
      try {
        hoverText = buildPassiveYieldTitle({
          defs: gameDefs,
          state,
          resource: fullResId,
          mode: 'both',
          heading: def.name || id,
        });
      } catch (e) {
        hoverText = '';
      }

      const hoverContent = (
        <div style={{ maxWidth: 420, maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {def.emoji ? `${def.emoji} ` : ''}{def.name || id}
          </div>
          <div style={{ marginBottom: 8, opacity: 0.85 }}>
            Mængde: {fmt(amount)}{def.unit ? ` ${def.unit}` : ''} • UnitSpace: {Number(def.unitSpace ?? 0)}
          </div>
          {hoverText
            ? <div>{hoverText}</div>
            : <div style={{ opacity: 0.7 }}>Ingen passive kilder fundet.</div>
          }
        </div>
      );

      // Én linje pr. ressource + ellipsis, og HoverCard-wrapper der fylder hele cellen
      return (
        <HoverCard key={id} content={hoverContent} style={{ display: 'block', width: '100%' }}>
          <div
            className="row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '2px 0',
              cursor: 'pointer',
              minWidth: 0, // vigtig ift. ellipsis
            }}
          >
            <div
              className="left"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span>{def.emoji}</span>
              <span
                title={def.name}
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {def.name}
              </span>
            </div>
            <div
              className="right"
              style={{ fontWeight: 600, marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(amount)}
            </div>
          </div>
        </HoverCard>
      );
    });

    return (
      <div
        className="resource-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, Number(columns) || 1)}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {cells}
      </div>
    );
  }

  // Detailed layout (inventory-siden) – uændret
  if (format === 'detailed') {
    return sortedItems.map(([id, amount]) => {
      const def = resDefs[id];
      if (!def) return null;

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
    });
  }

  return null;
}