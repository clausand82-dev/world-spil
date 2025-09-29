import React, { useMemo, useState } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import HoverCard from '../ui/HoverCard.jsx';
import { fmt } from '../../services/helpers.js';

function emojiFromScore(score01) {
  if (score01 >= 0.90) return '😊';
  if (score01 >= 0.80) return '😐';
  if (score01 >= 0.70) return '😞';
  if (score01 >= 0.60) return '😢';
  if (score01 >= 0.50) return '😠';
  return '😡';
}

// Labels til visning
const LABELS = {
  housing: 'Housing',
  food: 'Provision',
  water: 'Vand',
  health: 'Sundhed',
  // Aggregerede
  heat: 'Varme',
  power: 'Strøm',
  // Subkategorier
  heatFossil: 'Varme (Fossil)',
  heatGreen: 'Varme (Green)',
  heatNuclear: 'Varme (Nuclear)',
  powerFossil: 'Strøm (Fossil)',
  powerGreen: 'Strøm (Green)',
  powerNuclear: 'Strøm (Nuclear)',
};

// Hoved → sub nøgler
const GROUPS = {
  heat:  ['heatGreen', 'heatNuclear', 'heatFossil'],
  power: ['powerGreen', 'powerNuclear', 'powerFossil'],
};

// Mapping af nøgle → usage/capacity keys fra summary
const MAP = {
  health:     { usage: 'useHealth',     cap: 'healthCapacity' },
  food:       { usage: 'useProvision',  cap: 'provisionCapacity' },
  water:      { usage: 'useWater',      cap: 'waterCapacity' },
  housing:    { usage: 'useHousing',    cap: 'housingCapacity' },
  heat:       { usage: 'useHeat',       cap: 'heatCapacity' },
  power:      { usage: 'usePower',      cap: 'powerCapacity' },
  heatFossil:   { usage: 'useHeatFossil',   cap: 'heatFossilCapacity' },
  heatGreen:    { usage: 'useHeatGreen',    cap: 'heatGreenCapacity' },
  heatNuclear:  { usage: 'useHeatNuclear',  cap: 'heatNuclearCapacity' },
  powerFossil:  { usage: 'usePowerFossil',  cap: 'powerFossilCapacity' },
  powerGreen:   { usage: 'usePowerGreen',   cap: 'powerGreenCapacity' },
  powerNuclear: { usage: 'usePowerNuclear', cap: 'powerNuclearCapacity' },
};

// Beregn score som i backend
function calcScore01(used, cap) {
  const u = Number(used) || 0;
  const c = Number(cap) || 0;
  if (c <= 0) return 0;
  const overload = Math.max(0, u / c - 1);
  return Math.max(0, 1 - overload);
}

