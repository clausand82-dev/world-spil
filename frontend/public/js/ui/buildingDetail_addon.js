/* buildingDetail_addon.js
   Addons tab rendering for Building Detail */
(function(){
  window.BuildingDetailTabs = window.BuildingDetailTabs || {};

  window.BuildingDetailTabs.addons = function(tc, id, playerOwnsBaseBuilding){
    const defs = window.data?.defs || {};
    const addDefs = defs?.add || {};
    const currentStage = Number(window.data?.state?.user?.currentstage ?? window.data?.state?.user?.stage ?? 0);

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
        right = (typeof cancelWithProgress === 'function')
          ? cancelWithProgress(addId, '160px', 12)
          : `<button class=\"btn\" data-cancel-build=\"${addId}\">Cancel</button>`;
        if (typeof cancelWithProgress !== 'function' && typeof progressBar === 'function') right += progressBar(addId, true, '160px', 12);
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
        const label = (display.level === 1) ? "Build" : "Upgrade";
        right = !ok
          ? `<button class="btn" disabled>Need more</button>`
          : `<button class="btn primary" data-fakebuild-id="${addId}" data-buildmode="timer" data-buildscope="addon">${label}</button>`;
        if (typeof progressPlaceholder === 'function') right += progressPlaceholder(addId, '160px', 12);
      }

      rows.push(
        `<div class="item" data-addon-row="${addId}">
          <div class="icon">${def.icon || "🔨"}</div>
          <div>
            <div class="title">${def.name || seriesName}</div>
            ${def.desc ? `<div class="sub">ℹ️ ${def.desc}</div>` : ""}
            ${parts.bothInline ? `<div class="sub">${parts.bothInline}</div>` : ""}
          </div>
          <div class="right">${right}</div>
        </div>`
      );
    }

    tc.innerHTML = `<section class="panel section">
                      <div class="section-head">🔨 Building Addons</div>
                      <div class="section-body">${rows.join("") || "<div class='sub'>Ingen</div>"}</div>
                    </section>`;
  };

  // Move addon start handler here
  if (!window.__AddonStartWired__) {
    window.__AddonStartWired__ = true;
    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest('[data-fakebuild-id][data-buildmode="timer"][data-buildscope="addon"]');
      if (!btn) return;
      ev.preventDefault(); ev.stopPropagation();
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
})();
