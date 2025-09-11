/* =========================================================
   ui/buildingDetail.js
   - Detaljevisning for én bygning
   - Hero (256×256), stats, actions, tabs (addons/research/recipes/special)
   - Addons: kædet levels, stage-filter, krav som i byggelisten
   - VIGTIGT: Bygningens progressbar står under DURABILITY-feltet.
             Addon-progressbar står ved knappen i højre side.
========================================================= */

window.renderBuildingDetail = (id) => {
  // Normalisér id (vi vil bruge fuldt id til billede: "bld.<family>.lN.big.png")
  const rawId = String(id ?? '');
  id = rawId.replace(/^bld\./, '');
  const d = window.data?.defs?.bld?.[id];
  
  // Husk valgt tab pr bygning
window.__ActiveBuildingTab = window.__ActiveBuildingTab || {};
if (!window.__ActiveBuildingTab[id]) {
  window.__ActiveBuildingTab[id] = "addons"; // fallback hvis intet valgt endnu
}
const activeTab = window.__ActiveBuildingTab[id];

  if (!d) { location.hash = "#/dashboard"; return; }

  const main = $("#main");

  const header = `
    <div class="section-head">
      <a href="#/buildings" class="back">&larr;</a>
      Building
    </div>`;

  // Production tekst
  const resName = (rid) => {
    const k = String(rid || '').replace(/^res\./,'');
    return window.data?.defs?.res?.[k]?.name || k;
  };
    const resEmoji = (rid) => {
    const k = String(rid || '').replace(/^res\./,'');
    return window.data?.defs?.res?.[k]?.emoji || k;
  };
  //const prod = (d.yield || []).map(y => `+${y.amount} ${resEmoji(y.id)}`).join(" • ") + " / " + d.yield_period_str || "-" ;
  const prod = (d.yield || []).length
  ? (d.yield.map(y => `+${y.amount}${resEmoji(y.id)}`).join(" • ")
     + (d.yield_period_str ? ` / ${d.yield_period_str}` : ""))
  : "-";
  
  // Parse family/level
  const mm = id.match(/^(.+)\.l(\d+)$/);
  const family = mm ? mm[1] : id.replace(/\.l\d+$/,'');
  const series = "bld."+family;

  function computeOwnedMax(series){
    const all = Object.keys(window.data?.state?.bld || {}).filter(k => k.startsWith(series + ".l"));
    return all.length ? Math.max(...all.map(k => Number(k.split(".l")[1]||0))) : 0;
  }
  function normalizePriceToObject(cost) {
    if (!cost) return {};
    const vals = Object.values(cost);
    if (vals.length && typeof vals[0] === "object" && vals[0] && ('id' in vals[0] || 'rid' in vals[0] || 'resource' in vals[0])) {
      return cost;
    }
    if (Array.isArray(cost)) {
      const out = {};
      cost.forEach((row, i) => {
        if (!row) return;
        const rid = row.id ?? row.rid ?? row.resource;
        const amt = row.amount ?? row.qty ?? row.value;
        if (!rid || !Number(amt)) return;
        out[`c${i}`] = { id: String(rid), amount: Number(amt) };
      });
      return out;
    }
    const out = {};
    for (const [rid, spec] of Object.entries(cost)) {
      if (spec && typeof spec === "object") {
        const id = spec.id ?? spec.rid ?? spec.resource ?? rid;
        const amt = Number(spec.amount ?? spec.qty ?? spec.value ?? 0);
        if (!amt) continue;
        out[rid] = { id: String(id), amount: amt };
      } else {
        const amt = Number(spec ?? 0);
        if (!amt) continue;
        out[rid] = { id: rid, amount: amt };
      }
    }
    return out;
  }

  const ownedMax = computeOwnedMax(series);
  const curStage = Number(window.data?.state?.user?.currentstage ?? window.data?.state?.user?.stage ?? 0);

  let targetKey = null, targetDef = null, targetLevel = 0;
  if (ownedMax <= 0) {
    targetKey  = `${family}.l1`;
    targetDef  = window.data?.defs?.bld?.[targetKey] || null;
    targetLevel = 1;
  } else {
    const nextKey = `${family}.l${ownedMax+1}`;
    targetKey  = nextKey;
    targetDef  = window.data?.defs?.bld?.[nextKey] || null;
    targetLevel = ownedMax + 1;
  }
  const stageReq = Number(targetDef?.stage ?? targetDef?.stage_required ?? 0);
  const stageOk  = !!targetDef && (!stageReq || stageReq <= curStage);

  const targetFullId  = targetDef ? `bld.${targetKey}` : null;
  const currentFullId = `bld.${id}`;

  // Durability/progress
  const maxDur = Number(d?.durability ?? 0);
  const curDur = (ownedMax > 0) ? (Number(window.data?.state?.bld?.[currentFullId]?.durability) || 0) : 0;
  const durPct = maxDur > 0 ? Math.max(0, Math.min(100, Math.round((curDur / maxDur) * 100))) : 0;

  const jobActiveOnTarget = !!(targetFullId && window.ActiveBuilds && window.ActiveBuilds[targetFullId]);
  const jobActiveOnCurrent= !!(window.ActiveBuilds && window.ActiveBuilds[currentFullId]);
  const jobActive = jobActiveOnTarget || jobActiveOnCurrent;
  const jobIdForPB = jobActiveOnTarget ? targetFullId : currentFullId;

  // Stats
  const fpTxt = ((d?.stats?.footprint||0)>=0?"+":"")+(d?.stats?.footprint||0)+" Byggepoint";
  const acTxt = ((d?.stats?.animal_cap||0)>=0?"+":"")+(d?.stats?.animal_cap||0)+" Staldplads";

  // Pris + krav (dele) fra renderReqLine – uden labels (vi har egne sektioner)
  let parts = { priceHTML: "", reqHTML: "", bothInline: "" };
  let targetPriceObj = {};
  let canBuyScanOk = false;

  if (targetDef) {
    const fake = { id: targetFullId, price: normalizePriceToObject(targetDef.cost), req: (targetDef.require||""), isUpgrade: ownedMax>0 };
    const p = (typeof renderReqLine === "function")
      ? renderReqLine(fake, { context:"detail", returnParts:true, split:true, showLabels:false })
      : null;
    parts = p || parts;
    targetPriceObj = fake.price || {};
    const canAff = (typeof canAfford === "function") ? canAfford(fake.price) : { ok:true };
    canBuyScanOk = !!canAff.ok && (p?.allOk ?? true);
  }

  // Render
  main.innerHTML = `
    <section class="panel section">
      ${header}
      <div class="section-body">
        <div class="detail-hero">
          <div class="photo" id="bldPhoto" style="background-image:url('assets/art/placeholder.big.png')"></div>
          <div>
            <div style="font-weight:800;font-size:18px;margin-bottom:6px;">
              ${d.icon||"🏗️"} ${d.name} <span class="sub" style="margin-left:8px;">Level ${d.lvl}</span>
            </div>
            <div class="sub" style="margin:0 0 10px">${d.desc||""}</div>

            <div class="statgrid">
              <!-- Række 1 -->
              <div class="statitem">
                <div class="label">${window.data.lang["ui.production.h1"]}</div>
                <div class="value">${prod}</div>
              </div>
              <div class="statitem">
                <div class="label">${ jobActive ? (ownedMax>0 ? "Upgrade" : "Build") : window.data.lang["ui.durability.h1"] }</div>
                <div class="value">
                  ${
                    jobActive
                      ? `
                        <div class="build-progress" data-pb-for="${jobIdForPB}" style="display:block; width:100%;">
                          <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                            <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                          </div>
                          <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
                        </div>`
                      : `
                        <div class="progress">
                          <span style="width:${durPct}%"></span>
                          <div class="pct">${durPct}%</div>
                        </div>`
                  }
                </div>
              </div>

              <!-- Række 2 -->
              <div class="statitem">
                <div class="label">${window.data.lang["ui.capacity.h1"]}</div>
                <div class="value">${fpTxt} • ${acTxt}</div>
              </div>
              <div class="statitem">
                <div class="label">${ownedMax>0?"Upgrade cost":"Build cost"}</div>
                <div class="value">${parts.priceHTML || "-"}</div>
              </div>

              <!-- Række 3 -->
              <div class="statitem"></div>
              <div class="statitem">
                <div class="label">Demands</div>
                <div class="value">${parts.reqHTML || "-"}</div>
              </div>

              <!-- Række 4 -->
<div class="statitem"></div>
<div class="statitem">
  <div class="label">${
    (ownedMax>0) ? "Time for upgrade" : "Time for build"
  }</div>
  <div class="value">${parts.timeOnly || "-"}</div>
</div>
            </div>
          </div>
        </div>

        <!-- Actions-bjælke -->
        <div class="actions-bar">
          ${(() => {
            const afford = (targetPriceObj && window.canAfford) ? window.canAfford(targetPriceObj).ok : false;
            const ownedAny = computeOwnedMax(series) > 0;

            const stageBadge = (!stageOk && targetDef)
              ? `<span class="badge stage-locked price-bad" title="Kræver Stage ${stageReq}">Stage locked</span>`
              : "";

            if (jobActive) {
              return `
                <button class="btn" data-cancel-build="${jobIdForPB}">Cancel</button>
                <button class="btn" id="btnRepair">Repair</button>
                <button class="btn" id="btnDemolish">Demolish</button>`;
            }

            if (!targetDef || !stageOk) {
              return `
                ${stageBadge}
                <button class="btn" disabled>${ownedAny ? "Upgrade" : "Build"}</button>
                <button class="btn" id="btnRepair">Repair</button>
                <button class="btn" id="btnDemolish">Demolish</button>`;
            }

            if (afford && canBuyScanOk) {
              return `
                <button class="btn primary" data-fakebuild-id="${targetFullId}" data-buildmode="timer">${ownedAny ? "Upgrade" : "Build"}</button>
                <button class="btn" id="btnRepair">Repair</button>
                <button class="btn" id="btnDemolish">Demolish</button>`;
            }

            return `
              <button class="btn" disabled>Need more</button>
              <button class="btn" id="btnRepair">Repair</button>
              <button class="btn" id="btnDemolish">Demolish</button>`;
          })()}
        </div>

        <!-- Tabs -->
        <div class="tabs" style="margin-top:12px;">
  <button class="tab ${activeTab==='addons' ? 'active' : ''}"  data-tab="addons">+ Addons</button>
  <button class="tab ${activeTab==='research' ? 'active' : ''}" data-tab="research">Research</button>
  <button class="tab ${activeTab==='recipes' ? 'active' : ''}"  data-tab="recipes">Recipes</button>
  <button class="tab ${activeTab==='special' ? 'active' : ''}"  data-tab="special">Special</button>
</div>
        <div id="tabContent"></div>
      </div>
    </section>
  `;

  // Hero image
  const ph = $("#bldPhoto");
  if (ph) {
    const fullIdForImage = rawId.startsWith("bld.") ? rawId : `bld.${id}`;
    const candidateBig = `assets/art/${fullIdForImage}.big.png`;
    const fallbackBig  = `assets/art/placeholder.big.png`;
    const bestBig      = window.resolveArtPath ? window.resolveArtPath(candidateBig, fallbackBig) : fallbackBig;
    ph.style.backgroundImage = `url('${bestBig}')`;
  }

  window.BuildingsProgress?.rehydrate?.(main);

  $("#btnRepair")?.addEventListener("click", () => {
    openConfirm({
      title: "Repair building?",
      body: `Price: ${renderCostColored(d.repairPrice, true)}`,
      confirmText: "Repair",
      onConfirm: () => { alert("Demo: repair ikke implementeret"); }
    });
  });
  $("#btnDemolish")?.addEventListener("click", () => {
    openConfirm({
      title: "Demolish building?",
      body: `Are you sure?`,
      confirmText: "Demolish",
      onConfirm: () => { alert("Demo: demolish ikke implementeret"); }
    });
  });

  function switchTab(name){
  const tc = $("#tabContent");
  const defs = window.data?.defs || {};
  const addDefs = defs?.add || {};
  const currentStage = curStage;

  if (name === "addons") {
    const familyOnly = String(id).replace(/\.l\d+$/,'');
    const groups = {};
    for (const [k, def] of Object.entries(addDefs)) {
      const fam = String(def?.family || "");
      const matchFamily = (fam === familyOnly) || fam.split(",").includes(familyOnly);
      if (!matchFamily) continue;
      const aStage = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
      if (aStage > currentStage) continue;
      const m = /^(.*)\.l(\d+)$/i.exec(k); if (!m) continue;
      const series = m[1], lvl = Number(m[2]);
      (groups[series] ||= []).push({ key:k, def, level:lvl });
    }
    for (const s of Object.keys(groups)) groups[s].sort((a,b)=>a.level-b.level);

    const ownedLevel = (seriesName) => {
      let max=0;
      for (const key of Object.keys(window.data?.state?.add || {})) {
        if (!key.startsWith(`add.${seriesName}.l`)) continue;
        const m = /\.l(\d+)$/i.exec(key); if (!m) continue;
        max = Math.max(max, Number(m[1]));
      }
      return max;
    };

    const rows = [];
    for (const [seriesName, items] of Object.entries(groups)) {
      const own = ownedLevel(seriesName);
      const next = items.find(x => x.level === own + 1) || null;
      const nextAll = addDefs[`${seriesName}.l${own+1}`];
      const nextStageReq = Number(nextAll?.stage ?? nextAll?.stage_required ?? 0) || 0;
      const nextStageOk  = !nextAll || nextStageReq <= currentStage;

      let display = null;
      if (own <= 0) display = items.find(x=>x.level===1) || items[0];
      else if (next && nextStageOk) display = next;
      else display = items[Math.min(Math.max(own-1,0), items.length-1)] || items[items.length-1];

      const rid = display.key;
      const def = display.def;
      const addId = `add.${rid}`;
      const owned = own >= display.level;

      const parts = (typeof renderReqLine === "function") ? 
        renderReqLine(
          {
            id: addId,
            price: normalizeCostObj(def.cost),
            req: def.require || def.req || "",
            isUpgrade: (display.level > 1)
          },
          { context: "addon", showLabels: true, split: false, compact: true, returnParts: true }
        )
        : { bothInline: "", allOk: true };

      let right = '';
      const activeAddon = !!(window.ActiveBuilds && window.ActiveBuilds[addId]);
      if (activeAddon) {
        right = `<button class="btn" data-cancel-build="${addId}">Cancel</button>
                 <div class="build-progress" data-pb-for="${addId}" style="display:block; margin-top:8px; width:160px;">
                   <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                     <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                   </div>
                   <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
                 </div>`;
      } else if (owned) {
        if (own > 0 && nextAll && !nextStageOk) {
          const tip = nextStageReq ? ` title="Kræver Stage ${nextStageReq}"` : "";
          right = `<span class="badge stage-locked price-bad"${tip}>Stage locked</span>`;
        } else {
          right = `<span class="badge owned">Owned</span>`;
        }
      } else {
        const can = (typeof canAfford === "function") ? (canAfford(def.cost) || { ok:false }) : { ok:true };
        const ok  = !!can.ok && !!parts.allOk;
        const needsMore = !ok;
        const label = (display.level === 1) ? "Build" : "Upgrade";

        right = needsMore
          ? `<button class="btn" disabled>Need more</button>`
          : `<button class="btn primary" data-fakebuild-id="${addId}" data-buildmode="timer" data-buildscope="addon">${label}</button>`;

        right += `<div class="build-progress" data-pb-for="${addId}" style="display:none; margin-top:8px; width:160px;">
                    <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                      <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                    </div>
                    <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
                  </div>`;
      }

      rows.push(
        `<div class="item" data-addon-row="${addId}">
          <div class="icon">${def.icon || "➕"}</div>
          <div>
            <div class="title">${def.name || seriesName}</div>
            ${def.desc ? `<div class="sub">🛈 ${def.desc}</div>` : ""}
            ${parts.bothInline ? `<div class="sub">${parts.bothInline}</div>` : ""}
          </div>
          <div class="right">${right}</div>
        </div>`
      );
    }

    tc.innerHTML = `<section class="panel section">
                      <div class="section-head">🔧 Building Addons</div>
                      <div class="section-body">${rows.join("") || "<div class='sub'>Ingen</div>"}</div>
                    </section>`;
    window.BuildingsProgress?.rehydrate?.(tc);
    return;
  }

  if (name === "research") {
    const familyOnly = String(id).replace(/\.l\d+$/,'');
    tc.innerHTML = renderResearchListForBuilding(familyOnly, id);
    window.BuildingsProgress?.rehydrate?.(tc);
    return;
  }

  if (name === "recipes") {
    const familyOnly = String(id).replace(/\.l\d+$/,'');
    tc.innerHTML = renderRecipesListForBuilding(familyOnly);
    window.BuildingsProgress?.rehydrate?.(tc);
    return;
  }

  tc.innerHTML = `<section class="panel section"><div class="section-head">⭐ Special</div><div class="section-body"><div class="sub">TODO</div></div></section>`;
}



  document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const name = btn.dataset.tab;
    window.__ActiveBuildingTab[id] = name; // <- husk valg pr. bygning
    switchTab(name);
  });
});
switchTab(activeTab); // <- behold valgt tab efter opdatering
};

