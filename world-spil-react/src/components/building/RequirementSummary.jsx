import React from 'react';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import { prettyTime } from '../../services/helpers.js';
import { useT } from "../../services/i18n.js";
import Icon from '../common/Icon.jsx';

/*
  RequirementSummary.jsx (refactored to use CSS classes)
  - Uses requirement-summary, requirement-summary__grid and column class wrappers
  - Passes yieldPrice into ResourceCost via extra prop (ResourceCost handles inline placement)
*/

export default function RequirementSummary({ price = {}, yieldPrice = null, reqString = '', duration = null, durationBase = null, durationText = null, footprint = 0, footprintOk = true }) {
  const t = useT();

  const resolvedDuration = durationText || (duration != null ? prettyTime(duration) : null);
  const hasDurationBuff = duration != null && durationBase != null && Math.round(duration) !== Math.round(durationBase);

  const footprintIconUrl = '/assets/icons/symbol_footprint.png';
  const timeIconUrl = '/assets/icons/symbol_time.png';

  return (
    <div className="requirement-summary">
      <div className="requirement-summary__grid">
        {/* COLUMN 1: Resources + optional yield inline */}
        <div className="requirement-summary__col requirement-summary__col--resources">
          <ResourceCost cost={price} extra={yieldPrice} />
        </div>

        {/* COLUMN 2: Requirements (vertical list) */}
        <div className="requirement-summary__col requirement-summary__col--req">
          {reqString ? (
            <div className="demand-list">
              {String(reqString).split(/[,;]/).map((id) => id.trim()).filter(Boolean).map((id, i) => (
                <div key={`${id}-${i}`}><DemandList req={id} /></div>
              ))}
            </div>
          ) : (
            <div className="sub" style={{ color: '#888' }}>Ingen krav</div>
          )}
        </div>

        {/* COLUMN 3: Time */}
        <div className="requirement-summary__col requirement-summary__col--time">
          <Icon iconUrl={timeIconUrl} value={'default.png'} size={44} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{resolvedDuration || '-'}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{hasDurationBuff ? `Normal: ${prettyTime(durationBase ?? 0)}` : (durationBase ? prettyTime(durationBase) : '-')}</div>
          </div>
        </div>

        {/* COLUMN 4: Footprint / Buildpoints */}
        <div className="requirement-summary__col requirement-summary__col--fp">
          <Icon iconUrl={footprintIconUrl} value={'default.png'} size={44} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{footprint > 0 ? `+${footprint} BP` : `${footprint} BP`}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{footprintOk ? 'OK' : 'Mangler'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}