import React, { useMemo } from 'react';
import Modal from '../ui/Modal.jsx';
import { fmt } from '../../services/helpers.js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

function buildChartData(items, resDefs, totalCapacity) {
  const entries = Object.entries(items || {});
  if (entries.length === 0) return [];

  return entries
    .map(([id, amountValue]) => {
      const amount = Number(amountValue || 0);
      if (amount <= 0) return null;

      const def = resDefs?.[id] || {};
      const unitSpace = Number(def.unitSpace ?? 0);
      const usedSpace = unitSpace * amount;
      const pctRaw = totalCapacity > 0 ? (usedSpace / totalCapacity) * 100 : 0;
      const pct = Number.isFinite(pctRaw) ? Math.max(0, pctRaw) : 0;

      // Normalize emoji: support unicode emoji or image URL / file name
      const rawEmoji =
        def.iconUrl ?? def.icon ?? def.emoji ?? def.image ?? def.icon_file ?? '';
      let emojiChar = '';
      let emojiUrl = '';
      if (rawEmoji) {
        if (typeof rawEmoji === 'string') {
          // If looks like a URL or absolute path, use as-is
          if (rawEmoji.startsWith('/') || rawEmoji.startsWith('http')) {
            emojiUrl = rawEmoji;
          } else if (/\.(png|jpg|jpeg|svg|webp)$/i.test(rawEmoji)) {
            // file name only -> try assets/pic (game uses assets/pic for res/stats icons)
            emojiUrl = (import.meta?.env?.BASE_URL || '/') + `assets/pic/${rawEmoji}`;
          } else if (/^[\p{Emoji}\u200d]+$/u.test(rawEmoji)) {
            // plain unicode emoji(s)
            emojiChar = rawEmoji;
          } else {
            // fallback: maybe a plain name like "stats_water" -> try assets/pic/stats_water.png
            const nameNormalized = rawEmoji.replace(/\.[a-z0-9]+$/i, '').replace(/[.\s\-]+/g, '_');
            emojiUrl = (import.meta?.env?.BASE_URL || '/') + `assets/pic/${nameNormalized}.png`;
          }
        } else if (typeof rawEmoji === 'object') {
          const maybe = rawEmoji.iconUrl ?? rawEmoji.url ?? rawEmoji.path ?? '';
          if (maybe) {
            emojiUrl = (maybe.startsWith('/') || maybe.startsWith('http')) ? maybe : (import.meta?.env?.BASE_URL || '/') + `assets/pic/${maybe}`;
          } else if (rawEmoji.emoji) {
            emojiChar = rawEmoji.emoji;
          }
        }
      }

      // Debugging helper: hvis ingen emojiUrl/char findes, log def id så du kan tjekke i Network
      if (!emojiUrl && !emojiChar) {
        // console.debug(`No icon for res ${id} (def keys: ${Object.keys(def||{}).join(',')})`);
      }

      return {
        id,
        name: def.name || id,
        emojiChar,
        emojiUrl,
        amount,
        unit: def.unit || '',
        unitSpace,
        usedSpace,
        pct,
        pctClamped: Math.min(100, pct),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.usedSpace - a.usedSpace);
}

// Styre den lille hover boks i diagrammet
const tooltipStyle = {
  background: 'rgba(15, 23, 42, 0.92)',
  color: '#e2e8f0',
  borderRadius: 6,
  padding: '8px 10px',
  boxShadow: '0 8px 20px rgba(2, 6, 23, 0.55)',
  border: '1px solid rgba(184, 148, 148, 0.2)',
};

function CapacityTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        {entry.emojiUrl ? (
          <img src={entry.emojiUrl} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
        ) : entry.emojiChar ? (
          <span style={{ fontSize: 18 }}>{entry.emojiChar}</span>
        ) : null}
        <span>{entry.name}</span>
      </div>
      <div style={{ fontSize: 12, display: 'grid', gap: 2 }}>
        <span>Kapacitet: {fmt(entry.usedSpace)} ({entry.pct.toFixed(1)}%)</span>
        <span>Mængde: {fmt(entry.amount)}{entry.unit ? ` ${entry.unit}` : ''}</span>
        <span>Fylder pr. enhed: {fmt(entry.unitSpace)}</span>
      </div>
    </div>
  );
}

export default function ResourceCapacityModal({
  open,
  onClose,
  title,
  items,
  resDefs,
  totalCapacity = 0,
}) {
  const data = useMemo(
    () => buildChartData(items, resDefs, totalCapacity),
    [items, resDefs, totalCapacity]
  );

  const totalUsedSpace = useMemo(
    () => data.reduce((sum, item) => sum + item.usedSpace, 0),
    [data]
  );

  const usedPct = totalCapacity > 0 ? (totalUsedSpace / totalCapacity) * 100 : 0;
  const remainingSpace = Math.max(0, totalCapacity - totalUsedSpace);

  return (
    <Modal open={open} onClose={onClose} title={title} size="large">
      {data.length === 0 ? (
        <div style={{ padding: '12px 4px', color: '#94a3b8' }}>
          Ingen ressourcer i lageret lige nu.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              fontSize: 13,
              color: '#cbd5f5',
            }}
          >
            <div>
              <div style={{ opacity: 0.7 }}>Total kapacitet</div>
              <div style={{ fontWeight: 700 }}>{fmt(totalCapacity)}</div>
            </div>
            <div>
              <div style={{ opacity: 0.7 }}>Brugte pladser</div>
              <div style={{ fontWeight: 700 }}>
                {fmt(totalUsedSpace)} ({usedPct.toFixed(1)}%)
              </div>
            </div>
            <div>
              <div style={{ opacity: 0.7 }}>Ledig plads</div>
              <div style={{ fontWeight: 700 }}>{fmt(remainingSpace)}</div>
            </div>
          </div>

          <div style={{ width: '100%', height: 420 }}>  
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 10, right: 24, bottom: 10, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  stroke="#94a3b8"
                  style={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={180}
                  tickFormatter={(name, index) => {
                    const emojiChar = data[index]?.emojiChar || '';
                    return `${emojiChar ? `${emojiChar} ` : ''}${name}`;
                  }}
                  stroke="#94a3b8"
                  style={{ fontSize: 12 }}
                />
                <Tooltip content={<CapacityTooltip />} cursor={{ fill: 'rgba(184, 148, 148, 0.08)' }} />
                <Bar dataKey="pctClamped" fill="#38bdf8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Modal>
  );
}
