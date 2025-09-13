/* =========================================================
   ui/common.js
   - Fælles UI-hjælpere: modal, pris-render, små komponenter
========================================================= */

/* ===== UI switches for krav/pris-linje (nem on/off) ===== */
window.UI_REQLINE = {
  // Byggeliste:
  LIST_COMPACT: true,       // true = vis pris+krav i samme linje som level (mindre størrelse)
  LIST_SHOW_LABELS: true,   // true = behold "🔨 Build/Upgrade cost:" + "📜 Demands:"
  // Detail:
  DETAIL_SPLIT: true,       // true = vis pris på 1. linje og krav på 2. linje
  // Tooltips på krav-chips:
  TOOLTIP_TEXTS: true       // true = brug “Kræver at du forsker i …” osv. / “Du har allerede …”
};

/* ====== Art manifest helpers (undgår 404-støj helt) ====== */
window.ArtManifest = {
  ready: false,
  files: new Set(),
  _loading: false
};

window.loadArtManifest = async function() {
  if (window.ArtManifest.ready || window.ArtManifest._loading) return;
  window.ArtManifest._loading = true;
  try {
    const res = await fetch("assets/art/manifest.json", { cache: "no-cache" });
    if (!res.ok) {
      window.ArtManifest.ready = true;
      return;
    }
    const arr = await res.json();
    if (Array.isArray(arr)) {
      for (const name of arr) {
        if (name) window.ArtManifest.files.add(String(name));
      }
    }
    window.ArtManifest.ready = true;
  } catch {
    window.ArtManifest.ready = true;
  } finally {
    window.ArtManifest._loading = false;
  }
};

window.resolveArtPath = function(candidate, fallback) {
  const key = String(candidate).replace(/^.*assets\/art\//, "");
  return window.ArtManifest.files.has(key) ? candidate : fallback;
};

// --- Modal ---
const modal = $("#modal");
const modalBody = $("#modalBody");
const modalBtns = $("#modalActions");
$("#modalClose")?.addEventListener("click", closeModal);
modal?.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".modal__content")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});
function closeModal() {
  modal.hidden = true;
  modalBody.innerHTML = "";
  modalBtns.innerHTML = "";
}
window.openConfirm = ({ title, body, confirmText = "OK", cancelText = "Annullér", onConfirm }) => {
  modalBody.innerHTML = `<h3 style="margin-top:0">${title}</h3><div class="sub" style="margin-top:4px">${body}</div>`;
  modalBtns.innerHTML = `<button type="button" class="btn" id="cancel">${cancelText}</button><button type="button" class="btn primary" id="ok">${confirmText}</button>`;
  $("#cancel").onclick = (e) => { e.preventDefault(); closeModal(); };
  $("#ok").onclick = async () => {
    try {
      if (typeof onConfirm === "function") await onConfirm();
    } finally {
      closeModal();
    }
  };
  modal.hidden = false;
};
window.closeModal = closeModal;

// --- Pris/krav helpers ---
window.renderCostColored = (map, inline = false) => {
  if (!map) return "";
  const parts = Object.entries(map).map(([rid, needData]) => {
    const id = needData.id || rid;
    const needAmount = needData.amount || 0;
    const resShort = String(id).replace(/^res\./, '');
    const def = window.data?.defs?.res?.[resShort] ?? { emoji: '❓', name: resShort };
    const haveAmount = window.data?.state?.inv?.solid?.[resShort] ?? window.data?.state?.inv?.liquid?.[resShort] ?? 0;
    const ok = haveAmount >= needAmount;
    const haveHtml = `<span class="${ok ? 'price-ok' : 'price-bad'}">${def.emoji} ${fmt(haveAmount)}</span>`;
    const needHtml = `<span class="sub" style="opacity:.8">/ ${fmt(needAmount)}</span>`;
    return haveHtml + needHtml;
  });
  return inline ? parts.join(" • ") : parts.join(" ");
};

