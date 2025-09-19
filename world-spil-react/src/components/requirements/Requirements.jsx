// src/component/requirement/Requirements.jsx
import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceCost from './ResourceCost.jsx';
import DemandList from './DemandList.jsx';
import StatRequirement from './StatRequirement.jsx';
import { normalizePrice, parseBldKey, prettyTime, computeOwnedMaxBySeries, hasResearch } from '../../services/helpers.js';
import { applySpeedBuffsToDuration } from '../../services/calcEngine-lite.js';
import { useT } from "../../services/i18n.js";

function inferAction(item) {
  const id = String(item?.id || '');
  if (id.startsWith('rsd.')) return 'produce';
  if (item?.isUpgrade || (item?.ownedMax ?? 0) > 0) return 'upgrade';
  return 'build';
}

export function useRequirements(item) {
  const { data } = useGameData();
  if (!data || !item) return { allOk: false, Component: () => null };

  const { price, req, duration_s, footprintDelta } = item;
  const { state } = data;
  const t = useT();

  const activeBuffs = React.useMemo(() => {
    const out = [];
    const push = (arr) => Array.isArray(arr) && arr.forEach((b) => out.push(b));
    for (const key of ['bld', 'add', 'rsd']) {
      const bag = data?.defs?.[key] || {};
      Object.values(bag).forEach((def) => push(def?.buffs));
    }
    return out;
  }, [data?.defs]);

  const normalizedPrice = normalizePrice(price);
  let priceOk = true;
  for (const costItem of Object.values(normalizedPrice)) {
    let have = 0;
    if (costItem.id.startsWith('ani.')) {
      have = state.ani?.[costItem.id]?.quantity ?? 0;
    } else {
      const key = costItem.id.replace(/^res\./, '');
      have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0;
    }
    if (have < costItem.amount) {
      priceOk = false;
      break;
    }
  }

  let reqOk = true;
  const reqIds = Array.isArray(req) ? req : String(req || '').split(/[,;]/).filter(Boolean);
  for (const reqId of reqIds) {
    let satisfied = false;
    if (reqId.startsWith('bld.')) {
      const parsed = parseBldKey(reqId);
      if (parsed) satisfied = (computeOwnedMaxBySeries('bld', state)[parsed.series] || 0) >= parsed.level;
    } else if (reqId.startsWith('rsd.')) {
      satisfied = hasResearch(reqId, state);
    } else if (reqId.startsWith('add.')) {
      const match = reqId.match(/^add\.(.+)\.l(\d+)$/);
      if (match) satisfied = (computeOwnedMaxBySeries('add', state)[`add.${match[1]}`] || 0) >= Number(match[2]);
    }
    if (!satisfied) {
      reqOk = false;
      break;
    }
  }

  const footprintChange = Number(footprintDelta ?? 0);
  const footprintCost = footprintChange < 0 ? Math.abs(footprintChange) : 0;
  let footprintOk = true;
  if (footprintCost > 0) {
    const cap = state.cap?.footprint || { total: 0, used: 0 };
    const availableCap = (cap.total || 0) - Math.abs(cap.used || 0);
    footprintOk = availableCap >= footprintCost;
  }

  const allOk = priceOk && reqOk && footprintOk;

  const action = inferAction(item);
  const parsedDuration = Number(duration_s);
  const baseDurationS = Number.isFinite(parsedDuration) ? parsedDuration : null;
  const finalDurationS = baseDurationS != null
    ? applySpeedBuffsToDuration(baseDurationS, action, {
        appliesToCtx: item.id || 'all',
        activeBuffs,
      })
    : null;
  const displayDurationS = finalDurationS ?? baseDurationS;
  const hasDurationBuff = finalDurationS != null && baseDurationS != null && Math.round(finalDurationS) !== Math.round(baseDurationS);
  const durationLabel = displayDurationS != null ? prettyTime(displayDurationS) : null;
  const durationTitle = hasDurationBuff ? `Normal: ${prettyTime(baseDurationS ?? 0)}` : undefined;

  const RequirementsComponent = ({ showLabels = true, inline = true }) => (
    <div className="reqline">
      {Object.keys(normalizedPrice).length > 0 && (
        <>
          {showLabels && <strong>{(item.isUpgrade || item.ownedMax > 0) ? 'Upgrade cost: ' : 'Build cost: '}</strong>}
          <ResourceCost cost={price} />
        </>
      )}

      {reqIds.length > 0 && (inline ? <span className="sep">|</span> : <br />)}
      {reqIds.length > 0 && showLabels && <strong>Demands: </strong>}
      {reqIds.length > 0 && <DemandList req={req} />}

      {footprintCost > 0 && (inline ? <span className="sep">|</span> : <br />)}
      {footprintCost > 0 && (
        <StatRequirement icon={t('ui.emoji.footprint.h1')} value={`${footprintCost} BP`} isOk={footprintOk} />
      )}

      {durationLabel && (inline ? <span className="sep">|</span> : <br />)}
      {durationLabel && (
        <StatRequirement
          icon={t('ui.emoji.time.h1')}
          value={durationLabel}
          title={durationTitle}
        />
      )}
    </div>
  );

  return { allOk, Component: RequirementsComponent };
}

export default function Requirements(props) {
  const { Component } = useRequirements(props.item);
  return <Component {...props} />;
}