/* =========================================================
   ui/buildings.js
   - Buildings-liste (separat fra detail)
   - Viser kun bygninger i spillerens currentstage
   - Arbejder pr. serie/base (bld.XYZ) med levels (l1, l2, ...)
   - Knappen viser Build/Upgrade/Owned alt efter state.bld og defs
========================================================= */

/* ---------------------------
   Små helpers (ingen DOM her)
---------------------------- */

/** Parse et building-id til { series, family, level }
 *  - State-id:  "bld.barn.l1"         -> series="bld.barn",   family="barn",       level=1
 *  - Defs-key:  "barn.l2"             -> series="bld.barn",   family="barn",       level=2
 *  - Defs-key:  "mark.wheat.l3"       -> series="bld.mark.wheat", family="mark.wheat", level=3
 */
function parseBldKey(key, fromState=false) {
  // fromState = true betyder vi forventer 'bld.' prefix
  const reState = /^bld\.(.+)\.l(\d+)$/i; // matcher hele family før .lN
  const reDefs  = /^(.+)\.l(\d+)$/i;      // uden 'bld.' prefix
  const m = (fromState ? reState : reDefs).exec(String(key || ""));
  if (!m) return null;
  const family = m[1];                       // fx "barn" eller "mark.wheat"
  const level  = Number(m[2]);
  const series = fromState ? `bld.${family}` : `bld.${family}`;
  return { series, family, level };
}

/** Returnér spillerens højeste ejede level pr. serie, ud fra window.data.state.bld
 *  - state.bld kan være map med nøgler "bld.xxx.lN" -> data/obj (vi kigger kun på nøglen)
 */
function computeOwnedMaxBySeries() {
  const S = window.data?.state || window.state || {};
  const bySeries = Object.create(null);
  const bldMap = S.bld || {};
  for (const key of Object.keys(bldMap)) {
    const p = parseBldKey(key, /*fromState*/ true);
    if (!p) continue;
    bySeries[p.series] = Math.max(bySeries[p.series] || 0, p.level || 0);
  }
  return bySeries; // fx { "bld.barn": 1, "bld.mark.wheat": 2 }
}

/** Byg et overblik over defs i currentstage, grupperet pr. serie
 *  - WD.bld er typisk { "barn.l1": {stage:1,...}, "barn.l2": {...}, ... }
 *  - Vi filtrerer på def.stage === currentStage, og grupperer pr. series
 *  - Returnerer: map series -> array af { key:"barn.l1", def, level }
 */
function groupDefsBySeriesInStage(WD, currentStage) {
  const out = Object.create(null);
  for (const [defsKey, def] of Object.entries(WD?.bld || {})) {
    const stage = Number(def?.stage ?? def?.stage_required ?? 0);
    if (stage > Number(currentStage)) continue; // spring over kun hvis stage er højere end current
    const p = parseBldKey(defsKey, /*fromState*/ false);
    if (!p) continue;
    const arr = (out[p.series] ||= []);
    arr.push({ key: defsKey, def, level: p.level });
  }
  // Sortér levels inde i hver serie, så l1, l2, ... er i stigende orden
  for (const s of Object.keys(out)) {
    out[s].sort((a,b) => a.level - b.level);
  }
  return out;
}

/** Vælg target for en serie, givet spillerens højeste ejede level i serien
 *  - Hvis intet ejet: target = l1 i currentstage (hvis findes)
 *  - Hvis ejet lK:   target = l(K+1) i currentstage (hvis findes)
 *  - Ellers: ingen target (null) => Owned i denne stage
 */
function pickTargetForSeries(seriesItems, ownedMaxLevel) {
  if (!Array.isArray(seriesItems) || seriesItems.length === 0) return null;
  // Find l1 hvis intet ejet
  if (!ownedMaxLevel || ownedMaxLevel <= 0) {
    const first = seriesItems.find(x => x.level === 1);
    return first || null;
  }
  // Find l(K+1) som næste
  const next = seriesItems.find(x => x.level === (ownedMaxLevel + 1));
  return next || null;
}

