import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from './CapacityBar.jsx';

// Genbrug fra sidebar
function makeSourceContent(partsListForCap) {
  if (!partsListForCap) return null;
  const { buildings = [], addon = [], research = [] } = partsListForCap;
  const Section = ({ title, items }) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {items.map((it, idx) => (
            <li key={`${it.id}-${idx}`}>{it.name || it.id}: {it.amount}</li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div style={{ maxWidth: 360 }}>
      <Section title="Bygninger" items={buildings} />
      <Section title="Addons" items={addon} />
      <Section title="Research" items={research} />
    </div>
  );
}

function makeAggregateContent(labelToPartsListMap) {
  const entries = Object.entries(labelToPartsListMap)
    .filter(([_, pl]) => {
      if (!pl) return false;
      const b = pl.buildings?.length || 0;
      const a = pl.addon?.length || 0;
      const r = pl.research?.length || 0;
      return (b + a + r) > 0;
    });
  if (entries.length === 0) {
    return <div style={{ maxWidth: 360, opacity: 0.8 }}>Ingen kapacitetskilder fundet.</div>;
  }
  return (
    <div style={{ maxWidth: 420 }}>
      {entries.map(([label, pl]) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
          {makeSourceContent(pl)}
        </div>
      ))}
    </div>
  );
}

export default function HeaderCapacities() {
  const { data, err, loading } = useHeaderSummary();

  if (err) return <div style={{ color: 'red' }}>Fejl: {err}</div>;
  if (loading || !data) return null;

  const caps = data.capacities;
  const use  = data.usages;
  const hov  = data.citizens.groupCounts;
  const pl   = data.partsList ?? {};

  const tips = useMemo(() => ({
    heat:  makeAggregateContent({
             'Heat (Green)':   pl.heatGreenCapacity,
             'Heat (Nuclear)': pl.heatNuclearCapacity,
             'Heat (Fossil)':  pl.heatFossilCapacity,
           }),
    power: makeAggregateContent({
             'Power (Green)':   pl.powerGreenCapacity,
             'Power (Nuclear)': pl.powerNuclearCapacity,
             'Power (Fossil)':  pl.powerFossilCapacity,
           }),
  }), [pl]);

  const rows = [
    { label: 'Housing',    used: use.useHousing.total,    cap: caps.housingCapacity,         breakdown: hov },
    { label: 'Provision',  used: use.useProvision.total,  cap: caps.provisionCapacity,       breakdown: hov },
    { label: 'Water',      used: use.useWater.total,      cap: caps.waterCapacity,           breakdown: hov },
    // Heat/Power: giv specifik hover og undlad citizens-breakdown
    { label: 'Heat',       used: use.useHeat.total,       cap: caps.heatCapacity,            hoverContent: tips.heat,  breakdown: undefined },
    { label: 'Power',      used: use.usePower.total,      cap: caps.powerCapacity,           hoverContent: tips.power, breakdown: undefined },
    { label: 'Health',     used: use.useHealth.total,     cap: caps.healthCapacity,          breakdown: hov },
    { label: 'Cloth',      used: use.useCloth.total,      cap: caps.productClothCapacity,    breakdown: hov },
    { label: 'Medicin',    used: use.useMedicin.total,    cap: caps.productMedicinCapacity,  breakdown: hov },
    { label: 'WasteOther', used: use.wasteOther.total,    cap: caps.wasteOtherCapacity,      breakdown: hov },
  ];

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {rows.map((r) => (
        <CapacityBar
          key={r.label}
          label={r.label}
          used={r.used}
          capacity={r.cap}
          breakdown={r.breakdown}
          hoverContent={r.hoverContent}
        />
      ))}
    </div>
  );
}