if (!window.__AddonStartWired__) {
  window.__AddonStartWired__ = true;
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest('[data-fakebuild-id][data-buildmode="timer"][data-buildscope="addon"]');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const addId = btn.getAttribute("data-fakebuild-id");
    const def = window.data?.defs?.add?.[addId.replace(/^add\./,"")];
    const dur = Number(def?.duration_s ?? 10);
    btn.disabled = true;
    try {
      await window.BuildJobs.start(addId, dur);
    } catch (e) {
      console.error("Addon start failed", e);
      btn.disabled = false;
      return;
    }
    const wrap = document.querySelector(`.build-progress[data-pb-for="${addId}"]`);
    if (wrap) wrap.style.display = "";
    const cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.setAttribute("data-cancel-build", addId);
    btn.replaceWith(cancel);
  });
}

// =====================================================================
// START PÅ RETTELSE: Dedikeret event listener for research jobs
// =====================================================================
if (!window.__ResearchStartWired__) {
  window.__ResearchStartWired__ = true;
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest('[data-fakebuild-id][data-buildmode="timer"][data-buildscope="research"]');
    if (!btn) return;

    ev.preventDefault();
    ev.stopPropagation();

    const rsdId = btn.getAttribute("data-fakebuild-id"); // fx "rsd.construction.l1"
    const def = window.data?.defs?.rsd?.[rsdId.replace(/^rsd\./, "")];
    if (!def) {
      console.error("Research definition not found for:", rsdId);
      return;
    }
    const dur = Number(def?.duration_s ?? 10);

    btn.disabled = true;
    try {
      await window.BuildJobs.start(rsdId, dur);
    } catch (e) {
      console.error("Research start failed", e);
      btn.disabled = false;
      return;
    }

    const wrap = document.querySelector(`.build-progress[data-pb-for="${rsdId}"]`);
    if (wrap) wrap.style.display = "";
    const cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.setAttribute("data-cancel-build", rsdId);
    btn.replaceWith(cancel);
  });
}
// =====================================================================
// SLUT PÅ RETTELSE
// =====================================================================