/** Normalisér en def-cost til det objekt-format din renderCostColored forventer
 *  - renderCostColored itererer Object.entries(map) og slår op på value.id og value.amount
 *  - Denne helper accepterer både array [{id,amount}, ...] og plain objekt
 *    og returnerer fx: { c0:{id:'res.wood', amount:5}, c1:{id:'res.money', amount:100} }
 */
function normalizePriceToObject(cost) {
  if (!cost) return {};
  // Allerede i forventet objekt-format? (tjek én vilkårlig value)
  const vals = Object.values(cost);
  if (vals.length && typeof vals[0] === "object" && vals[0] && ('id' in vals[0] || 'rid' in vals[0] || 'resource' in vals[0])) {
    return cost; // ligner allerede {*, {id, amount}}
  }
  // Array-format [{id,amount}] → lav til objekt
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
  // Key-value map { "res.wood": 5, "res.money": 100 } → objekt med id/amount
  const out = {};
  for (const [rid, spec] of Object.entries(cost)) {
    if (spec && typeof spec === "object") {
      const amt = Number(spec.amount ?? spec.qty ?? spec.value ?? 0);
      if (!amt) continue;
      out[rid] = { id: rid, amount: amt };
    } else {
      const amt = Number(spec ?? 0);
      if (!amt) continue;
      out[rid] = { id: rid, amount: amt };
    }
  }
  return out;
}

/** Ejer spiller denne KONKRETE building-id? (én sandhed: state.bld) */
function isOwnedBuilding(id) {
  const S = window.data?.state || window.state || {};
  return !!S?.bld?.[id];
}


