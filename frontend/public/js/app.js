/* =========================================================
   app.js
   - Boot + routing + header/sidebar render
   - Ubrudt funktionalitet fra v4.3, men via split-filer
========================================================= */

//window.KvReady = kvapi.loadKV(true); // Hvis noget brokker sig med kvapi, så "tænd" denne.
window.dataReady = dataApi.loadData();   // start load af træet
window.API_BASE = '/world-spil/backend/api'; 

// Stub, så vi ikke crasher hvis login-UI ikke er defineret endnu
window.renderAuthHeader = window.renderAuthHeader || function(){};

// Tema toggle (samme knap i topbaren)
$("#themeToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

// --- Header render (chips + player + login/logud) ----------
window.renderHeader = () => {
  // Chips: water, wood, money
  const stateSolid = window.data.state.inv.solid;
  const stateLiquid = window.data.state.inv.liquid;
  const defs = window.data.defs.res;
  const lang = window.data.lang;
  
    // AnimalCap + Footprint
  const ac=state.animalCap||{used:0,total:0} // DEMO ANIMAL CAP 
  //const fp=state.footprint||{used:0,total:0}; // DEMO DATA FOOTPRINT
  const footprint = window.data.state.cap.footprint ?? 0;
  const fp_total = footprint.base + footprint.bonus;
  const fp_used = Math.abs(footprint.used);
  const animal_cap = window.data.state.cap.animal_cap ?? 0;
  const ac_total = animal_cap.base + animal_cap.bonus;
  const ac_used = Math.abs(animal_cap.used);

  const chips = (
    `<span class="res-chip" data-tip="${defs.wood.name}">${defs.wood.emoji} ${stateSolid.wood}</span>
    <span class="res-chip" data-tip="${defs.stone.name}">${defs.stone.emoji} ${stateSolid.stone}</span>
    <span class="res-chip" data-tip="${defs.firewood.name}">${defs.firewood.emoji} ${stateSolid.firewood}</span>
    <span class="res-chip" data-tip="${defs.water.name}">${defs.water.emoji} ${stateLiquid.water}</span>
    <span class="res-chip" data-tip="${defs.money.name}">💰 ${stateSolid.money}</span>
    <span class="res-chip" data-tip="Cap på dyr">🐾 ${fmt(ac_used)}<span class="max">/${fmt(ac_total)}</span></span>
    <span class="res-chip" data-tip="${lang["ui.footprint.h1"]}">⬛ ${fmt(fp_used)}<span class="max">/${fmt(fp_total)}</span></span>`
  );
   

   $("#headerRes").innerHTML = chips;
   bindResChipTooltips();

  // --- læg DB-brugerdata i topbaren (hvis hentet) ---
const u = (window.state && state.user) ? state.user : null;
if (u) {
  const nameEl = document.getElementById('playerName');
  const locEl  = document.getElementById('playerLoc');

  if (nameEl) nameEl.textContent = 'World id:';
  if (locEl)  locEl.textContent  = `${u.world_id ?? '-'} / ${u.map_id ?? '-'} / ${u.field_id ?? '-'}`;
}

function bindResChipTooltips() {
  // Én global tooltip
  let tip = document.getElementById('ws-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'ws-tooltip';
    Object.assign(tip.style, {
      position: 'fixed',
      zIndex: '99999',
      background: '#333',
      color: '#fff',
      padding: '4px 8px',
      borderRadius: '6px',
      fontSize: '12px',
      lineHeight: '1.2',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 120ms',
      maxWidth: '280px',
      boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    });
    document.body.appendChild(tip);
  }

  // Fjern gamle handlers (hvis du re-render)
  document.querySelectorAll('.res-chip[data-tip]').forEach(el => {
    el.onmouseenter = null;
    el.onmousemove  = null;
    el.onmouseleave = null;

    el.addEventListener('mouseenter', (e) => {
      tip.textContent = el.getAttribute('data-tip') || '';
      tip.style.opacity = '1';
      position(e);
    });

    el.addEventListener('mousemove', position);

    el.addEventListener('mouseleave', () => {
      tip.style.opacity = '0';
    });
  });

  function position(e) {
    const tipEl = document.getElementById('ws-tooltip');
    if (!tipEl) return;
    // offset fra cursor
    let left = e.clientX + 12;
    let top  = e.clientY + 16;

    // hold inde i viewport
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;

    if (left + w > vw - 8) left = vw - w - 8;
    if (top + h > vh - 8)  top  = vh - h - 8;

    tipEl.style.left = left + 'px';
    tipEl.style.top  = top  + 'px';
  }
}

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
  const el   = $("#sidebar");
  const defs = window?.data?.defs?.res || {};
  const inv  = window?.data?.state?.inv || { solid:{}, liquid:{} };
  const cap  = window?.data?.state?.cap || { solid:{used:0,base:0}, liquid:{used:0,base:0} };
  const lang = window?.data?.lang || {};

  const invSolid  = inv.solid  || {};
  const invLiquid = inv.liquid || {};

  // Kun IDs der findes i defs
  const solidIds  = Object.keys(invSolid).filter(id  => defs[id]);
  const liquidIds = Object.keys(invLiquid).filter(id => defs[id]);

  const fmtHave = (bag, id) => {
    const v = Number(bag[id]);
    return Number.isFinite(v) ? v : 0;
  };

  const resRow = (id, bag) => {
    const d    = defs[id];
    const have = fmtHave(bag, id);
    return `
      <div class="row">
        <div class="left"><span>${d.emoji ?? ""}</span><span>${d.name ?? id}</span></div>
        <div class="right"><strong>${fmt(have)}</strong></div>
      </div>`;
  };

  const liqHave = Number(cap.liquid?.used) || 0;
  const liqMax  = Number(cap.liquid?.base) || 0;
  const solHave = Number(cap.solid?.used)  || 0;
  const solMax  = Number(cap.solid?.base)  || 0;

  el.innerHTML = `
    <section class="panel section res-panel">
      <div class="section-head">💧 ${lang["ui.liquid.h1"] ?? "Liquid"}<span style="margin-left:auto;font-weight:600">${fmt(liqHave)}/${fmt(liqMax)}</span></div>
      <div class="section-body">
        ${liquidIds.map(id => resRow(id, invLiquid)).join("") || `<div class="sub">Ingen</div>`}
      </div>
    </section>

    <section class="panel section res-panel">
      <div class="section-head">🧱 ${lang["ui.solid.h1"] ?? "Solid"}<span style="margin-left:auto;font-weight:600">${fmt(solHave)}/${fmt(solMax)}</span></div>
      <div class="section-body">
        ${solidIds.map(id => resRow(id, invSolid)).join("") || `<div class="sub">Ingen</div>`}
      </div>
    </section>

    <section class="panel section">
      <div class="section-body"><div class="sub">Version: ${window.data.config.game_data.version} • prototype</div></div>
    </section>
  `;

  // Insert Owned Animals box between resources and version
  try {
    const aniState = window?.data?.state?.ani || {};
    const aniDefs  = window?.data?.defs?.ani || {};
    const aniCap   = window?.data?.state?.cap?.animal_cap || { used:0, total:0 };
    
    const ownedAnimals = Object.entries(aniState)
        .filter(([id, a]) => (a?.quantity || 0) > 0)
        .map(([id, a]) => {
            const key = String(id).replace(/^ani\./, '');
            const def = aniDefs[key] || { name: key, emoji: '🐾' };
            return { name: def.name || key, emoji: def.emoji || '🐾', qty: Number(a.quantity || 0) };
        });

    // =====================================================================
    // RETTELSE: Vi bygger altid sektionen, men ændrer indholdet.
    // =====================================================================
    const animalsBox = document.createElement('section');
    animalsBox.className = 'panel section res-panel';

    const animalsBodyHTML = ownedAnimals.length > 0
        ? ownedAnimals.map(a => `
            <div class="row">
                <div class="left"><span>${a.emoji}</span><span>${a.name}</span></div>
                <div class="right"><strong>${fmt(a.qty)}</strong></div>
            </div>
        `).join("")
        : `<div class="sub" style="padding: 8px 10px;">Ingen</div>`; // Viser "Ingen" hvis listen er tom

    animalsBox.innerHTML = `
        <div class="section-head">🐾 Animals<span style="margin-left:auto;font-weight:600">${fmt(aniCap.used)}/${fmt(aniCap.total)}</span></div>
        <div class="section-body">
            ${animalsBodyHTML}
        </div>
    `;

    // Indsæt den nye boks efter den sidste ressource-sektion
    const allSections = document.querySelectorAll('#sidebar .section.res-panel');
    const lastResourceSection = allSections[allSections.length - 1];
    if (lastResourceSection) {
        // Indsæt efter den sidste res-panel for at holde rækkefølgen
        lastResourceSection.parentNode.insertBefore(animalsBox, lastResourceSection.nextSibling);
    } else {
        // Fallback, hvis der (af en eller anden grund) ikke er nogen ressource-sektioner
        const sidebar = document.getElementById('sidebar');
        // Indsæt før version-sektionen, hvis den findes
        const versionSection = sidebar.querySelector('.section:not(.res-panel)');
        if (versionSection) {
            sidebar.insertBefore(animalsBox, versionSection);
        } else {
            sidebar.appendChild(animalsBox);
        }
    }

    const sidebar = el;
    // Find the version panel (the one containing 'Version:')
    const versionPanel = Array.from(sidebar.querySelectorAll('.panel.section')).find(sec => /Version:\s*/i.test(sec.textContent || ''));
    if (versionPanel) sidebar.insertBefore(animalsBox, versionPanel);
    else sidebar.appendChild(animalsBox);
  } catch {}
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
    case "recipes":    renderRecipesPage(); break; // <-- NY LINJE
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
    // ← Vent på at manifest er indlæst (ellers falder alt bare tilbage til placeholder)
    if (window.loadArtManifest) await window.loadArtManifest();

    // 1) Hent defs + state (demo/mock)
    /*const defsData  = await api.getDefs();
    const stateData = await api.getState();*/

    /*// Bevar objekter, MERGE ind
    window.defs  = window.defs  || {};
    Object.assign(window.defs, defsData || {});

    window.state = window.state || {};
    Object.assign(window.state, stateData || {});*/

    // 2) Session + profil
    try {
      const sess = await api.session();
      if (sess?.ok && sess.data?.loggedIn) {
        state.session = state.session || {};
        state.session.loggedIn = true;
        state.session.userId   = sess.data.userId || null;
        state.session.username = sess.data.username || null;

        try {
          const prof = await api.getUser?.();
          if (prof?.ok) state.user = prof.data;
        } catch(_){}
      }
    } catch(_) {}
     
    // 3) Start UI
    await window.dataReady;

    renderHeader();
    renderAuthHeader?.();
    renderSidebar?.();

    if (!location.hash) location.hash = "#/dashboard";
    route();

  } catch(err){
    console.error(err);
    $("#main").innerHTML = `
      <section class="panel section">
        <div class="section-head">Fejl</div>
        <div class="section-body"><div class="sub">Kunne ikke indlæse data.</div></div>
      </section>`;
  }
}


