import React from 'react';
import StatsEffectsTooltip from '../ui/StatsEffectsTooltip.jsx';

/**
 * Wrapper til konsistent hover på tværs af tabs:
 * - headerMode="stats": StatsEffectsTooltip tegner titel/undertekst (samme look som bygninger)
 * - headerMode="wrapper": vi tegner en simpel header, og StatsEffectsTooltip skjuler sin (showHeader=false)
 * - extras: fritekst/beregningslinjer under stats
 * - bevarer rå stats-nøgler (emoji/undertekst virker)
 */
export default function ManagementStatsTooltip({
  title,
  subtitle,
  stats,
  extras,
  translations,
  headerMode = 'wrapper',
  filterKeys = ['item', 'items', 'title', 'name', 'desc'],
}) {
  const filtered = filterStats(stats, filterKeys);
  const useStatsHeader = headerMode === 'stats';
  const defForStats = useStatsHeader
    ? { title, desc: subtitle, stats: filtered }
    : { stats: filtered };

  return (
    <div style={{ minWidth: 260, maxWidth: 520 }}>
      {!useStatsHeader && (title || subtitle) ? (
        <div style={{ marginBottom: 8 }}>
          {title ? <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div> : null}
          {subtitle ? <div style={{ fontSize: 12, opacity: 0.8 }}>{subtitle}</div> : null}
        </div>
      ) : null}

      <StatsEffectsTooltip def={defForStats} translations={translations} showHeader={useStatsHeader} />

      {Array.isArray(extras) && extras.length > 0 ? (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {extras.map((line, idx) => {
              if (typeof line === 'string') {
                return (
                  <li key={idx} style={{ padding: '4px 0' }}>
                    <div style={{ fontSize: 13 }}>{line}</div>
                  </li>
                );
              }
              const label = String(line?.label ?? '').trim();
              const value = fmtValue(line?.value);
              const desc = String(line?.desc ?? '').trim();
              return (
                <li key={idx} style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>{label}</span>
                    <span style={{ textAlign: 'right' }}>{value}</span>
                  </div>
                  {desc ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{desc}</div> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function filterStats(stats, filterKeys) {
  if (!stats) return {};
  if (typeof stats === 'string') return parseStatsString(stats, filterKeys);
  if (typeof stats !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(stats)) {
    const key = String(k || '').trim();
    if (!key || filterKeys.includes(key)) continue;
    if (v == null) continue;
    if (typeof v === 'object') continue;
    out[key] = v; // rå nøgle bevares
  }
  return out;
}
function parseStatsString(s, filterKeys) {
  const parts = String(s).split(';').map(x => x.trim()).filter(Boolean);
  const out = {};
  for (const p of parts) {
    const [k, v = ''] = p.split('=', 2).map(x => x.trim());
    if (!k || filterKeys.includes(k)) continue;
    const num = Number(v);
    out[k] = (!Number.isNaN(num) && v !== '') ? num : v;
  }
  return out;
}
function fmtValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
}