window.renderBuildingsPage = () => {
  const main = $("#main");

  const WS = window.data?.state;
  const WD = window.data?.defs;
  if (!WS || !WD?.bld) {
    console.warn("Data/defs ikke klar endnu");
    return;
  }

  const currentStage = Number(WS.user?.currentstage || WS.user?.stage || 0);

  const ownedMaxBySeries = computeOwnedMaxBySeries();
  const groups = groupDefsBySeriesInStage(WD, currentStage);

  const bldList = [];

  for (const [series, items] of Object.entries(groups)) {
    const ownedMax = ownedMaxBySeries[series] || 0;
    const target   = pickTargetForSeries(items, ownedMax);
    const family   = series.replace(/^bld\./, "");

    const ownedDef = ownedMax > 0
      ? (WD.bld[`${family}.l${ownedMax}`] || items.find(x => x.level === ownedMax)?.def)
      : null;
    const l1Def    = WD.bld[`${family}.l1`];

    const displayName   = (ownedDef?.name) || (l1Def?.name) || (target?.def?.name) || family;
    const displayDesc   = (ownedDef?.desc) || (l1Def?.desc) || "";
    const displayLinkId = ownedMax > 0 ? `bld.${family}.l${ownedMax}` : `bld.${family}.l1`;

    const nextDefKey    = `${family}.l${(ownedMax || 0) + 1}`;
    const nextDefAll    = WD.bld[nextDefKey];
    const nextReqStage  = Number(nextDefAll?.stage ?? nextDefAll?.stage_required ?? 0);

    let displayLevelText = "";
    let stageLocked = false;
    if (ownedMax <= 0) {
      displayLevelText = `Ikke bygget`;
    } else if (!nextDefAll) {
      displayLevelText = `Level ${ownedMax} (maks)`;
    } else {
      if (!nextReqStage || nextReqStage <= currentStage) {
        displayLevelText = `Level ${ownedMax} → Level ${ownedMax + 1}`;
      } else {
        stageLocked = true;
        displayLevelText = `Level ${ownedMax} (<span class="price-bad" title="Kræver Stage ${nextReqStage}">stage låst</span>)`;
      }
    }

    if (!target) {
      const top = items[items.length - 1];
      bldList.push({
        id: `bld.${top.key}`,
        name: target?.def?.name || top?.def?.name || family,
        level: Math.max(ownedMax, top.level),
        owned: true,
        isUpgrade: false,
        price: {},
        req: top.def?.require || "",
        duration_s: Number(top.def?.duration_s ?? 0),

        displayName,
        displayDesc,
        displayLinkId,
        displayLevelText,
        stageLocked,
        stageReq: nextReqStage || 0,

        icon: "🏗️",
        desc: top.def?.desc || "",
        yield: top.def?.yield || [],
        durability: top.def?.durability || 0,
        footprintDelta: top.def?.stats?.footprint || 0,
        animalCapDelta: top.def?.stats?.animalCap || 0
      });
      continue;
    }

    const fullId = `bld.${target.key}`;
    const price  = normalizePriceToObject(target.def?.cost || target.def?.price || {});
    const stageOk = !nextReqStage || nextReqStage <= currentStage;

    bldList.push({
      id: fullId,
      name: target.def?.name || target.key,
      level: target.level,
      owned: false,
      isUpgrade: (ownedMax > 0),
      price,
      req: target.def?.require || "",
      duration_s: Number(target.def?.duration_s ?? 10),

      displayName,
      displayDesc,
      displayLinkId,
      displayLevelText,
      stageLocked: !stageOk && !!nextReqStage,
      stageReq: nextReqStage || 0,

      icon: "🏗️",
      desc: target.def?.desc || "",
      yield: target.def?.yield || [],
      durability: target.def?.durability || 0,
      footprintDelta: target.def?.stats?.footprint || 0,
      animalCapDelta: target.def?.stats?.animalCap || 0
    });
  }

  const list = bldList.map(bld => {
    const owned  = isOwnedBuilding(bld.id);

    // Req/pris-linje (kompakt i liste)
    const reqLine = window.renderReqLine
      ? window.renderReqLine(bld, { context: "list", compact: window.UI_REQLINE.LIST_COMPACT, showLabels: window.UI_REQLINE.LIST_SHOW_LABELS })
      : "";

    // Thumbnail via manifest (ingen 404)
    const candidateImg = `assets/art/${bld.id}.medium.png`;
    const fallbackImg  = `assets/art/placeholder.medium.png`;
    const bestImg      = window.resolveArtPath ? window.resolveArtPath(candidateImg, fallbackImg) : fallbackImg;

    const icon = `
      <img 
        src="${bestImg}" 
        alt="" 
        class="bld-thumb"
        style="width:50px;height:50px;border-radius:6px;border:1px solid var(--border)">
    `;

    const scanok =
      (globalThis?.data?.extra?.priceok === "price-bad" ||
       globalThis?.data?.extra?.reqok   === "price-bad")
        ? "price-bad"
        : "price-ok";

    const canBuy = !owned && (scanok === "price-ok");

    let actionHtml = "";
    const active = window.ActiveBuilds && window.ActiveBuilds[bld.id];

    if (active) {
      actionHtml = `<button class="btn" data-cancel-build="${bld.id}">Cancel</button>`;
      const wrap = document.querySelector(`.build-progress[data-pb-for="${bld.id}"]`);
      if (wrap) wrap.style.display = "";
    } else if (bld.stageLocked) {
      const tip = bld.stageReq ? ` title="Kræver Stage ${bld.stageReq}"` : "";
      actionHtml = `<span class="badge stage-locked price-bad"${tip}>Stage locked</span>`;
    } else if (owned) {
      actionHtml = `<span class="badge owned">Owned</span>`;
    } else if (canBuy) {
      const label = bld.isUpgrade ? "Upgrade" : "Build";
      actionHtml = `
        <button class="btn primary"
                data-fakebuild-id="${bld.id}"
                data-buildmode="timer">${label}</button>`;
    } else {
      actionHtml = `<button class="btn" disabled>Need more</button>`;
    }

    const descLine = bld.displayDesc ? `<div class="sub">🛈 ${bld.displayDesc}</div>` : "";

    const levelAndReq = `
      <div class="sub">
        <span>${bld.displayLevelText}</span>
        ${reqLine ? `<span class="sep" style="opacity:.6; margin:0 .35em;">•</span><span class="inline-req">${reqLine}</span>` : ""}
      </div>`.replace(/\s+<\/span>\s*<span class="sep"[^>]*>•<\/span>\s*$/, "</span>");

    return `
  <div class="item" data-bld-id="${bld.id}">
    <div class="icon">${icon}</div>
    <div>
      <div class="title"><a href="#/building/${bld.displayLinkId}" class="link">${bld.displayName}</a></div>
      ${descLine}
      ${levelAndReq}
    </div>
    <div class="right">
      ${actionHtml}
      <div class="build-progress" data-pb-for="${bld.id}" style="display:none; margin-top:8px; width:160px;">
        <div class="pb-track" style="position:relative; height:10px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
          <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
        </div>
        <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
      </div>
    </div>
  </div>`;
  }).join("");

  main.innerHTML = `
    <section class="panel section">
      <div class="section-head">🏗️ Buildings</div>
      <div class="section-body">${list}</div>
    </section>
  `;

  window.BuildingsProgress?.rehydrate(main);
};





