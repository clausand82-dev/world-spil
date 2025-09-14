/* buildingDetail_recipe.js
   Recipe tab rendering for Building Detail */
(function(){
  window.BuildingDetailTabs = window.BuildingDetailTabs || {};

  function recipeRow(rcpKey, def, curStage, familyForBuilding, playerOwnsBaseBuilding) {
    const fullId = "rcp." + rcpKey;
    const myLvl  = (typeof levelOf === 'function') ? levelOf(rcpKey) : (Number(rcpKey.match(/\.l(\d+)$/)?.[1] || 1));
    const mode   = String(def?.mode || "active");
    const fam    = String(def?.family || "");
    const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
    const stageOk  = stageReq <= Number(curStage || 0);
    const belongs  = (fam === familyForBuilding) || fam.split(",").includes(familyForBuilding);
    if (!belongs || !stageOk) return "";

    const priceObj = window.helpers.normalizePrice(def.cost);
    const parts = (typeof renderReqLine === "function")
      ? renderReqLine(
          { id: fullId, price: priceObj, req: def.require || def.req || "", isUpgrade: (myLvl > 1) , duration_s: def.duration_s},
          { context: "recipe", showLabels: true, split: false, compact: true, returnParts: true }
        )
      : { bothInline: "", allOk: true };

    const afford = (typeof canAfford === "function") ? (canAfford(priceObj) || { ok:false }) : { ok:true };
    const active = !!(window.ActiveBuilds && window.ActiveBuilds[fullId]);

    let right = '';
    if (!playerOwnsBaseBuilding) {
        right = `<button class=\"btn\" disabled>Kræver Bygning</button>`;
    } else if (active) {
      right = (typeof cancelWithProgress === 'function')
        ? cancelWithProgress(fullId, '160px', 8, (mode === 'passive' ? 'Pause' : 'Cancel'))
        : `<button class=\"btn\" data-cancel-build=\"${fullId}\">${mode === "passive" ? "Pause" : "Cancel"}</button>`;
      if (typeof cancelWithProgress !== 'function' && typeof progressBar === 'function') right += progressBar(fullId, true, '160px', 8);
    } else {
      const ok  = !!afford.ok && !!parts.allOk && stageOk;
      const label = (mode === "passive") ? "Start" : "Build 1x";
      right = !ok
        ? `<button class=\"btn\" disabled>Need more</button>`
        : `<button class=\"btn primary\" data-fakebuild-id=\"${fullId}\" data-buildmode=\"timer\" data-buildscope=\"recipe\">${label}</button>`;
      if (typeof progressPlaceholder === 'function') right += progressPlaceholder(fullId, '160px', 8);
    }

    const inputs = renderCostColored(def.cost, true);
    const outputs = renderCostColored(def.yield, true);
    outputsColorized = outputs.replace(/price-bad/g, "price-ok"); // For at farven ikke er RØD
    
    const timeStr = def?.time_str || (def?.duration_s ? `${def.duration_s}s` : "");
    // OVERRIDE: render output as produced amounts only (no "have/need")
    try {
      outputsColorized = (function(yld){
        const map = window.helpers.normalizePrice(yld);
        const parts = [];
        for (const item of Object.values(map)) {
          const id = String(item.id || "");
          const amount = Number(item.amount || 0);
          let emoji = '';
          if (id.startsWith('res.')) {
            const key = id.replace(/^res\./,'');
            emoji = window.data?.defs?.res?.[key]?.emoji || '';
          } else if (id.startsWith('ani.')) {
            const key = id.replace(/^ani\./,'');
            emoji = window.data?.defs?.ani?.[key]?.emoji || '';
          }
          parts.push(`+${amount}${emoji}`);
        }
        return parts.join(' • ');
      })(def.yield);
    } catch {}
    const recipeIO = `<div class=\"sub\">🧪 <strong>Recipe:</strong> ${inputs} → ${outputsColorized}${timeStr ? " / " + timeStr : ""}</div>`;

    return `
      <div class="item" data-recipe-row="${fullId}\">
        <div class="icon">🍳</div>
          <div class="grow">
          <div class="title">${def.name || rcpKey}</div>${def.desc ?
              `<div class="sub">ℹ️ ${def.desc}</div>`
               : ""} ${recipeIO} ${parts.bothInline ? 
                `<div class="sub" style="margin-top: 4px;">${parts.bothInline}</div>` : ""}
            </div>
            <div class="right">${right}</div>
       </div>`;
  }

  function renderRecipesListForBuilding_mod(family, playerOwnsBaseBuilding) {
    const defs = window?.data?.defs || {};
    const rcpDefs = defs?.rcp || {};
    const curStage = Number(window.data?.state?.user?.currentstage ?? window.data?.state?.user?.stage ?? 0);

    const items = [];
    for (const [key, def] of Object.entries(rcpDefs)) {
      const fam = String(def?.family || "");
      if (!fam) continue;
      const belongs = (fam === family) || fam.split(",").includes(family);
      if (!belongs) continue;
      const stageReq = Number(def?.stage ?? def?.stage_required ?? 0) || 0;
      if (stageReq > curStage) continue;
      const lvl = (typeof levelOf === 'function') ? levelOf(key) : Number(key.match(/\.l(\d+)$/)?.[1] || def?.lvl || 0);
      items.push({ key, def, stage: stageReq, lvl });
    }

    items.sort((a,b) => (a.stage - b.stage) || (a.lvl - b.lvl) || String(a.key).localeCompare(String(b.key)));
    const rows = items.map(x => recipeRow(x.key, x.def, curStage, family, playerOwnsBaseBuilding)).filter(Boolean);
    return `<section class=\"panel section\"><div class=\"section-head\">🍳 Jobs / Recipes</div><div class=\"section-body\">${rows.join("") || "<div class='sub'>Ingen</div>"}</div></section>`;
  }

  window.BuildingDetailTabs.recipes = function(tc, familyOnly, playerOwnsBaseBuilding){
    try {
      tc.innerHTML = renderRecipesListForBuilding_mod(familyOnly, playerOwnsBaseBuilding);
      window.BuildingsProgress?.rehydrate?.(tc);
    } catch (e) {
      console.error('Recipes tab render failed', e);
      tc.innerHTML = `<section class=\"panel section\"><div class=\"section-body\"><div class=\"sub\">Recipes failed to render</div></div></section>`;
    }
  };
  
  // Move recipe start handler here
  if (!window.__RecipeStartWired__) {
    window.__RecipeStartWired__ = true;
    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest('[data-fakebuild-id][data-buildmode="timer"][data-buildscope="recipe"]');
      if (!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const rcpId = btn.getAttribute("data-fakebuild-id");
      const def = window.data?.defs?.rcp?.[rcpId.replace(/^rcp\./, "")];
      if (!def) { console.error("Recipe definition not found for:", rcpId); return; }
      const dur = Number(def?.duration_s ?? 10);
      btn.disabled = true;
      try {
        await window.BuildJobs.start(rcpId, dur);
      } catch (e) {
        console.error("Recipe start failed", e);
        btn.disabled = false;
        return;
      }
      const wrap = document.querySelector(`.build-progress[data-pb-for="${rcpId}"]`);
      if (wrap) wrap.style.display = "";
      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.setAttribute("data-cancel-build", rcpId);
      btn.replaceWith(cancel);
    });
  }
})();
