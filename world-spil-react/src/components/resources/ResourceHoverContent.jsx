import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { computePassiveYields } from '../../services/passiveYields.js';

const fmtAmount = (value) =>
  Number(value || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 });

const Section = ({ title, items, sign }) => {
  if (!items || items.length === 0) {
    return (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>Ingen kilder.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {items.map((entry, index) => (
          <div
            key={`${entry.sourceId || entry.name || 'source'}-${index}`}
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <span style={{ opacity: 0.6, minWidth: 52, fontSize: 11 }}>
              {String(entry.sourceType || '').toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {entry.name || entry.sourceId}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 12 }}>
              {sign}
              {fmtAmount(Math.abs(entry.perHour || 0))} / t
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple top summary used by both simple and detailed hover
export function SimpleResourceSummary({ resourceDef, amount, totalSpace }) {
  const unitSpace = Number(resourceDef?.unitSpace ?? 0);
  const unitLabel = resourceDef?.unit ? ` ${resourceDef.unit}` : '';
  const emojiNode = resourceDef?.emoji ? (
    <span style={{ marginRight: 6, display: 'inline-flex', alignItems: 'center', fontSize: '2em', lineHeight: 1 }}>
      {resourceDef.emoji}
    </span>
  ) : null;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 6 }}>
      <div style={{ width: '2.4em', minWidth: '2.4em', height: '2.4em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {resourceDef?.iconUrl ? (
          <img src={resourceDef.iconUrl} alt={resourceDef.name} style={{ width: '2em', height: '2em', objectFit: 'contain' }} />
        ) : (
          emojiNode || <span style={{ fontSize: '2em', lineHeight: 1 }}>📦</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {resourceDef?.name || (resourceDef?.id || 'Ukendt')}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#333' }}>
          Mængde: <span style={{ fontWeight: 700 }}>{fmtAmount(amount)}</span>{unitLabel}
          <span style={{ color: '#666', marginLeft: 8 }}>• UnitSpace: {Number(unitSpace)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ResourceHoverContent({
  resourceId,
  resourceDef,
  amount,
  totalSpace,
}) {
  const { data } = useGameData() || {};
  const defs = data?.defs;
  const state = data?.state;

  const { positive, negative } = useMemo(() => {
    if (!resourceId) return { positive: [], negative: [] };
    try {
      return computePassiveYields({ defs, state, resource: resourceId }) || {
        positive: [],
        negative: [],
      };
    } catch {
      return { positive: [], negative: [] };
    }
  }, [defs, state, resourceId]);

  const totalPositive = positive.reduce(
    (sum, entry) => sum + (entry.perHour || 0),
    0
  );
  const totalNegative = negative.reduce(
    (sum, entry) => sum + (entry.perHour || 0),
    0
  );
  const netPerHour = totalPositive + totalNegative;

  const unitSpace = Number(resourceDef?.unitSpace ?? 0);
  const displayName =
    resourceDef?.name || resourceId?.replace(/^res\./i, '') || 'Ukendt ressource';
  const unitLabel = resourceDef?.unit ? ` ${resourceDef.unit}` : '';

  return (
    <div style={{ maxWidth: 420, display: 'grid', gap: 10 }}>
      {/* Reuse simple summary at top so simple + detailed share same layout */}
      <SimpleResourceSummary resourceDef={resourceDef} amount={amount} totalSpace={totalSpace} />

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 11, opacity: 0.8 }}>
          Fylder i lager: {fmtAmount(totalSpace)} (pr. enhed: {fmtAmount(unitSpace)})
        </div>
      </div>

      <Section title="Producerer (+)" items={positive} sign="+" />
      <Section title="Forbruger (-)" items={negative} sign="-" />

      <div
        style={{
          borderTop: '1px solid rgba(0,0,0,0.08)',
          paddingTop: 8,
          display: 'grid',
          gap: 4,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ opacity: 0.8 }}>Total +</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtAmount(Math.max(0, totalPositive))}
            {' '}
            / t
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ opacity: 0.8 }}>Total -</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtAmount(Math.abs(Math.min(0, totalNegative)))}
            {' '}
            / t
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontWeight: 700 }}>
          <span>Netto</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {netPerHour >= 0 ? '+' : '-'}
            {fmtAmount(Math.abs(netPerHour))}
            {' '}
            / t
          </span>
        </div>
      </div>
    </div>
  );
}
