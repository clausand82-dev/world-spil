import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { useT } from '../services/i18n.js';
import ResearchRow from '../components/building/rows/ResearchRow.jsx';
import ResearchTab from '../components/building/tabs/ResearchTab.jsx';
import { computeResearchOwned, computeOwnedMap, collectActiveBuffs } from '../services/requirements.js';

// Hjælpere til parse og stage
function parseStageMin(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseResearchKey(id) {
  // "rsd.tools.l2" -> { base: "rsd.tools", lvl: 2 }
  const m = /^(.+)\.l(\d+)$/.exec(id);
  if (!m) return { base: id, lvl: 1 };
  return { base: m[1], lvl: Number(m[2]) };
}
function getSeriesBase(fullId) {
  return parseResearchKey(fullId).base;
}

export default function ResearchPage() {
  const t = useT();
  const { data } = useGameData();
  if (!data) return <div>{t?.('ui.loading') ?? 'Indlæser...'}</div>;

  const defs = data.defs || {};
  const researchDefs = defs.rsd || {};
  const state = data.state || {};
  const userStage = Number(state.user?.currentstage || 0);

  // --- Compute ownership & active buffs so requirementInfo can resolve buffed vs base durations ---
  const ownedBuildings = useMemo(() => computeOwnedMap(state.bld || {}), [state.bld]);
  const ownedAddons = useMemo(() => computeOwnedMap(state.add || {}), [state.add]);
  const ownedResearch = useMemo(() => computeResearchOwned(state), [state]);
  const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);

  const requirementCaches = useMemo(() => ({
    ownedBuildings, ownedAddons, ownedResearch, activeBuffs,
  }), [ownedBuildings, ownedAddons, ownedResearch, activeBuffs]);

  // Byg families (ingen stage-filter her; vi viser stage-locked korrekt via ResearchRow)
  const families = useMemo(() => {
    const map = {};
    for (const [key, def] of Object.entries(researchDefs)) {
      const famRaw = def.family || 'misc';
      const fams = String(famRaw).split(',').map((s) => s.trim()).filter(Boolean);
      if (fams.length === 0) fams.push('misc');

      const id = key; // kan være med/uden "rsd."
      const fullId = key.startsWith('rsd.') ? key : `rsd.${key}`;
      const entry = {
        id,
        fullId,
        def,
        displayLevel: parseResearchKey(fullId).lvl,
        stageReq: parseStageMin(def.stage),
      };

      for (const fam of fams) {
        if (!map[fam]) map[fam] = [];
        map[fam].push(entry);
      }
    }

    // sortér natural: level først
    for (const k of Object.keys(map)) {
      map[k].sort(
        (a, b) =>
          (a.displayLevel || 0) - (b.displayLevel || 0) ||
          a.fullId.localeCompare(b.fullId)
      );
    }
    return map;
  }, [researchDefs]);

  const familyKeys = Object.keys(families).sort();
  const ALL_KEY = 'all';
  const allFamilyKeys = [ALL_KEY, ...familyKeys];
  const [activeFamily, setActiveFamily] = useState(allFamilyKeys[0] || ALL_KEY);

  // Brug samme ejerskabs-udledning som andre steder (kritisk for korrekt "owned")
  const researchOwnedMap = useMemo(() => computeResearchOwned(state), [state]);
  const baseOwnedFor = (seriesBase) => Number(researchOwnedMap[seriesBase] || 0);

  // Vis/skjul owned (bevares i localStorage)
  const [showOwned, setShowOwned] = useState(() => {
    try {
      const v = localStorage.getItem('research.showOwned');
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  });
  useEffect(() => { try { localStorage.setItem('research.showOwned', showOwned ? '1' : '0'); } catch (e) {} }, [showOwned]);

  // Udvælg de entries, der skal vises for en bestemt tab/family
  function getVisibleForFamily(familyKey, showOwnedOverride) {
    const arr = familyKey === ALL_KEY ? Object.values(families).flat() : (families[familyKey] || []);
    if (!arr.length) return [];

    // group by series base -> map(level -> entry)
    const bySeries = new Map();
    for (const e of arr) {
      const base = getSeriesBase(e.fullId) || e.fullId;
      const lvl = Number(e.displayLevel || 0);
      if (!bySeries.has(base)) bySeries.set(base, new Map());
      bySeries.get(base).set(lvl, e);
    }

    const out = [];
    for (const [base, lvlMap] of bySeries.entries()) {
      const levels = Array.from(lvlMap.keys()).sort((a, b) => a - b);
      if (!levels.length) continue;

      const ownedLevel = baseOwnedFor(base);
      const maxLevel = levels[levels.length - 1] || 0;

      // current: hvis ejet → højeste ejet; ellers → lvl1 (eller laveste)
      let currentLevel = ownedLevel > 0 ? ownedLevel : (levels.includes(1) ? 1 : levels[0]);
      if (!levels.includes(currentLevel)) currentLevel = levels[levels.length - 1];
      const currentEntry = lvlMap.get(currentLevel);
      if (!currentEntry) continue;

      const curStageReq = parseStageMin(currentEntry.def?.stage);
      const currentAnnotated = {
        ...currentEntry,
        seriesBase: base,
        ownedLevel,               // VIGTIGT: ResearchRow forventer dette
        baseOwned: ownedLevel,    // ekstra felt for god ordens skyld
        isOwned: ownedLevel > 0 && currentLevel <= ownedLevel,
        isMaxOwned: ownedLevel > 0 && ownedLevel >= maxLevel,
        role: 'current',
        stageReq: curStageReq,
        stageOk: userStage >= curStageReq,
      };

      // Ingen ejet: vis current kun hvis stage-krav opfyldt
      if (ownedLevel > 0 || userStage >= curStageReq) {
        out.push(currentAnnotated);
      }

      // next: næste level, hvis findes
      if (ownedLevel < maxLevel) {
        const nextLevel = levels.find((l) => l > currentLevel) || null;
        if (nextLevel) {
          const nextEntry = lvlMap.get(nextLevel);
          const nextStageReq = parseStageMin(nextEntry.def?.stage);
          out.push({
            ...nextEntry,
            seriesBase: base,
            ownedLevel,             // VIGTIGT: så Row kan sammenligne displayLevel vs ownedLevel
            baseOwned: ownedLevel,
            isOwned: false,
            isMaxOwned: false,
            role: 'next',
            stageReq: nextStageReq,
            stageOk: userStage >= nextStageReq,
          });
        }
      }
    }

    // Vis/skjul owned (skjul kun “current owned” rækker når slået fra)
    const localShowOwned = typeof showOwnedOverride === 'boolean' ? showOwnedOverride : showOwned;
    const filtered = localShowOwned ? out : out.filter(e => !(e.role === 'current' && (e.ownedLevel || 0) > 0));

    // Stabil sortering
    filtered.sort((a, b) => {
      const an = (a.def?.name || a.seriesBase || a.fullId).toString();
      const bn = (b.def?.name || b.seriesBase || b.fullId).toString();
      if (an === bn) {
        if (a.role !== b.role) return a.role === 'current' ? -1 : 1;
        return (a.displayLevel || 0) - (b.displayLevel || 0);
      }
      return an.localeCompare(bn);
    });

    return filtered;
  }

  // Indhold for aktiv tab
  const visibleFamilyEntries = useMemo(() => {
    return getVisibleForFamily(activeFamily, showOwned);
  }, [families, state?.research, userStage, activeFamily, showOwned]);

  // Tællere pr. tab: X/Y = udenOwned/medOwned
  const familyCounts = useMemo(() => {
    const map = {};
    const allKeys = [ALL_KEY, ...Object.keys(families).sort()];
    for (const k of allKeys) {
      const visibleWith = getVisibleForFamily(k, true).length;     // med owned
      const visibleWithout = getVisibleForFamily(k, false).length; // uden owned
      map[k] = { visibleWith, visibleWithout };
    }
    return map;
  }, [families, state?.research, userStage]);

  // ---------- Scroll fokus (én gang pr. valgt fokus-id; reaktiver ved nyt fokus) ----------
  const pendingFocusRef = useRef(null);
  const lastFocusRef = useRef('');
  const didScrollForCurrentRef = useRef(false);

  function getFocusFromHash() {
    const h = window.location.hash || '';
    const idx = h.indexOf('?');
    if (idx !== -1) {
      try {
        const qs = new URLSearchParams(h.slice(idx + 1));
        return qs.get('focus') || '';
      } catch { /* ignore malformed */ }
    }
    try {
      const qs2 = new URLSearchParams(window.location.search || '');
      return qs2.get('focus') || '';
    } catch {
      return '';
    }
  }

  function findElement(id) {
    if (!id) return null;
    const byId = document.getElementById(id) || document.getElementById(id.replace(/\./g, '__'));
    if (byId) return byId;

    try {
      const sel = `[data-fullid="${CSS && CSS.escape ? CSS.escape(id) : id}"]`;
      const byData = document.querySelector(sel);
      if (byData) return byData;
    } catch (e) { /* ignore */ }

    try {
      const sel = `[id="${CSS && CSS.escape ? CSS.escape(id) : id}"]`;
      const byAttr = document.querySelector(sel);
      if (byAttr) return byAttr;
    } catch (e) { /* ignore */ }

    return null;
  }

  function scrollElementIntoView(el) {
    if (!el) return false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
    catch { el.scrollIntoView(); }
    el.classList.add('focus-highlight');
    const onEnd = () => { el.classList.remove('focus-highlight'); el.removeEventListener('animationend', onEnd); };
    el.addEventListener('animationend', onEnd, { once: true });
    return true;
  }

  function tryScrollOnce(focusId) {
    if (!focusId) return false;
    if (didScrollForCurrentRef.current) return false;
    const el = findElement(focusId);
    if (el) {
      requestAnimationFrame(() => {
        const ok = scrollElementIntoView(el);
        if (ok) {
          didScrollForCurrentRef.current = true;
          pendingFocusRef.current = null;
        }
      });
      return true;
    }
    return false;
  }

  useEffect(() => {
    function onHash() {
      const focus = getFocusFromHash();
      if (!focus) return;

      if (focus !== lastFocusRef.current) {
        lastFocusRef.current = focus;
        didScrollForCurrentRef.current = false;
        pendingFocusRef.current = focus;

        setTimeout(() => tryScrollOnce(focus), 150);
        setTimeout(() => tryScrollOnce(focus), 500);
      }

      for (const fam of Object.keys(families)) {
        const arr = families[fam] || [];
        if (arr.some((e) => e.fullId === focus || e.id === focus)) {
          setActiveFamily(fam);
          break;
        }
      }
    }

    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [families]);

  useEffect(() => {
    const focus = pendingFocusRef.current;
    if (!focus || didScrollForCurrentRef.current) return;
    const attempt = () => tryScrollOnce(focus);
    requestAnimationFrame(attempt);
    const t1 = setTimeout(attempt, 120);
    const t2 = setTimeout(attempt, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeFamily, families]);

  return (
    <section className="panel section">
      <div className="section-head">🔬 Research</div>
      <div className="section-body">

        <div className="tabs-bar" role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[ALL_KEY, ...familyKeys].map((f) => (
            <button
              key={f}
              role="button"
              aria-selected={f === activeFamily}
              onClick={() => setActiveFamily(f)}
              className={`tab ${activeFamily === f ? 'active' : ''}`}
            >
              {f === ALL_KEY ? 'Alle' : f}
              <span style={{ opacity: 0.7, marginLeft: 6 }}>
                {familyCounts[f]?.visibleWithout ?? 0}/{familyCounts[f]?.visibleWith ?? 0}
              </span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn"
              aria-pressed={showOwned}
              title={showOwned ? 'Skjul allerede researchede' : 'Vis allerede researchede'}
              onClick={() => setShowOwned(s => !s)}
            >
              {showOwned ? 'Skjul ejede' : 'Vis ejede'}
            </button>
          </div>
        </div>

        <div className="tab-content">
          {activeFamily === ALL_KEY ? (
            (!familyKeys || familyKeys.length === 0) ? (
              <div className="sub">Ingen research.</div>
            ) : (
              familyKeys.map((fam) => (
                <section key={fam} className="panel section" style={{ marginBottom: 12 }}>
                  <div className="section-head">{fam}</div>
                  <div className="section-body">
                    {(families[fam] || []).length === 0 ? (
                      <div className="sub">Ingen</div>
                    ) : (
                      (families[fam] || []).map((entry) => {
                        const fullId = entry.fullId;
                        const base = getSeriesBase(fullId);
                        const baseOwned = baseOwnedFor(base);
                        return (
                          <div key={fullId} data-fullid={fullId} style={{ marginBottom: 8 }}>
                            <ResearchRow
                              entry={{
                                ...entry,
                                ownedLevel: Number(researchOwnedMap[getSeriesBase(entry.fullId)] || 0),
                              }}
                              state={state}
                              baseOwned={baseOwned}
                              requirementCaches={requirementCaches}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              ))
            )
          ) : (
            <ResearchTab
              family={activeFamily}
              defs={defs}
              state={state}
              stage={userStage}
              baseOwned={false}
              requirementCaches={requirementCaches}
            />
          )}
        </div>
      </div>
    </section>
  );
}