boot();

/* --- AUTH UI: append-only og ikke-invasivt --- */
(function(){
  if (window.__AUTH_INSTALLED__) return;
  window.__AUTH_INSTALLED__ = true;

  function ensureShell(){
    if (!document.getElementById("header")) { const h=document.createElement("header"); h.id="header"; h.className="topbar"; document.body.prepend(h); }
    if (!document.getElementById("main"))   { const m=document.createElement("main");   m.id="main";   m.className="main";   document.body.appendChild(m); }
    if (!document.getElementById("nav"))    { const n=document.createElement("nav");    n.id="nav";    n.className="bottombar"; document.body.appendChild(n); }
  }

  function renderAuthHeader(){
    const el = document.getElementById("authBtns"); if (!el) return;
    const s = (window.state && state.session) || { loggedIn:false };
    el.querySelector(".auth")?.remove(); // ryd kun auth-området
    const div = document.createElement("div");
    div.className = "auth";
    div.style.marginLeft = "auto";
    div.innerHTML = s.loggedIn
      ? `<span class="muted" style="margin-right:8px">👤 ${s.username||"Bruger"}</span><button class="btn" id="btnLogout">Log ud</button>`
      : `<button class="btn" id="btnOpenLogin">Log ind</button><button class="btn secondary" id="btnOpenRegister">Opret</button>`;
    el.appendChild(div);

    document.getElementById("btnLogout")?.addEventListener("click", async ()=>{
      const r = await api.logout();
      if (r?.ok){ state.session = { loggedIn:false, userId:null, username:null }; renderAuthHeader(); }
    });
    
    document.getElementById("btnOpenLogin")?.addEventListener("click", ()=>{
      openConfirm({
        title:"Log ind",
        body:`<div style="display:grid;gap:8px"><input id="loginUser" placeholder="Brugernavn"><input id="loginPass" placeholder="Kodeord" type="password"></div>`,
        confirmText:"Log ind", cancelText:"Luk",
        onConfirm: async () => {
  const root = document.getElementById("modalBody") || document;

  // find brugernavn + kodeord robust (prøv flere selektorer)
  const uEl = root.querySelector('#loginUser, [name="username"], input[type="text"]');
  const pEl = root.querySelector('#loginPass, [name="password"], input[type="password"]');

  const u = (uEl?.value || "").trim();
  const p =  pEl?.value || "";

  if (!u || !p) {
    // giv tydelig fejl hvis noget går galt
    openConfirm({ title: "Manglende data", body: "Udfyld brugernavn og kodeord." });
    return;
  }

  const resp = await api.login(u, p);
  if (resp?.ok) {
    state.session = { loggedIn: true, userId: resp.data.userId, username: resp.data.username || u }; 
    renderAuthHeader() // renderAuthHeader() har jeg selv tilføjet for at autoopdatere login status
    const box = document.getElementById('authBtns');

    renderHeader();
  } else {
    openConfirm({ title: "Login fejlede", body: resp?.error?.message || "Forkert brugernavn/kodeord" });
  }
}
      });
    });

    document.getElementById("btnOpenRegister")?.addEventListener("click", ()=>{
      openConfirm({
        title:"Opret bruger",
        body:`<div style="display:grid;gap:8px"><input id="regUser" placeholder="Brugernavn"><input id="regEmail" placeholder="Email" type="email"><input id="regPass" placeholder="Kodeord" type="password"></div>`,
        confirmText:"Opret", cancelText:"Luk",
onConfirm: async () => {
  const root = document.getElementById("modalBody");
  const uEl  = root ? root.querySelector("#regUser")  : null;
  const eEl  = root ? root.querySelector("#regEmail") : null;
  const pEl  = root ? root.querySelector("#regPass")  : null;
  const u    = uEl?.value?.trim() || "";
  const e    = eEl?.value?.trim() || "";
  const p    = pEl?.value || "";
  if (!u || !e || !p) {
    openConfirm({ title:"Manglende data", body:"Udfyld brugernavn, email og kodeord." });
    return;
  }
  const resp = await api.register(u, p, e);
  if (resp?.ok) {
    state.session = { loggedIn:true, userId:resp.data.userId, username:resp.data.username || u };
    const box = document.getElementById('authBtns');

    renderHeader();
  } else {
    openConfirm({ title:"Oprettelse fejlede", body: resp?.error?.message || "Tjek input" });
  }
}
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    ensureShell();
    // session check uden at røre dine demo-data
    try {
      const s = await api.session();
      state.session = { loggedIn: !!s?.data?.loggedIn, userId: s?.data?.userId||null, username: s?.data?.username||null };
    } catch(_) {}
    renderAuthHeader();
  });
})();

// Lille helper: lav querystring og kald fetch
async function apiGet(url, params = {}) {
  const usp = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const res = await fetch(url + (usp.toString() ? ('?' + usp.toString()) : ''), {
    method: 'GET',
    credentials: 'include', // send cookies/session
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
