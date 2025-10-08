import React from 'react';
import StatsEffectsTooltip from '../ui/StatsEffectsTooltip.jsx';

/**
 * ManagementStatsTooltip
 * Formål:
 * - Viser stats gennem StatsEffectsTooltip (med emoji/undertekst via kendte rå nøgler).
 * - Kan vise title/subtitle i samme header-stil som på bygninger (via headerMode='stats').
 * - Kan vise en ekstra sektion (extras) under stats – både fritekst og beregnede linjer.
 *
 * Props:
 * - title?: string
 * - subtitle?: string
 * - stats: object | string | (choices, ctx) => object|string
 * - extras?: Array<string | {label: string, value?: any, desc?: string}> | (choices, ctx) => samme
 * - translations?: object
 * - headerMode?: 'wrapper' | 'stats' (default 'wrapper')
 *   - 'stats': sender title/subtitle som def.name/def.desc og lader StatsEffectsTooltip tegne headeren
 *   - 'wrapper': viser egen header ovenfor og kalder StatsEffectsTooltip med showHeader={false}
 * - filterKeys?: string[] – fjern støjnøgler (default: ['item','items','title','name','desc'])
 */
export default function ManagementStatsTooltip({
  title,
  subtitle,
  stats,
  extras,
  translations,
  headerMode = 'wrapper',
  filterKeys = ['item', 'items', 'title', 'name', 'desc'],
  choices,
  ctx,
}) {
  const resolvedStats = resolveStats(stats, choices, ctx);
  const filteredStats = filterStats(resolvedStats, filterKeys);

  const resolvedExtras = resolveExtras(extras, choices, ctx);

  // Header-tegning mode
  const useStatsHeader = headerMode === 'stats';
  const defForStats = useStatsHeader
    ? { title, desc: subtitle, stats: filteredStats }
    : { stats: filteredStats };

  return (
    <div style={{ minWidth: 260, maxWidth: 520 }}>
      {/* Egen header når headerMode='wrapper' */}
      {!useStatsHeader && (title || subtitle) ? (
        <div style={{ marginBottom: 8 }}>
          {title ? <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div> : null}
          {subtitle ? <div style={{ fontSize: 12, opacity: 0.8 }}>{subtitle}</div> : null}
        </div>
      ) : null}

      {/* Stats – header vises kun i 'stats' mode */}
      <StatsEffectsTooltip
        def={defForStats}
        translations={translations}
        showHeader={useStatsHeader}
      />

      {/* Extras – hvis noget at vise, lav en divider og en lille liste */}
      {Array.isArray(resolvedExtras) && resolvedExtras.length > 0 ? (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {resolvedExtras.map((line, idx) => {
              if (typeof line === 'string') {
                return (
                  <li key={idx} style={{ padding: '4px 0' }}>
                    <div style={{ fontSize: 13 }}>{line}</div>
                  </li>
                );
              }
              const label = String(line?.label ?? '').trim();
              const value = line?.value;
              const desc = String(line?.desc ?? '').trim();
              return (
                <li key={idx} style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>{label}</span>
                    <span style={{ textAlign: 'right' }}>{fmtValue(value)}</span>
                  </div>
                  {desc ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                      {desc}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function resolveStats(stats, choices, ctx) {
  if (typeof stats === 'function') return stats(choices, ctx);
  return stats || {};
}
function resolveExtras(extras, choices, ctx) {
  if (typeof extras === 'function') return extras(choices, ctx);
  return extras || [];
}
function filterStats(stats, filterKeys) {
  const src = typeof stats === 'function' ? stats() : stats;
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue;
    if (typeof v === 'object') continue; // undgå nested
    const key = String(k).trim();
    if (!key || filterKeys.includes(key)) continue;
    // Bevar rå nøgle (fx healthCapacity) for at få emoji/undertekst
    out[key] = v;
  }
  return out;
}
function fmtValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
}