window.canAfford = (price) => {
  const miss = [];
  const inv = window?.data?.state?.inv ?? {};
  const liquid = inv.liquid ?? {};
  const solid = inv.solid ?? {};
  const haveOf = (rid) => {
    const ridNoPrefix = String(rid).replace(/^res\./, "");
    const lastSeg = String(rid).split(".").pop();
    const v = liquid[rid] ?? solid[rid] ?? liquid[ridNoPrefix] ?? solid[ridNoPrefix] ?? liquid[lastSeg] ?? solid[lastSeg] ?? 0;
    return (typeof v === "object" && v !== null) ? +(v.amount ?? 0) : +v;
  };
  if (!price) return { ok: true, miss };
  if (Array.isArray(price)) {
    for (const item of price) {
      const rid = item?.id ?? item?.rid ?? item?.resource ?? "";
      const need = +(item?.amount ?? item?.value ?? 0);
      if (!rid || !String(rid).startsWith("res.")) continue;
      const have = haveOf(rid);
      if (have < need) miss.push({ rid, need, have });
    }
  } else {
    for (const [rid, spec] of Object.entries(price)) {
      if (!String(rid).startsWith("res.")) continue;
      const need = (typeof spec === "object" && spec !== null) ? +(spec.amount ?? 0) : +spec;
      const have = haveOf(rid);
      if (have < need) miss.push({ rid, need, have });
    }
  }
  return { ok: miss.length === 0, miss };
};

window.spend = (price) => {
  for (const [rid, need] of Object.entries(price || {})) {
    if (rid.startsWith("res.")) state.res[rid] = (state.res[rid] || 0) - need;
  }
};

