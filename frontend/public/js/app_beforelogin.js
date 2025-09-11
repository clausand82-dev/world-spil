/* =========================================================
   app.js
   - Boot + routing + header/sidebar render
   - Ubrudt funktionalitet fra v4.3, men via split-filer
========================================================= */

// Tema toggle (samme knap i topbaren)
$("#themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

// --- Header render (chips + player + login/logud) ----------
window.renderHeader = () => {
  // Chips: water, wood, money
  const order = ["res.water","res.wood","res.money"];
  const chips = order.map(id=>{
    const d=defs.res[id], cur=state.res[id]||0, max=d.max ?? "";
    return `<span class="res-chip">${d.emoji} ${fmt(cur)}${max?`<span class="max">/${fmt(max)}</span>`:""}</span>`;
  });

  // AnimalCap + Footprint
  const ac=state.animalCap||{used:0,total:0}, fp=state.footprint||{used:0,total:0};
  chips.push(`<span class="res-chip">🐾 ${fmt(ac.used)}<span class="max">/${fmt(ac.total)}</span></span>`);
  chips.push(`<span class="res-chip">⬛ ${fmt(fp.used)}<span class="max">/${fmt(fp.total)}</span></span>`);

  $("#headerRes").innerHTML = chips.join("");

  // Player meta
  const p=state.player||{};
  $("#playerMeta").textContent = `${p.code||""}  ${p.world||""}  ${p.land||""}  ${p.map||""}  ${p.field||""}`;

  // Login/Logud (dummy – rigtig auth kommer senere)
  const auth = $("#authBtns");
  const loggedIn = state.session?.loggedIn;
  auth.innerHTML = loggedIn
    ? `<button class="btn" onclick="state.session.loggedIn=false; renderHeader()">Log ud</button>`
    : `<button class="btn primary" onclick="openLogin()">Log ind</button>`;
};

// Simpel login-modal (demo)
window.openLogin = () => {
  const body = `
    <div style="display:grid; gap:8px; margin-top:8px">
      <input placeholder="Brugernavn" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"/>
      <input placeholder="Kodeord" type="password" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"/>
    </div>`;
  openConfirm({
    title: "Log ind",
    body,
    confirmText: "Log ind",
    onConfirm: () => { state.session.loggedIn = true; renderHeader(); }
  });
};

// --- Sidebar render (liquid/solid totals; rækker viser “har”) ---
window.renderSidebar = () => {
  const el = $("#sidebar");
  const liq = Object.keys(defs.res).filter(id => defs.res[id].type==="liquid");
  const sol = Object.keys(defs.res).filter(id => defs.res[id].type==="solid");
  const liqHave = sumBy(liq, id => state.res[id]||0);
  const liqMax  = sumBy(liq, id => defs.res[id].max||0);
  const solHave = sumBy(sol, id => state.res[id]||0);
  const solMax  = sumBy(sol, id => defs.res[id].max||0);

  const resRow = (id) => {
    const d=defs.res[id], have=state.res[id]||0;
    return `
      <div class="row">
        <div class="left"><span>${d.emoji}</span><span>${d.name}</span></div>
        <div class="right"><strong>${fmt(have)}</strong></div>
      </div>`;
  };

  el.innerHTML = `
  <section class="panel section res-panel">
    <div class="section-head">💧 Liquid Resources <span style="margin-left:auto;font-weight:600">${fmt(liqHave)}/${fmt(liqMax)}</span></div>
    <div class="section-body">${liq.map(resRow).join("")}</div>
  </section>
  <section class="panel section res-panel">
    <div class="section-head">🧱 Solid Resources <span style="margin-left:auto;font-weight:600">${fmt(solHave)}/${fmt(solMax)}</span></div>
    <div class="section-body">${sol.map(resRow).join("")}</div>
  </section>
  <section class="panel section">
    <div class="section-body"><div class="sub">${window.__UI_VERSION__} • prototype</div></div>
  </section>
  `;
};

// --- Router ------------------------------------------------
window.addEventListener("hashchange", route);

function route(){
  const hash = (location.hash.slice(2) || "dashboard"); // "#/dashboard" → "dashboard"
  const [page, sub] = hash.split("/");

  highlightQuickbar(page); // aktiv i bundmenu

  switch(page){
    case "dashboard":  renderDashboard(); break;
    case "buildings":  renderBuildingsPage(); break;
    case "research":   renderResearchPage(); break;
    case "inventory":  renderInventoryPage(); break;
    case "animals":    renderAnimalsPage(); break;
    case "stats":      renderStatsPage(); break;
    case "logs":       renderLogsPage(); break;
    case "user":       renderUserPage(); break;
    case "building":   sub ? renderBuildingDetail(sub) : renderDashboard(); break;
    default:           renderDashboard();
  }
}

// --- Boot --------------------------------------------------
async function boot(){
  try {
    // Hent defs + state (mock lige nu)
    const defsData  = await api.getDefs();
    const stateData = await api.getState();

    // Gem globalt
    window.defs   = { ...defsData };
    window.state  = { ...stateData };

    // Start UI
    renderHeader();
    renderSidebar();
    route();

  } catch(err){
    console.error(err);
    $("#main").innerHTML = `<section class="panel section"><div class="section-head">Fejl</div><div class="section-body"><div class="sub">Kunne ikke indlæse data.</div></div></section>`;
  }
}
boot();
