import React from 'react';
import StatsEffectsTooltip from '../ui/StatsEffectsTooltip.jsx';

/**
 * Wrapper der:
 * - viser din egen title
 * - saniterer stats (fjerner "item"/tomt/nested)
 * - bruger StatsEffectsTooltip med showHeader={false} (så "Item" aldrig vises)
 */
export default function ManagementStatsTooltip({
  title,
  stats,
  translations,
  rename = {
    traffic_flow: 'Traffic Flow',
    safety: 'Safety',
    est_cost: 'Est Cost',
  },
}) {
  const sanitized = sanitizeStats(stats, rename);
  return (
    <div style={{ maxWidth: 420 }}>
      {title ? <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
      <StatsEffectsTooltip def={{ stats: sanitized }} translations={translations} showHeader={false} />
    </div>
  );
}

function sanitizeStats(stats, rename) {
  const src = typeof stats === 'function' ? stats() : stats;
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue;
    if (typeof v === 'object') continue; // undgå nested objekter
    const key = String(k).trim();
    if (!key) continue;
    if (['item', 'items', 'title', 'name', 'desc'].includes(key)) continue;
    const label = rename?.[key] || toTitle(key);
    out[label] = v;
  }
  return out;
}

function toTitle(key) {
  return String(key)
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)\S/g, s => s.toUpperCase());
}