window.renderReqLine = (bld, opts = {}) => {
  const CFG = window.UI_REQLINE || {};
  const context = opts.context || "list";
  const compact = !!(opts.compact ?? (context === "list" ? CFG.LIST_COMPACT : false));
  const showLabels = !!(opts.showLabels ?? true);
  const returnParts = !!opts.returnParts;

  const S = window.data?.state || window.state || {};
  const D = window.data?.defs || {};

  // --- Pris (uændret logik) ---
  const priceHtmlRaw = (typeof renderCostColored === "function")
    ? (renderCostColored(bld?.price || {}, true) || "")
    : "";
  globalThis.data = globalThis.data || {};
  globalThis.data.extra = globalThis.data.extra || {};
  globalThis.data.extra.priceok = /\bprice-bad\b/.test(priceHtmlRaw) ? "price-bad" : "price-ok";

  // --- Demands (uændret logik) ---
  const reqRaw = bld?.req;
  let reqIds = [];
  if (Array.isArray(reqRaw)) reqIds = reqRaw.flatMap(s => String(s || "").split(/[,;]+/));
  else if (typeof reqRaw === "string") reqIds = String(reqRaw || "").split(/[,;]+/);
  reqIds = (reqIds || []).map(s => s.trim()).filter(Boolean)
           .map(s => (s.startsWith("rsd.") || s.startsWith("bld.") || s.startsWith("add.")) ? s : (s.includes(".") ? `rsd.${s}` : s));


  const ownedMaxForSeries = (series) => {
    let max = 0;
    for (const k of Object.keys(S?.bld || {})) {
      if (!k.startsWith(series + ".l")) continue;
      const m = k.match(/\.l(\d+)$/);
      const lvl = m ? +m[1] : 0;
      if (lvl > max) max = lvl;
    }
    return max;
  };

  const RS = S?.rsd || {};
  const hasRsd = (rid) => {
    const alt = rid.replace(/^rsd\./, "");
    return !!((RS && typeof RS.has === "function" && RS.has(rid))
      || (Array.isArray(RS) && (RS.includes(rid) || RS.includes(alt)))
      || (!!RS[rid]) || (!!RS[alt]));
  };

  const chips = [];
  let allOk = true;
  for (const rid of reqIds) {
    let ok = false, label = rid, href = '#', tip = rid;
    if (rid.startsWith("rsd.")) {
      const key = rid.slice(4);
      const rDef = D.rsd?.[key];
      const base = rDef?.name || key.replace(/\.[^\.]+$/, "");
      const lvl = (rDef?.lvl ?? (key.match(/\.l(\d+)$/)?.[1])) || "";
      label = `${base}${lvl ? " L" + lvl : ""}`;
      ok = hasRsd(rid);
      href = '#/research';
      tip = ok ? `Du har allerede forsket i ${label}` : `Kræver at du forsker i ${label}`;
    } else if (rid.startsWith("bld.")) {
      const bldKey = rid.replace(/^bld\./, "");
      const m = bldKey.match(/^(.+)\.l(\d+)$/);
      const family = m ? m[1] : bldKey.replace(/\.l\d+$/, '');
      const needLvl = m ? +m[2] : 1;
      const series = `bld.${family}`;
      const bDef = D.bld?.[bldKey];
      const bName = bDef?.name || family;
      label = `${bName} L${needLvl}`;
      const haveMax = ownedMaxForSeries(series);
      ok = haveMax >= needLvl;
      href = '#/buildings';
      tip = ok ? `Du har allerede bygget ${label}` : `Kræver at du bygger ${label}`;
      } else if (rid.startsWith("add.")) {
  const addKey = rid.replace(/^add\./, "");
  const m = addKey.match(/^(.+)\.l(\d+)$/);
  const series = m ? m[1] : addKey.replace(/\.l\d+$/,'');
  const needLvl = m ? +m[2] : 1;

  const aDef = D.add?.[addKey];
  const aName = aDef?.name || series;

  // Hvor mange addon-levels har spilleren i denne serie?
  let haveMax = 0;
  for (const k of Object.keys(S?.add || {})) {
    if (!k.startsWith(`add.${series}.l`)) continue;
    const mm = k.match(/\.l(\d+)$/);
    const lvl = mm ? +mm[1] : 0;
    if (lvl > haveMax) haveMax = lvl;
  }

  label = `${aName} L${needLvl}`;
  ok = haveMax >= needLvl;
  href = '#/building'; // holder os i building-kontekst
  tip = ok ? `Du har allerede addon ${label}` : `Kræver addon ${label}`;
    } else {
      ok = false;
      label = rid;
    }
    allOk = allOk && !!ok;
    chips.push(`<a class="${ok ? 'price-ok' : 'price-bad'}" href="${href}" title="${tip}">${label}</a>`);
  }
 
  globalThis.data.extra.reqok = allOk ? "price-ok" : (reqIds.length ? "price-bad" : "price-ok");
  
  
  
  // --- NYT: TID (time_str eller fallback fra duration_s) ---
  const id = String(bld?.id || "");

  // --- NY, INTELLIGENT FOOTPRINT LOGIK ---
  let footprintOk = true;
  let footprintCost = 0;
  let footprintChange = 0;
 
// Find footprint-ændringen (kan være positiv eller negativ)
if (id.startsWith("bld.")) {
    const key = id.replace(/^bld\./, '');
    footprintChange = D.bld?.[key]?.stats?.footprint || bld?.footprintDelta || 0;
} else if (id.startsWith("add.")) {
    const key = id.replace(/^add\./, '');
    footprintChange = D.add?.[key]?.stats?.footprint || 0;
}

// Kun hvis footprintChange er NEGATIV, er det en omkostning/krav
if (footprintChange < 0) {
    const footprintCost = Math.abs(footprintChange); // Omkostningen er den positive værdi
    const cap = S.cap?.footprint || { base: 0, bonus: 0, used: 0 };
    const totalCap = (cap.base || 0) + (cap.bonus || 0);
    const usedCap = Math.abs(cap.used || 0);
    const availableCap = totalCap - usedCap;

    footprintOk = availableCap >= footprintCost;
      
      const footprintChip = `
        <span class="${footprintOk ? 'price-ok' : 'price-bad'}" title="Kræver ${footprintCost} Byggepoint. Du har ${availableCap} ledige.">
            ⬛ ${footprintCost} BP
        </span>
    `;
    chips.push(footprintChip);
} 
// Hvis footprintChange er POSITIV, er det en bonus, ikke et krav
else if (footprintChange > 0) {
    const footprintChip = `
        <span class="price-ok" title="Giver ${footprintChange} Byggepoint.">
            ⬛ +${footprintChange} BP
        </span>
    `;
    chips.push(footprintChip);
}
  
  if (!footprintOk) {
    reqOk = false; // Opdater kun den overordnede status, hvis der er et krav, der ikke er opfyldt
}
 


  const emoji = "⏱";
  let timeStr = "";
  let timeLabel = "";
  const pretty = (secs) => {
    const s = Math.max(0, Math.round(+secs || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}h ${m}m ${ss}s` : (m ? `${m}m ${ss}s` : `${ss}s`);
  };

  if (id.startsWith("bld.")) {
    const key = id.replace(/^bld\./, "");
    const def = D.bld?.[key];
    timeStr   = def?.time_str || (def?.duration_s != null ? pretty(def.duration_s) : "");
    timeLabel = bld?.isUpgrade ? "Time for upgrade" : "Time for build";
  } else if (id.startsWith("add.")) {
    const key = id.replace(/^add\./, "");
    const def = D.add?.[key];
    timeStr   = def?.time_str || (def?.duration_s != null ? pretty(def.duration_s) : "");
    timeLabel = bld?.isUpgrade ? "Time for upgrade" : "Time for build";
  } else if (id.startsWith("rsd.")) {
    const key = id.replace(/^rsd\./, "");
    const def = D.rsd?.[key];
    timeStr   = def?.time_str || (def?.duration_s != null ? pretty(def.duration_s) : "");
    timeLabel = "Time for research";
    } else if (id.startsWith("rcp.")) {
  const key = id.replace(/^rcp\./, "");
  const def = D.rcp?.[key];
  timeStr   = def?.time_str || (def?.duration_s != null ? pretty(def.duration_s) : "");
  timeLabel = "Time for production";
  }

  const lblCost = `<span class="pill-label pill-label--mini">🔨 <strong>${
  context === "recipe" ? "Production cost:" : (bld?.isUpgrade ? "Upgrade cost:" : "Build cost:")
}</strong></span>`;
  const lblReqs = `<span class="pill-label pill-label--mini">📜 <strong>Demands:</strong></span>`;
  const lblTime = `<span class="pill-label pill-label--mini">${emoji} <strong>${timeLabel}:</strong></span>`;

  const priceHTML = priceHtmlRaw ? (showLabels ? `${lblCost} ${priceHtmlRaw}` : priceHtmlRaw) : "";
  const reqHTML   = chips.length ? (showLabels ? `${lblReqs} ${chips.join(" • ")}` : chips.join(" • ")) : "";
  const timeHTML  = timeStr ? (showLabels ? `${lblTime} ${timeStr}` : `${emoji} ${timeStr}`) : "";

  const joined = [priceHTML, reqHTML, timeHTML].filter(Boolean).join(" • ");

  if (returnParts) {
    // Både med og uden labels til detail-view
    return {
      priceHTML,
      reqHTML,
      timeHTML,
      timeOnly: timeStr ? `${emoji} ${timeStr}` : "",
      bothInline: joined,
      allOk
    };
  }

  const wrapperTag = compact && context === "list" ? "span" : "div";
  const cls = compact && context === "list" ? "reqline reqline--compact" : "price-pill";
  return joined ? `<${wrapperTag} class="${cls}">${joined}</${wrapperTag}>` : "";
};


/* ===========================
   State, API & Actions
=========================== */
const BASE_API = "http://localhost/world-spil/backend/api";

async function postJSON(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });

    let responseData;
    try {
      // Try JSON first
      responseData = await res.clone().json();
    } catch {
      // Fallback: parse text or return empty object
      try {
        const t = await res.text();
        responseData = t ? { message: t } : {};
      } catch {
        responseData = {};
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      data: responseData
    };
  } catch (networkError) {
    console.error("Network error in postJSON:", networkError);
    return {
      ok: false,
      status: 0,
      data: { message: networkError.message || "Network request failed" }
    };
  }
}

function ensureStateRoot() {
  window.data = window.data || {};
  const S = (window.data.state = window.data.state || {});
  if (!window.state) window.state = S;
  return S;
}

function bumpResourceEverywhere(diffMap) {
  const matchers = Object.entries(diffMap || {}).map(([rid, diff]) => {
    const noPref = rid.startsWith("res.") ? rid.slice(4) : rid;
    const withPref = rid.startsWith("res.") ? rid : `res.${rid}`;
    return { keys: new Set([rid, noPref, withPref]), diff: Number(diff || 0) };
  });
  const seen = new WeakSet();
  const isNumericString = (s) => typeof s === "string" && s.trim() !== "" && !isNaN(Number(s));
  function walk(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || seen.has(obj) || depth > 8) return;
    seen.add(obj);
    if (Array.isArray(obj)) { for (const v of obj) walk(v, depth + 1); return; }
    for (const [k, v] of Object.entries(obj)) {
      for (const m of matchers) {
        if (m.keys.has(k)) {
          if (typeof v === "number" && Number.isFinite(v)) obj[k] = v + m.diff;
          else if (isNumericString(v)) {
            const n = Number(v);
            if (Number.isFinite(n)) obj[k] = String(n + m.diff);
          }
        }
      }
      walk(v, depth + 1);
    }
  }
  try { walk(window.data); } catch {}
}

function applyDelta(delta = {}) {
  const S = ensureStateRoot();
  if (delta.resources && typeof delta.resources === "object") {
    bumpResourceEverywhere(delta.resources);
  }
  S.owned = S.owned || { bld: {}, addon: {} };
  S.bld = S.bld || {};
  if (Array.isArray(delta.buildings)) {
    for (const b of delta.buildings) {
      const bid = b?.id || b?.bld_id;
      if (!bid) continue;
      S.owned.bld[bid] = true;
      const prev = S.bld[bid] || {};
      S.bld[bid] = { ...prev, level: b.level ?? prev.level ?? 1, durability: b.durability ?? prev.durability };
    }
  }
  S.addon = S.addon || {};
  if (Array.isArray(delta.addons)) {
    for (const a of delta.addons) {
      const aid = a?.id || a?.addon_id || a?.add_id;
      if (!aid) continue;
      S.owned.addon[aid] = true;
      S.addon[aid] = { ...(S.addon[aid] || {}), level: a.level ?? 1 };
    }
  }
  S.research = S.research || {};
  if (delta.research && Array.isArray(delta.research.completed)) {
      for (const id of delta.research.completed) {
          S.research[id] = true;
      }
  }
  if (window.state !== S) window.state = S;
}

function isOwned(type, id) {
  const s = window.data?.state || window.state || {};
  if (type === "building") return !!s?.owned?.bld?.[id];
  if (type === "addon") return !!s?.owned?.addon?.[id];
  if (type === "research") return !!s?.research?.[id.replace(/^rsd\./, '')];
  return false;
}

function markOwnedBuilding(id, lvl = 1) {
  const S = ensureStateRoot();
  S.owned = S.owned || { bld: {}, addon: {} };
  S.bld = S.bld || {};
  S.owned.bld[id] = true;
  S.bld[id] = { ...(S.bld[id] || {}), level: S.bld[id]?.level ?? lvl };
  if (window.state !== S) window.state = S;
}

function refreshUIAfter(type) {
  try { renderHeader?.(); } catch {}
  try { renderSidebar?.(); } catch {}
  function normId(raw) {
    if (!raw) return null;
    const id = String(raw);
    return id.startsWith("bld.") ? id : ("bld." + id.replace(/^bld\./, ""));
  }
  function parseBld(stateId) {
    if (!stateId) return null;
    const m = String(stateId).replace(/^bld\./, '').match(/^(.+)\.l(\d+)$/);
    if (!m) return null;
    return { family: m[1], level: Number(m[2] || 0), series: "bld." + m[1] };
  }
  function ownedMaxLevel(series) {
    const all = Object.keys(window.data?.state?.bld || {}).filter(k => k.startsWith(series + ".l"));
    return all.length ? Math.max(...all.map(k => Number(k.split(".l")[1] || 0))) : 0;
  }
  try {
    const hash = String(location.hash || "");
    const m = hash.match(/^#\/building\/(.+)$/);
    if (m && typeof window.renderBuildingDetail === "function") {
      const curId = normId(m[1]);
      const parsed = parseBld(curId);
      if (parsed) {
        const maxOwned = ownedMaxLevel(parsed.series);
        if (maxOwned > parsed.level) {
          const newId = `${parsed.series}.l${maxOwned}`;
          location.hash = `#/building/${newId}`;
          try { window.renderBuildingDetail(newId); } catch {}
          return;
        }
      }
      try { window.renderBuildingDetail(m[1]); } catch {}
      return;
    }
  } catch {}
  try {
    const hash = String(location.hash || "");
    if (hash.startsWith("#/research") && typeof window.renderResearchPage === "function") { window.renderResearchPage(); return; }
    if (hash.startsWith("#/buildings") && typeof window.renderBuildingsPage === "function") { window.renderBuildingsPage(); return; }
    if (typeof window.renderDashboard === "function") { window.renderDashboard(); } // Fallback
  } catch {}
}

