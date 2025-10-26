import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import Icon from '../common/Icon.jsx';

/*
  DemandList.jsx
  - Renders a compact inline list of requirement tokens (icons + labels)
  - Accepts a req string or array (e.g. "res.straw, bld.sawmill.l1")
*/

function parseReqString(req) {
  if (!req) return [];
  if (Array.isArray(req)) return req.filter(Boolean);
  return String(req).split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
}

export default function DemandList({ req }) {
  const { data } = useGameData();
  const defs = data?.defs || {};

  const reqIds = React.useMemo(() => parseReqString(req), [req]);

  if (!reqIds.length) return null;

  const nodes = reqIds.map((raw) => {
    const id = String(raw || '').trim();
    let label = id;
    let iconUrl = undefined;
    let value = undefined;

    try {
      if (id.startsWith('res.')) {
        const key = id.replace(/^res\./, '');
        const d = defs?.res?.[key];
        label = d?.name || key;
        iconUrl = d?.iconUrl;
        value = d?.iconFilename || d?.emoji || `${key}.png`;
      } else if (id.startsWith('ani.')) {
        const key = id.replace(/^ani\./, '');
        const d = defs?.ani?.[key];
        label = d?.name || key;
        iconUrl = d?.iconUrl;
        value = d?.iconFilename || d?.emoji || `${key}.png`;
      } else if (id.startsWith('bld.') || id.startsWith('add.') || id.startsWith('rsd.') || id.startsWith('rcp.')) {
        const parts = id.split('.');
        const prefix = parts[0]; // bld/add/rsd/rcp
        const key = parts.slice(1).join('.');
        const bucket = defs?.[prefix] || {};
        const d = bucket?.[key] || null;
        label = d?.name || key || id;
        iconUrl = d?.iconUrl;
        value = d?.iconFilename || d?.emoji || undefined;
      } else {
        label = id;
        iconUrl = undefined;
        value = undefined;
      }
    } catch (e) {
      label = id;
      iconUrl = undefined;
      value = undefined;
    }

    return { id, label, iconUrl, value };
  });

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {nodes.map((n) => (
        <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <Icon iconUrl={n.iconUrl} value={n.value} size={16} alt={n.label} />
          <span style={{ opacity: 0.95 }}>{n.label}</span>
        </span>
      ))}
    </span>
  );
}