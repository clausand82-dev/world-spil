/* =========================================================
   services/helpers.js
   - Et rent JavaScript-modul, der eksporterer genbrugelige funktioner.
   - Ingen globale `window`-variable.
========================================================= */

// --- Små helpers ---
export const fmt = (n) => (typeof n === "number" ? n.toLocaleString("da-DK") : String(n));
export const $ = (sel) => document.querySelector(sel);

// --- Parsere ---
export function parseBldKey(key) {
    const re = /^(?:bld\.)?(.+)\.l(\d+)$/i;
    const m = re.exec(String(key || ""));
    if (!m) return null;
    const family = m[1];
    const level = Number(m[2]);
    const series = `bld.${family}`;
    return { series, family, level };
}

// --- Normalisering ---
export function normalizePrice(cost) {
    if (!cost) return {};
    const out = {};
    if (Array.isArray(cost)) {
        cost.forEach((row) => {
            const id = row.id ?? row.rid ?? row.resource ?? row.type;
            const amount = row.amount ?? row.qty ?? row.value;
            if (id && Number(amount)) out[String(id)] = { id: String(id), amount: Number(amount) };
        });
    } else if (typeof cost === 'object') {
        for (const [key, spec] of Object.entries(cost)) {
            const amount = (typeof spec === 'object' && spec !== null) ? Number(spec.amount ?? 0) : Number(spec ?? 0);
            if (amount) out[key] = { id: key, amount };
        }
    }
    return out;
}


window.helpers = window.helpers || {};

window.helpers = {
    
  /** Parse et building-id til { series, family, level }
 *  - State-id:  "bld.barn.l1"         -> series="bld.barn",   family="barn",       level=1
 *  - Defs-key:  "barn.l2"             -> series="bld.barn",   family="barn",       level=2
 *  - Defs-key:  "mark.wheat.l3"       -> series="bld.mark.wheat", family="mark.wheat", level=3*/
computeOwnedMaxBySeries(stateKey = 'bld') {
    const bySeries = {};
    const prefix = stateKey; // f.eks. 'bld' eller 'add'
    const source = window.data?.state?.[stateKey] || {};
    
    for (const key of Object.keys(source)) {
        // Vi antager, at nøglerne er i formatet "prefix.family.lN"
        const m = key.match(new RegExp(`^${prefix}\\.(.+)\\.l(\\d+)$`));
        if (m) {
            const series = `${prefix}.${m[1]}`;
            const level = Number(m[2]);
            bySeries[series] = Math.max(bySeries[series] || 0, level);
        }
    }
    return bySeries;
},

groupDefsBySeriesInStage(defs, currentStage, prefix) {
    const out = {};
    for (const [key, def] of Object.entries(defs || {})) {
        const stage = Number(def?.stage ?? 0);
        if (stage > currentStage) continue;
        
        const m = key.match(/^(.+)\.l(\d+)$/i);
        if (m) {
            const series = `${prefix}.${m[1]}`;
            (out[series] ||= []).push({ key, def, level: Number(m[2]) });
        }
    }
    for (const s in out) {
        out[s].sort((a, b) => a.level - b.level);
    }
    return out;
},

pickNextTargetInSeries(seriesItems, ownedMaxLevel) {
    if (!Array.isArray(seriesItems) || seriesItems.length === 0) return null;
    const targetLevel = (ownedMaxLevel || 0) + 1;
    return seriesItems.find(x => x.level === targetLevel) || null;
},
hasResearch(rsdIdFull) {
    if (!rsdIdFull) return false;
    const key = String(rsdIdFull).replace(/^rsd\./, '');
    const state = window.data?.state;
    // Tjekker både den nye `research`-struktur og den gamle `rsd` for fuld kompatibilitet
    return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[rsdIdFull]);
},
ownedResearchMax(seriesFull) {
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
},
isOwnedBuilding(id) {
    const S = window.data?.state || window.state || {};
    return !!S?.bld?.[id];
},
    // ... (her vil vi tilføje flere funktioner senere)
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
window.openConfirm = function openConfirm({ title = 'Bekræft', body = '', confirmText = 'OK', onConfirm, onCancel }) {
  // Sørg for container
  let modal = document.getElementById('confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = ''; // vigtig
    document.body.appendChild(modal);
  }

  // Indre dialog
  modal.innerHTML = `
    <div style="background:#fff; padding:16px; border-radius:8px; max-width:480px; width:90%;">
      <h3 style="margin:0 0 8px 0;">${title}</h3>
      <div>${body || ''}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button id="confirm-cancel" class="btn">Annullér</button>
        <button id="confirm-ok" class="btn primary">${confirmText}</button>
      </div>
    </div>
  `;

  const cleanup = () => {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  };

  modal.querySelector('#confirm-cancel').onclick = () => {
    try { onCancel && onCancel(); } finally { cleanup(); }
  };
  modal.querySelector('#confirm-ok').onclick = () => {
    try { onConfirm && onConfirm(); } finally { cleanup(); }
  };
};

window.closeModal = closeModal;

/**
 * RETTET: Viser nu både ressourcer og dyr korrekt,
 * og henter "have"-antallet fra den korrekte state.
 */
