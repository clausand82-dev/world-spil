import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from '../header/CapacityBar.jsx';
import CitizensBadge from './CitizensBadge.jsx';

function makeSourceContent(partsListForCap) {
  if (!partsListForCap) return null;
  const {
    buildings = [], addon = [], research = [],
    animals = [], inventory = [], // NY
  } = partsListForCap;

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
      <Section title="Animals" items={animals} />       {/* NY */}
      <Section title="Inventory" items={inventory} />   {/* NY */}
    </div>
  );
}

// Aggregat-hover for Heat/Power med subkilder
function makeAggregateContent(labelToPartsListMap) {
  const entries = Object.entries(labelToPartsListMap)
    .filter(([_, pl]) => {
      if (!pl) return false;
      const b = pl.buildings?.length || 0;
      const a = pl.addon?.length || 0;
      const r = pl.research?.length || 0;
      return (b + a + r) > 0;
    });

  // Returnér en placeholder i stedet for null, så vi undgår fallback til citizens-tooltip
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

export default function SidebarCapacities() {
  const { data, err, loading } = useHeaderSummary();

  // Hooks før early returns
  const pl = data?.partsList ?? {};
  const tips = useMemo(() => ({
    housing:    makeSourceContent(pl.housingCapacity),
    provision:  makeSourceContent(pl.provisionCapacity),
    water:      makeSourceContent(pl.waterCapacity),
    heat:       makeAggregateContent({
                  'Heat (Green)':   pl.heatGreenCapacity,
                  'Heat (Nuclear)': pl.heatNuclearCapacity,
                  'Heat (Fossil)':  pl.heatFossilCapacity,
                }),
    power:      makeAggregateContent({
                  'Power (Green)':   pl.powerGreenCapacity,
                  'Power (Nuclear)': pl.powerNuclearCapacity,
                  'Power (Fossil)':  pl.powerFossilCapacity,
                }),
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
    { label: 'Housing',    used: use.useHousing.total,    cap: caps.housingCapacity,         tip: tips.housing,  breakdown: data.citizens.groupCounts },
    { label: 'Provision',  used: use.useProvision.total,  cap: caps.provisionCapacity,       tip: tips.provision, breakdown: data.citizens.groupCounts },
    { label: 'Water',      used: use.useWater.total,      cap: caps.waterCapacity,           tip: tips.water,    breakdown: data.citizens.groupCounts },
    // Heat/Power: GIV SPECIFIK hoverContent og UNDLAD citizens-breakdown for at undgå forkert tooltip
    { label: 'Heat',       used: use.useHeat.total,       cap: caps.heatCapacity,            tip: tips.heat,     breakdown: undefined },
    { label: 'Power',      used: use.usePower.total,      cap: caps.powerCapacity,           tip: tips.power,    breakdown: undefined },
    { label: 'Health',     used: use.useHealth.total,     cap: caps.healthCapacity,          tip: tips.health,   breakdown: data.citizens.groupCounts },
    { label: 'Cloth',      used: use.useCloth.total,      cap: caps.productClothCapacity,    tip: tips.cloth,    breakdown: data.citizens.groupCounts },
    { label: 'Medicin',    used: use.useMedicin.total,    cap: caps.productMedicinCapacity,  tip: tips.medicin,  breakdown: data.citizens.groupCounts },
    { label: 'WasteOther', used: use.wasteOther.total,    cap: caps.wasteOtherCapacity,      tip: tips.wasteOther, breakdown: data.citizens.groupCounts },
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
          breakdown={r.breakdown}
        />
      ))}
    </div>
  );
}