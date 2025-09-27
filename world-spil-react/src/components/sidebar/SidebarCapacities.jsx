import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from '../header/CapacityBar.jsx';
import CitizensBadge from './CitizensBadge.jsx';

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
    <div style={{ maxWidth: 320 }}>
      <Section title="Bygninger" items={buildings} />
      <Section title="Addons" items={addon} />
      <Section title="Research" items={research} />
    </div>
  );
}

export default function SidebarCapacities() {
  const { data, err, loading } = useHeaderSummary();

  // KALD HOOKS UBETINGET FØR EARLY RETURNS (for at undgå ændret hooks-rækkefølge)
  const pl = data?.partsList ?? {};
  const tips = useMemo(() => ({
    housing:    makeSourceContent(pl.housingCapacity),
    provision:  makeSourceContent(pl.provisionCapacity),
    water:      makeSourceContent(pl.waterCapacity),
    heat:       makeSourceContent(pl.heatCapacity),
    health:     makeSourceContent(pl.healthCapacity),
    cloth:      makeSourceContent(pl.productClothCapacity),
    medicin:    makeSourceContent(pl.productMedicinCapacity),
    wasteOther: makeSourceContent(pl.wasteOtherCapacity),
  }), [pl]);

  if (err) return <div style={{ color: 'red' }}>Fejl: {err}</div>;
  if (loading || !data) return null;

  const caps = data.capacities;
  const use  = data.usages;
  const citizens = data.citizens;

  const rows = [
    { label: 'Housing',    used: use.useHousing.total,    cap: caps.housingCapacity,         tip: tips.housing },
    { label: 'Provision',  used: use.useProvision.total,  cap: caps.provisionCapacity,       tip: tips.provision },
    { label: 'Water',      used: use.useWater.total,      cap: caps.waterCapacity,           tip: tips.water },
    { label: 'Heat',       used: use.useHeat.total,       cap: caps.heatCapacity,            tip: tips.heat },
    { label: 'Health',     used: use.useHealth.total,     cap: caps.healthCapacity,          tip: tips.health },
    { label: 'Cloth',      used: use.useCloth.total,      cap: caps.productClothCapacity,    tip: tips.cloth },
    { label: 'Medicin',    used: use.useMedicin.total,    cap: caps.productMedicinCapacity,  tip: tips.medicin },
    { label: 'WasteOther', used: use.wasteOther.total,    cap: caps.wasteOtherCapacity,      tip: tips.wasteOther },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <CitizensBadge citizens={citizens} />
      {rows.map((r) => (
        <CapacityBar
          key={r.label}
          label={r.label}
          used={r.used}
          capacity={r.cap}
          hoverContent={r.tip}
          breakdown={data.citizens.groupCounts}
        />
      ))}
    </div>
  );
}