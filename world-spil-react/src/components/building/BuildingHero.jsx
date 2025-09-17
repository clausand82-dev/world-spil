import React from 'react';
import GameImage from '../GameImage.jsx';
import BuildProgress from '../BuildProgress.jsx';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import { prettyTime } from '../../services/helpers.js';
import { useT } from "../../services/i18n.js";

function BuildingHero({ heroDef, heroId, durabilityPct, jobActiveId, footprintText, animalCapText, actionTarget, requirementState }) {
  const jobActive = !!jobActiveId;
  const hasBuffedTime = Number.isFinite(actionTarget?.duration) && Number.isFinite(actionTarget?.durationBase)
    ? Math.round(actionTarget.duration) !== Math.round(actionTarget.durationBase)
    : false;
  const timeValue = actionTarget?.duration != null ? prettyTime(actionTarget.duration) : '-';
  const timeTitle = hasBuffedTime ? `Normal: ${prettyTime(actionTarget.durationBase ?? 0)}` : undefined;
const t = useT(); // bruges til sprog
  return (
    <div className="detail-hero">
      <div className="photo">
        <GameImage
          src={`/assets/art/${heroId}.big.png`}
          fallback="/assets/art/placeholder.big.png"
          alt={heroDef?.name || heroId}
          width={256}
          height={256}
        />
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
          {heroDef?.icon || ''} {heroDef?.name || heroId}
          {heroDef?.lvl ? <span className="sub" style={{ marginLeft: 8 }}>Level {heroDef.lvl}</span> : null}
        </div>
        {heroDef?.desc ? <div className="sub" style={{ marginBottom: 10 }}>{heroDef.desc}</div> : null}
        <div className="statgrid">
          <div className="statitem">
            <div className="label">{t("ui.production.h1")}</div>
            <div className="value">-</div>
          </div>
          <div className="statitem">
            <div className="label">{jobActive ? 'In progress' : 'Durability'}</div>
            <div className="value">
              {jobActive ? (
                <BuildProgress bldId={jobActiveId} style={{ width: '100%' }} />
              ) : (
                <div className="progress">
                  <span style={{ width: `${durabilityPct}%` }} />
                  <div className="pct">{durabilityPct}%</div>
                </div>
              )}
            </div>
          </div>
          <div className="statitem">
            <div className="label">{t("ui.capacity.h1")}</div>
            <div className="value">{footprintText} � {animalCapText}</div>
          </div>
          <div className="statitem">
            <div className="label">{t("ui.buildcost.h1")}</div>
            <div className="value">{actionTarget ? (Object.keys(actionTarget.price || {}).length ? <ResourceCost cost={actionTarget.price} /> : '-') : '-'}</div>
          </div>
          <div className="statitem">
            <div className="label">{t("ui.demands.h1")}</div>
            <div className="value">{actionTarget?.reqString ? <DemandList req={actionTarget.reqString} /> : '-'}</div>
          </div>
          <div className="statitem">
            <div className="label">{t("ui.time.h1")}</div>
            <div className="value" title={timeTitle}>
              {timeValue}
            </div>
          </div>
          {actionTarget?.footprint > 0 ? (
            <div className="statitem">
              <div className="label">{t("ui.footprint.h1")}</div>
              <div className="value">
                <StatRequirement icon={t("ui.emoji.footprint.h1")} label="" value={`${actionTarget.footprint} BP`} isOk={requirementState.footprintOk} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default BuildingHero;
