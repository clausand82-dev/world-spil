/* =========================================================
   ui/buildingDetail.js
   - Detaljevisning for én bygning
   - Hero (256×256), stats, actions, tabs (addons/research/recipes/special)
   - Addons: kædet levels, stage-filter, krav som i byggelisten
   - VIGTIGT: Bygningens progressbar står under DURABILITY-feltet.
             Addon-progressbar står ved knappen i højre side.
========================================================= */

// Shared progress bar HTML helper (module-level)
function progressBar(forId, visible, width = '160px', height = 12) {
  return `
    <div class="build-progress" data-pb-for="${forId}" style="display:${visible ? 'block' : 'none'}; margin-top:8px; width:${width};">
      <div class="pb-track" style="position:relative; height:${height}px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
        <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
      </div>
      <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
    </div>`;
}

// Tiny utils to reduce repetition
function levelOf(key) {
  const m = String(key || '').match(/\.l(\d+)$/);
  return m ? +m[1] : 1;
}
function familyOf(idOrKey) {
  const s = String(idOrKey || '').replace(/^(?:bld|add|rsd|rcp)\./, '');
  return s.replace(/\.l\d+$/, '');
}
function cancelWithProgress(id, width = '160px', height = 12, label = 'Cancel') {
  return `<button class="btn" data-cancel-build="${id}">${label}</button>` +
         progressBar(id, true, width, height);
}
function progressPlaceholder(id, width = '160px', height = 12) {
  return progressBar(id, false, width, height);
}

window.renderBuildingDetail = (id) => {
  const D = window.data?.defs || {};
  const S = window.data?.state || {};
  const L = window.data?.lang || {};
  // Normalisér id (vi vil bruge fuldt id til billede: "bld.<family>.lN.big.png")
  const rawId = String(id ?? '');
  id = rawId.replace(/^bld\./, '');
  const d = D.bld?.[id];
  
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
  const resName = (rid) => { const k = String(rid||'').replace(/^res\./,''); return D.res?.[k]?.name || k; };
  const resEmoji = (rid) => { const k = String(rid||'').replace(/^res\./,''); return D.res?.[k]?.emoji || k; };
  //const prod = (d.yield || []).map(y => `+${y.amount} ${resEmoji(y.id)}`).join(" • ") + " / " + d.yield_period_str || "-" ;
  const prod = (d.yield || []).length
  ? (d.yield.map(y => `+${y.amount}${resEmoji(y.id)}`).join(" • ")
     + (d.yield_period_str ? ` / ${d.yield_period_str}` : ""))
  : "-";
  
  // Parse family/level using utils
  const family = familyOf(id);
  const series = "bld." + family;

  const ownedMax = window.helpers.computeOwnedMaxBySeries('bld')[series] || 0;
  const curStage = Number(S?.user?.currentstage ?? S?.user?.stage ?? 0);

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
  const curDur = (ownedMax > 0) ? (Number(S?.bld?.[currentFullId]?.durability) || 0) : 0;
  const durPct = maxDur > 0 ? Math.max(0, Math.min(100, Math.round((curDur / maxDur) * 100))) : 0;

  const jobActiveOnTarget = !!(targetFullId && window.ActiveBuilds && window.ActiveBuilds[targetFullId]);
  const jobActiveOnCurrent= !!(window.ActiveBuilds && window.ActiveBuilds[currentFullId]);
  const jobActive = jobActiveOnTarget || jobActiveOnCurrent;
  const jobIdForPB = jobActiveOnTarget ? targetFullId : currentFullId;
  const playerOwnsBaseBuilding = ownedMax > 0;

  // Stats
  const fpTxt = ((d?.stats?.footprint||0)>=0?"+":"")+(d?.stats?.footprint||0)+" Byggepoint";
  const acTxt = ((d?.stats?.animal_cap||0)>=0?"+":"")+(d?.stats?.animal_cap||0)+" Staldplads";

  // progressBar helper is now defined at module-level

  // Pris + krav (dele) fra renderReqLine – uden labels (vi har egne sektioner)
  let parts = { priceHTML: "", reqHTML: "", bothInline: "" };
  let targetPriceObj = {};
  let canBuyScanOk = false;

  if (targetDef) {
    const fake = { id: targetFullId, price: window.helpers.normalizePrice(targetDef.cost), req: (targetDef.require||""), isUpgrade: ownedMax>0 };
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
            const ownedAny = (window.helpers.computeOwnedMaxBySeries('bld')[series] || 0) > 0;

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
    if (window.BuildingDetailTabs?.addons) {
      window.BuildingDetailTabs.addons(tc, id, playerOwnsBaseBuilding);
      window.BuildingsProgress?.rehydrate?.(tc);
      return;
    }
    const familyOnly = String(id).replace(/\.l\d+$/,'');
    const groups = {};
    for (const [k, def] of Object.entries(addDefs)) {
      const fam = String(def?.family || "");
      const matchFamily = (fam === familyOnly) || fam.split(",").includes(familyOnly);
      if (!matchFamily) continue;
      const aStage = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
      if (aStage > currentStage) continue;
      const series = (typeof familyOf === 'function') ? familyOf(k) : String(k).replace(/\.l\d+$/, '');
      const lvl    = (typeof levelOf === 'function')  ? levelOf(k)    : (Number(k.match(/\.l(\d+)$/)?.[1] || 0));
      if (!series || !lvl) continue;
      (groups[series] ||= []).push({ key:k, def, level:lvl });
    }
    for (const s of Object.keys(groups)) groups[s].sort((a,b)=>a.level-b.level);

    const ownedLevel = (seriesName) => {
      let max=0;
      for (const key of Object.keys(window.data?.state?.add || {})) {
        if (!key.startsWith(`add.${seriesName}.l`)) continue;
        const lvl = (typeof levelOf === 'function') ? levelOf(key) : (Number(key.match(/\.l(\d+)$/)?.[1] || 0));
        if (lvl > max) max = lvl;
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
            price: window.helpers.normalizePrice(def.cost),
            req: def.require || def.req || "",
            isUpgrade: (display.level > 1)
          },
          { context: "addon", showLabels: true, split: false, compact: true, returnParts: true }
        )
        : { bothInline: "", allOk: true };

      let right = '';
      const activeAddon = !!(window.ActiveBuilds && window.ActiveBuilds[addId]);
      if (!playerOwnsBaseBuilding) {
          right = `<button class="btn" disabled>Kræver Bygning</button>`;
      } else if (activeAddon) {
        right = cancelWithProgress(addId, '160px', 12);
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

        right += progressPlaceholder(addId, '160px', 12);
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
    const familyOnly = familyOf(id);
    if (window.BuildingDetailTabs?.research) {
      window.BuildingDetailTabs.research(tc, familyOnly, id, playerOwnsBaseBuilding);
    } else {
      tc.innerHTML = renderResearchListForBuilding(familyOnly, id, playerOwnsBaseBuilding);
      window.BuildingsProgress?.rehydrate?.(tc);
    }
    return;
  }

  if (name === "recipes") {
    const familyOnly = familyOf(id);
    if (window.BuildingDetailTabs?.recipes) {
      window.BuildingDetailTabs.recipes(tc, familyOnly, playerOwnsBaseBuilding);
    } else {
      tc.innerHTML = renderRecipesListForBuilding(familyOnly, playerOwnsBaseBuilding);
      window.BuildingsProgress?.rehydrate?.(tc);
    }
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