/* =========================================================
   BUILDINGS: Progress wiring (timer start/cancel + rehydrate)
========================================================= */
(function(){
  if (!window.BuildJobs) { console.warn("BuildJobs mangler (common.js)"); return; }

  // 🔒 Sørg for, at vi kun sætter handlers ÉN gang (hindrer dublet-jobs)
  if (window.__BUILD_TIMER_WIRED__) return;
  window.__BUILD_TIMER_WIRED__ = true;

  const pendingStarts = new Set(); // værn mod race/dobbelklik

  // Start build (escrow + job). Fanger KUN timer-knapper for BYGNINGER.
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-fakebuild-id][data-buildmode='timer']");
    if (!btn) return;

    // Ignorér addons (disse håndteres i buildingDetail.js)
    if (btn.getAttribute("data-buildscope")) return;

    ev.preventDefault();
    ev.stopPropagation();

    const bldId = btn.getAttribute("data-fakebuild-id");
    if (!bldId) return;

    // Hårde guards
    if (isOwnedBuilding?.(bldId)) return;
    if (window.ActiveBuilds?.[bldId]) return;
    if (pendingStarts.has(bldId)) return;

    // Varighed fra defs.bld
    const def = window.data?.defs?.bld?.[String(bldId).replace(/^bld\./, "")];
    const durationS = Number(def?.duration_s ?? 10);

    btn.disabled = true;
    pendingStarts.add(bldId);
    try {
      await window.BuildJobs.start(bldId, durationS);
    } catch (e) {
      console.error("Start build failed", e);
      btn.disabled = false;
      pendingStarts.delete(bldId);
      return;
    }
    pendingStarts.delete(bldId);

    // Vis progressbar
    const wrap = document.querySelector(`.build-progress[data-pb-for="${bldId}"]`);
    if (wrap) wrap.style.display = "";

    // Byt Build/Upgrade -> Cancel
    const cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.setAttribute("data-cancel-build", bldId);
    btn.replaceWith(cancel);
  });

  // Cancel = refund (server sender locked_costs; common.js → applyDelta)
  document.addEventListener("click", async (ev) => {
    
    const btn = ev.target.closest("[data-cancel-build]");
    

    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();

    const bldId = btn.getAttribute("data-cancel-build");
    try {
      await window.BuildJobs.cancel(bldId);
    } catch(e) {
      console.error("Cancel failed", e);
      return;
    }
    if (btn.getAttribute("data-buildscope") === "addon") return;
    // Skjul progress & fjern knappen
    try {
      document.querySelectorAll(`.build-progress[data-pb-for="${bldId}"]`).forEach(wrap => wrap.style.display = "none");
    } catch {}
    btn.remove();
  });

  // Rehydrate: vis progress & byt knap → Cancel for aktive jobs
  window.BuildingsProgress = window.BuildingsProgress || {};
  window.BuildingsProgress.rehydrate = function(scope=document){
    try {
      for (const [bldId, job] of Object.entries(window.ActiveBuilds || {})) {
        const wrap = scope.querySelector(`.build-progress[data-pb-for="${bldId}"]`);
        if (wrap) wrap.style.display = "";
        const btn = scope.querySelector(`[data-fakebuild-id="${bldId}"][data-buildmode="timer"]`);
        if (btn) {
          const cancel = document.createElement("button");
          cancel.className = "btn";
          cancel.textContent = "Cancel";
          cancel.setAttribute("data-cancel-build", bldId);
          btn.replaceWith(cancel);
        }
      }
    } catch(e) { /* no-op */ }
  };

  if (document.readyState !== "loading") {
    window.BuildingsProgress.rehydrate(document);
  } else {
    document.addEventListener("DOMContentLoaded", () => window.BuildingsProgress.rehydrate(document));
  }
})();
