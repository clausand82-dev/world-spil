/* =========================================================
   ui/buildingDetail_addon.js
   - REFAKTORERET: Implementerer nu det sekundære tab-system,
     du har designet, for at gruppere hoved-addons og udstyr.
========================================================= */

// Gemmer den aktive fane for hver bygnings-familie
window.__activeAddonGroupFilter = window.__activeAddonGroupFilter || {};

(function(){
  window.BuildingDetailTabs = window.BuildingDetailTabs || {};

  // Gemmer den aktive fane for hver bygnings-familie
  window.__activeAddonGroupFilter = window.__activeAddonGroupFilter || {};

  window.BuildingDetailTabs.addons = function(tc, id, playerOwnsBaseBuilding){
    const defs = window.data?.defs || {};
    const addDefs = defs?.add || {};
    const currentStage = Number(window.data?.state?.user?.currentstage ?? 0);
    const familyOnly = String(id).replace(/\.l\d+$/, '');

    if (!window.__activeAddonGroupFilter[familyOnly]) {
        window.__activeAddonGroupFilter[familyOnly] = "main";
    }
    const activeGroup = window.__activeAddonGroupFilter[familyOnly];

    // 1. Gruppér alle relevante addons efter serie (din eksisterende logik)
    const groups = {};
    for (const [k, def] of Object.entries(addDefs)) {
      const fam = String(def?.family || "");
      if (!fam.split(",").includes(familyOnly)) continue;
      const series = String(k).replace(/\.l\d+$/, '');
      const lvl = levelOf(k);
      (groups[series] ||= []).push({ key: k, def, level: lvl });
    }
    for (const s of Object.keys(groups)) groups[s].sort((a,b)=>a.level-b.level);

    // 2. Identificer ejede hoved-addons for at bygge tabs
    const ownedMainAddonGroups = new Set();
    const ownedMaxBySeries = window.helpers.computeOwnedMaxBySeries('add');
    for (const [seriesName, items] of Object.entries(groups)) {
        const def = items[0].def;
        if (!def.group || def.group === 'main') {
            if ((ownedMaxBySeries[`add.${seriesName}`] || 0) > 0) {
                ownedMainAddonGroups.add(seriesName.split('_')[0]);
            }
        }
    }

    // 3. Byg HTML for de sekundære tabs
    const filterTabs = ['main', ...Array.from(ownedMainAddonGroups).sort()];
    const filterTabsHTML = filterTabs.map(groupKey => {
        let label = window.data.lang["ui.text_main.h1"];
        if (groupKey !== 'main') {
            const mainAddonDef = addDefs[`${groupKey}.l1`];
            label = mainAddonDef?.name || groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
        }
        return `<button class="tab secondary-tab ${activeGroup === groupKey ? 'active' : ''}" data-group="${groupKey}">${label}</button>`;
    }).join('');
    
    // =====================================================================
    // RETTELSE: Vi genindsætter din FULDE, ORIGINALE `for...of`-løkke her.
    // Det eneste nye er `if`-betingelsen, der filtrerer.
    // =====================================================================
    const rows = [];
    for (const [seriesName, items] of Object.entries(groups)) {
        const defForGroup = items[0].def;
        const itemGroup = defForGroup.group || 'main';

        // Anvend filteret: Spring over, hvis denne gruppe ikke matcher den aktive fane
        if (itemGroup.split('_')[0] !== activeGroup) continue;
        
        // --- DIN ORIGINALE, FULDT FUNGERENDE LOGIK STARTER HER ---
        const own = ownedMaxBySeries[`add.${seriesName}`] || 0;
        const next = items.find(x => x.level === own + 1) || null;
        const _nextForSeries = addDefs[`${seriesName}.l${own+1}`];
        const nextStageReq = Number(_nextForSeries?.stage ?? _nextForSeries?.stage_required ?? 0) || 0;
        const nextStageOk  = !_nextForSeries || nextStageReq <= currentStage;

        let display = null;
        if (own <= 0) {
            display = items.find(x => x.level === 1) || items[0];
        } else if (next && nextStageOk) {
            display = next;
        } else {
            // Fald tilbage til seneste tilgængelige/ejet niveau
            const idx = Math.min(Math.max(own - 1, 0), items.length - 1);
            display = items[idx] || items[items.length - 1];
        }
        if (!display) continue;

        if ((display.def.stage || 0) > currentStage && display.level === 1) continue;

        const def = display.def;
        const addId = `add.${display.key}`;
        const owned = own >= display.level;
        let right = '';
        const activeAddon = !!window.ActiveBuilds?.[addId];
        if (!playerOwnsBaseBuilding) {
            right = `<button class="btn" disabled>Kræver Bygning</button>`;
        } else if (activeAddon) {
            right = cancelWithProgress(addId);
        } else if (owned) {
            const nextAll = addDefs[`${seriesName}.l${own+1}`];
            if (nextAll && (nextAll.stage || 0) > currentStage) {
                right = `<span class="badge stage-locked price-bad" title="Kræver Stage ${nextAll.stage}">Stage locked</span>`;
            } else {
                right = `<span class="badge owned">Owned</span>`;
            }
        } else {
            const parts = renderReqLine({id:addId, price:def.cost, req:def.require, isUpgrade:display.level>1, footprintDelta: def.stats?.footprint}, {returnParts:true});
            const can = (typeof canAfford === 'function') ? (canAfford(def.cost) || { ok:false }) : { ok:true };
            const ok  = !!can.ok && !!parts.allOk;
            if (ok) {
                const label = display.level === 1 ? "Build" : "Upgrade";
                right = `<button class="btn primary" data-fakebuild-id="${addId}" data-buildmode="timer" data-buildscope="addon">${label}</button>`;
            } else {
                right = `<button class="btn" disabled>Need more</button>`;
            }
            right += progressPlaceholder(addId);
        }

        const parts = renderReqLine({id:addId, price:def.cost, req:def.require, isUpgrade:display.level>1, footprintDelta: def.stats?.footprint});
        
        rows.push(
            `<div class="item" data-addon-row="${addId}">
              <div class="icon">${def.icon || "🔨"}</div>
              <div>
                <div class="title">${def.name || seriesName}</div>
                ${def.desc ? `<div class="sub">ℹ️ ${def.desc}</div>` : ""}
                <div class="sub">${parts}</div>
              </div>
              <div class="right">${right}</div>
            </div>`
        );
        // --- DIN ORIGINALE LOGIK SLUTTER HER ---
    }

    // Sammensæt den endelige HTML
    tc.innerHTML = `
        <section class="panel section">
            <div class="section-head">
                🔨 Building Addons
                <div class="tabs secondary-tabs">${filterTabsHTML}</div>
            </div>
            <div class="section-body">${rows.join("") || "<div class='sub'>Ingen tilgængelige addons for denne gruppe.</div>"}</div>
        </section>`;
  };


  // Event listener for de sekundære tabs
  if (!window.__AddonTabWired__) {
    window.__AddonTabWired__ = true;
    document.addEventListener('click', (e) => {
        if (e.target.matches('.secondary-tab[data-group]')) {
            const hash = window.location.hash;
            if (!hash.startsWith('#/building/')) return;
            const family = familyOf(hash.split('/')[2]);
            if (family) {
                window.__activeAddonGroupFilter[family] = e.target.dataset.group;
                const tc = document.getElementById('tabContent');
                if (tc) {
                    const curStage = Number(window.data?.state?.user?.currentstage ?? 0);
                    const ownedMax = window.helpers.computeOwnedMaxBySeries('bld')[`bld.${family}`] || 0;
                    const playerOwnsBaseBuilding = ownedMax > 0;
                    window.BuildingDetailTabs.addons(tc, family, playerOwnsBaseBuilding);
                }
            }
        }
    });
  }

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
