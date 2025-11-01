import React, { useMemo, useState, useRef, useEffect } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import HoverCard from '../ui/HoverCard.jsx';
import { fmt } from '../../services/helpers.js';
import { useGameData } from '../../context/GameDataContext.jsx';
import { useStatsLabels, happinessEmojiFromScore } from '../../hooks/useStatsLabels.jsx';

// Beregn score som i backend
function calcScore01(used, cap) {
  const u = Number(used) || 0;
  const c = Number(cap) || 0;
  if (c <= 0) return 0;
  const overload = Math.max(0, u / c - 1);
  return Math.max(0, 1 - overload);
}

export default function HeaderHappinessBadge() {
  const { data, loading, err, isFetching } = useHeaderSummary();
  const lastDataRef = useRef(data);
  useEffect(() => { if (data) lastDataRef.current = data; }, [data]);
  const effective = data || lastDataRef.current;
  const { data: gameData } = useGameData();
  const [hoverMain, setHoverMain] = useState(null);

  const LABELS = useStatsLabels();

  const isEnabledForHappiness = (key) => {
  const meta = metaMap?.[key] || {};
  // Hvis backend ikke sender feltet, fallback til true
  if (meta?.happiness && typeof meta.happiness.enabled === 'boolean') {
    return Boolean(meta.happiness.enabled);
  }
  return true;
};

  // Backend-provided happiness summary + registry metadata
  const h = effective?.happiness ?? { impacts: {}, weightTotal: 0, impactTotal: 0, happiness: 0 };
  const usages = effective?.usages ?? {};
  const caps = effective?.capacities ?? {};
  const metaMap = effective?.metricsMeta ?? {}; // fra backend: indeholder stage.locked, parent, subs osv.
  const stageCurrent = Number(gameData?.state?.user?.currentstage ?? 0);

  // Hjælpere: stage / unlock checks (brug metadata fra summary)
  const isUnlocked = (key) => {
    const m = metaMap?.[key];
    if (!m || !m.stage) return true; // fallback: vis
    return !Boolean(m.stage.locked);
  };

  // Weight-check: brug backend-impacts hvis tilgængelig (impacts indeholder weight),
  // ellers fallback til config (gameData.config.happinessWeights eller pattern key).
  const getWeight = (key) => {
    const imp = h.impacts?.[key];
    if (imp && typeof imp.weight === 'number') return Number(imp.weight || 0);
    // fallback: check config keys like `${key}HappinessWeight` or gameData.config.happiness
    const cfg = gameData?.config || {};
    // first try direct key in config (e.g. healthHappinessWeight)
    const weightKey = `${key}HappinessWeight`;
    if (weightKey in cfg) return Number(cfg[weightKey] || 0);
    // next: config.happiness map if present
    const happinessCfg = cfg?.happiness || cfg?.Happiness || {};
    if (happinessCfg && (key in happinessCfg)) return Number(happinessCfg[key] || 0);
    return 0;
  };

  // Build parent -> subs map dynamically from metricsMeta
  const parentToSubs = useMemo(() => {
    const out = {};
    for (const [id, meta] of Object.entries(metaMap || {})) {
      const parent = String(meta?.parent || '').trim();
      if (!parent) continue;
      if (!out[parent]) out[parent] = [];
      out[parent].push(id);
    }
    // Ensure parents appear even if no subs in map (they may be top-level metrics)
    for (const k of Object.keys(metaMap || {})) {
      if (!out[k] && Array.isArray(metaMap[k]?.subs) && metaMap[k].subs.length > 0) {
        out[k] = metaMap[k].subs.slice();
      }
    }
    return out;
  }, [metaMap]);

  // Decide which keys to consider as top-level "main" rows:
  // - include keys that appear in impacts (backend decided weight>0 and unlocked when building impacts)
  // - also include registry top-level keys (metaMap) that either have happiness enabled or have subs
  const allCandidates = useMemo(() => {
    const fromImpacts = Object.keys(h.impacts || {});
    const fromMeta = Object.keys(metaMap || {});
    const set = new Set([...fromImpacts, ...fromMeta]);
    return Array.from(set);
  }, [h.impacts, metaMap]);

  // Build rows with stage gating + weight filtering + parent/sub logic
  const rows = useMemo(() => {
    // helper to build a single row or return null if not visible
    const makeRow = (key) => {
      // if weight is zero → do not show
      const weight = getWeight(key);
      if (weight <= 0) return null;

      // stage gating: show only when unlocked
      if (!isUnlocked(key)) return null;

      // get usage/cap data (if backend provides imp use that first)
      const imp = h.impacts?.[key] || null;
      let used = 0, cap = 0, score = 0, fromImpact = false;
      if (imp) {
        fromImpact = true;
        used = Number(imp.used || 0);
        cap = Number(imp.capacity || 0);
        score = Number(imp.score || 0);
      } else {
        // fallback derive from usages/caps using registry metadata
        const meta = metaMap?.[key] || {};
        const usageField = meta?.usageField || null;
        const capField = meta?.capacityField || null;
        used = usageField ? Number(usages?.[usageField]?.total || 0) : 0;
        cap = capField ? Number(caps?.[capField] || 0) : 0;
        score = calcScore01(used, cap);
      }

      // Hide trivial empty rows unless it was an impact (backend wanted it shown)
      if (!fromImpact) {
        if (!isVisibleByStage(key) || !isUnlockedByStage(key)) return null;
      }
      // NYT: tjek registered happiness enabled
      if (!isEnabledForHappiness(key)) return null;

      const impact = (typeof imp?.impact === 'number') ? Number(imp.impact) : (weight * score || 0);

      return { key, label: LABELS[key] || key, used, cap, scorePct: Math.round(score * 100), weight, impact, fromImpact };
    };

    // Determine visible subs and parents
    const visibleSet = new Set();
    // First pass: build rows for non-sub items and for subs (we'll decide parent visibility after)
    const candidateRows = {};
    for (const k of allCandidates) {
      const r = makeRow(k);
      if (r) {
        candidateRows[k] = r;
        visibleSet.add(k);
      }
    }

    // Parent logic: ensure parent appears if any of its subs are visible.
    for (const [parent, subs] of Object.entries(parentToSubs)) {
      const anySubVisible = subs.some(s => visibleSet.has(s));
      if (anySubVisible) {
        // ensure parent is visible if stage/unlock & weight allow
        if (!visibleSet.has(parent)) {
          const prow = makeRow(parent);
          if (prow) {
            candidateRows[parent] = prow;
            visibleSet.add(parent);
          }
        }
      }
    }

    // Build ordered array: prefer some order similar to current PREFERRED behaviour
    const PREFERRED = ['health', 'food', 'water', 'housing', 'heat', 'power', 'product'];
    const ordered = Object.keys(candidateRows).sort((a, b) => {
      const ai = PREFERRED.indexOf(a), bi = PREFERRED.indexOf(b);
      if (ai >= 0 || bi >= 0) {
        if (ai === bi) return a.localeCompare(b);
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        return ai - bi;
      }
      return candidateRows[b].impact - candidateRows[a].impact || a.localeCompare(b);
    });

    // --- NEW: nest subs under parents and avoid duplicates in top-level ---
    const childToParent = {};
    for (const [parent, subs] of Object.entries(parentToSubs)) {
      for (const s of subs) childToParent[s] = parent;
    }

    const finalRows = [];
    for (const k of ordered) {
      // skip keys that are subs (they will be shown under their parent)
      if (childToParent[k]) continue;
      const row = candidateRows[k];
      if (!row) continue;
      const subsKeys = parentToSubs[k] || [];
      const subsRows = subsKeys.map(s => candidateRows[s]).filter(Boolean);
      if (subsRows.length > 0) row.subs = subsRows;
      finalRows.push(row);
    }

    return finalRows;
  }, [allCandidates, getWeight, isUnlocked, h, usages, caps, metaMap, parentToSubs, LABELS]);

  const mainRows = rows || [];

  const score01 = Number(h.total ?? h.happiness ?? 0);
  const pct = Math.round(score01 * 100);
  const emoji = happinessEmojiFromScore(score01);
  const lastScoreRef = useRef(pct);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (lastScoreRef.current !== undefined && lastScoreRef.current !== pct) {
      setBlink(true);
      const t = setTimeout(() => setBlink(false), 180);
      return () => clearTimeout(t);
    }
    lastScoreRef.current = pct;
  }, [pct]);

  const hover = (
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
            if (!r) return null;
            const subsRows = r.subs || [];
            const showSubs = hoverMain === r.key && subsRows.length > 0;
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
                    <span style={{ fontSize: 12, opacity: 0.8 }}>
                      brug: {r.used.toLocaleString()} / {r.cap.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontVariantNumeric: 'tabular-nums' }}>{r.scorePct}%</div>
                    {r.fromImpact && <div style={{ fontSize: 12, opacity: 0.8 }}>Weight:{r.weight}</div>}
                  </div>
                </div>

                {showSubs && (
                  <div style={{ marginTop: 6, paddingLeft: 8 }}>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                      {subsRows.map(subRow => (
                        <li key={subRow.key} style={{ padding: '4px 6px', borderRadius: 6 }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong>{subRow.label}</strong>
                              <span style={{ fontSize: 12, opacity: 0.8 }}>
                                brug: {subRow.used.toLocaleString()} / {subRow.cap.toLocaleString()}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{subRow.scorePct}%</div>
                              {subRow.fromImpact && <div style={{ fontSize: 12, opacity: 0.8 }}>Weight:{subRow.weight}</div>}
                            </div>
                          </div>
                        </li>
                      ))}
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

  return (
    <HoverCard content={hover}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 14 }}>
        <span
          className="res-chip"
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'opacity 160ms ease, transform 160ms ease',
            opacity: blink ? 0.5 : 1,
            transform: blink ? 'translateY(-4px)' : 'translateY(0)',
          }}
        >
          <span role="img" aria-label="happiness" style={{ fontSize: 16 }}></span>
          <span>{emoji}</span>
          <span style={{ fontWeight: 600 }}> {pct}%</span>
          
        </span>
      </div>
    </HoverCard>
  );
}