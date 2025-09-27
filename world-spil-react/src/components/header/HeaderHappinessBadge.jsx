import React from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';

function emojiFromScore(score01) {
  if (score01 >= 0.90) return '😊';
  if (score01 >= 0.80) return '😐';
  if (score01 >= 0.70) return '😞';
  if (score01 >= 0.60) return '😢';
  if (score01 >= 0.50) return '😠';
  return '😡';
}

export default function HeaderHappinessBadge() {
  const { data, loading, err } = useHeaderSummary();
  if (loading || err || !data?.happiness) return null;

  const score01 = Number(data.happiness.happiness || 0);
  const pct = Math.round(score01 * 100);
  const emoji = emojiFromScore(score01);

  return (
    <span className="res-chip" title={`Happiness: ${pct}%`}>
      {emoji} {pct}
    </span>
  );
}