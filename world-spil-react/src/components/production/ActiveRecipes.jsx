import React, { useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import RecipeRow from '../building/rows/RecipeRow.jsx';
import { useT } from '../../services/i18n.js';
import * as H from '../../services/helpers.js';
import { collectActiveBuffs } from '../../services/requirements.js';
 
// --- Custom tab labels: map type token -> display label ---
// Tilføj eller ret efter behov, fx 'basic' -> 'Basal'
const TYPE_LABELS = {
  basic: 'Basal',
  food: 'Mad',
  tools: 'Værktøj',
  luxury: 'Luksus',
  animal: 'Dyr',
  butchery: 'Slagtning',
  fabrics: 'Stof',
  heat: 'Varme',
  biproduct: 'Biprodukt',
  // tilføj flere mappings her
};
 
export default function ActiveRecipes({ defs: defsProp, state: stateProp, stage: stageProp, debug = true }) {
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
   // Shared cache so requirementInfo can see active buffs
   const requirementCaches = React.useMemo(() => {
     return { activeBuffs: collectActiveBuffs(defs) || [] };
   }, [defs]);

  // (moved) availableTypes computed later after ownedBuildingFamilies / ownedBldMax / ownedAddMax are defined
  const [activeType, setActiveType] = useState('all');
 
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
      // Filter by active tab/type (support comma or whitespace separated type tokens)
      const typeStr = String(def?.type || '').toLowerCase();
      const typeWords = typeStr ? typeStr.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [];
      if (activeType !== 'all' && !typeWords.includes(activeType)) continue;
      const mode = String(def?.mode || 'active').toLowerCase();
      if (mode === 'disabled') continue;
 
      // Visibility rule: only stage requirement must be met to show recipe.
      const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
      const stageOk = stageReq <= currentStage;
      if (!stageOk) continue;
 
      // We still capture family/req info on the entry but do NOT block visibility
      const famRaw = String(def?.family || '');
      const recipeFamilies = famRaw ? famRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const reqIds = normalizeReq(def.require || def.req || '');
      const reqOk = reqIds.every(isReqSatisfied);
 
       const level = Number(key.match(/\.l(\d+)$/)?.[1] || def?.lvl || 1);
 
       out.push({
         def,
         fullId: `rcp.${key}`,
         level,
         stageReq,
         stageOk,
         reqOk,
         families: recipeFamilies,
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
   }, [recipeDefs, ownedBuildingFamilies, ownedBldMax, ownedAddMax, currentStage, activeType]);
 
   // Compute which type-tabs actually have visible recipes (respecting mode/stage/family filters)
   const availableTypes = useMemo(() => {
     const set = new Set();
     for (const [key, def] of Object.entries(recipeDefs)) {
       const mode = String(def?.mode || 'active').toLowerCase();
       if (mode === 'disabled') continue;
       const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
       // only stage requirement determines tab availability
       if (stageReq > currentStage) continue;
 
       const typeStr = String(def?.type || '').toLowerCase();
       if (!typeStr) {
         set.add('other');
         continue;
       }
       typeStr.split(/[,\s]+/).forEach((w) => { if (w && w.trim()) set.add(w.trim()); });
     }
     return ['all', ...Array.from(set).sort()];
   }, [recipeDefs, ownedBuildingFamilies, ownedBldMax, ownedAddMax, currentStage]);
 
   // Ensure activeType is valid when availableTypes change
   React.useEffect(() => {
     if (!availableTypes.includes(activeType)) {
       setActiveType('all');
     }
   }, [availableTypes, activeType]);

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

        {/* Tabs for types */}
      <div className="tabs-bar" role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {availableTypes.map((t) => (
           <button
             key={t}
             type="button"
             className={`tab ${activeType === t ? 'active' : ''}`}
             onClick={() => setActiveType(t)}
           >
             {t === 'all'
               ? tf('ui.text.all', 'All')
               : (TYPE_LABELS[t] ?? (t.charAt(0).toUpperCase() + t.slice(1)))
             }
           </button>
         ))}
       </div>
         {entries.map((entry) => (
           <RecipeRow
             key={entry.fullId}
             entry={entry}
             defs={defs}
             state={state}
             baseOwned={true}
             requirementCaches={requirementCaches}
           />
         ))}
       </div>
     </section>
   );
 }