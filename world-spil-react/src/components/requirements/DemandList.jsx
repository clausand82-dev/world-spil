import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';

function computeOwnedMaxBySeriesFromState(state, stateKey = 'bld') {
  const bySeries = {};
  const source = state?.[stateKey] || {};
  for (const key of Object.keys(source)) {
    const m = key.match(new RegExp(`^${stateKey}\\.(.+)\\.l(\\\d+)$`));
    if (!m) continue;
    const series = `${stateKey}.${m[1]}`;
    const level = Number(m[2]);
    bySeries[series] = Math.max(bySeries[series] || 0, level);
  }
  return bySeries;
}
function hasResearchInState(state, rsdIdFull) {
  if (!rsdIdFull) return false;
  const key = String(rsdIdFull).replace(/^rsd\./, '');
  return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[rsdIdFull]);
}

function DemandChip({ reqId }) {
  const { data } = useGameData();
  const state = data?.state; const defs = data?.defs;
  let ok = false, label = reqId, href = '#', tip = reqId;
  if (reqId.startsWith('rsd.')) {
    const k = reqId.slice(4);
    const d = defs?.rsd?.[k];
    label = d?.name || k;
    ok = hasResearchInState(state, reqId);
    href = '#/research';
    tip = ok ? `Fuldført: ${label}` : `Kræver: ${label}`;
  } else if (reqId.startsWith('bld.')) {
    const p = H.parseBldKey(reqId);
    if (p) {
      const d = defs?.bld?.[`${p.family}.l${p.level}`];
      label = `${d?.name || p.family} L${p.level}`;
      const ownedBySeries = computeOwnedMaxBySeriesFromState(state, 'bld');
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
      const ownedAdd = computeOwnedMaxBySeriesFromState(state, 'add');
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
  return <>{reqIds.map((id, i) => <React.Fragment key={id}>{i > 0 && ' • '}<DemandChip reqId={id} /></React.Fragment>)}</>;
}

