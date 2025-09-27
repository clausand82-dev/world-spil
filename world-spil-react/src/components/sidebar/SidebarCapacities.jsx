import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from '../header/CapacityBar.jsx';
import CitizensBadge from './CitizensBadge.jsx';

// Genbrug: Byg indhold for én kapacitets partsList (bygninger/addon/research)
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

// NY: Sammensat hover for aggregater (fx Heat/Power) med subkategorier
function makeAggregateContent(labelToPartsListMap) {
  const entries = Object.entries(labelToPartsListMap)
    .filter(([_, pl]) => {
      if (!pl) return false;
      const b = pl.buildings?.length || 0;
      const a = pl.addon?.length || 0;
      const r = pl.research?.length || 0;
      return (b + a + r) > 0;
    });

  if (entries.length === 0) return null;

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

  // KALD HOOKS UBETINGET FØR EARLY RETURNS (for at undgå ændret hooks-rækkefølge)
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
    { label: 'Housing',    used: use.useHousing.total,    cap: caps.housingCapacity,         tip: tips.housing },
    { label: 'Provision',  used: use.useProvision.total,  cap: caps.provisionCapacity,       tip: tips.provision },
    { label: 'Water',      used: use.useWater.total,      cap: caps.waterCapacity,           tip: tips.water },
    { label: 'Heat',       used: use.useHeat.total,       cap: caps.heatCapacity,            tip: tips.heat },   // aggregat m. subs
    { label: 'Power',      used: use.usePower.total,      cap: caps.powerCapacity,           tip: tips.power },  // aggregat m. subs
    { label: 'Health',     used: use.useHealth.total,     cap: caps.healthCapacity,          tip: tips.health },
    { label: 'Cloth',      used: use.useCloth.total,      cap: caps.productClothCapacity,    tip: tips.cloth },
    { label: 'Medicin',    used: use.useMedicin.total,    cap: caps.productMedicinCapacity,  tip: tips.medicin },
    { label: 'WasteOther', used: use.wasteOther.total,    cap: caps.wasteOtherCapacity,      tip: tips.wasteOther },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <CapacityBar
          key={r.label}
          label={r.label}
          used={r.used}
          capacity={r.cap}
          hoverContent={r.tip}                     // viser enten en enkel partsList-oversigt
          breakdown={data.citizens.groupCounts}    // eller et aggregat med subsektioner (heat/power)
        />
      ))}
    </div>
  );
}