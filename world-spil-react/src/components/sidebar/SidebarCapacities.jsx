import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from '../header/CapacityBar.jsx';
import CitizensBadge from './CitizensBadge.jsx';

// Hjælp: lav pænt navn ud fra defs + håndtér scope og ".lN"-suffix
function resolveDefName(defs, branch, rawId, fallbackName) {
  const id = String(rawId || '');

  // Fjern scope først: bld.|add.|rsd.|ani.|res.
  const idNoScope = id.replace(/^(?:bld|add|rsd|ani|res)\./i, '');

  // Pil evt. level-suffix af for lookup, men udled level for visning
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

  // PRØV først level-specifik def (fx basecamp.l3), derefter basis-def (basecamp)
  const defLevel = (bucket && lvl) ? (defs?.[bucket]?.[`${baseId}.l${lvl}`] || null) : null;
  const defBase  = bucket ? defs?.[bucket]?.[baseId] : null;

  const niceCore =
    defLevel?.display_name || defLevel?.name ||
    defBase?.display_name  || defBase?.name  ||
    fallbackName || baseId;

  return (lvl && lvl > 0) ? `${niceCore} (L${lvl})` : niceCore;
}

// Sektion til hover for én kapacitets partsList (bygninger/addon/research/animals/inventory)
function makeSourceContent(partsListForCap, defs) {
  if (!partsListForCap) return null;
  const {
    buildings = [], addon = [], research = [],
    animals = [], inventory = [],
  } = partsListForCap;

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

  const totalCount =
    (buildings?.length || 0) +
    (addon?.length || 0) +
    (research?.length || 0) +
    (animals?.length || 0) +
    (inventory?.length || 0);

  if (totalCount === 0) {
    return <div style={{ maxWidth: 360, opacity: 0.8 }}>Ingen kapacitetskilder fundet.</div>;
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <Section title="Bygninger" branch="bld" items={buildings} />
      <Section title="Addons"    branch="add" items={addon} />
      <Section title="Research"  branch="rsd" items={research} />
      <Section title="Animals"   branch="ani" items={animals} />
      <Section title="Inventory" branch="res" items={inventory} />
    </div>
  );
}

