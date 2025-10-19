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
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 700 }}>
          {resourceDef?.emoji ? <span style={{ marginRight:6, display:'inline-flex', alignItems:'center' }}>{resourceDef.emoji}</span> : null}
{displayName}
        </div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>
          Mængde: {fmtAmount(amount)}{unitLabel}
        </div>
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
