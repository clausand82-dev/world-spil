import React from 'react';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList, { DemandToken } from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import { prettyTime } from '../../services/helpers.js';
import { useT } from "../../services/i18n.js";
import Icon from '../common/Icon.jsx';

/*
  RequirementSummary - final adjustments per your message:

  - Column layout: 7fr / 2fr / 1fr / 1fr (relative widths)
  - Column 1: Resources (ResourceCost grid)
    -> After resources, optional yield is rendered if 'yieldPrice' prop is provided
  - Column 2: Requirements: renders each requirement on its own line (vertical list), with small type-icon in front (rsd/bld/add)
  - Column 3: Time: large icon (default.png) and two rows: current (buffed) time and original (base) time
  - Column 4: Footprint: large icon (default.png) and two rows: +/‑ amount and "OK"/"Mangler"
  - Only 'need' for resources is shown (not have/need)
  - Icon fallback uses '/assets/icons/default.png' (passed as both iconUrl and value to Icon)
*/

export default function RequirementSummary({
  price = {},
  yieldPrice = null,     // optional: same shape as `price` if you want yield displayed after resources
  reqString = '',
  duration = null,
  durationBase = null,
  durationText = null,
  footprint = 0,
  footprintOk = true,
}) {
  const t = useT();

  // parse the requirements into array
  const reqIds = React.useMemo(() => {
    if (!reqString) return [];
    return String(reqString || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }, [reqString]);

  const resolvedDuration = durationText || (duration != null ? prettyTime(duration) : null);
  const baseDurationLabel = durationBase != null ? prettyTime(durationBase) : null;
  const hasDurationBuff = duration != null && durationBase != null && Math.round(duration) !== Math.round(durationBase);

  const footprintIconUrl = '/assets/icons/symbol_footprint.png';
  const timeIconUrl = '/assets/icons/symbol_time.png';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '7fr 2fr 1fr 1fr',
      gap: 12,
      alignItems: 'start',
      width: '100%',
    }}>
      {/* COLUMN 1: Resources + optional yield */}
      <div style={{ paddingRight: 12 }}>
        <ResourceCost cost={price} />
        {yieldPrice ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginRight: 6 }}>→</div>
            <ResourceCost cost={yieldPrice} />
          </div>
        ) : null}
      </div>

      {/* COLUMN 2: Requirements (vertical list, each on own line) */}
      <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        {reqIds.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reqIds.map((id, i) => <DemandToken key={`${id}-${i}`} reqId={id} compact={true} />)}
          </div>
        ) : (
          <div className="sub" style={{ color: '#888' }}>Ingen krav</div>
        )}
      </div>

      {/* COLUMN 3: Time (large icon + two-line text) */}
      <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Icon iconUrl={timeIconUrl} value={'default.png'} size={44} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{resolvedDuration || '-'}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{baseDurationLabel || '-'}</div>
        </div>
      </div>

      {/* COLUMN 4: Footprint / Buildpoints */}
      <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Icon iconUrl={footprintIconUrl} value={'default.png'} size={44} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{footprint > 0 ? `+${footprint} BP` : `${footprint} BP`}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{footprintOk ? 'OK' : 'Mangler'}</div>
        </div>
      </div>
    </div>
  );
}