import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';
import Icon from '../common/Icon.jsx';

/*
  DemandList.jsx (small tokens used for requirements)
  - DemandToken passes both iconUrl and value to Icon to ensure fallback to default.png.
  - Token layout: small icon + label (inline).
  - Functionality unchanged (links and ok-checks preserved).
*/

function computeOwnedMaxBySeriesFromState(state, stateKey = 'bld') {
  const bySeries = {};
  const source = state?.[stateKey] || {};
  for (const key of Object.keys(source)) {
    const m = key.match(new RegExp(`^${stateKey}\\.(.+)\\.l(\\d+)$`));
    if (!m) continue;
    const series = `${stateKey}.${m[1]}`;
    const level = Number(m[2]);
    bySeries[series] = Math.max(bySeries[series] || 0, level);
  }
  return bySeries;
}

export function DemandToken({ reqId, compact = true }) {
  const { data } = useGameData();
  const state = data?.state; const defs = data?.defs;
  let ok = false, label = reqId, href = '#', tip = reqId;

  if (reqId.startsWith('rsd.')) {
    const k = reqId.slice(4);
    const d = defs?.rsd?.[k];
    label = d?.name || k;
    ok = H.hasResearch(reqId, state);
    href = `#/research?focus=${encodeURIComponent(reqId)}`;
    tip = ok ? `Fuldført: ${label}` : `Kræver: ${label}`;
  } else if (reqId.startsWith('bld.')) {
    const p = H.parseBldKey(reqId);
    if (p) {
      const d = defs?.bld?.[`${p.family}.l${p.level}`];
      label = `${d?.name || p.family} L${p.level}`;
      const ownedBySeries = H.computeOwnedMaxBySeries('bld', state);
      ok = (ownedBySeries[p.series] || 0) >= p.level;
      href = '#/buildings';
      tip = ok ? `Ejet: ${label}` : `Kræver: ${label}`;
    }
  } else if (reqId.startsWith('add.')) {
    const m = reqId.match(/^add\.(.+)\.l(\d+)$/);
    if (m) {
      const [s, l] = [m[1], +m[2]];
      const d = defs?.add?.[reqId.replace(/^add\./, '')] || defs?.add?.[`${s}.l${l}`] || defs?.add?.[s];
      label = `${d?.name || s} L${l}`;
      const ownedAdd = H.computeOwnedMaxBySeries('add', state);
      ok = (ownedAdd[`add.${s}`] || 0) >= l;
      href = '#/building';
      tip = ok ? `Ejet: ${label}` : `Kræver: ${label}`;
    }
  }

  // determine type icon (rsd/bld/add) - try to get a relevant iconUrl if defs expose it, fallback to default
  const defaultIcon = '/assets/icons/default.png';
  let typeIconUrl = defaultIcon;
  try {
    const prefix = String(reqId || '').slice(0, 3);
    if (prefix === 'rsd') {
      const key = reqId.replace(/^rsd\./, '').split('.')[0];
      typeIconUrl = '/assets/icons/symbol_research.png' || defaultIcon;
    } else if (prefix === 'bld') {
      const key = reqId.replace(/^bld\./, '').split('.')[0];
      typeIconUrl = '/assets/icons/symbol_building.png' || defaultIcon;
    } else if (prefix === 'add') {
      const key = reqId.replace(/^add\./, '').split('.')[0];
      typeIconUrl = '/assets/icons/symbol_addon.png' || defaultIcon;
    }
  } catch (e) {
    typeIconUrl = defaultIcon;
  }

  const color = ok ? '#0a0' : '#c33';

  return (
    <a
      href={href}
      title={tip}
      className={ok ? 'price-ok demand-token' : 'price-bad demand-token'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 6px',
        textDecoration: 'none',
        borderRadius: 6,
        minWidth: compact ? 120 : 160,
      }}
    >
      <Icon iconUrl={typeIconUrl} value={'default.png'} size={20} />
      <span style={{ fontWeight: 600, color }}>{label}</span>
    </a>
  );
}

export default function DemandList({ req }) {
  if (!req) return null;
  const reqIds = Array.isArray(req)
    ? req.map(s => String(s || '').trim()).filter(Boolean)
    : String(req || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);

  if (!reqIds.length) return null;

  return (
    <div className="demand-list" style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-start' }}>
      {reqIds.map((id, i) => <DemandToken key={`${id}-${i}`} reqId={id} compact={true} />)}
    </div>
  );
}