import React, { useEffect, useMemo, useState } from 'react';
import ItemRow from './ItemRow.jsx';
import ResourceHoverContent, { SimpleResourceSummary } from './resources/ResourceHoverContent.jsx';
import StatsEffectsTooltip from './ui/StatsEffectsTooltip.jsx';
import DockHoverCard from './ui/DockHoverCard.jsx';
import { useGameData } from '../context/GameDataContext.jsx';
import { buildPassiveYieldTitle } from '../services/passiveYields.js';
import { fmt } from '../services/helpers.js';
import Icon from './ui/Icon.jsx';

/**
 * ResourceList
 *
 * - Shows icons using ui/Icon (robust resolution of iconUrl / emoji)
 * - Restores click dispatch for 'resources:trade'
 * - Ensures instant sidebar updates by keeping an internal items state that is
 *   refreshed when the global game state inventory changes (covers in-place mutation cases).
 *
 * Props:
 *  - items: optional map of id->amount (if not provided, we derive from GameDataContext)
 *  - defs: optional defs map (fallback to game defs)
 *  - format: 'detailed' | 'simple'
 *  - columns: for simple grid
 */

function dispatchResourceTrade(resId, payload = {}) {
  if (!resId) return;
  if (String(resId).startsWith('ani.')) return;
  try {
    window.dispatchEvent(new CustomEvent('resources:trade', { detail: { resId, ...payload } }));
  } catch (e) {
    // fallback for very old browsers
    try {
      const ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('resources:trade', true, true, { resId, ...payload });
      window.dispatchEvent(ev);
    } catch (err) {
      console.warn('dispatchResourceTrade failed', err);
    }
  }
}

export default function ResourceList({ items: itemsProp, defs, format = 'detailed', columns = 1 }) {
  const { data } = useGameData();
  const gameDefs = data?.defs || {};
  const gameState = data?.state || {};
  const translations = data?.i18n?.current ?? {};

  // derive fallback items from global state (liquid first then solid)
  const deriveItemsFromState = useMemo(() => {
    // prefer the explicit inventory buckets if present (caller may expect liquid/solid)
    return gameState?.inv?.liquid && Object.keys(gameState.inv.liquid).length ? gameState.inv.liquid
      : (gameState?.inv?.solid && Object.keys(gameState.inv.solid || {}).length ? gameState.inv.solid : {});
  }, [gameState?.inv?.liquid, gameState?.inv?.solid]);

  // internal items state: start from prop if provided, else from derived global state
  const [items, setItems] = useState(() => itemsProp ?? deriveItemsFromState);

  // keep in sync: update items when either the prop changes OR the global inventory changes.
  // This fixes the "sidebar not updating instantly" when the parent passes a mutated object
  // or when the global game state updates directly.
  useEffect(() => {
    setItems(itemsProp ?? deriveItemsFromState);
  }, [itemsProp, deriveItemsFromState]);

  const resDefs = gameDefs.res || defs || {};
  const sortedItems = Object.entries(items || {}).sort();

  if (sortedItems.length === 0) return <div className="sub">Ingen</div>;

  // helper: click coords + bounding rect (sends resource name + emoji)
  const handleClickWithRect = (e, fullResId, resName, resEmoji) => {
    const clickX = e.clientX ?? null;
    const clickY = e.clientY ?? null;
    const el = e.currentTarget || e.target;
    const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const payload = {};
    if (rect) {
      payload.rect = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY,
      };
    }
    if (typeof clickX === 'number' && typeof clickY === 'number') {
      payload.click = { x: clickX + window.scrollX, y: clickY + window.scrollY };
    }
    payload.resName = resName || fullResId;
    payload.resEmoji = resEmoji || '';
    dispatchResourceTrade(fullResId, payload);
  };

  // SIMPLE view: compact grid
  if (format === 'simple') {
    const cells = sortedItems.map(([id, amount]) => {
      const def = resDefs[id];
      if (!def) return null;
      const fullResId = `res.${id}`;
      let hoverText = '';
      try {
        hoverText = buildPassiveYieldTitle({
          defs: gameDefs,
          state: gameState,
          resource: fullResId,
          mode: 'both',
          heading: def.name || id,
        });
      } catch (e) { hoverText = ''; }

      const hoverContent = (
        <div style={{ maxWidth: 420, maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          <SimpleResourceSummary resourceDef={def} amount={amount} totalSpace={(def.unitSpace || 0) * amount} />
          {hoverText ? <div style={{ marginTop: 6 }}>{hoverText}</div> : <div style={{ marginTop: 6, opacity: 0.7 }}>Ingen passive kilder fundet.</div>}
        </div>
      );

      const emojiDef = { iconUrl: def.iconUrl, emoji: def.emoji, name: def.name };

      return (
        <DockHoverCard key={id} content={hoverContent} style={{ display: 'block' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => handleClickWithRect(e, fullResId, def.name, def.emoji)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClickWithRect(e, fullResId, def.name, def.emoji); } }}
            style={{ cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
          >
            <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon def={emojiDef} alt={def.name} size={28} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{def.name}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{fmt(amount)}{def.unit ? ` ${def.unit}` : ''}</div>
            </div>
          </div>
        </DockHoverCard>
      );
    });

    return (
      <div className="resource-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Number(columns) || 1)}, minmax(0, 1fr))`, gap: 6 }}>
        {cells}
      </div>
    );
  }

  // DETAILED view
  return sortedItems.map(([id, amount]) => {
    const def = resDefs[id];
    if (!def) return null;

    const fullResId = `res.${id}`;
    const space = (def.unitSpace || 0) * amount;
    const unit = def.unit ? ` ${def.unit}` : "";

    let hoverText = '';
    try {
      hoverText = buildPassiveYieldTitle({
        defs: gameDefs,
        state: gameState,
        resource: fullResId,
        mode: 'both',
        heading: def.name || id,
      });
    } catch (e) { hoverText = ''; }

    const hoverContent = (
      <div style={{ display: 'grid', gap: 12 }}>
        <ResourceHoverContent
          resourceId={fullResId}
          resourceDef={def}
          amount={amount}
          totalSpace={space}
        />
        <div style={{
          borderTop: '1px solid rgba(0,0,0,0.08)',
          paddingTop: 8,
          display: 'grid',
          gap: 4,
          fontSize: 12,
        }}>
          <StatsEffectsTooltip def={def} translations={translations} />
        </div>
      </div>
    );

    const emojiDef = { iconUrl: def.iconUrl, emoji: def.emoji, name: def.name };

    return (
      <DockHoverCard
        key={id}
        content={hoverContent}
        style={{ display: 'block', width: '100%' }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => handleClickWithRect(e, fullResId, def.name, def.emoji)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClickWithRect(e, fullResId, def.name, def.emoji); } }}
          className="row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '6px 8px',
            minWidth: 0,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          <div className="left" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon def={emojiDef} alt={def.name} size={36} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span title={def.name}>{def.name}</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                Fylder pr. enhed: {def.unitSpace || 0}{unit}
              </div>
            </div>
          </div>
          <div className="right" style={{ fontWeight: 600, marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(amount)}{unit} / Fylder: {fmt(space)} ialt
          </div>
        </div>
      </DockHoverCard>
    );
  });
}