// =====================================================================
// START: Dedikeret event listener for recipe jobs
// =====================================================================
if (!window.__RecipeStartWired__) {
  window.__RecipeStartWired__ = true;
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest('[data-fakebuild-id][data-buildmode="timer"][data-buildscope="recipe"]');
    if (!btn) return;

    ev.preventDefault();
    ev.stopPropagation();

    const rcpId = btn.getAttribute("data-fakebuild-id"); // fx "rcp.firewood.l1"
    const def = window.data?.defs?.rcp?.[rcpId.replace(/^rcp\./, "")];
    if (!def) {
      console.error("Recipe definition not found for:", rcpId);
      return;
    }

    // Varighed: vi følger samme praksis som research/addons (duration_s, fallback 10)
    const dur = Number(def?.duration_s ?? 10);

    btn.disabled = true;
    try {
      await window.BuildJobs.start(rcpId, dur);
    } catch (e) {
      console.error("Recipe start failed", e);
      btn.disabled = false;
      return;
    }

    // Vis progress og erstat knap med Cancel (samme UI-mønster)
    const wrap = document.querySelector(`.build-progress[data-pb-for="${rcpId}"]`);
    if (wrap) wrap.style.display = "";
    const cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.setAttribute("data-cancel-build", rcpId);
    btn.replaceWith(cancel);
  });
}
// =====================================================================
// SLUT: Dedikeret event listener for recipe jobs
// =====================================================================


