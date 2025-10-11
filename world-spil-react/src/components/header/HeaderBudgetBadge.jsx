import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import HoverCard from '../ui/HoverCard.jsx';
import { useT } from "../../services/i18n.js";

function fmtNum(v) {
  return Number(v || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 });
}

export default function HeaderBudgetBadge() {
  const { data, loading, err } = useHeaderSummary();
  const t = useT();

  if (loading || err || !data) return null;

  const usages = data?.usages ?? {};
  const capacities = data?.capacities ?? {};
  const metaMap = data?.metricsMeta ?? {};

  // Total tax-usage: sum af alle usage entries hvor key starter med "tax"
  const taxUsed = useMemo(() => {
    let sum = 0;
    for (const [key, val] of Object.entries(usages)) {
      if (!/^useTax/i.test(key)) continue;
      const total = Number(val?.total || 0);
      sum += total;
    }
    return sum;
  }, [usages]);

  // Kapacitet: prøv taxCapacity, ellers budgetCapacity som fallback
  const taxCap = Number(
    capacities.taxCapacity ??
    capacities.budgetCapacity ??
    0
  );

  const ratio = taxCap > 0 ? Math.max(0, Math.min(1, taxUsed / taxCap)) : 0;
  const pct = Math.round(ratio * 100);

  const content = (
    <div style={{ minWidth: 260 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Budget</div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Forbrug (tax)</span><span>{fmtNum(taxUsed)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Kapacitet</span><span>{fmtNum(taxCap)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: 6, fontWeight: 600 }}>
          <span>Udnyttelse</span><span>{pct.toLocaleString('da-DK')}%</span>
        </div>
      </div>
      {/* Senere: udvid med popup/hover der viser detaljer pr. tax-område */}
    </div>
  );

  return (
    <HoverCard content={content} cardStyle={{ maxWidth: 360, minWidth: 260 }}>
      <span className="res-chip" title="Budget (tax)" style={{ cursor: 'pointer', userSelect: 'none' }}>
        💹 {fmtNum(taxUsed)} / {fmtNum(taxCap)}
      </span>
    </HoverCard>
  );
}