export default function HeaderHappinessBadge() {
  const { data, loading, err } = useHeaderSummary();
  const [hoverMain, setHoverMain] = useState(null);

  const h = data?.happiness ?? { impacts: {}, weightTotal: 0, impactTotal: 0, happiness: 0 };
  const usages = data?.usages ?? {};
  const caps   = data?.capacities ?? {};

  const score01 = Number(h.happiness || 0);
  const pct = Math.round(score01 * 100);
  const emoji = emojiFromScore(score01);

  // Uændret: makeRow bruger impacts hvis de findes, ellers regner den score ud fra usages/capacities
  const makeRow = (key) => {
    const label = LABELS[key] || key;
    const imp = h.impacts?.[key] || null;
    const fromImpact = !!imp;

    let used = 0, cap = 0, score = 0, weight = 0, impact = 0;

    if (fromImpact) {
      used   = Number(imp.used || 0);
      cap    = Number(imp.capacity || 0);
      score  = Number(imp.score || 0);
      weight = Number(imp.weight || 0);
      impact = Number(imp.impact || 0);
    } else {
      const m = MAP[key];
      if (m) {
        used  = Number(usages?.[m.usage]?.total || 0);
        cap   = Number(caps?.[m.cap] || 0);
        score = calcScore01(used, cap);
      }
      weight = 0;
      impact = 0;
    }

    return {
      key, label, used, cap,
      scorePct: Math.round(score * 100),
      weight, impact,
      fromImpact,
    };
  };

  const content = useMemo(() => {
    // Foretrukken visningsorden – andre følger alfabetisk
    const PREFERRED = ['health', 'food', 'water', 'housing', 'heat', 'power'];

    // Saml alle sub-keys (så vi kan filtrere dem ud af toprækker)
    const SUB_SET = new Set(Object.values(GROUPS || {}).flat());

    // 1) Nøgler med weight > 0 fra backend-impacts (disse SKAL vises), men ikke subs
    const impactKeys = Object.entries(h.impacts || {})
      .filter(([, imp]) => Number(imp?.weight || 0) > 0)
      .map(([k]) => k)
      .filter(k => !SUB_SET.has(k)); // ← filtrér subs væk her

    // 2) Kombinér med de vigtige standardnøgler, så de også kan vises ved aktivitet
    const allKeys = Array.from(new Set([...impactKeys, ...PREFERRED]));

    // 3) Sortér efter PREFERRED, derefter alfabetisk
    const orderIndex = (k) => {
      const i = PREFERRED.indexOf(k);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    allKeys.sort((a, b) => {
      const oa = orderIndex(a), ob = orderIndex(b);
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });

    // 4) Lav rækker, filtrér sådan:
    //    - ALT med weight > 0 (fromImpact) vises
    //    - Ellers vis hvis der er aktivitet (used>0 eller cap>0)
    const mainRows = allKeys
      .map(k => makeRow(k))
      .filter(r => r.fromImpact || r.used > 0 || r.cap > 0);

    return (
      
        
      <div style={{ minWidth: 260, maxWidth: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>Happiness breakdown</strong>
        <span style={{ opacity: 0.75 }}>Σw={Math.round(h.weightTotal || 0)}</span>
      </div>
        
        {mainRows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Ingen aktive kategorier.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {mainRows.map(r => {
              const subs = GROUPS[r.key] || [];
              const showSubs = hoverMain === r.key && subs.length > 0;

              return (
                <li
                  key={r.key}
                  onMouseEnter={() => setHoverMain(r.key)}
                  onMouseLeave={() => setHoverMain(null)}
                  style={{
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: hoverMain === r.key ? 'rgba(44,123,229,0.08)' : 'transparent',
                    transition: 'background 120ms linear',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong>{r.label}</strong>
                      {/* NYT: vis “brug” under hver hovedrække */}
                      <span style={{ fontSize: 12, opacity: 0.8 }}>
                        brug: {r.used.toLocaleString()} / {r.cap.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontVariantNumeric: 'tabular-nums' }}>{r.scorePct}%</div>
                      {r.fromImpact && <div style={{ fontSize: 12, opacity: 0.8 }}>Weight:{r.weight}</div>}
                    </div>
                  </div>

                  {/* Subs – vises kun under parent */}
                  {showSubs && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      <ul style={{ margin: 0, paddingLeft: 14 }}>
                        {subs.map(subKey => {
                          const subRow = makeRow(subKey);
                          return (
                            <li key={subKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span>{LABELS[subKey] || subKey}</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{subRow.scorePct}%</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }, [h, usages, caps, hoverMain]);

  // Nu må vi gerne "stille" os selv ved loading/fejl
  if (loading || err) return null;
  // Hvis der slet ikke er happiness endnu, kan vi skjule badge – hooks er allerede kaldt
  if (!data?.happiness) return null;

  return (
    <HoverCard
      content={content}
      cardStyle={{ maxWidth: 560, minWidth: 420 }}
    >
      <span className="res-chip" title={undefined} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {emoji} {pct}
      </span>
    </HoverCard>
  );
}