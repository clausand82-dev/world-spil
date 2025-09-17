import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import RecipeRow from '../building/rows/RecipeRow.jsx';
import { useT } from '../../services/i18n.js';
import * as H from '../../services/helpers.js';

export default function ActiveRecipes({ defs: defsProp, state: stateProp, stage: stageProp, debug = false }) {
  const t = useT();
  const tf = (key, fallback) => { const v = t(key); return v === key ? fallback : v; };

  // Hent data korrekt fra context
  const { data, isLoading, error } = useGameData();
  const defs = defsProp || data?.defs || {};
  const state = stateProp || data?.state || {};
  const currentStage = typeof stageProp === 'number'
    ? stageProp
    : Number(state?.user?.currentstage ?? state?.user?.stage ?? 0) || 0;

  const recipeDefs = defs?.rcp || {};

  // Ejerede bygnings-familier (intet level-krav)
  const ownedBuildingFamilies = useMemo(() => {
    const fams = new Set();
    for (const id of Object.keys(state?.bld || {})) {
      // Forventet format: "bld.<serie>.l<level>"
      const p = typeof H.parseBldKey === 'function' ? H.parseBldKey(id) : null;
      if (p?.family) fams.add(String(p.family));
      else {
        // fallback-parse hvis helper ikke findes
        const m = String(id).match(/^bld\.([^.]+(?:\.[^.]+)*)\.l\d+$/);
        if (m) fams.add(m[1]); // antag familie = serie-basen
      }
    }
    return fams;
  }, [state?.bld]);

  // Ejer oversigter til req-checks (bld./add.)
  const ownedBldMax = useMemo(() => (typeof H.computeOwnedMaxBySeries === 'function' ? H.computeOwnedMaxBySeries('bld', state) : {}), [state]);
  const ownedAddMax = useMemo(() => (typeof H.computeOwnedMaxBySeries === 'function' ? H.computeOwnedMaxBySeries('add', state) : {}), [state]);

  // hasResearch helper
  const hasResearch = (rid) => {
    if (typeof H.hasResearch === 'function') return H.hasResearch(rid, state);
    const ridStr = String(rid);
    const key = ridStr.replace(/^rsd\./, '');
    return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[ridStr]);
  };

  // Parse req til liste
  const normalizeReq = (req) => {
    if (!req) return [];
    if (Array.isArray(req)) return req.map(String).map((s) => s.trim()).filter(Boolean);
    return String(req).split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  };

  // Tjek demands/req (bld./add./rsd.) — ressourcekrav ignoreres i filtreringen
  const isReqSatisfied = (reqId) => {
    if (!reqId) return true;
    if (reqId.startsWith('bld.')) {
      const p = typeof H.parseBldKey === 'function' ? H.parseBldKey(reqId) : null;
      if (p?.series && Number.isFinite(p.level)) {
        return (ownedBldMax[p.series] || 0) >= Number(p.level);
      }
      const m = reqId.match(/^bld\.([^]+)\.l(\d+)$/);
      if (m) return (ownedBldMax[`bld.${m[1]}`] || 0) >= Number(m[2]);
      return false;
    }
    if (reqId.startsWith('add.')) {
      const m = reqId.match(/^add\.([^]+)\.l(\d+)$/);
      if (m) return (ownedAddMax[`add.${m[1]}`] || 0) >= Number(m[2]);
      return false;
    }
    if (reqId.startsWith('rsd.')) return !!hasResearch(reqId);
    return true;
  };

  const entries = useMemo(() => {
    const out = [];

    for (const [key, def] of Object.entries(recipeDefs)) {
      const mode = String(def?.mode || 'active').toLowerCase();
      if (mode === 'disabled') continue;

      const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
      if (stageReq > currentStage) continue;

      const famRaw = String(def?.family || '');
      if (!famRaw) continue;
      const recipeFamilies = famRaw.split(',').map((s) => s.trim()).filter(Boolean);

      // Familie-match: mindst én opskrift-family i ownedBuildingFamilies
      const hasOwnedFamily = recipeFamilies.some((f) => ownedBuildingFamilies.has(f));
      if (!hasOwnedFamily) continue;

      // Demands (bld./add./rsd.) skal være opfyldt
      const reqIds = normalizeReq(def.require || def.req || '');
      const reqOk = reqIds.every(isReqSatisfied);
      if (!reqOk) continue;

      const level = Number(key.match(/\.l(\d+)$/)?.[1] || def?.lvl || 1);

      out.push({
        def,
        fullId: `rcp.${key}`,
        level,
        stageReq,
        stageOk: true,
      });
    }

    out.sort((a, b) => {
      const fa = String(a.def.family || '');
      const fb = String(b.def.family || '');
      if (fa !== fb) return fa.localeCompare(fb);
      if (a.stageReq !== b.stageReq) return a.stageReq - b.stageReq;
      if (a.level !== b.level) return a.level - b.level;
      return String(a.def.name || '').localeCompare(String(b.def.name || ''));
    });

    return out;
  }, [recipeDefs, ownedBuildingFamilies, ownedBldMax, ownedAddMax, currentStage]);

  if (debug) {
    // Hjælp til at se hvad der sker
    console.log('[ActiveRecipes][debug]', {
      currentStage,
      ownedBuildingFamilies: Array.from(ownedBuildingFamilies),
      totalRecipes: Object.keys(recipeDefs).length,
      matched: entries.map((e) => e.fullId),
    });
  }

  if (isLoading) return <div className="sub">{tf('ui.text.loading.h1', 'Indlæser...')}</div>;
  if (error || !data) return <div className="sub">{tf('ui.text.error.h1', 'Fejl.')}</div>;

  if (!entries.length) {
    return (
      <section className="panel section">
        <div className="section-head">
          {tf('ui.emoji.recipe.h1', '📜')} {tf('ui.headers.recipe.h1', 'Jobs / Opskrifter')} – {tf('ui.text.available.h1', 'Tilgængelige')}
        </div>
        <div className="section-body">
          <div className="sub">{tf('ui.text.none.h1', 'Ingen')}</div>
        </div>
      </section>
    );
  }

  // baseOwned=true: vi har allerede verificeret family-ejerskab
  return (
    <section className="panel section">
      <div className="section-head">
        {tf('ui.emoji.recipe.h1', '📜')} {tf('ui.headers.recipe.h1', 'Jobs / Opskrifter')} – {tf('ui.text.available.h1', 'Tilgængelige')}
      </div>
      <div className="section-body">
        {entries.map((entry) => (
          <RecipeRow
            key={entry.fullId}
            entry={entry}
            defs={defs}
            state={state}
            baseOwned={true}
            requirementCaches={{}}
          />
        ))}
      </div>
    </section>
  );
}