window.renderCostColored = (map, inline = false) => {
    if (!map || Object.keys(map).length === 0) return "";
    
    // Vi bruger den normaliserede pris for at sikre et ensartet format
    const normalizedMap = window.helpers.normalizePrice(map);

    const parts = Object.values(normalizedMap).map(needData => {
        const id = needData.id;
        const needAmount = needData.amount;
        let haveAmount = 0;
        let def = null;
        let nameForSub = '';

        // Tjek om det er et dyr eller en ressource
        if (id.startsWith('ani.')) {
            const key = id.replace(/^ani\./, '');
            def = window.data?.defs?.ani?.[key] ?? { emoji: '🐾', name: key };
            haveAmount = window.data?.state?.ani?.[id]?.quantity ?? 0;
            nameForSub = ''; // For dyr viser vi kun emoji i sub-teksten
        } else {
            const key = id.replace(/^res\./, '');
            def = window.data?.defs?.res?.[key] ?? { emoji: '❓', name: key };
            haveAmount = window.data?.state?.inv?.solid?.[key] ?? window.data?.state?.inv?.liquid?.[key] ?? 0;
            nameForSub = def.name;
        }
        
        const ok = haveAmount >= needAmount;

        // Speciel formatering for dyr for at matche `Slagt Ko`-billedet
        if (id.startsWith('ani.')) {
            return `<span class="${ok ? 'price-ok' : 'price-bad'}" title="${def.name}">${fmt(haveAmount)} / ${fmt(needAmount)} ${def.emoji || ''}</span>`;
        }

        // Standard formatering for ressourcer
        const haveHtml = `<span class="${ok ? 'price-ok' : 'price-bad'}">${def.emoji} ${fmt(haveAmount)}</span>`;
        const needHtml = `<span class="sub" style="opacity:.8">/ ${fmt(needAmount)}</span>`;
        return haveHtml + needHtml;
    });

    return inline ? parts.join(" • ") : parts.join(" ");
};

// --- Version-tags (kan vises i UI) -----------------------
window.__UI_VERSION__ = "v4.4-split";

// --- Global containers (udfyldes ved boot via API) -------
window.defs = {};      // definitions (res, bld, rsd, rcp, lang…)
window.state = {};     // spiller-state (res, owned, research, meta…)




// Markér aktivt punkt i bundmenuen
window.highlightQuickbar = (page) => {
  document.querySelectorAll(".quickbar a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });
};

// Summerer værdier over en id-liste (bruges i sidebar totals)
window.sumBy = (ids, fn) => ids.reduce((acc, id) => acc + (fn(id) || 0), 0);

// Lille util til at sikre property
window.get = (obj, path, defVal = undefined) => {
  try { return path.split(".").reduce((o, k) => o[k], obj); } catch { return defVal; }
};

export function computeOwnedMaxBySeries(stateKey = 'bld') {
    const bySeries = {};
    const prefix = stateKey;
    const source = window.data?.state?.[stateKey] || {};
    for (const key of Object.keys(source)) {
        const m = key.match(new RegExp(`^${prefix}\\.(.+)\\.l(\\d+)$`));
        if (m) {
            const series = `${prefix}.${m[1]}`;
            const level = Number(m[2]);
            bySeries[series] = Math.max(bySeries[series] || 0, level);
        }
    }
    return bySeries;
}

export function hasResearch(rsdIdFull) {
    if (!rsdIdFull) return false;
    const key = String(rsdIdFull).replace(/^rsd\./, '');
    const state = window.data?.state;
    return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[rsdIdFull]);
}

export function groupDefsBySeriesInStage(defs, currentStage, prefix) {
    const out = {};
    for (const [key, def] of Object.entries(defs || {})) {
        const stage = Number(def?.stage ?? 0);
        if (stage > currentStage) continue;
        
        const m = key.match(/^(.+)\.l(\d+)$/i);
        if (m) {
            const series = `${prefix}.${m[1]}`;
            (out[series] ||= []).push({ key, def, level: Number(m[2]) });
        }
    }
    for (const s in out) {
        out[s].sort((a, b) => a.level - b.level);
    }
    return out;
}

/**
 * Vælger den næste bygning/opgradering, der er tilgængelig i en serie.
 */
export function pickNextTargetInSeries(seriesItems, ownedMaxLevel) {
    if (!Array.isArray(seriesItems) || seriesItems.length === 0) return null;
    const targetLevel = (ownedMaxLevel || 0) + 1;
    return seriesItems.find(x => x.level === targetLevel) || null;
}

export function prettyTime(secs) {
    if (secs == null) return '';
    const s = Math.max(0, Math.round(+secs));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}h ${m}m ${ss}s` : (m ? `${m}m ${ss}s` : `${ss}s`);
}

// helpers.js
export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  // Prøv at læse JSON-body uanset status
  let payload = null;
  const text = await res.text().catch(() => null);
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!res.ok) {
    const msg =
      (payload && payload.message) ||
      (typeof payload === 'string' && payload) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.response = payload;
    throw err;
  }
  return payload;
}

