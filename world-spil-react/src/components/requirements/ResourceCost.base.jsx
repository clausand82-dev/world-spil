import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { fmt, normalizePrice } from '../../services/helpers.js';
import Icon from '../common/Icon.jsx';

/*
  ResourceCost.base.jsx
  - Uses CSS classes (rc-inline, rc-tile, rc-icon, rc-name, rc-need, rc-sep-plus, rc-sep-arrow)
  - Keeps logic unchanged; visual appearance moved to requirement-layout.css
  - CHANGED: accept optional extraTransform prop to allow different transform behavior
    for the `extra` list (yields) vs the main `cost` list.
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

function CostItem({ id, needAmount = 0, isExtra = false }) {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const state = data?.state || {};
  let def = null;
  let displayName = id || '';

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
  let have = 0;
  try {
    if (String(id).startsWith('ani.')) {
      have = data?.state?.ani?.[id]?.quantity ?? 0;
    } else {
      const key = String(id).replace(/^res\./, '');
      have = Number(data?.state?.inv?.solid?.[key] || 0) + Number(data?.state?.inv?.liquid?.[key] || 0);
    }
  } catch (e) {
    have = 0;
  }
  const ok = have >= need;
  const statusClass = ok ? 'price-ok' : 'price-bad';

  const iconUrl = def?.iconUrl || undefined;
  const value = def?.iconFilename || def?.emoji || undefined;
  const title = `${displayName}: behov ${fmt(need)}${!isExtra ? ` (lager: ${fmt(have)})` : ''}`;

  return (
    <div className={`rc-tile ${isExtra ? 'rc-extra' : ''} ${statusClass}`} title={title}>
      <div className="rc-icon">
        <Icon iconUrl={iconUrl} value={value || 'default.png'} size={24} alt={displayName} /> {/* Størrelse på ikoner */}
      </div>

      <div className="rc-name" title={displayName}>
        <span>{displayName}</span>
      </div>

      <div className="rc-need">
        <span>{fmt(need)}</span>
      </div>
    </div>
  );
}

/*
  NOTE: added extraTransform param.
  - `transform` is applied to cost items (existing behavior)
  - `extraTransform` if provided is applied to extra items (yields).
  - If extraTransform is not provided we fallback to using transform (backwards compatible).
*/
export default function ResourceCost({ cost = {}, extra = null, transform, extraTransform } = {}) {
  const baseItems = Object.values(normalizePrice(cost || {}));
  const extraItemsRaw = extra ? Object.values(normalizePrice(extra || {})) : [];

  const costItems = transform
    ? baseItems.map(it => {
        const id = (it.id || '').startsWith('res.') || (it.id || '').startsWith('ani.')
          ? it.id
          : (it.id in (window?.data?.defs?.res || {}) ? `res.${it.id}` : it.id);
        const amt = transform(id, it.amount);
        return { ...it, id, amount: amt };
      })
    : baseItems;

  // Use extraTransform if provided; otherwise fall back to transform for compatibility
  const chosenExtraTransform = extraTransform ?? transform;

  const extraItems = chosenExtraTransform
    ? extraItemsRaw.map(it => {
        const id = (it.id || '').startsWith('res.') || (it.id || '').startsWith('ani.')
          ? it.id
          : (it.id in (window?.data?.defs?.res || {}) ? `res.${it.id}` : it.id);
        const amt = chosenExtraTransform(id, it.amount);
        return { ...it, id, amount: amt };
      })
    : extraItemsRaw;

  if (!costItems.length && !extraItems.length) return null;

  return (
    <div className="rc-inline" aria-hidden={false}>
      {costItems.map((item, i) => (
        <React.Fragment key={`cost-${item.id}-${i}`}>
          <CostItem id={item.id} needAmount={item.amount} isExtra={false} />
        </React.Fragment>
      ))}

      {extraItems.length > 0 && (
        <>
          {/* Kun én pil mellem cost og yield */}
          <div className="rc-sep-arrow">→</div>

          {extraItems.map((item, i) => (
            <React.Fragment key={`extra-${item.id}-${i}`}>
              <CostItem id={item.id} needAmount={item.amount} isExtra={true} />
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}