// Aggregat-hover for fx Heat/Power
function makeAggregateContent(subLabelToPartsListMap, defs) {
  const entries = Object.entries(subLabelToPartsListMap)
    .filter(([_, pl]) => {
      if (!pl) return false;
      const b = pl.buildings?.length || 0;
      const a = pl.addon?.length || 0;
      const r = pl.research?.length || 0;
      const an = pl.animals?.length || 0;
      const inv = pl.inventory?.length || 0;
      return (b + a + r + an + inv) > 0;
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

// Foretrukken rækkefølge for top-level metrics (bruges når de findes i metricsMeta)
const PREFERRED_ORDER = [
  'housing', 'food', 'water', 'heat', 'power', 'health', 'cloth', 'medicin', 'wasteOther',
];

function sortTopLevelMetrics(metaEntries) {
  const indexOf = (id) => {
    const i = PREFERRED_ORDER.indexOf(id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return metaEntries.sort((a, b) => {
    const [idA, mA] = a;
    const [idB, mB] = b;
    const ia = indexOf(idA);
    const ib = indexOf(idB);
    if (ia !== ib) return ia - ib;
    const la = (mA.label || idA).toLowerCase();
    const lb = (mB.label || idB).toLowerCase();
    return la.localeCompare(lb);
  });
}

export default function SidebarCapacities() {
  const { data, err, loading } = useHeaderSummary();
  const { data: gameData } = useGameData();
  const defs = gameData?.defs || {};

  const capacities = data?.capacities ?? {};
  const usages = data?.usages ?? {};
  const partsList = data?.partsList ?? {};
  const metricsMeta = data?.metricsMeta ?? null;
  const stageCurrent = Number(data?.stage?.current ?? data?.state?.user?.currentstage ?? 0);

  const fallbackRows = useMemo(() => {
    if (metricsMeta) return null;
    if (!data) return null;

    const rows = [
      { id: 'housing',    label: 'Housing',   used: usages.useHousing?.total,   cap: capacities.housingCapacity,        capField: 'housingCapacity' },
      { id: 'food',       label: 'Provision', used: usages.useProvision?.total, cap: capacities.provisionCapacity,      capField: 'provisionCapacity' },
      { id: 'water',      label: 'Water',     used: usages.useWater?.total,     cap: capacities.waterCapacity,          capField: 'waterCapacity' },
      { id: 'heat',       label: 'Heat',      used: usages.useHeat?.total,      cap: capacities.heatCapacity,           capField: 'heatCapacity',
        subs: [
          { id: 'heatGreen',   label: 'Heat (Green)',   capField: 'heatGreenCapacity' },
          { id: 'heatNuclear', label: 'Heat (Nuclear)', capField: 'heatNuclearCapacity' },
          { id: 'heatFossil',  label: 'Heat (Fossil)',  capField: 'heatFossilCapacity' },
        ],
      },
      { id: 'power',      label: 'Power',     used: usages.usePower?.total,     cap: capacities.powerCapacity,          capField: 'powerCapacity',
        subs: [
          { id: 'powerGreen',   label: 'Power (Green)',   capField: 'powerGreenCapacity' },
          { id: 'powerNuclear', label: 'Power (Nuclear)', capField: 'powerNuclearCapacity' },
          { id: 'powerFossil',  label: 'Power (Fossil)',  capField: 'powerFossilCapacity' },
        ],
      },
      { id: 'health',     label: 'Health',    used: usages.useHealth?.total,    cap: capacities.healthCapacity,         capField: 'healthCapacity' },
      { id: 'cloth',      label: 'Cloth',     used: usages.useCloth?.total,     cap: capacities.productClothCapacity,   capField: 'productClothCapacity' },
      { id: 'medicin',    label: 'Medicin',   used: usages.useMedicin?.total,   cap: capacities.productMedicinCapacity, capField: 'productMedicinCapacity' },
      { id: 'wasteOther', label: 'WasteOther',used: usages.wasteOther?.total,   cap: capacities.wasteOtherCapacity,     capField: 'wasteOtherCapacity' },
    ];

    const makeHoverForRow = (row) => {
      if (row.subs && row.subs.length) {
        const map = {};
        row.subs.forEach((s) => {
          if (!s.capField) return;
          map[s.label] = partsList[s.capField];
        });
        return makeAggregateContent(map, defs);
      }
      return makeSourceContent(partsList[row.capField], defs);
    };

    return rows.map(r => ({
      key: r.id,
      label: r.label,
      used: Number(r.used || 0),
      cap: Number(r.cap || 0),
      hoverContent: makeHoverForRow(r),
    }));
  }, [metricsMeta, data, usages, capacities, partsList, defs]);

  const dynamicRows = useMemo(() => {
    if (!metricsMeta) return null;

    const metaMap = metricsMeta;
    const entries = Object.entries(metaMap);

    const topUnlocked = entries.filter(([id, m]) => {
      const unlockAt = Number(m?.stage?.unlock_at ?? 1);
      const isUnlocked = stageCurrent >= unlockAt;
      const isTop = !m?.parent;
      const hasAnyField = Boolean((m?.usageField || '').length || (m?.capacityField || '').length);
      return isUnlocked && isTop && hasAnyField;
    });

    const sortedTop = sortTopLevelMetrics(topUnlocked);

    const hoverForMetric = (id, m) => {
      const capField = m?.capacityField || '';
      const subs = Array.isArray(m?.subs) ? m.subs : [];

      if (subs.length > 0) {
        const map = {};
        subs.forEach(subId => {
          const subMeta = metaMap[subId];
          if (!subMeta) return;
          const unlockAt = Number(subMeta?.stage?.unlock_at ?? 1);
          if (stageCurrent < unlockAt) return;
          const subLabel = subMeta?.label || subId;
          const subCapField = subMeta?.capacityField || '';
          if (!subCapField) return;
          map[subLabel] = partsList[subCapField];
        });
        return makeAggregateContent(map, defs);
      }

      if (capField) {
        return makeSourceContent(partsList[capField], defs);
      }
      return null;
    };

    const rows = sortedTop.map(([id, m]) => {
      const label = m?.label || id;
      const uKey = m?.usageField || '';
      const cKey = m?.capacityField || '';
      const used = uKey ? Number(usages[uKey]?.total || 0) : 0;
      const cap = cKey ? Number(capacities[cKey] || 0) : 0;
      const hoverContent = hoverForMetric(id, m);

      return { key: id, label, used, cap, hoverContent };
    });

    const filtered = rows.filter(r => r.hoverContent || r.used > 0 || r.cap > 0);
    return filtered;
  }, [metricsMeta, stageCurrent, usages, capacities, partsList, defs]);

  const rows = dynamicRows || fallbackRows || [];

  if (err) return <div style={{ color: 'red' }}>Fejl: {String(err)}</div>;
  if (loading || !data) return null;

  const citizens = data.citizens;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <CapacityBar
          key={r.key}
          label={r.label}
          used={r.used}
          capacity={r.cap}
          hoverContent={r.hoverContent}
        />
      ))}
    </div>
  );
}