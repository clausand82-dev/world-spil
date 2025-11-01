import React, { useMemo, useRef, useEffect, useState } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';
import HoverCard from '../ui/HoverCard.jsx';
import Icon from '../ui/Icon.jsx';

function fmt(n, opts = {}) {
  const v = Number(n || 0);
  if (opts.percent) return `${Math.round(v * 100)}%`;
  return v.toLocaleString('da-DK');
}

export default function HeaderCrimeBadge() {
  const { data, loading, err } = useHeaderSummary();
  // keep last valid summary to avoid unmount/remount during revalidate
  const lastDataRef = useRef(data);
  useEffect(() => { if (data) lastDataRef.current = data; }, [data]);
  const effective = data || lastDataRef.current;
  const { data: gameData } = useGameData();
  const stageCurrent = Number(gameData?.state?.user?.currentstage ?? 0);

  // Vis kun hvis vi har effektive data
  if (!effective) return null;

  // fine-grupperne indeholder både adults- og crime-undersplit
  const adultsWithCrime = effective?.citizens?.groupCounts?.adultsTotal ?? {};
  const adultsCrime = effective?.citizens?.groupCounts?.crime ?? {};
  const adultWithoutCrime = effective?.citizens?.groupCounts?.adults ?? {};

  const pct01 = adultsWithCrime > 0 ? (adultsCrime / adultsWithCrime) : 0;
  const pct = Math.round(pct01 * 1000) / 10; // 1 decimal
  // blink when pct changes
  const lastPctRef = useRef(pct);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (lastPctRef.current !== undefined && lastPctRef.current !== pct) {
      setBlink(true);
      const t = setTimeout(() => setBlink(false), 180);
      return () => clearTimeout(t);
    }
    lastPctRef.current = pct;
  }, [pct]);
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
      <span
        className="res-chip"
        title="Kriminalitet"
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'opacity 160ms ease, transform 160ms ease',
          opacity: blink ? 0.5 : 1,
          transform: blink ? 'translateY(-4px)' : 'translateY(0)',
        }}
      >
        <Icon src="/assets/icons/citizens_crime.png" size={18} alt="happiness" /> {pct.toLocaleString('da-DK')}%
      </span>
    </HoverCard>
  );
}