import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import InlineCapacityBar from '../header/InlineCapacityBar.jsx';
import { makeDefsNameResolver } from '../utils/nameResolver.js';
import { useStatsLabels } from '../../hooks/useStatsLabels.jsx';

const fmt = (v) => Number(v || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 });

// Map sidebar-sektion -> defs-gruppe-prefix
const SECTION_FAMILY = {
  buildings: 'bld',
  addon: 'add',
  research: 'rsd',
  animals: 'ani',
  inventory: 'res',
};

function CapBreakdown({ label, list, defs, partsList }) {
  if (!list) return null;

  const nameResolver = useMemo(() => makeDefsNameResolver(defs), [defs]);

  const sections = [
    ['buildings', 'Bygninger'],
    ['addon', 'Addons'],
    ['research', 'Forskning'],
    ['animals', 'Dyr'],
    ['inventory', 'Lager'],
    ['citizens', 'Borgere'], // NY
  ];

  const visibleSections = sections.filter(([key]) => Array.isArray(list?.[key]) && list[key].length > 0);
  if (visibleSections.length === 0) return null;

  const SECTION_FAMILY_LOCAL = { buildings: 'bld', addon: 'add', research: 'rsd', animals: 'ani', inventory: 'res' };

  const ItemList = ({ items, familyKey }) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {items.map((it, idx) => {
          const fam = SECTION_FAMILY_LOCAL[familyKey];
          const name = nameResolver.resolve(fam, it);
          const amount = it?.amount ?? it?.value ?? it?.val ?? (typeof it === 'number' ? it : 0);
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(amount || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 })}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      {visibleSections.map(([key, title]) => (
        <div key={key} style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
          <ItemList items={list?.[key]} familyKey={key} />
        </div>
      ))}
    </div>
  );
}

function UsageBreakdown({ label, usage }) {
  if (!usage) return null;

  const breakdown = usage.breakdown || {};

  // crime skal ikke vises separat — gør den implicit i adults
  const crime = Number(breakdown.crime || 0);
  const keys = ['baby', 'kids', 'young', 'adults', 'old']; // fjern 'crime' fra visning

  const rows = keys
    .map((k) => {
      let val = Number(breakdown[k] || 0);
      // når vi behandler adults, tilføj crime implicit
      if (k === 'adults') val += crime;
      return [k, val];
    })
    .filter(([, v]) => v !== 0);

  const infra = Number(usage.infra || 0);
  const total = Number(usage.total || 0);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {rows.length === 0 ? (
          <div style={{ opacity: 0.6 }}>—</div>
        ) : (
          rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ textTransform: 'capitalize' }}>{k}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</span>
            </div>
          ))
        )}
        {infra !== 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Infra</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(infra)}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid #e5e7eb', paddingTop: 6, fontWeight: 600 }}>
        <span>Total</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
      </div>
    </div>
  );
}

function HoverPanel({ open, onClose, content, panelRef, locked }) {
  const localRef = useRef(null);
  const ref = panelRef || localRef;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 50,
        width: 420,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '60vh',
        overflow: 'auto',
        background: '#ffffff',
        color: '#0b1220',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gap: 10,
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
        fontSize: 12,
        lineHeight: 1.3,
      }}
      onMouseLeave={() => { if (!locked) onClose?.(); }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {content}
      </div>
    </div>
  );
}

