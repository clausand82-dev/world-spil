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
  water: 'Water',
  health: 'Health',
  // Aggregerede
  heat: 'Heat',
  power: 'Power',
  // Subkategorier
  heatFossil: 'Heat (Fossil)',
  heatGreen: 'Heat (Green)',
  heatNuclear: 'Heat (Nuclear)',
  powerFossil: 'Power (Fossil)',
  powerGreen: 'Power (Green)',
  powerNuclear: 'Power (Nuclear)',
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
  // Hooks SKAL kaldes ubetinget:
  const [hoverMain, setHoverMain] = useState(null);

  // Safe defaults så hooks-ordren ikke ændres ved early returns
  const h = data?.happiness ?? { impacts: {}, weightTotal: 0, impactTotal: 0, happiness: 0 };
  const usages = data?.usages ?? {};
  const caps   = data?.capacities ?? {};

  const score01 = Number(h.happiness || 0);
  const pct = Math.round(score01 * 100);
  const emoji = emojiFromScore(score01);

  // Lav en visnings-row for en given nøgle
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
    const MAIN_ORDER = ['health', 'food', 'water', 'housing', 'heat', 'power'];

    const mainRows = MAIN_ORDER
      .map(k => makeRow(k))
      .filter(r => (r.used > 0) || (r.cap > 0) || r.fromImpact);

    return (
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Happiness breakdown</div>
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
                    <div>
                      <strong>{r.label}</strong>
                      {subs.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#666' }}>
                          (hold mus for sub)
                        </span>
                      )}
                    </div>
                    <div style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {fmt(r.used)} / {fmt(r.cap)} — score {r.scorePct}%{r.weight > 0 ? <> × weight {fmt(r.weight)} = {fmt(r.impact)}</> : null}
                    </div>
                  </div>

                  {showSubs && (
                    <ul style={{ marginTop: 6, marginBottom: 2, paddingLeft: 10, listStyle: 'none', borderLeft: '2px solid rgba(0,0,0,0.06)' }}>
                      {subs.map(sk => {
                        const s = makeRow(sk);
                        const show = (s.used > 0) || (s.cap > 0) || s.fromImpact;
                        if (!show) return null;
                        return (
                          <li key={sk} style={{ padding: '3px 0 3px 6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 12 }}>{LABELS[sk] || sk}</span>
                              <span style={{ fontSize: 12, color: '#333' }}>
                                {fmt(s.used)} / {fmt(s.cap)} — score {s.scorePct}%{s.weight > 0 ? <> × weight {fmt(s.weight)} = {fmt(s.impact)}</> : null}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Total impact {fmt(h.impactTotal)} / weight {fmt(h.weightTotal)} → {Math.round(score01 * 100)}%
        </div>
      </div>
    );
  }, [hoverMain, h, caps, usages]);

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