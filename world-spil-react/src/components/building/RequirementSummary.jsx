import React from 'react';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import { prettyTime } from '../../services/helpers.js';

function RequirementSummary({ price, reqString, duration, durationBase, durationText, footprint, footprintOk }) {
  const nodes = [];

  if (price && Object.keys(price).length) {
    nodes.push(<ResourceCost key="price" cost={price} />);
  }

  if (reqString) {
    nodes.push(<DemandList key="req" req={reqString} />);
  }

  if (typeof footprint === 'number' && footprint !== 0) {
    const isBonus = footprint > 0;
    const amount = isBonus ? footprint : Math.abs(footprint);
    const displayValue = `${isBonus ? '+' : ''}${amount} BP`;
    nodes.push(
      <StatRequirement
        key="footprint"
        icon="⬛"
        label=""
        value={displayValue}
        isOk={isBonus || footprintOk}
      />
    );
  }

  const resolvedDuration = durationText || (duration != null ? prettyTime(duration) : null);
  if (resolvedDuration) {
    const hasBuff = duration != null && durationBase != null && Math.round(duration) !== Math.round(durationBase);
    const timeTitle = hasBuff ? `Normal: ${prettyTime(durationBase ?? 0)}` : undefined;
    nodes.push(
      <span key="time" title={timeTitle}>
        <StatRequirement
          icon="🕐"
          label=""
          value={resolvedDuration}
          isOk
        />
      </span>
    );
  }

  if (!nodes.length) {
    return <div className="sub" style={{ marginTop: 4 }}>-</div>;
  }

  const interleaved = nodes.flatMap((node, idx) => (
    idx === 0 ? [node] : [<span key={`sep-${idx}`}>|</span>, node]
  ));

  return (
    <div className="sub" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
      {interleaved}
    </div>
  );
}

export default RequirementSummary;
