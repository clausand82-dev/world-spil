import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';

function DemandChip({ reqId }) {
  const { data } = useGameData();
  const state = data?.state; const defs = data?.defs;
  let ok = false, label = reqId, href = '#', tip = reqId;
  if (reqId.startsWith('rsd.')) {
    const k = reqId.slice(4);
    const d = defs?.rsd?.[k];
    label = d?.name || k;
    ok = H.hasResearch(reqId, state);
    href = '#/research';
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
      const d = defs?.add?.[reqId.replace(/^add\./, '')];
      label = `${d?.name || s} L${l}`;
      const ownedAdd = H.computeOwnedMaxBySeries('add', state);
      ok = (ownedAdd[`add.${s}`] || 0) >= l;
      href = '#/building';
      tip = ok ? `Ejet: ${label}` : `Kræver: ${label}`;
    }
  }
  return <a className={ok ? 'price-ok' : 'price-bad'} href={href} title={tip}>{label}</a>;
}

export default function DemandList({ req }) {
  const reqIds = String(req || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (reqIds.length === 0) return null;
  return <>{reqIds.map((id, i) => <React.Fragment key={`${id}-${i}`}>{i > 0 && ' • '}<DemandChip reqId={id} /></React.Fragment>)}</>;
}

