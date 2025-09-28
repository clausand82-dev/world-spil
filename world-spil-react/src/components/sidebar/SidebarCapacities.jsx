import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import CapacityBar from '../header/CapacityBar.jsx';
import CitizensBadge from './CitizensBadge.jsx';

// Sektion til hover for én kapacitets partsList (bygninger/addon/research/animals/inventory)
function makeSourceContent(partsListForCap) {
  if (!partsListForCap) return null;
  const {
    buildings = [], addon = [], research = [],
    animals = [], inventory = [],
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

  // Ingen kilder? Returnér lille tekst (så vi ikke falder tilbage til citizens-tooltip)
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
      <Section title="Bygninger" items={buildings} />
      <Section title="Addons" items={addon} />
      <Section title="Research" items={research} />
      <Section title="Animals" items={animals} />
      <Section title="Inventory" items={inventory} />
    </div>
  );
}

// Aggregat-hover for fx Heat/Power, der viser underkategoriernes kilder
function makeAggregateContent(subLabelToPartsListMap) {
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
          {makeSourceContent(pl)}
        </div>
      ))}
    </div>
  );
}

// Foretrukken rækkefølge for top-level metrics (bruges når de findes i metricsMeta)
const PREFERRED_ORDER = [
  'housing', 'food', 'water', 'heat', 'power', 'health', 'cloth', 'medicin', 'wasteOther',
];

// Hjælp: sorter top-level metrics med prefereret rækkefølge → derefter alfabetisk
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
    // fallback: label alfabetisk
    const la = (mA.label || idA).toLowerCase();
    const lb = (mB.label || idB).toLowerCase();
    return la.localeCompare(lb);
  });
}

export default function SidebarCapacities() {
  // 1) Kald alle hooks UDEN betingelser
  const { data, err, loading } = useHeaderSummary();

  // 2) Afled null-safe værdier (så hooks kan køre samme antal på alle renders)
  const capacities = data?.capacities ?? {};
  const usages = data?.usages ?? {};
  const partsList = data?.partsList ?? {};
  const metricsMeta = data?.metricsMeta ?? null;
  const stageCurrent = Number(data?.stage?.current ?? data?.state?.user?.currentstage ?? 0);

  // 3) useMemo hooks – KALDES ALTID (returnerer bare tomt/null hvis data ikke er klar)
  const fallbackRows = useMemo(() => {
    if (metricsMeta) return null;
    if (!data) return null; // intet at vise i fallback uden data

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
        return makeAggregateContent(map);
      }
      return makeSourceContent(partsList[row.capField]);
    };

    return rows.map(r => ({
      key: r.id,
      label: r.label,
      used: Number(r.used || 0),
      cap: Number(r.cap || 0),
      hoverContent: makeHoverForRow(r),
    }));
  }, [metricsMeta, data, usages, capacities, partsList]);

  const dynamicRows = useMemo(() => {
    if (!metricsMeta) return null;

    const metaMap = metricsMeta;
    const entries = Object.entries(metaMap);

    // Filtrér: kun top-level + unlocked + giver mening at vise
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
          if (stageCurrent < unlockAt) return; // skjul låste subs
          const subLabel = subMeta?.label || subId;
          const subCapField = subMeta?.capacityField || '';
          if (!subCapField) return;
          map[subLabel] = partsList[subCapField];
        });
        return makeAggregateContent(map);
      }

      if (capField) {
        return makeSourceContent(partsList[capField]);
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

    // Behold rækker med hover eller hvor der er noget tal at vise
    const filtered = rows.filter(r => r.hoverContent || r.used > 0 || r.cap > 0);
    return filtered;
  }, [metricsMeta, stageCurrent, usages, capacities, partsList]);

  const rows = dynamicRows || fallbackRows || [];

  // 4) Først her må vi lave early returns (efter alle hooks er kaldt)
  if (err) return <div style={{ color: 'red' }}>Fejl: {String(err)}</div>;
  if (loading || !data) return null;

  const citizens = data.citizens;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <CitizensBadge citizens={citizens} />
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