const pendingPurchases = new Set();
const purchaseKey = (type, id) => `${type}:${id}`;
async function purchase(type, id) {
  if (!type && id) type = id.startsWith("rsd.") ? "research" : id.startsWith("add.") ? "addon" : "building";
  const key = purchaseKey(type, id);
  if (pendingPurchases.has(key)) return;
  const clicked = (document.activeElement instanceof HTMLButtonElement) ? document.activeElement : null;
  if (clicked) clicked.disabled = true;
  pendingPurchases.add(key);
  try {
    const resp = await postJSON(`${BASE_API}/actions/purchase.php`, { type, id, request_id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) });
    if (!resp.ok) {
      alert(resp.data?.message || "Købet blev afvist.");
      return;
    }
    if (resp.data?.delta) applyDelta(resp.data.delta);
    if (!isOwned(type, id)) {
      if (type === "building") markOwnedBuilding(id, 1);
    }
    refreshUIAfter(type);
  } catch (err) {
    console.error("purchase error:", err);
    alert("Der skete en fejl – prøv igen.");
  } finally {
    pendingPurchases.delete(key);
    if (clicked && !isOwned(type, id)) clicked.disabled = false;
  }
}

window.buyBuilding = (id) => purchase("building", id);
window.buyAddon = (id) => purchase("addon", id);
window.buyResearch = (id) => purchase("research", id);
window.fakeBuild = (id) => {
  if (id?.startsWith("rsd.")) return window.buyResearch(id);
  if (id?.startsWith("add.")) return window.buyAddon(id);
  return window.buyBuilding(id);
};

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fakebuild-id]");
    if (!btn || btn.getAttribute("data-buildmode") === "timer") return;
    const raw = btn.getAttribute("data-fakebuild-id");
    const id = String(raw || "").trim().replace(/^[('"]+|[)'"]+$/g, "");
    if (id) window.fakeBuild(id);
  });
});

