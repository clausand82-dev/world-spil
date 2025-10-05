import React, { useMemo, useState, useEffect } from 'react';
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

/** Henter focus param fra hash:
 * understøtter '#/research?focus=rsd.foo.l1' og '#/research#rsd.foo.l1'
 */
function getFocusFromHash() {
  const h = window.location.hash || '';
  // Hvis query-agtig del findes: '#/research?focus=...'
  const qIdx = h.indexOf('?');
  if (qIdx !== -1) {
    const q = h.slice(qIdx + 1);
    try {
      const params = new URLSearchParams(q);
      const f = params.get('focus');
      if (f) return decodeURIComponent(f);
    } catch (e) {
      // ignore
    }
  }
  // fallback: hvis der er et fragment efter første '#/...#fragment'
  // fx '#/research#rsd.foo.l1'
  const parts = h.split('#');
  if (parts.length >= 3) {
    const frag = parts[2];
    if (frag) return decodeURIComponent(frag);
  }
  return null;
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
      // fjern research der kræver højere stage end spilleren har
      if (stageReq > userStage) continue;

      const famRaw = def.family || 'misc';
      const fams = String(famRaw).split(',').map(s => s.trim()).filter(Boolean);
      if (fams.length === 0) fams.push('misc');

      const base = getSeriesBase(id);
      const ownedLevel = computeOwnedLevelForBase(base, state.research);
      const displayLevel = getLevelFromId(id);
      const stageOk = userStage >= stageReq;

      // krav-check: hvis def.require (eller def.requires) findes, parse den og tjek om hver id er opfyldt
      const reqText = def.require || def.requires || '';
      const reqList = parseRequireList(reqText);
      const missing = reqList.filter(r => !idSatisfiesLevelRequirement(r, state));
      const reqOk = missing.length === 0;

      for (const fam of fams) {
        map[fam] = map[fam] || [];
        map[fam].push({
          fullId: id,
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

  // focusId fra URL (fx '#/research?focus=rsd.foo.l1')
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    const f = getFocusFromHash();
    if (f) setFocusId(f);
  }, []);

  useEffect(() => {
    // hvis activeFamily ikke længere findes, vælg første
    if (!familyKeys.includes(activeFamily)) {
      setActiveFamily(familyKeys[0] || 'misc');
    }
  }, [familyKeys, activeFamily]);

  useEffect(() => {
    if (!focusId) return;
    // vent til families er klar, så vi kan finde hvilken family den hører til
    for (const fam of Object.keys(families)) {
      const arr = families[fam] || [];
      if (arr.some(e => e.fullId === focusId)) {
        // sæt tab og scroll til element
        setActiveFamily(fam);
        setTimeout(() => {
          // find element i DOM (ResearchRow bruger data-research-row attr)
          try {
            const sel = `[data-research-row="${CSS && CSS.escape ? CSS.escape(focusId) : focusId}"]`;
            const el = document.querySelector(sel);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // kort highlight (tilføj klasse og fjern den)
              el.classList.add('research-focus-flash');
              setTimeout(() => el.classList.remove('research-focus-flash'), 1800);
            }
          } catch (e) {
            // ignore selector issues
            const el2 = document.querySelector(`[data-research-row="${focusId}"]`);
            if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);
        return;
      }
    }
    // hvis ikke fundet i nogen family, gør ingenting
  }, [focusId, families]);

  return (
    <div className="page research-page">
      <h1>{t?.('page.research') ?? 'Research'}</h1>

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
            <div key={entry.fullId} style={{ marginBottom: 8 }}>
              <ResearchRow
                entry={entry}
                state={state}
                baseOwned={computeOwnedLevelForBase(getSeriesBase(entry.fullId), state.research)}
                requirementCaches={{}} // valgfri cache
              />
            </div>
          ))
        )}
      </div>

      {/* lille styling helper — kan sættes i din CSS i stedet */}
      <style>{`
        .research-focus-flash {
          transition: box-shadow 220ms ease, transform 220ms ease;
          box-shadow: 0 8px 30px rgba(40,160,255,0.16);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}