function hasResearch(rsdIdFull) {
  const S = window.data?.state || window.state || {};
  if (S.rsd && (S.rsd[rsdIdFull] || S.rsd[rsdIdFull?.replace(/^rsd\./, "")])) return true;
  const R = S.research || {};
  if (R.completed?.has && R.completed.has(rsdIdFull)) return true;
  if (R.completed && R.completed[rsdIdFull]) return true;
  return false;
}

function ownedResearchMax(seriesFull) {
  const S = window.data?.state || window.state || {};
  let max = 0;
  if (S.rsd && typeof S.rsd === "object") {
    for (const k of Object.keys(S.rsd)) {
      if (!String(k).startsWith(seriesFull + ".l")) continue;
      const m = String(k).match(/\.l(\d+)$/);
      const lvl = m ? +m[1] : 0;
      if (lvl > max) max = lvl;
    }
  }
  const R = S.research || {};
  const iter = R.completed?.has ? Array.from(R.completed) : Object.keys(R.completed || {});
  for (const k of iter) {
    if (!String(k).startsWith(seriesFull + ".l")) continue;
    const m = String(k).match(/\.l(\d+)$/);
    const lvl = m ? +m[1] : 0;
    if (lvl > max) max = lvl;
  }
  return max;
}

function normalizeCostObj(cost) {
  if (!cost) return {};
  const vals = Object.values(cost);
  if (vals.length && typeof vals[0] === "object" && vals[0] && ('id' in vals[0] || 'rid' in vals[0] || 'resource' in vals[0])) {
    return cost;
  }
  if (Array.isArray(cost)) {
    const out = {};
    cost.forEach((row, i) => {
      if (!row) return;
      const id  = row.id ?? row.rid ?? row.resource;
      const amt = row.amount ?? row.qty ?? row.value;
      if (!id || !Number(amt)) return;
      out[`c${i}`] = { id: String(id), amount: Number(amt) };
    });
    return out;
  }
  const out = {};
  for (const [k, spec] of Object.entries(cost)) {
    if (spec && typeof spec === "object") {
      const amt = Number(spec.amount ?? spec.qty ?? spec.value ?? 0);
      if (!amt) continue;
      out[k] = { id: k, amount: amt };
    } else {
      const amt = Number(spec ?? 0);
      if (!amt) continue;
      out[k] = { id: k, amount: amt };
    }
  }
  return out;
}

