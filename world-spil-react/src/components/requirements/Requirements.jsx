import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceCost from './ResourceCost.jsx';
import DemandList from './DemandList.jsx';
import StatRequirement from './StatRequirement.jsx';
import { normalizePrice, parseBldKey } from '../../services/helpers.js';

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

export function useRequirements(item) {
  const { data } = useGameData();
  if (!data || !item) return { allOk: false, Component: () => null };

  const { state } = data;
  const { price, req, duration_s, footprintDelta } = item;

  const normalizedPrice = normalizePrice(price);
  let priceOk = true;
  for (const costItem of Object.values(normalizedPrice)) {
    let have = 0;
    if (costItem.id.startsWith('ani.')) have = state.ani?.[costItem.id]?.quantity ?? 0;
    else { const key = costItem.id.replace(/^res\./, ''); have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0; }
    if (have < costItem.amount) { priceOk = false; break; }
  }

  let reqOk = true;
  const reqIds = Array.isArray(req) ? req : String(req || '').split(/[,;]/).filter(Boolean);
  for (const reqId of reqIds) {
    let satisfied = false;
    if (reqId.startsWith('bld.')) {
      const p = parseBldKey(reqId);
      if (p) satisfied = (computeOwnedMaxBySeriesFromState(state, 'bld')[p.series] || 0) >= p.level;
    } else if (reqId.startsWith('rsd.')) {
      satisfied = hasResearchInState(state, reqId);
    } else if (reqId.startsWith('add.')) {
      const m = reqId.match(/^add\.(.+)\.l(\d+)$/);
      if (m) satisfied = (computeOwnedMaxBySeriesFromState(state, 'add')[`add.${m[1]}`] || 0) >= Number(m[2]);
    }
    if (!satisfied) { reqOk = false; break; }
  }

  let footprintOk = true;
  const footprintCost = Math.abs(footprintDelta || 0);
  if (footprintCost > 0) {
    const cap = state.cap?.footprint || { total: 0, used: 0 };
    const availableCap = (cap.total || 0) - Math.abs(cap.used || 0);
    footprintOk = availableCap >= footprintCost;
  }

  const allOk = priceOk && reqOk && footprintOk;

  const RequirementsComponent = ({ showLabels = true, inline = true }) => (
    <div className="reqline">
      {Object.keys(normalizedPrice).length > 0 && (
        <>
          {showLabels && <strong>{(item.isUpgrade || item.ownedMax > 0) ? '🔨 Upgrade cost: ' : '🔨 Build cost: '}</strong>}
          <ResourceCost cost={price} />
        </>
      )}
      {reqIds.length > 0 && (inline ? ' • ' : <br />)}
      {reqIds.length > 0 && showLabels && <strong>📜 Demands: </strong>}
      {reqIds.length > 0 && <DemandList req={req} />}
      {footprintCost > 0 && (inline ? ' • ' : <br />)}
      {footprintCost > 0 && <StatRequirement icon="🏗" label="Byggepoint" value={`${footprintCost} BP`} isOk={footprintOk} />}
      {duration_s != null && (inline ? ' • ' : <br />)}
      {duration_s != null && <StatRequirement icon="⏱" label="Tid" value={`${duration_s}s`} />}
    </div>
  );

  return { allOk, Component: RequirementsComponent };
}