export default function SidebarCapacities() {
  const { data: header } = useHeaderSummary();
  const { data: gameData } = useGameData();
  // hent oversatte stat-navne (emoji + label strings)
  const statLabels = useStatsLabels();

  const defs = gameData?.defs || {};
  const usages = header?.usages || {};
  const capacities = header?.capacities || {};
  const partsList = header?.partsList || {};
  const metaMap = header?.metricsMeta || {};
  const stageCurrent = Number(gameData?.state?.user?.currentstage ?? 0);

  // Sæt ønsket rækkefølge (fallback kun hvis backend ikke allerede leverer metricsOrder)
  const headerWithOrder = React.useMemo(() => {
    const defaultOrder = ['housing', 'food', 'water', 'heat',];
    return { ...(header || {}), metricsOrder: header?.metricsOrder ?? defaultOrder };
  }, [header]);

  const rows = useMemo(() => {
    if (!metaMap) return [];
    const entries = Object.entries(metaMap);

    const topUnlocked = entries.filter(([id, m]) => {
      const unlockAt = Number(m?.stage?.unlock_at ?? 1);
      const isUnlocked = stageCurrent >= unlockAt;
      const isTop = !m?.parent;
      const hasAnyField = Boolean((m?.usageField || '').length || (m?.capacityField || '').length);
      return isUnlocked && isTop && hasAnyField;
    });

    // Mulighed 1: eksplicit liste i header (metricsOrder / metricsKeyOrder)
    const explicitOrder = Array.isArray(headerWithOrder?.metricsOrder)
      ? headerWithOrder.metricsOrder
      : Array.isArray(headerWithOrder?.metricsKeyOrder)
        ? headerWithOrder.metricsKeyOrder
        : [];

    const sortWithFallback = (a, b) => {
      // a/b er [id, meta]
      const ma = a[1] || {};
      const mb = b[1] || {};
      const oa = Number.isFinite(Number(ma?.order)) ? Number(ma.order) : NaN;
      const ob = Number.isFinite(Number(mb?.order)) ? Number(mb.order) : NaN;
      if (!Number.isNaN(oa) || !Number.isNaN(ob)) {
        if (!Number.isNaN(oa) && !Number.isNaN(ob)) return oa - ob;
        if (!Number.isNaN(oa)) return -1;
        return 1;
      }
      const la = (ma.label || a[0]).toLowerCase();
      const lb = (mb.label || b[0]).toLowerCase();
      return la.localeCompare(lb);
    };

    let ordered;
    if (explicitOrder.length > 0) {
      const idx = new Map(explicitOrder.map((k, i) => [k, i]));
      ordered = topUnlocked.slice().sort((a, b) => {
        const ia = idx.has(a[0]) ? idx.get(a[0]) : Number.POSITIVE_INFINITY;
        const ib = idx.has(b[0]) ? idx.get(b[0]) : Number.POSITIVE_INFINITY;
        if (ia !== ib) return ia - ib;
        return sortWithFallback(a, b);
      });
    } else {
      ordered = topUnlocked.slice().sort(sortWithFallback);
    }

    return ordered.map(([id, m]) => {
      const label = statLabels?.[id] || m?.label || id;
      const uKey = m?.usageField || '';
      const cKey = m?.capacityField || '';
      const used = uKey ? Number(usages[uKey]?.total || 0) : 0;
      const cap = cKey ? Number(capacities[cKey] || 0) : 0;
      return { key: id, label, used, cap };
    });
  }, [metaMap, stageCurrent, usages, capacities, partsList, defs, headerWithOrder, statLabels]);

  const [hoverKey, setHoverKey] = useState(null);
  const [hoverLocked, setHoverLocked] = useState(false);
  const hoverTimer = useRef(null);
  const hoverPanelRef = useRef(null);

  const openHover = (key) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverKey(key);
  };
  const closeHoverSoon = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (hoverLocked) return;
    hoverTimer.current = setTimeout(() => setHoverKey(null), 120);
  };

  // unlock when clicking outside the hover panel while locked
  useEffect(() => {
    if (!hoverLocked) return undefined;
    const onDocDown = (e) => {
      const panelEl = hoverPanelRef.current;
      if (panelEl && panelEl.contains(e.target)) return;
      setHoverLocked(false);
      setHoverKey(null);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [hoverLocked]);

  // Build hover content
  const hoverContent = useMemo(() => {
    if (!hoverKey || !metaMap?.[hoverKey]) return null;

    const buildForMetric = (id) => {
      const m = metaMap[id] || {};
      const label = statLabels?.[id] || m.label || id;
      const uKey = m.usageField || '';
      const cKey = m.capacityField || '';
      const subIds = Array.isArray(m.subs) ? m.subs : [];

      const usage = uKey ? usages[uKey] : null;
      const capList = cKey ? partsList[cKey] : null;

      const unlockedSubs = subIds.filter((sid) => {
        const sm = metaMap[sid];
        if (!sm) return false;
        const unlockAt = Number(sm?.stage?.unlock_at ?? 1);
        return stageCurrent >= unlockAt;
      });

      const used = uKey ? Number(usages[uKey]?.total || 0) : 0;
      const cap = cKey ? Number(capacities[cKey] || 0) : 0;

      return (
        <div key={id} style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px', minWidth: 220 }}>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>Brug (usage)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(used)}</span>
              </div>
            </div>
            <div style={{ flex: '1 1 180px', minWidth: 220 }}>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>Kapacitet (capacity)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(cap)}</span>
              </div>
            </div>
          </div>

          {usage && (
            <UsageBreakdown label="Usage – opdeling" usage={usage} />
          )}

          {capList && (
            <CapBreakdown label="Capacity – kilder" list={capList} defs={defs} partsList={partsList} />
          )}

          {unlockedSubs.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700, marginTop: 6 }}>Underområder</div>
              {unlockedSubs.map((sid) => {
                const sm = metaMap[sid] || {};
                const slabel = statLabels?.[sid] || sm.label || sid;
                const suKey = sm.usageField || '';
                const scKey = sm.capacityField || '';

                const susage = suKey ? usages[suKey] : null;
                const scapList = scKey ? partsList[scKey] : null;
                const sused = suKey ? Number(usages[suKey]?.total || 0) : 0;
                const scap = scKey ? Number(capacities[scKey] || 0) : 0;

                return (
                  <div key={sid} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{slabel}</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 220 }}>
                        <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>Brug (usage)</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(sused)}</span>
                        </div>
                      </div>
                      <div style={{ flex: '1 1 180px', minWidth: 220 }}>
                        <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>Kapacitet (capacity)</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(scap)}</span>
                        </div>
                      </div>
                    </div>
                    {susage && <UsageBreakdown label="Usage – opdeling" usage={susage} />}
                    {scapList && <CapBreakdown label="Capacity – kilder" list={scapList} defs={defs} partsList={partsList} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return buildForMetric(hoverKey);
  }, [hoverKey, metaMap, usages, capacities, partsList, defs, stageCurrent, statLabels]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div
          key={r.key}
          onClick={() => { setHoverKey(r.key); setHoverLocked(true); }}
          style={{ cursor: 'pointer' }}
        >
          <InlineCapacityBar
            label={r.label}
            used={r.used}
            capacity={r.cap}
          />
        </div>
      ))}

      <HoverPanel
        open={!!hoverKey && !!hoverContent}
        onClose={() => { setHoverKey(null); setHoverLocked(false); }}
        content={hoverContent}
        panelRef={hoverPanelRef}
        locked={hoverLocked}
      />
    </div>
  );
}