function researchRow(rsdKey, def, backId, curStage, ownedLvlForSeries) {
  const fullId = "rsd." + rsdKey;
  const myLvl  = Number(rsdKey.match(/\.l(\d+)$/)?.[1] || 1);

  const priceObj = normalizeCostObj(def.cost);
  const parts = (typeof renderReqLine === "function")
    ? renderReqLine(
        { id: fullId, price: priceObj, req: def.require || def.req || "", isUpgrade: (myLvl > 1) },
        { context: "research", showLabels: true, split: false, compact: true, returnParts: true }
      )
    : { bothInline: "", allOk: true };

  const afford     = (typeof canAfford === "function") ? (canAfford(priceObj) || { ok:false }) : { ok:true };
  const stageReq   = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
  const curStageNum= Number(curStage || 0);
  const stageOk    = stageReq <= curStageNum;
  const ownedThis  = hasResearch(fullId);
  const active     = !!(window.ActiveBuilds && window.ActiveBuilds[fullId]);

  const showStageLock = !stageOk && ownedLvlForSeries > 0;
  const stageBadge = showStageLock
    ? `<span class="badge stage-locked price-bad" title="Kræver Stage ${stageReq}">Stage locked</span>`
    : "";

  let right = '';
  if (active) {
    right = `<button class="btn" data-cancel-build="${fullId}">Cancel</button>
             <div class="build-progress" data-pb-for="${fullId}" style="display:block; margin-top:8px; width:160px;">
               <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                 <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
               </div>
               <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
             </div>`;
  } else if (ownedThis) {
    right = `<span class="badge owned">Owned</span>`;
  } else if (showStageLock) {
    right = `<span class="badge stage-locked price-bad" title="Kræver Stage ${stageReq}">Stage locked</span>`;
  } else {
    const ok = !!afford.ok && !!parts.allOk && stageOk;
    const needsMore = !ok; // ← NYT: ensartet check
    const label = (myLvl === 1) ? "Research" : "Upgrade";

    right = needsMore
      ? `<button class="btn" disabled>Need more</button>`
      : `<button class="btn primary" data-fakebuild-id="${fullId}" data-buildmode="timer" data-buildscope="research">${label}</button>`;

    // Progress-bar placeholder (vises når jobbet starter)
    right += `<div class="build-progress" data-pb-for="${fullId}" style="display:none; margin-top:8px; width:160px;">
                <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                  <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                </div>
                <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
              </div>`;
  }

  return `
    <div class="item" data-research-row="${fullId}">
      <div class="icon">🔬</div>
      <div class="grow">
        <div class="title">${def.name || rsdKey} ${stageBadge}</div>
        ${def.desc ? `<div class="sub">🛈 ${def.desc}</div>` : ""}
        ${parts.bothInline ? `<div class="sub">${parts.bothInline}</div>` : ""}
      </div>
      <div class="right">${right}</div>
    </div>
  `;
}

