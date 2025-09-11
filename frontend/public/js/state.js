/* =========================================================
   state.js
   - Global "state" + "defs" (midlertidigt via mock i services/api.js)
   - Format matcher v4.3 for at holde UI uændret
   - Små helpers til formattering og highlight i quickbar
========================================================= */

// --- Version-tags (kan vises i UI) -----------------------
window.__UI_VERSION__ = "v4.4-split";

// --- Global containers (udfyldes ved boot via API) -------
window.defs = {};      // definitions (res, bld, rsd, rcp, lang…)
window.state = {};     // spiller-state (res, owned, research, meta…)

// --- Små helpers -----------------------------------------
window.$ = (sel) => document.querySelector(sel); // hurtig DOM query

// Dansk talformat – bruges overalt i UI
window.fmt = (n) => (typeof n === "number" ? n.toLocaleString("da-DK") : n);

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