/* =========================================================
   GLOBAL BUILD JOBS (TIMER)
========================================================= */
(function() {
  const BASE = BASE_API;
  const LS_VER = "v1";
  const getUserId = () => String(window?.data?.state?.user?.id || "anon");
  const lsKey = () => `ws:active_builds:${LS_VER}:user:${getUserId()}`;
  window.ActiveBuilds = window.ActiveBuilds || {};
  const completionQueue = new Set();
  let tickerRunning = false;

  function loadActiveBuildsFromStorage() {
    try {
      const raw = localStorage.getItem(lsKey());
      const obj = raw ? JSON.parse(raw) : {};
      if (obj && typeof obj === "object") window.ActiveBuilds = obj;
    } catch (e) { console.warn("loadActiveBuildsFromStorage failed", e); }
  }

  function sanitizeActiveBuilds() {
  let changed = false;
  for (const bldId in window.ActiveBuilds) {
    const job = window.ActiveBuilds[bldId];
    // Et job er ugyldigt, hvis det mangler ID eller gyldige tidsstempler
    if (!job || !job.jobId || typeof job.startTs !== 'number' || typeof job.endTs !== 'number') {
      console.warn(`Fjerner ugyldigt spøgelses-job for ${bldId}`, job);
      delete window.ActiveBuilds[bldId];
      changed = true;
    }
  }
  if (changed) {
    saveActiveBuildsToStorage(); // Gem den rensede liste tilbage
  }
}

  function saveActiveBuildsToStorage() {
    try { localStorage.setItem(lsKey(), JSON.stringify(window.ActiveBuilds || {})); }
    catch (e) { console.warn("saveActiveBuildsToStorage failed", e); }
  }

  window.BuildJobs = window.BuildJobs || {};
  window.BuildJobs.persist = { load: loadActiveBuildsFromStorage, save: saveActiveBuildsToStorage };
  loadActiveBuildsFromStorage();
  sanitizeActiveBuilds();

  (function primeCompletions() {
    const now = Date.now();
    for (const [bldId, job] of Object.entries(window.ActiveBuilds)) {
      if (!job || !job.endTs) { delete window.ActiveBuilds[bldId]; continue; }
      if (now >= job.endTs) completionQueue.add(bldId);
    }
    if (completionQueue.size) saveActiveBuildsToStorage();
  })();

  async function ensureTicker() {
    if (tickerRunning) return;
    tickerRunning = true;
    async function tick() {
      const now = Date.now();
      let anyActive = false;
      for (const [bldId, job] of Object.entries(window.ActiveBuilds)) {
        if (!job) continue;
        anyActive = true;
        try {
          document.querySelectorAll(`.build-progress[data-pb-for="${bldId}"]`).forEach(wrap => {
            const fill = wrap.querySelector(".pb-fill");
            const label = wrap.querySelector(".pb-label");
            if (!fill || !label) return;
            const total = Math.max(1, job.endTs - job.startTs);
            const done = Math.max(0, Math.min(total, now - job.startTs));
            const pct = Math.round((done / total) * 100);
            fill.style.width = pct + "%";
            label.textContent = pct + "%";
          });
        } catch {}

        if (now >= (job.endTs + 1000) && (!job.nextCheckTs || now >= job.nextCheckTs)) {
          completionQueue.add(bldId);
        }
      }
      if (completionQueue.size) {
        const toProcess = Array.from(completionQueue);
        completionQueue.clear();
        for (const bldId of toProcess) {
          const job = window.ActiveBuilds[bldId];
          if (!job || (job.nextCheckTs && now < job.nextCheckTs)) continue;
          
// ---------------

const scope = String(bldId).startsWith("rsd.") ? "research"
            : String(bldId).startsWith("add.") ? "addon"
            : "building";

const payload = { id: bldId, job_id: job.jobId, scope };

//---------------------


          //const payload = { id: bldId, job_id: job.jobId, scope: (String(bldId).startsWith("add.") ? "addon" : "building") };
          const resp = await postJSON(`${BASE}/actions/build_complete.php`, payload);
          
          if (resp.ok) {
            if (resp.data?.delta) applyDelta(resp.data.delta);

if (Array.isArray(resp.data?.yield?.summary) && resp.data.yield.summary.length) {
  const d = {};
  for (const s of resp.data.yield.summary)
    for (const c of (s.credited || []))
      d[c.res_id] = (d[c.res_id] || 0) + Number(c.amount || 0);
  bumpResourceEverywhere(d);
}

            delete window.ActiveBuilds[bldId];
            saveActiveBuildsToStorage();
            refreshUIAfter("scope");
          } else {
            const msg = resp.data?.message || '';
            if (resp.status === 400 && /Not finished yet/i.test(msg)) {
              console.log(`Job ${bldId} not ready on server, retrying in 1.5s.`);
              window.ActiveBuilds[bldId].nextCheckTs = now + 1500;
              completionQueue.add(bldId);
            } else {
              console.error(`build_complete failed for ${bldId}:`, resp.data?.message || `HTTP ${resp.status}`);
              window.ActiveBuilds[bldId].nextCheckTs = now + 5000;
              completionQueue.add(bldId);
            }
          }
        }
        if(completionQueue.size > 0) saveActiveBuildsToStorage();
      }
      setTimeout(tick, anyActive ? 250 : 1000);
    }
    tick();
  }
  ensureTicker();

  window.BuildJobs.start = async function(bldId, durationS) {
    // =====================================================================
    // START PÅ RETTELSE: Korrekt scope-detektion for research
    // =====================================================================
    const scope = String(bldId).startsWith("rsd.") ? "research"
                : String(bldId).startsWith("add.") ? "addon"
                : "building";

    const resp = await postJSON(`${BASE}/actions/build_start.php`, { id: bldId, scope });
    
    if (!resp.ok || !resp.data?.job_id) {
      console.error("Server response for build_start is invalid.", resp.data);
      throw new Error(resp.data?.message || "Start build failed: Server did not return a valid job ID.");
    }

    const jobData = resp.data;
    const parseUTC = (s) => {
      if(!s) return Date.now();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
      if (!m) return Date.now();
      const [_, Y, M, D, h, mn, sc] = m.map(Number);
      return Date.UTC(Y, M - 1, D, h, mn, sc);
    };

    const startTs = parseUTC(jobData.start_utc);
    const endTs = parseUTC(jobData.end_utc);

    window.ActiveBuilds[bldId] = { jobId: jobData.job_id, startTs, endTs, nextCheckTs: 0 };
    saveActiveBuildsToStorage();
    await ensureTicker();

    if (Array.isArray(jobData.locked_costs)) {
      const resDelta = {};
      for (const c of jobData.locked_costs) {
        if (c.res_id && c.amount) resDelta[c.res_id] = -(c.amount);
      }
      applyDelta({ resources: resDelta });
      
      if (Array.isArray(resp.data?.yield?.summary) && resp.data.yield.summary.length) {
  const d = {};
  for (const s of resp.data.yield.summary)
    for (const c of (s.credited || []))
      d[c.res_id] = (d[c.res_id] || 0) + Number(c.amount || 0);
      bumpResourceEverywhere(d); 
}
      ;refreshUIAfter(scope); // Brug det korrekte scope til refresh
    }
    return window.ActiveBuilds[bldId];
  };

  window.BuildJobs.cancel = async function(bldId) {
    const job = window.ActiveBuilds[bldId];
    if (!job) return;

    // =====================================================================
    // START PÅ RETTELSE: Korrekt scope-detektion for research
    // =====================================================================
    const scope = String(bldId).startsWith("rsd.") ? "research"
                : String(bldId).startsWith("add.") ? "addon"
                : "building";

   const resp = await postJSON(`${BASE}/actions/build_cancel.php`, { id: bldId, job_id: job.jobId, scope });
    
    if (resp.ok) {
      delete window.ActiveBuilds[bldId];
      saveActiveBuildsToStorage();
      if (Array.isArray(resp.data?.locked_costs)) {
        const resDelta = {};
        for (const c of resp.data.locked_costs) {
          if (c.res_id && c.amount) resDelta[c.res_id] = +(c.amount);
        }
        applyDelta({ resources: resDelta });
      }
      refreshUIAfter(scope); // Brug det korrekte scope til refresh
    } else {
      const msg = resp.data?.message || '';
      if (resp.status === 400 && msg.includes("Job not running")) {
        console.warn(`Attempted to cancel job ${bldId}, but it was already finished on the server. Cleaning up UI.`);
        delete window.ActiveBuilds[bldId];
        saveActiveBuildsToStorage();

if (Array.isArray(resp.data?.yield?.summary) && resp.data.yield.summary.length) {
  const d = {};
  for (const s of resp.data.yield.summary)
    for (const c of (s.credited || []))
      d[c.res_id] = (d[c.res_id] || 0) + Number(c.amount || 0);
  bumpResourceEverywhere(d);
  console.log("CANCEL")
}
        refreshUIAfter(scope);
      } else {
        throw new Error(resp.data?.message || "Cancel failed");
      }
    }
  };
})();