function renderResearchListForBuilding(family, backId) {
  const defs = window?.data?.defs || {};
  const rsdDefs = defs?.rsd || {};
  const curStage = Number(window.data?.state?.user?.currentstage ?? window.data?.state?.user?.stage ?? 0);
  const bySeries = new Map();
  for (const [key, def] of Object.entries(rsdDefs)) {
    const fam = String(def?.family || "");
    if (!fam) continue;
    const belongs = (fam === family) || fam.split(",").includes(family);
    if (!belongs) continue;
    const m = key.match(/^(.+)\.l(\d+)$/);
    if (!m) continue;
    const serieKey = "rsd." + m[1];
    if (!bySeries.has(serieKey)) bySeries.set(serieKey, []);
    bySeries.get(serieKey).push({ key, def, lvl: Number(m[2]) });
  }
  for (const arr of bySeries.values()) arr.sort((a,b)=>a.lvl-b.lvl);
  const rows = [];
  for (const [series, items] of bySeries.entries()) {
    const ownedMax = ownedResearchMax(series);
    const next = (ownedMax <= 0) ? items.find(x=>x.lvl===1) || items[0] : items.find(x=>x.lvl===ownedMax+1) || items[items.length-1];
    if (!next) continue;
    const stageReq = Number(next.def?.stage ?? next.def?.stage_required ?? 0);
    const stageOk  = !stageReq || stageReq <= curStage;
    if (!stageOk && ownedMax<=0) {
      continue;
    }
    rows.push(researchRow(next.key, next.def, backId, curStage, ownedMax));
  }
  return `<section class="panel section"><div class="section-head">🔬 Related Research</div><div class="section-body">${rows.join("") || "<div class='sub'>Ingen</div>"}</div></section>`;
}

