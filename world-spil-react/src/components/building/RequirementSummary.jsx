import React from 'react';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList, { DemandToken } from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import { prettyTime } from '../../services/helpers.js';
import { useT } from "../../services/i18n.js";
import Icon from '../common/Icon.jsx';

/*
  RequirementSummary - adjustments:
  - Grid with column widths 7fr / 2fr / 1fr / 1fr
  - Vertical separators as left borders on columns 2-4; to ensure they span full panel height we set alignItems: 'stretch'
  - Column 1: resources (ResourceCost); after resources optional yieldPrice rendered as arrow -> ResourceCost
  - Column 2: vertical list of requirements (each its own line with small type icon)
  - Column 3: time (large icon + two lines: current and base)
  - Column 4: footprint (large icon + two lines: +/-BP and status)
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
}) {
  const t = useT();

  const reqIds = React.useMemo(() => {
    if (!reqString) return [];
    return String(reqString || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }, [reqString]);

  const resolvedDuration = durationText || (duration != null ? prettyTime(duration) : null);
  const baseDurationLabel = durationBase != null ? prettyTime(durationBase) : null;

  const defaultIconUrl = '/assets/icons/default.png';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '7fr 2fr 1fr 1fr',
      gap: 12,
      alignItems: 'stretch',
      width: '100%',
    }}>
      {/* Column 1: Resources */}
      <div style={{ paddingRight: 12 }}>
        <ResourceCost cost={price} />
        {yieldPrice ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginRight: 6 }}>→</div>
            <ResourceCost cost={yieldPrice} />
          </div>
        ) : null}
      </div>

      {/* Column 2: Requirements (vertical list) */}
      <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        {reqIds.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reqIds.map((id, i) => <DemandToken key={`${id}-${i}`} reqId={id} compact={true} />)}
          </div>
        ) : (
          <div className="sub" style={{ color: '#888' }}>Ingen krav</div>
        )}
      </div>

      {/* Column 3: Time */}
      <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Icon iconUrl={'/assets/icons/symbol_time.png'} value={'default.png'} size={44} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{resolvedDuration || '-'}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{baseDurationLabel || '-'}</div>
        </div>
      </div>

      {/* Column 4: Footprint */}
      <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Icon iconUrl={'/assets/icons/symbol_footprint.png'} value={'default.png'} size={44} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{footprint > 0 ? `+${footprint} BP` : `${footprint} BP`}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{footprintOk ? 'OK' : 'Mangler'}</div>
        </div>
      </div>
    </div>
  );
}