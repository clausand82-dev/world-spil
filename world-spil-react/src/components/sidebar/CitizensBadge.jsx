import React, { useMemo } from 'react';
import HoverCard from '../ui/HoverCard.jsx';

/**
 * CitizensBadge
 * - Viser 👥 + total antal personer.
 * - Hover viser en liste med grupper og counts.
 *
 * VISNINGSVALG (KORT vs. LANG) STYRES AF STAGE:
 * - showLong = (stage >= thresholdStage)
 * - thresholdStage er en prop med default 3, så du kan ændre niveau senere uden at røre koden.
 *
 * Dataforventning (fra summary.php):
 * citizens = {
 *   totals: { totalPersons: number },
 *   lists: {
 *     short: [ { key, label, count }, ... ], // baby, kids, young, adults (inkl. crime), old
 *     long:  [ { key, label, count }, ... ], // alle undergrupper, uden crime-felter
 *   }
 *   // desuden: raw, groupCounts, sorted, ... (til andre formål)
 * }
 */
export default function CitizensBadge({
  citizens,
  stage = 0,            // din nuværende bruger-stage (kan komme fra global state/props)
  thresholdStage = 3,    // ÆNDRE HER: hvilken stage der giver adgang til "lang" visning - ÆNDRE I HEADERCI...BADGE ISTEDET
  showModeHint = false,   // lille hint "(kort/lang)" ved siden af tallet
}) {
  const total = citizens?.totals?.totalPersons || 0;
  const shortList = citizens?.lists?.short || [];
  const longList  = citizens?.lists?.long || [];

  // VISNINGSVALG: lang hvis stage >= thresholdStage, ellers kort
  const showLong = (Number(stage) || 0) >= (Number(thresholdStage) || 0);
  const list = showLong ? longList : shortList;

  const content = useMemo(() => {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong>Fordeling ({showLong ? 'lang' : 'kort'})</strong>
          {/* Intet toggle/knap – styres udelukkende af stage */}
        </div>
        <ul style={{ margin: 0, paddingLeft: 14 }}>
          {list.map(it => (
            <li key={it.key}>{it.label}: {it.count}</li>
          ))}
        </ul>
      </div>
    );
  }, [list, showLong]);

  return (
    <HoverCard content={content}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 14 }}
        title={undefined}
      >
        <span role="img" aria-label="citizens" style={{ fontSize: 16 }}>👥</span>
        <span style={{ fontWeight: 600 }}>{total}</span>
        {showModeHint && (
          <span style={{ fontSize: 11, color: '#666' }}>
            ({showLong ? 'lang' : 'kort'})
          </span>
        )}
      </div>
    </HoverCard>
  );
}