function recipeRow(rcpKey, def, curStage, familyForBuilding) {
  const fullId = "rcp." + rcpKey;
  const myLvl  = Number(rcpKey.match(/\.l(\d+)$/)?.[1] || 1);
  const mode   = String(def?.mode || "active"); // active | passive
  const fam    = String(def?.family || "");
  const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
  const stageOk  = stageReq <= Number(curStage || 0);
  const belongs  = (fam === familyForBuilding) || fam.split(",").includes(familyForBuilding);
  if (!belongs) return "";
  if (!stageOk)  return "";

  // Pris/krav (genbrug – nu med context:"recipe", så label hedder Production cost)
  const priceObj = normalizeCostObj(def.cost);
  const parts = (typeof renderReqLine === "function")
    ? renderReqLine(
        { id: fullId, price: priceObj, req: def.require || def.req || "", isUpgrade: (myLvl > 1) },
        { context: "recipe", showLabels: true, split: false, compact: true, returnParts: true }
      )
    : { bothInline: "", allOk: true };

  // Kan vi betale?
  const afford = (typeof canAfford === "function") ? (canAfford(priceObj) || { ok:false }) : { ok:true };

  // Aktivt job?
  const active = !!(window.ActiveBuilds && window.ActiveBuilds[fullId]);

  // Højre side (knapper)
  let right = '';
  if (active) {
    right = `<button class="btn" data-cancel-build="${fullId}">${mode === "passive" ? "Pause" : "Cancel"}</button>
             <div class="build-progress" data-pb-for="${fullId}" style="display:block; margin-top:8px; width:160px;">
               <div class="pb-track" style="position:relative; height:8px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                 <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
               </div>
               <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
             </div>`;
  } else {
    const ok  = !!afford.ok && !!parts.allOk && stageOk;
    const label = (mode === "passive") ? "Start" : "Build 1x";
    right = !ok
      ? `<button class="btn" disabled>Need more</button>`
      : `<button class="btn primary" data-fakebuild-id="${fullId}" data-buildmode="timer" data-buildscope="recipe">${label}</button>`;
    right += `<div class="build-progress" data-pb-for="${fullId}" style="display:none; margin-top:8px; width:160px;">
                <div class="pb-track" style="position:relative; height:8px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                  <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                </div>
                <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
              </div>`;
  }

  // --- VIS OPSKRIFT (emoji + tal) + TID på samme linje ------------------
  const resName = (rid) => {
    const key = String(rid || '').replace(/^res\./,'');
    return window.data?.defs?.res?.[key]?.name || key;
  };
  const resEmoji = (rid) => {
    const key = String(rid || '').replace(/^res\./,'');
    return window.data?.defs?.res?.[key]?.emoji || '';
  };

  // Inputs (cost)
  const inputs = [];
  for (const [rid, spec] of Object.entries(priceObj || {})) {
    const id = spec?.id || rid;
    const amt = +(spec?.amount ?? spec ?? 0);
    if (!id || !amt) continue;
    inputs.push(`${resEmoji(id)} ${amt} ${resName(id)}`);
  }

  // Outputs (yield)
  const outs = [];
  const yarr = Array.isArray(def?.yield) ? def.yield : [];
  for (const y of yarr) {
    const id = y?.id || y?.rid || y?.resource;
    const amt = +(y?.amount ?? y?.value ?? 0);
    if (!id || !amt) continue;
    outs.push(`${resEmoji(id)} ${amt} ${resName(id)}`);
  }

  // Tid (fra defs)
  const timeStr = def?.time_str || (def?.duration_s ? `${def.duration_s}s` : "");

  // Linje 1: Recipe: inputs → outputs / TIME
  const recipeIO = (inputs.length || outs.length)
    ? `<div class="sub">🧪 <strong>Recipe:</strong> ${inputs.join(" + ")} → ${outs.join(" + ")}${timeStr ? " / " + timeStr : ""}</div>`
    : "";

  // ---------------------------------------------------------------------

  return `
    <div class="item" data-recipe-row="${fullId}">
      <div class="icon">🍲</div>
      <div class="grow">
        <div class="title">${def.name || rcpKey}</div>
        ${def.desc ? `<div class="sub">🛈 ${def.desc}</div>` : ""}
        ${recipeIO}
        ${parts.bothInline ? `<div class="sub">${parts.bothInline}</div>` : ""}
      </div>
      <div class="right">${right}</div>
    </div>
  `;
}


