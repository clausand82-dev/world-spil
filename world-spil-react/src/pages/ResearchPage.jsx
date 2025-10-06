import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { useT } from '../services/i18n.js';
import ResearchRow from '../components/building/rows/ResearchRow.jsx';

function getSeriesBase(id) {
  const m = /^(.+)\.l(\d+)$/.exec(id);
  return m ? m[1] : id;
}
function getLevelFromId(id) {
  const m = /^(.+)\.l(\d+)$/.exec(id);
  return m ? parseInt(m[2], 10) : 0;
}
function computeOwnedLevelForBase(base, researchMap = {}) {
  let max = 0;
  for (const k of Object.keys(researchMap || {})) {
    const m = /^(.+)\.l(\d+)$/.exec(k);
    if (m && m[1] === base) {
      const lvl = parseInt(m[2], 10);
      if (lvl > max) max = lvl;
    }
  }
  return max;
}

function parseStageMin(stage) {
  if (!stage) return 0;
  const m = String(stage).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function parseRequireList(req) {
  if (!req) return [];
  // krav kan være komma/semikolon/space separeret
  return String(req).split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
}

function idSatisfiesLevelRequirement(id, state) {
  // hvis id er serie med .lN -> accepteres hvis der findes samme base med level >= N
  const m = /^(.+)\.l(\d+)$/.exec(id);
  const researchMap = state?.research || {};
  const ownedBld = state?.owned?.bld || {};
  const ownedAddon = state?.owned?.addon || {};

  if (m) {
    const base = m[1];
    const reqLvl = parseInt(m[2], 10);
    // tjek research
    for (const k of Object.keys(researchMap)) {
      const mm = /^(.+)\.l(\d+)$/.exec(k);
      if (mm && mm[1] === base) {
        const lvl = parseInt(mm[2], 10);
        if (lvl >= reqLvl) return true;
      }
    }
    // tjek owned buildings/addons (de bruger tilsvarende id-format)
    for (const k of Object.keys(ownedBld)) {
      const mm = /^(.+)\.l(\d+)$/.exec(k);
      if (mm && mm[1] === base) {
        const lvl = parseInt(mm[2], 10);
        if (lvl >= reqLvl) return true;
      }
    }
    for (const k of Object.keys(ownedAddon)) {
      const mm = /^(.+)\.l(\d+)$/.exec(k);
      if (mm && mm[1] === base) {
        const lvl = parseInt(mm[2], 10);
        if (lvl >= reqLvl) return true;
      }
    }
    return false;
  }

  // ikke-level id: tjek exact i research eller owned
  if (researchMap[id]) return true;
  if (ownedBld[id]) return true;
  if (ownedAddon[id]) return true;
  return false;
}

export default function ResearchPage() {
  const t = useT();
  const { data } = useGameData();
  if (!data) return <div>{t?.('ui.loading') ?? 'Indlæser...'}</div>;

  const defs = data.defs || {};
  const researchDefs = defs.rsd || {};
  const state = data.state || {};
  const userStage = Number(state.user?.currentstage || 0);

  const families = useMemo(() => {
    const map = {};
    for (const [id, def] of Object.entries(researchDefs)) {
  const stageReq = parseStageMin(def.stage);
  if (stageReq > userStage) continue;

  const famRaw = def.family || 'misc';
  const fams = String(famRaw).split(',').map(s => s.trim()).filter(Boolean);
  if (fams.length === 0) fams.push('misc');

  // Ensure fullId includes the rsd. prefix so anchors match reqId values
  const fullId = id.startsWith('rsd.') ? id : `rsd.${id}`;

  const base = getSeriesBase(fullId); // use fullId when parsing series if helpers expect prefix
  const ownedLevel = computeOwnedLevelForBase(getSeriesBase(fullId), state.research);
  const displayLevel = getLevelFromId(fullId);
  const stageOk = userStage >= stageReq;

  const reqText = def.require || def.requires || '';
  const reqList = parseRequireList(reqText);
  const missing = reqList.filter(r => !idSatisfiesLevelRequirement(r, state));
  const reqOk = missing.length === 0;

  for (const fam of fams) {
    map[fam] = map[fam] || [];
    map[fam].push({
      fullId,
      def,
      ownedLevel,
      displayLevel,
      stageReq,
      stageOk,
      reqOk,
      missingReqs: missing,
    });
  }
}
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.displayLevel || 0) - (b.displayLevel || 0) || a.fullId.localeCompare(b.fullId));
    }
    return map;
  }, [researchDefs, state.research, state.owned, state.user, userStage]);

  const familyKeys = Object.keys(families).sort();
  const [activeFamily, setActiveFamily] = useState(familyKeys[0] || 'misc');
  const pendingFocusRef = useRef(null);

  // --- helpers (flyttet ud af effect så flere effects kan bruge dem) ---
  function parseFocusFromHash(hash) {
    if (!hash) return null;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const qs = hash.slice(qIndex + 1);
      const params = new URLSearchParams(qs);
      return params.get('focus');
    }
    const parts = hash.split('#');
    if (parts.length > 2) return decodeURIComponent(parts[2]);
    return null;
  }

  function findElement(id) {
    if (!id) return null;
    const byId = document.getElementById(id);
    if (byId) return byId;
    try {
      const byData = document.querySelector(`[data-fullid="${CSS && CSS.escape ? CSS.escape(id) : id}"]`);
      if (byData) return byData;
    } catch (e) { /* ignore */ }
    try {
      const byAttr = document.querySelector(`[id="${CSS && CSS.escape ? CSS.escape(id) : id}"]`);
      if (byAttr) return byAttr;
    } catch (e) { /* ignore */ }
    return document.getElementById(id.replace(/\./g, '__'));
  }

  const FOCUS_HIGHLIGHT_MS = 4000;
  function scrollElementIntoView(el) {
    if (!el) return false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(); }
    el.style.setProperty('--focus-duration', `${FOCUS_HIGHLIGHT_MS / 1000}s`);
    const onEnd = () => { el.classList.remove('focus-highlight'); el.removeEventListener('animationend', onEnd); };
    el.classList.add('focus-highlight');
    el.addEventListener('animationend', onEnd, { once: true });
    return true;
  }

  function tryScrollOnce(focus) {
    if (!focus) return false;
    const el = findElement(focus);
    if (el) {
      requestAnimationFrame(() => scrollElementIntoView(el));
      pendingFocusRef.current = null;
      return true;
    }
    return false;
  }

  useEffect(() => {
    function handleHashChange() {
      const focus = parseFocusFromHash(window.location.hash);
      if (!focus) return;

      // undgå at gen-sætte samme pending focus flere gange
      if (pendingFocusRef.current === focus) return;
      pendingFocusRef.current = focus;

      const fam = Object.keys(families || {}).find(f => (families[f] || []).some(e => e.fullId === focus));
      if (fam) {
        // skift til familien — selve scroll forsøges først efter familien er aktiv (i anden effect)
        setActiveFamily(fam);
        return;
      }

      // hvis element findes allerede i DOM, scroll nu
      const ok = tryScrollOnce(focus);
      if (!ok) {
        // retries hvis element ikke findes endnu
        requestAnimationFrame(() => tryScrollOnce(focus));
        setTimeout(() => tryScrollOnce(focus), 300);
        setTimeout(() => tryScrollOnce(focus), 800);
      }
    }

    // initial check + listener
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [families]); // kun families her

  // --- effect: når activeFamily ændrer sig, prøv at scrolle til pending focus (hvis der er en) ---
  useEffect(() => {
    const focus = pendingFocusRef.current;
    if (!focus) return;
    // forsøg at scrolle et par gange (elementet bør nu være renderet)
    const attempt = () => tryScrollOnce(focus);
    requestAnimationFrame(attempt);
    const t1 = setTimeout(attempt, 120);
    const t2 = setTimeout(attempt, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeFamily, families]);

  return (
           <section className="panel section">
            <div className="section-head">Research</div>
<div className="section-body">
      <div className="tabs-bar" role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {familyKeys.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={f === activeFamily}
            onClick={() => setActiveFamily(f)}
            className={f === activeFamily ? 'btn active' : 'btn'}
          >
            {f} <span style={{ opacity: 0.7, marginLeft: 6 }}>({families[f].length})</span>
          </button>
        ))}
      </div>

      <div className="tab-content">
        {(!families[activeFamily] || families[activeFamily].length === 0) ? (
          <div className="sub">Ingen research i denne kategori.</div>
        ) : (
          families[activeFamily].map((entry) => (
  <div id={entry.fullId} data-fullid={entry.fullId} key={entry.fullId} style={{ marginBottom: 8 }}>
    <ResearchRow
      entry={entry}
      state={state}
      baseOwned={computeOwnedLevelForBase(getSeriesBase(entry.fullId), state.research)}
      requirementCaches={{}} // valgfri cache
              />
            </div>
          ))
        )}
      </div></div>
   
          </section>
  );
}