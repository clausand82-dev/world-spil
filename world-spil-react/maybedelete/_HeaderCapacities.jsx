import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';
import CapacityBar from './CapacityBar.jsx';

// Hjælp: lav pænt navn ud fra defs + håndtér scope og ".lN"-suffix
function resolveDefName(defs, branch, rawId, fallbackName) {
  const id = String(rawId || '');

  // Fjern scope
  const idNoScope = id.replace(/^(?:bld|add|rsd|ani|res)\./i, '');

  // Level-suffix
  const lvlMatch = idNoScope.match(/\.l(\d+)$/i);
  const lvl = lvlMatch ? Number(lvlMatch[1]) : null;
  const baseId = idNoScope.replace(/\.l\d+$/i, '');

  const b = String(branch || '').toLowerCase();
  const bucket = (b === 'buildings' || b === 'bld') ? 'bld'
               : (b === 'addon'     || b === 'add') ? 'add'
               : (b === 'research'  || b === 'rsd') ? 'rsd'
               : (b === 'animals'   || b === 'ani') ? 'ani'
               : (b === 'inventory' || b === 'res') ? 'res'
               : null;

  // PRØV level-specifik def først (fx choppingblock.l1), ellers basis
  const defLevel = (bucket && lvl) ? (defs?.[bucket]?.[`${baseId}.l${lvl}`] || null) : null;
  const defBase  = bucket ? defs?.[bucket]?.[baseId] : null;

  const niceCore =
    defLevel?.display_name || defLevel?.name ||
    defBase?.display_name  || defBase?.name  ||
    fallbackName || baseId;

  return (lvl && lvl > 0) ? `${niceCore} (L${lvl})` : niceCore;
}

// Genbrug fra sidebar – men med defs-navne
function makeSourceContent(partsListForCap, defs) {
  if (!partsListForCap) return null;
  const { buildings = [], addon = [], research = [] } = partsListForCap;

  const Section = ({ title, items, branch }) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {items.map((it, idx) => {
            const label = resolveDefName(defs, branch, it.id, it.name);
            return (
              <li key={`${it.id}-${idx}`}>{label}: {it.amount}</li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 360 }}>
      <Section title="Bygninger" items={buildings} branch="bld" />
      <Section title="Addons"    items={addon}     branch="add" />
      <Section title="Research"  items={research}  branch="rsd" />
    </div>
  );
}

function makeAggregateContent(labelToPartsListMap, defs) {
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
          {makeSourceContent(pl, defs)}
        </div>
      ))}
    </div>
  );
}

export default function HeaderCapacities() {
  const { data, err, loading } = useHeaderSummary();
  const { data: gameData } = useGameData();
  const defs = gameData?.defs || {};

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
           }, defs),
    power: makeAggregateContent({
             'Power (Green)':   pl.powerGreenCapacity,
             'Power (Nuclear)': pl.powerNuclearCapacity,
             'Power (Fossil)':  pl.powerFossilCapacity,
           }, defs),
  }), [pl, defs]);

  const rows = [
    { label: 'Housing',    used: use.useHousing.total,    cap: caps.housingCapacity,         breakdown: hov, tip: makeSourceContent(pl.housingCapacity, defs) },
    { label: 'Provision',  used: use.useProvision.total,  cap: caps.provisionCapacity,       breakdown: hov, tip: makeSourceContent(pl.provisionCapacity, defs) },
    { label: 'Water',      used: use.useWater.total,      cap: caps.waterCapacity,           breakdown: hov, tip: makeSourceContent(pl.waterCapacity, defs) },
    { label: 'Heat',       used: use.useHeat.total,       cap: caps.heatCapacity,                        tip: tips.heat },
    { label: 'Power',      used: use.usePower.total,      cap: caps.powerCapacity,                       tip: tips.power },
    { label: 'Health',     used: use.useHealth.total,     cap: caps.healthCapacity,          breakdown: hov, tip: makeSourceContent(pl.healthCapacity, defs) },
    { label: 'Cloth',      used: use.useCloth.total,      cap: caps.productClothCapacity,    breakdown: hov, tip: makeSourceContent(pl.productClothCapacity, defs) },
    { label: 'Medicin',    used: use.useMedicin.total,    cap: caps.productMedicinCapacity,  breakdown: hov, tip: makeSourceContent(pl.productMedicinCapacity, defs) },
    { label: 'WasteOther', used: use.wasteOther.total,    cap: caps.wasteOtherCapacity,      breakdown: hov, tip: makeSourceContent(pl.wasteOtherCapacity, defs) },
  ];

  return rows.map((r, idx) => (
    <CapacityBar
      key={idx}
      label={r.label}
      used={r.used}
      capacity={r.cap}
      breakdown={r.breakdown}
      hoverContent={r.tip}
    />
  ));
}