function renderRecipesListForBuilding(family) {
  const defs = window?.data?.defs || {};
  const rcpDefs = defs?.rcp || {};
  const curStage = Number(window.data?.state?.user?.currentstage ?? window.data?.state?.user?.stage ?? 0);

  // Filtrer: kun recipes for denne building-family og stage ≤ current
  const items = [];
  for (const [key, def] of Object.entries(rcpDefs)) {
    const fam = String(def?.family || "");
    if (!fam) continue;
    const belongs = (fam === family) || fam.split(",").includes(family);
    if (!belongs) continue;

    const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
    if (stageReq > curStage) continue; // højere stages vises slet ikke

    // Sorteringsnøgler: stage → lvl → id
    const lvl = Number(key.match(/\.l(\d+)$/)?.[1] || def?.lvl || 0);
    items.push({ key, def, stage: stageReq, lvl });
  }

  // Sortér: stage, lvl, id
  items.sort((a,b) =>
    (a.stage - b.stage) ||
    (a.lvl - b.lvl) ||
    String(a.key).localeCompare(String(b.key))
  );

  const rows = items.map(x => recipeRow(x.key, x.def, curStage, family)).filter(Boolean);
  return `<section class="panel section"><div class="section-head">⚒ Jobs / Recipes</div><div class="section-body">${rows.join("") || "<div class='sub'>Ingen</div>"}</div></section>`;
}


