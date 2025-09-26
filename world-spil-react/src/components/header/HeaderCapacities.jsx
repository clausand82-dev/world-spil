import React from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from './CapacityBar.jsx';

export default function HeaderCapacities() {
  const { data, err, loading } = useHeaderSummary();

  if (err) return <div style={{ color: 'red' }}>Fejl: {err}</div>;
  if (loading || !data) return null;

  const caps = data.capacities; // tal: *Capacity
  const use  = data.usages;     // objekter: use*
  const hov  = data.citizens.groupCounts; // RÅ PERSONER pr. makrogruppe

  const rows = [
    { label: 'Housing',    used: use.useHousing.total,    cap: caps.housingCapacity,         breakdown: hov },
    { label: 'Provision',  used: use.useProvision.total,  cap: caps.provisionCapacity,       breakdown: hov },
    { label: 'Water',      used: use.useWater.total,      cap: caps.waterCapacity,           breakdown: hov },
    { label: 'Heat',       used: use.useHeat.total,       cap: caps.heatCapacity,            breakdown: hov },
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
          breakdown={r.breakdown} // tooltip = RÅ personer
        />
      ))}
    </div>
  );
}