import React from 'react';
import ItemRow from './ItemRow.jsx';
import ResourceHoverContent from './resources/ResourceHoverContent.jsx';
import StatsEffectsTooltip from './ui/StatsEffectsTooltip.jsx';
import DockHoverCard from './ui/DockHoverCard.jsx';
import { useGameData } from '../context/GameDataContext.jsx';
import { buildPassiveYieldTitle } from '../services/passiveYields.js';
import { fmt } from '../services/helpers.js';

/**
 * ResourceList med click-event der sender både bounding rect og click coords
 * (click coords bruges nu til at placere popover nøjagtigt hvor brugeren klikker).
 */

function dispatchResourceTrade(resId, payload = {}) {
  if (!resId) return;
  if (String(resId).startsWith('ani.')) return;
  window.dispatchEvent(new CustomEvent('resources:trade', { detail: { resId, ...payload } }));
}

export default function ResourceList({ items, defs, format = 'detailed', columns = 1 }) {
  const { data } = useGameData();
  const gameDefs = data?.defs || {};
  const state = data?.state || {};
  const translations = data?.i18n?.current ?? {};

  const resDefs = gameDefs.res || defs || {};
  const sortedItems = Object.entries(items || {}).sort();

  if (sortedItems.length === 0) return <div className="sub">Ingen</div>;

  // helper: hent click coords og rect - now også sender resource name
  const handleClickWithRect = (e, fullResId, resName, resEmoji) => {
    // client coords relative to viewport
    const clickX = e.clientX ?? null;
    const clickY = e.clientY ?? null;
    // bounding rect for the clicked element
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
    // send resource name and emoji (fallbacks)
    payload.resName = resName || fullResId;
    payload.resEmoji = resEmoji || '';
    dispatchResourceTrade(fullResId, payload);
  };

  if (format === 'simple') {
    const cells = sortedItems.map(([id, amount]) => {
      const def = resDefs[id];
      if (!def) return null;
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
      } catch (e) { hoverText = ''; }

      const hoverContent = (
        <div style={{ maxWidth: 420, maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {def.emoji ? <span style={{ marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>{def.emoji}</span> : null}
{def.name || id}
          </div>
          <div style={{ marginBottom: 8, opacity: 0.85 }}>
            Mængde: {fmt(amount)}{def.unit ? ` ${def.unit}` : ''} • UnitSpace: {Number(def.unitSpace ?? 0)}
          </div>
          {hoverText ? <div>{hoverText}</div> : <div style={{ opacity: 0.7 }}>Ingen passive kilder fundet.</div>}
        </div>
      );
      
const emojiTextForPayload = def.emojiText ?? (typeof def.emoji === 'string' ? def.emoji : '');

     return (
  <DockHoverCard key={id} content={hoverContent} style={{ display: 'block', width: '100%' }}>
    <div
      className="row"
      role="button"
      tabIndex={0}
      onClick={(e) => handleClickWithRect(e, fullResId, def.name, emojiTextForPayload)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClickWithRect(e, fullResId, def.name, emojiTextForPayload); } }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 8px',
        cursor: 'pointer',
        minWidth: 0,
        borderRadius: 8,
      }}
    >
      <div className="left" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <span>{def.emoji}</span>
        <span title={def.name} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.name}</span>
      </div>
      <div className="right" style={{ fontWeight: 600, marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {fmt(amount)}
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

  // detailed
  if (format === 'detailed') {
    return sortedItems.map(([id, amount]) => {
      const def = resDefs[id];
      if (!def) return null;
      const fullResId = `res.${id}`;
      const space = (def.unitSpace || 0) * amount;
      const unit = def.unit ? ` ${def.unit}` : "";

      const hoverContent = (
        <div style={{ display: 'grid', gap: 12 }}>
          <ResourceHoverContent
            resourceId={fullResId}
            resourceDef={def}
            amount={amount}
            totalSpace={space}
          /><div
        style={{
          borderTop: '1px solid rgba(0,0,0,0.08)',
          paddingTop: 8,
          display: 'grid',
          gap: 4,
          fontSize: 12,
        }}
      >
          <StatsEffectsTooltip def={def} translations={translations} />
        </div></div>
      );

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
            style={{ cursor: 'pointer' }}
          >
            <ItemRow
              icon={def.emoji}
              title={def.name}
              subtitle={`Fylder pr. enhed: ${def.unitSpace || 0}`}
              value={`${fmt(amount)}${unit} / Fylder: ${fmt(space)} ialt`}
            />
          </div>
        </DockHoverCard>
      );
    });
  }

  return null;
}
