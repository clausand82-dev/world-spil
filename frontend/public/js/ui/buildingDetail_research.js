/* buildingDetail_research.js
   Research tab rendering for Building Detail */
(function(){
  window.BuildingDetailTabs = window.BuildingDetailTabs || {};

  function researchRow(rsdKey, def, backId, curStage, ownedLvlForSeries, playerOwnsBaseBuilding) {
    const fullId = "rsd." + rsdKey;
    const myLvl  = (typeof levelOf === 'function') ? levelOf(rsdKey) : (Number(rsdKey.match(/\.l(\d+)$/)?.[1] || 1));

    const priceObj = window.helpers.normalizePrice(def.cost);
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
    const ownedThis  = window.helpers.hasResearch(fullId);
    const active     = !!(window.ActiveBuilds && window.ActiveBuilds[fullId]);

    const showStageLock = !stageOk && ownedLvlForSeries > 0;
    const stageBadge = showStageLock
      ? `<span class="badge stage-locked price-bad" title="Kræver Stage ${stageReq}">Stage locked</span>`
      : "";

    let right = '';
    if (!playerOwnsBaseBuilding) {
        right = `<button class="btn" disabled>Kræver Bygning</button>`;
    } else if (active) {
      right = (typeof cancelWithProgress === 'function')
        ? cancelWithProgress(fullId, '160px', 12)
        : `<button class="btn" data-cancel-build="${fullId}">Cancel</button>`;
      if (typeof cancelWithProgress !== 'function' && typeof progressBar === 'function') right += progressBar(fullId, true, '160px', 12);
    } else if (ownedThis) {
      right = `<span class="badge owned">Owned</span>`;
    } else if (showStageLock) {
      right = `<span class="badge stage-locked price-bad" title="Kræver Stage ${stageReq}">Stage locked</span>`;
    } else {
      const ok = !!afford.ok && !!parts.allOk && stageOk;
      const label = (myLvl === 1) ? "Research" : "Upgrade";
      right = !ok
        ? `<button class="btn" disabled>Need more</button>`
        : `<button class="btn primary" data-fakebuild-id="${fullId}" data-buildmode="timer" data-buildscope="research">${label}</button>`;
      if (typeof progressPlaceholder === 'function') right += progressPlaceholder(fullId, '160px', 12);
    }

    return `
      <div class="item" data-research-row="${fullId}">
        <div class="icon">🧪</div>
        <div class="grow">
          <div class="title">${def.name || rsdKey} ${stageBadge}</div>
          ${def.desc ? `<div class="sub">ℹ️ ${def.desc}</div>` : ""}
          ${parts.bothInline ? `<div class="sub">${parts.bothInline}</div>` : ""}
        </div>
        <div class="right">${right}</div>
      </div>
    `;
  }

  function renderResearchListForBuilding_mod(family, backId, playerOwnsBaseBuilding) {
    const defs = window?.data?.defs || {};
    const rsdDefs = defs?.rsd || {};
    const curStage = Number(window.data?.state?.user?.currentstage ?? window.data?.state?.user?.stage ?? 0);
    const bySeries = new Map();
    for (const [key, def] of Object.entries(rsdDefs)) {
      const fam = String(def?.family || "");
      if (!fam) continue;
      const belongs = (fam === family) || fam.split(",").includes(family);
      if (!belongs) continue;
      const famKey = (typeof familyOf === 'function') ? familyOf(key) : String(key).replace(/\.l\d+$/, '');
      const lvl = (typeof levelOf === 'function') ? levelOf(key) : Number(key.match(/\.l(\d+)$/)?.[1] || 1);
      if (!famKey || !lvl) continue;
      const serieKey = "rsd." + famKey;
      if (!bySeries.has(serieKey)) bySeries.set(serieKey, []);
      bySeries.get(serieKey).push({ key, def, lvl });
    }
    for (const arr of bySeries.values()) arr.sort((a,b)=>a.lvl-b.lvl);
    const rows = [];
    for (const [series, items] of bySeries.entries()) {
      const ownedMax = window.helpers.ownedResearchMax(series);
      const next = (ownedMax <= 0) ? items.find(x=>x.lvl===1) || items[0] : items.find(x=>x.lvl===ownedMax+1) || items[items.length-1];
      if (!next) continue;
      const stageReq = Number(next.def?.stage ?? next.def?.stage_required ?? 0);
      const stageOk  = !stageReq || stageReq <= curStage;
      if (!stageOk && ownedMax<=0) continue;
      rows.push(researchRow(next.key, next.def, backId, curStage, ownedMax, playerOwnsBaseBuilding));
    }
    return `<section class="panel section"><div class="section-head">🧪 Related Research</div><div class="section-body">${rows.join("") || "<div class='sub'>Ingen</div>"}</div></section>`;
  }

  window.BuildingDetailTabs.research = function(tc, familyOnly, backId, playerOwnsBaseBuilding){
    try {
      tc.innerHTML = renderResearchListForBuilding_mod(familyOnly, backId, playerOwnsBaseBuilding);
      window.BuildingsProgress?.rehydrate?.(tc);
    } catch (e) {
      console.error('Research tab render failed', e);
      tc.innerHTML = `<section class="panel section"><div class="section-body"><div class="sub">Research failed to render</div></div></section>`;
    }
  };

  // Move research start handler here
  if (!window.__ResearchStartWired__) {
    window.__ResearchStartWired__ = true;
    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest('[data-fakebuild-id][data-buildmode="timer"][data-buildscope="research"]');
      if (!btn) return;

      ev.preventDefault(); ev.stopPropagation();

      const rsdId = btn.getAttribute("data-fakebuild-id");
      const def = window.data?.defs?.rsd?.[rsdId.replace(/^rsd\./, "")];
      if (!def) { console.error("Research definition not found for:", rsdId); return; }
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
})();
