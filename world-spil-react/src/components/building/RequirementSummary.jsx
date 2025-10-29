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
  - footprintOk prop now used to color status text (green/red)
  - NEW: isMaxBuilt (bool) — hvis true vises hverken tid eller footprint
*/

export default function RequirementSummary({
  price = {},
  yieldPrice = null,
  reqString = '',
  duration = null,
  durationBase = null,
  durationText = null,
  footprint = 0,
  footprintOk = true,
  isMaxBuilt = false,  footprintOverrideWhenIrrelevant = null,
  timeOverrideWhenIrrelevant = null,
  footprintDebug = null,
}) {
  const t = useT();

  const resolvedDuration = durationText || (duration != null ? prettyTime(duration) : null);
  const hasDurationBuff = duration != null && durationBase != null && Math.round(duration) !== Math.round(durationBase);

  const defaultIconUrl = '/assets/icons/default.png';

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
                <div key={`${id}-${i}`}><DemandList req={id} isMaxBuilt={isMaxBuilt} /></div>
              ))}
            </div>
          ) : (
            <div className="sub" style={{ color: '#888' }}>Ingen krav</div>
          )}
        </div>

        {/* COLUMN 3: Time — viser override hvis oplyst, ellers "Ingen Info" ved isMaxBuilt */}
        <div className="requirement-summary__col requirement-summary__col--time">
          <Icon iconUrl={'/assets/icons/symbol_time.png'} value={'default.png'} size={18} />
          <div style={{ textAlign: 'center' }}>
            {/* hvis caller angiver override, vis den altid */}
            {timeOverrideWhenIrrelevant ? (
              <div style={{ fontWeight: 600, color: '#888' }}>{timeOverrideWhenIrrelevant}</div>
            ) : isMaxBuilt ? (
              <div style={{ fontWeight: 600, color: '#888' }}>Ingen Info</div>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>{resolvedDuration || '-'}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>
                  {hasDurationBuff ? `Normal: ${prettyTime(durationBase ?? 0)}` : (durationBase ? prettyTime(durationBase) : '-')}
                </div>
              </>
            )}
          </div>
        </div>

        {/* COLUMN 4: Footprint / Buildpoints — vis override hvis oplyst, ellers "Ingen Info" ved isMaxBuilt */}
        <div className="requirement-summary__col requirement-summary__col--fp">
          <Icon iconUrl={'/assets/icons/symbol_footprint.png'} value={'default.png'} size={18} />
          <div style={{ textAlign: 'center' }}>
            {footprintOverrideWhenIrrelevant ? (
              <div style={{ fontWeight: 600, color: '#888' }}>{footprintOverrideWhenIrrelevant}</div>
            ) : isMaxBuilt ? (
              <div style={{ fontWeight: 600, color: '#888' }}>Ingen Info</div>
            ) : (
              <>
                <div title={footprintDebug || undefined} style={{ fontWeight: 600 }}>{footprint > 0 ? `+${footprint} BP` : `${footprint} BP`}</div>
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.95,
                    color: footprintOk ? 'var(--ws-good, #0a0)' : 'var(--ws-bad, #c33)',
                    fontWeight: 700,
                    marginTop: 4,
                  }}
                >
                  {footprintOk ? 'OK' : 'Mangler'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}