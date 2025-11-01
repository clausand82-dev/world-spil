import React, { useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import RecipeRow from '../building/rows/RecipeRow.jsx';
import { useT } from '../../services/i18n.js';
import * as H from '../../services/helpers.js';
import { collectActiveBuffs } from '../../services/requirements.js';
import Icon from '../ui/Icon.jsx';
import { icon } from '../common/Icon.jsx';
 
// --- Custom tab labels: map type token -> display label ---
// Kan være enten: 'basic': 'Basal'  eller  'basic': { label: 'Basal', icon: '/assets/icons/type_basic.png' }
const TYPE_LABELS = {
  basic: { label: 'Basal', icon: '/assets/icons/stats_product.png' },
  food: { label: 'Mad', icon: '/assets/icons/stats_food.png' },
  tools: { label: 'Værktøj', icon: '/assets/icons/irontools.png' },
  luxury: 'Luksus',
  animal: { label: 'Dyr', icon: '/assets/icons/animalhusbandry.png' },
  butchery: { label: 'Slagtning', icon: '/assets/icons/rawhide.png' },
  fabrics: { label: 'Stof', icon: '/assets/icons/cloth.png' },
  heat: { label: 'Varme', icon: '/assets/icons/stats_heat.png' },
  biproduct: { label: 'Biprodukt', icon: '/assets/icons/sand.png' },
  wood: { label: 'Træ', icon: '/assets/icons/wood.png' },
  health: { label: 'Sundhed', icon: '/assets/icons/stats_health.png' },
  mining: { label: 'Mine', icon: '/assets/icons/coal.png' }, // canonical key
  
  // tilføj flere mappings her
};

// alias map: peg alternative tokens til canonical nøgle
const TYPE_ALIASES = {
  mine: 'mining',
  mines: 'mining',
  mining: 'mining',
  smelt: 'mining',
  // tilføj andre aliaser her
};

function renderTypeLabel(token) {
  const canon = TYPE_ALIASES[token] || token;
  const entry = TYPE_LABELS[canon] || TYPE_LABELS[token];
  const label = typeof entry === 'string' ? entry : (entry?.label || (canon.charAt(0).toUpperCase() + canon.slice(1)));
  const iconMeta = typeof entry === 'object' ? entry?.icon : null;
  if (!iconMeta) return label;

  // iconMeta kan være en streng (src) eller et objekt { src, size, alt }
  const src = typeof iconMeta === 'string' ? iconMeta : iconMeta.src;
  const size = typeof iconMeta === 'object' && iconMeta.size ? iconMeta.size : 16;
  const alt = typeof iconMeta === 'object' && iconMeta.alt ? iconMeta.alt : label;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Icon src={src} size={size} alt={alt} />
      <span>{label}</span>
    </span>
  );
}
 
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
  return { activeBuffs: collectActiveBuffs(defs, state, data) || [] };
}, [defs, state, JSON.stringify(data?.activeBuffs || [])]);

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
      const typeWords = typeStr
        ? typeStr.split(/[,\s]+/).map(s => {
            const tok = String(s || '').trim().toLowerCase();
            return TYPE_ALIASES[tok] || tok;
          }).filter(Boolean)
        : [];
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
       if (stageReq > currentStage) continue;

       const typeStr = String(def?.type || '').toLowerCase();
       if (!typeStr) {
         set.add('other');
         continue;
       }
       typeStr.split(/[,\s]+/).forEach((w) => {
         const tok = w.trim();
         if (!tok) return;
         const canon = TYPE_ALIASES[tok] || tok;
         set.add(canon);
       });
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
           <Icon src="/assets/icons/menu_production.png" size={18} alt="happiness" /> {tf('ui.headers.recipe.h1', 'Jobs / Opskrifter')} – {tf('ui.text.available.h1', 'Tilgængelige')}
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
         <Icon src="/assets/icons/menu_production.png" size={18} alt="happiness" /> {tf('ui.headers.recipe.h1', 'Jobs / Opskrifter')} – {tf('ui.text.available.h1', 'Tilgængelige')}
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
               : renderTypeLabel(t)
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