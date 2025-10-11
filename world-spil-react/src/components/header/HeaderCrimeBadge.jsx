import React, { useMemo } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';
import HoverCard from '../ui/HoverCard.jsx';

function fmt(n, opts = {}) {
  const v = Number(n || 0);
  if (opts.percent) return `${Math.round(v * 100)}%`;
  return v.toLocaleString('da-DK');
}

export default function HeaderCrimeBadge() {
  const { data, loading, err } = useHeaderSummary();
  const { data: gameData } = useGameData();
  const stageCurrent = Number(gameData?.state?.user?.currentstage ?? 0);

  // Vis først når vi har data
  if (loading || err || !data) return null;

  // fine-grupperne indeholder både adults- og crime-undersplit
  const adultsWithCrime = data?.citizens?.groupCounts?.adultsTotal ?? {};
  const adultsCrime = data?.citizens?.groupCounts?.crime ?? {};
  const adultWithoutCrime = data?.citizens?.groupCounts?.adults ?? {};


  // Alle voksne-grupper
  /*const adultGroups = [
    'adultsUnemployed', 'adultsWorker', 'adultsPolice', 'adultsFire',
    'adultsHealth', 'adultsSoldier', 'adultsGovernment', 'adultsPolitician', 'adultsHomeless'
  ];
  const crimeGroups = [
    'crimeUnemployed', 'crimeWorker', 'crimePolice', 'crimeFire',
    'crimeHealth', 'crimeSoldier', 'crimeGovernment', 'crimePolitician', 'crimeHomeless'
  ];

  const adultsTotal = adultGroups.reduce((a, k) => a + Number(fine[k] || 0), 0);
  const crimeAdults = crimeGroups.reduce((a, k) => a + Number(fine[k] || 0), 0);*/

  const pct01 = adultsWithCrime > 0 ? (adultsCrime / adultsWithCrime) : 0;
  const pct = Math.round(pct01 * 1000) / 10; // 1 decimal
  const content = (
    <div style={{ minWidth: 260 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Kriminalitet</div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Voksne i alt</span><span>{fmt(adultsWithCrime)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Voksne kriminelle</span><span>{fmt(adultsCrime)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: 6, fontWeight: 600 }}>
          <span>Andel</span><span>{pct.toLocaleString('da-DK')}%</span>
        </div>
      </div>
    </div>
  );

  return (
    <HoverCard content={content} cardStyle={{ maxWidth: 340, minWidth: 260 }}>
      <span className="res-chip" title="Kriminalitet" style={{ cursor: 'pointer', userSelect: 'none' }}>
        🦹 {pct.toLocaleString('da-DK')}%
      </span>
    </HoverCard>
  );
}