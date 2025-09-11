/* =========================================================
   World UI v4.3 — ren JS (SPA)
   Ændringer:
   - Tabs lysere + hvid tekst, link visited fix
   - Building detail: hero-tekst flugter top, durability progressbar,
     Actions-bjælke (Upgrade/Repair/… med priser/krav)
   - Research/Recipes: Cancel-knap + confirm
   - Sidebar header viser totals; version flyttet som card nederst i sidebar
   - Login/Logud ved player-info
   - Usynlig map-select side (route #/map-select)
   - Demo-billeder for Farm: medium på dashboard, big i detail
========================================================= */

// Tema toggle
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

// ===== DUMMY DATA (erstat med API) =====
const defsVersion = "v4.3.0";
const defs = {
  res: {
    "res.water": { name:"Water", emoji:"💧", type:"liquid", unit:"L",  max:500, spacePerUnit:1 },
    "res.oil":   { name:"Oil",   emoji:"🛢️", type:"liquid", unit:"L",  max:80,  spacePerUnit:1 },
    "res.milk":  { name:"Milk",  emoji:"🥛", type:"liquid", unit:"L",  max:40,  spacePerUnit:1 },
    "res.grain": { name:"Grain", emoji:"🌾", type:"solid",  unit:"kg", max:999, spacePerUnit:1 },
    "res.wood":  { name:"Wood",  emoji:"🪵", type:"solid",  unit:"stk",max:800, spacePerUnit:1 },
    "res.stone": { name:"Stone", emoji:"🪨", type:"solid",  unit:"stk",max:500, spacePerUnit:1 },
    "res.iron":  { name:"Iron",  emoji:"⚙️", type:"solid",  unit:"kg", max:120, spacePerUnit:1 },
    "res.food":  { name:"Food",  emoji:"🥫", type:"solid",  unit:"stk",max:300, spacePerUnit:1 },
    "res.money": { name:"Money", emoji:"🟡", type:"currency", unit:"", max:999999 }
  },

  bld: {
    "bld.farm.l2": {
      name:"Farm", icon:"🚜", level:2, desc:"A productive farming facility.",
      yield:[{res:"res.grain", amount:12, time:"1h"}],
      durability:0.85, footprintDelta:+5, animalCapDelta:+2,
      repairPrice:{"res.money":120},
      price:{"res.money":300},
      req:[{type:"rsd", id:"rsd.agri.adv", label:"Advanced Agriculture"}],
      // demo-billeder
      photoBig:"assets/art/bld.basecamp.l1.big.png",
      photoMedium:"assets/art/bld.basecamp.l1.medium.png"
    },
    "bld.barn.l1":{
      name:"Barn", icon:"🏚️", level:1, desc:"Storage for harvested crops.",
      yield:[], durability:0.95, footprintDelta:+10, animalCapDelta:+4,
      repairPrice:{"res.money":80}, price:{"res.money":500},
      req:[{type:"bld", id:"bld.farm.l3", label:"Farm Level 3"}]
    },
    "bld.sawmill.l1":{
      name:"Sawmill", icon:"🪚", level:1, desc:"Processes wood.",
      yield:[{res:"res.wood", amount:6, time:"1h"}], durability:0.90, footprintDelta:-4, animalCapDelta:0,
      repairPrice:{"res.money":90}, price:{"res.money":500},
      req:[{type:"bld", id:"bld.farm.l3", label:"Farm Level 3"}]
    },
    "bld.mine.l1":{
      name:"Mine", icon:"⛏️", level:1, desc:"Extracts stone.",
      yield:[{res:"res.stone", amount:4, time:"1h"}], durability:0.60, footprintDelta:-6, animalCapDelta:0,
      repairPrice:{"res.money":150}, price:{"res.money":1200},
      req:[{type:"rsd", id:"rsd.mining.t1", label:"Mining Techniques"}]
    },
    "bld.lake.l1":{
      name:"Lake", icon:"🧪", level:1, desc:"Provides water access.",
      yield:[{res:"res.water", amount:25, time:"1h"}], durability:0.80, footprintDelta:-2, animalCapDelta:0,
      repairPrice:{"res.money":60}, price:{"res.money":800},
      req:[{type:"rsd", id:"rsd.water.access", label:"Water Access"}]
    }
  },

  rsd: {
    "rsd.agri.adv": { name:"Advanced Agriculture", icon:"🎋", desc:"Better crop yield.", cost:{"res.money":600}, progress:1.0 },
    "rsd.mining.t1":{ name:"Mining Techniques",   icon:"⛏️", desc:"Improve extraction.", cost:{"res.money":300}, progress:0.60 },
    "rsd.forest.m1":{ name:"Forestry Management", icon:"🌲", desc:"Manage woodlands.",   cost:{"res.money":450}, progress:0.0 }
  },

  rcp: {
    // addons
    "rcp.farm.irrigation": { name:"Irrigation System", icon:"💧", effect:"+20% water efficiency", price:{"res.money":300, "res.wood":10}, kind:"addon", owned:true },
    "rcp.farm.fertilizer": { name:"Fertilizer Storage", icon:"🌱", effect:"+15% crop yield",     price:{"res.money":150, "res.stone":5}, kind:"addon", owned:false },
    "rcp.farm.greenhouse": { name:"Greenhouse Extension", icon:"🏡", effect:"Year-round production", price:{"res.money":800, "res.wood":20, "res.stone":10}, kind:"addon", owned:false },
    // jobs/recipes (til demo af Cancel)
    "rcp.job.wheat": { name:"Grow Wheat", icon:"🌾", kind:"job", desc:"Produces grain in 1h", consumes:{"res.water":5}, produces:{"res.grain":12}, duration:"1h", state:"idle" }
  }
};

let stateVersion = 1;
const state = {
  session:{ loggedIn:false },
  player:{ code:"Player", world:"W:W001", land:"L:L001", map:"M:M001", field:"F:10" },
  res:{ "res.water":245, "res.oil":12, "res.milk":8, "res.grain":156, "res.wood":315, "res.stone":34, "res.iron":7, "res.food":23, "res.money":1250 },
  owned:{ bld:{ "bld.farm.l2":true, "bld.barn.l1":true } },
  research:{ "rsd.agri.adv":true },
  footprint:{ used:18, total:40 },
  animalCap:{ used:3, total:10 }
};

// ===== Helpers =====
const $ = s => document.querySelector(s);
const fmt = n => typeof n==="number" ? n.toLocaleString("da-DK") : n;
function highlightQuickbar(page){ document.querySelectorAll(".quickbar a").forEach(a=>a.classList.toggle("active", a.dataset.page===page)); }
function sumBy(ids, fn){ return ids.reduce((acc,id)=>acc + (fn(id)||0), 0); }
function getBldMedium(id){ return id==="bld.farm.l2" ? (defs.bld[id].photoMedium) : ""; }
function getBldBig(id){ return id==="bld.farm.l2" ? (defs.bld[id].photoBig) : ""; }

// ===== Modal (confirm/login) =====
const modal = $("#modal"), modalBody = $("#modalBody"), modalActions = $("#modalActions");
$("#modalClose").addEventListener("click", closeModal);
modal.addEventListener("mousedown", e=>{
     if(e.target.closest(".modal__content")) closeModal(); });

document.addEventListener("keydown", e=>{
    if (e.key === "Escape" && !modal.hidden) closeModal();
});

function openConfirm({title, body, confirmText="OK", cancelText="Annullér", onConfirm}){
  modalBody.innerHTML = `<h3 style="margin-top:0">${title}</h3><div class="sub" style="margin-top:4px">${body}</div>`;
  modalActions.innerHTML = `
    <button class="btn" id="mCancel">${cancelText}</button>
    <button class="btn primary" id="mOk">${confirmText}</button>
  `;
  $("#mCancel").onclick = closeModal;
  $("#mOk").onclick = ()=>{ closeModal(); onConfirm && onConfirm(); };
  modal.hidden = false;
}
function openLogin(){
  modalBody.innerHTML = `
    <h3 style="margin-top:0">Log ind</h3>
    <div style="display:grid; gap:8px; margin-top:8px">
      <input placeholder="Brugernavn" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"/>
      <input placeholder="Kodeord" type="password" style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"/>
    </div>`;
  modalActions.innerHTML = `
    <button class="btn" id="mCancel">Annullér</button>
    <button class="btn primary" id="mOk">Log ind</button>
  `;
  $("#mCancel").onclick = closeModal;
  $("#mOk").onclick = ()=>{ state.session.loggedIn = true; closeModal(); renderHeader(); };
  modal.hidden = false;
}
function closeModal(){ modal.hidden = true; modalBody.innerHTML = ""; modalActions.innerHTML = ""; }

// ===== Header & Sidebar =====
function renderHeader(){
  // chips: water, wood, money + animal cap + footprint
  const order = ["res.water","res.wood","res.money"];
  const chips = order.map(id=>{
    const d=defs.res[id], cur=state.res[id]||0, max=d.max ?? "";
    return `<span class="res-chip">${d.emoji} ${fmt(cur)}${max?`<span class="max">/${fmt(max)}</span>`:""}</span>`;
  });
  const ac=state.animalCap||{used:0,total:0}, fp=state.footprint||{used:0,total:0};
  chips.push(`<span class="res-chip">🐾 ${fmt(ac.used)}<span class="max">/${fmt(ac.total)}</span></span>`);
  chips.push(`<span class="res-chip">⬛ ${fmt(fp.used)}<span class="max">/${fmt(fp.total)}</span></span>`);
  $("#headerRes").innerHTML = chips.join("");

  const p=state.player; $("#playerMeta").textContent = `${p.code}  ${p.world}  ${p.land}  ${p.map}  ${p.field}`;

  const auth = $("#authBtns");
  auth.innerHTML = state.session.loggedIn
    ? `<button class="btn" onclick="state.session.loggedIn=false; renderHeader()">Log ud</button>`
    : `<button class="btn primary" onclick="openLogin()">Log ind</button>`;
}

function renderSidebar(){
  const el = $("#sidebar");
  const liq = Object.keys(defs.res).filter(id => defs.res[id].type==="liquid");
  const sol = Object.keys(defs.res).filter(id => defs.res[id].type==="solid");
  const liqHave = sumBy(liq, id => state.res[id]||0);
  const liqMax  = sumBy(liq, id => defs.res[id].max||0);
  const solHave = sumBy(sol, id => state.res[id]||0);
  const solMax  = sumBy(sol, id => defs.res[id].max||0);

  el.innerHTML = `
  <section class="panel section res-panel">
    <div class="section-head">💧 Liquid Resources <span style="margin-left:auto;font-weight:600">${fmt(liqHave)}/${fmt(liqMax)}</span></div>
    <div class="section-body">
      ${liq.map(id => resRow(id)).join("")}
    </div>
  </section>
  <section class="panel section res-panel">
    <div class="section-head">🧱 Solid Resources <span style="margin-left:auto;font-weight:600">${fmt(solHave)}/${fmt(solMax)}</span></div>
    <div class="section-body">
      ${sol.map(id => resRow(id)).join("")}
    </div>
  </section>
  <section class="panel section">
    <div class="section-body"><div class="sub">UI v4.3 • prototype</div></div>
  </section>
  `;

  function resRow(id){
    const d=defs.res[id], have=state.res[id]||0;
    const thumb = ""; // evt. små ikoner senere
    return `
      <div class="row">
        <div class="left"><span>${d.emoji}</span><span>${d.name}</span></div>
        <div class="right"><strong>${fmt(have)}</strong></div>
      </div>
    `;
  }
}

// ===== Router =====
window.addEventListener("hashchange", route);
function route(){
  const hash = (location.hash.slice(2) || "dashboard");
  const [page, sub] = hash.split("/");
  // map-select side: vis overlay og returner
  
  highlightQuickbar(page);
  switch(page){
    case "dashboard": renderDashboard(); break;
    case "buildings": renderBuildingsPage(); break;
    case "research":  renderResearchPage(); break;
    case "inventory": renderInventoryPage(); break;
    case "animals":   renderAnimalsPage(); break;
    case "stats":     renderStatsPage(); break;
    case "logs":      renderLogsPage(); break;
    case "user":      renderUserPage(); break;
    case "map-select": renderMapSelectedPage(); break;
    case "building":  sub ? renderBuildingDetail(sub) : renderDashboard(); break;
    default:          renderDashboard();
  }
  stateVersion++;
  // vis versions i konsis form hvor du vil – vi har flyttet prototype-linjen til sidebar card.
}

// ===== Dashboard =====
function renderDashboard(){
  const main = $("#main");

  const blds = Object.entries(defs.bld).map(([id,d])=>{
    const owned=!!state.owned.bld[id];
    const reqTxt = renderReqLine(d);
    const thumb = getBldMedium(id);
    const title = `<a href="#/building/${id}" class="link">${d.name}</a>`;
    const thumbHtml = thumb ? `<img src="${thumb}" alt="" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border)">` : d.icon||"🏗️";
    return `
      <div class="item">
        <div class="icon">${thumbHtml}</div>
        <div>
          <div class="title">${title}</div>
          <div class="sub">Level ${d.level}</div>
          ${reqTxt}
        </div>
        <div class="right">
          ${owned ? `<span class="badge owned">Owned</span>` : `<button class="btn primary" onclick="fakeBuild('${id}')">Build</button>`}
        </div>
      </div>
    `;
  }).join("");

  const rsd = Object.entries(defs.rsd).map(([id,d])=>{
    const completed = d.progress>=1 || !!state.research[id];
    const pct = Math.round((completed?1:d.progress||0)*100);
    const btn = completed ? `<span class="badge">✓ Complete</span>`
      : (pct>0 ? `<div style="display:flex;gap:8px"><button class="btn" onclick="continueResearch('${id}')">Continue</button><button class="btn" onclick="cancelResearch('${id}')">Cancel</button></div>`
                : `<button class="btn primary" onclick="startResearch('${id}')">Start</button>`);
    return `
      <div class="item">
        <div class="icon">${d.icon||"🧪"}</div>
        <div>
          <div class="title">${d.name}</div>
          <div class="sub">${renderCostColored(d.cost)}</div>
          <div class="progress"><span style="width:${pct}%"></span><div class="pct">${pct}%</div></div>
        </div>
        <div class="right">${btn}</div>
      </div>
    `;
  }).join("");

  // Production Overview (simpel aggregering pr time)
  const prodRows = Object.values(defs.bld).flatMap(b => (b.yield||[]).map(y=>y));
  const prodAgg = {};
  for (const y of prodRows){
    prodAgg[y.res] = (prodAgg[y.res]||0) + y.amount;
  }
  const prodList = Object.entries(prodAgg).map(([rid,amt])=>{
    const d=defs.res[rid]||{name:rid,emoji:""};
    return `<div class="item"><div class="icon">${d.emoji||"⚙️"}</div><div class="title">+${amt} ${d.name} / h</div></div>`;
  }).join("") || `<div class="sub" style="padding:10px 12px">Ingen produktion endnu.</div>`;

  main.innerHTML = `
    <section class="panel section">
      <div class="section-head">🏗️ Buildings</div>
      <div class="section-body">${blds}</div>
    </section>
    <section class="panel section">
      <div class="section-head">🔬 Research</div>
      <div class="section-body">${rsd}</div>
    </section>
    <section class="panel section">
      <div class="section-head">📊 Production Overview</div>
      <div class="section-body">${prodList}</div>
    </section>
  `;
}

// ===== Building Detail =====
function renderBuildingDetail(id){
  const d = defs.bld[id];
  if (!d){ location.hash = "#/dashboard"; return; }
  const main = $("#main");

  // header linje
  const header = `
    <div class="section-head">
      <a href="#/dashboard" class="link">← Back</a>
      <div style="margin-left:10px;font-weight:800">Building</div>
    </div>`;

  // production
  const prod = (d.yield||[]).map(y=>`+${y.amount} ${(defs.res[y.res]?.name)||y.res} / ${y.time}`).join(" • ") || "-";
  // durability
  const durPct = Math.round((d.durability||0)*100);
  const fpTxt = ((d.footprintDelta||0)>=0?"+":"")+(d.footprintDelta||0)+" footprint";
  const acTxt = ((d.animalCapDelta||0)>=0?"+":"")+(d.animalCapDelta||0)+" animal cap";
  const reqLine = renderReqLine(d);
  const missing = missingRequirements(d);

  const photoUrl = getBldBig(id) || "";

  // hero + actions + tabs
  main.innerHTML = `
    <section class="panel section">
      ${header}
      <div class="section-body">
        <div class="detail-hero">
          <div class="photo" style="background-image:url('${photoUrl}')"></div>
          <div>
            <div style="font-weight:800;font-size:18px;margin-bottom:6px;">
              ${d.icon||"🏗️"} ${d.name} <span class="sub" style="margin-left:8px;">Level ${d.level}</span>
            </div>
            <div class="sub" style="margin:0 0 10px">${d.desc||""}</div>
            <div class="statgrid">
              <div class="statitem"><div class="label">Production</div><div class="value">${prod}</div></div>
              <div class="statitem"><div class="label">Durability</div>
                <div class="value"><div class="progress"><span style="width:${durPct}%"></span><div class="pct">${durPct}%</div></div></div>
              </div>
              <div class="statitem"><div class="label">Capacity</div><div class="value">${fpTxt} • ${acTxt}</div></div>
              <div class="statitem"><div class="label">Requirements</div><div class="value">${reqLine || "-"}</div></div>
            </div>
            ${missing ? `<div class="sub" style="margin-top:8px;color:var(--bad)">${missing}</div>`:""}
          </div>
        </div>

        <div class="actions-bar">
          <button class="btn primary" id="btnUpgrade">Upgrade</button>
          <button class="btn" id="btnRepair">Repair</button>
          <button class="btn" id="btnDemolish">Demolish</button>
          <button class="btn" id="btnMove">Move</button>
          <div class="actions-meta" id="actionsMeta">${renderCostColored(d.price,true)}</div>
        </div>

        <div class="tabs" style="margin-top:12px;">
          <button class="tab active" data-tab="addons">+ Addons</button>
          <button class="tab" data-tab="research">Research</button>
          <button class="tab" data-tab="recipes">Recipes</button>
          <button class="tab" data-tab="special">Special</button>
        </div>
        <div id="tabContent"></div>
      </div>
    </section>
  `;

  // Actions: Upgrade/Repair (confirm)
  $("#btnRepair").onclick = ()=>{
    openConfirm({
      title:"Repair building?",
      body:`Price: ${renderCostColored(d.repairPrice,true)}`,
      confirmText:"Repair",
      onConfirm:()=>{ if(canAfford(d.repairPrice).ok){ spend(d.repairPrice); d.durability=1.0; renderHeader(); renderBuildingDetail(id);} }
    });
  };
  $("#btnUpgrade").onclick = ()=>{
    openConfirm({
      title:"Upgrade building?",
      body:`Price: ${renderCostColored(d.price,true)}<br/>${missing? `<span class="price-bad">${missing}</span>`:""}`,
      confirmText:"Upgrade",
      onConfirm:()=>{/* TODO: rigtig upgrade-logik */ alert("Demo: upgrade ikke implementeret");}
    });
  };

  // tabs
  switchTab("addons");
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      switchTab(btn.dataset.tab);
    });
  });

  function switchTab(name){
    const tc = $("#tabContent");
    if (name==="addons"){
      const list = Object.entries(defs.rcp)
        .filter(([,x])=>x.kind==="addon")
        .map(([rid,x])=>addonRow(rid,x,id)).join("");
      tc.innerHTML = `
        <section class="panel section">
          <div class="section-head">🔧 Building Addons</div>
          <div class="section-body">${list || "<div class='sub'>Ingen</div>"}</div>
        </section>`;
    } else if (name==="research"){
        tc.innerHTML = renderResearchListForBuilding(family, id);
    } else if (name==="recipes"){
      const j = defs.rcp["rcp.job.wheat"];
      const afford = canAfford(j.consumes);
      const price = renderCostColored(j.consumes,true);
      const btns = j.state==="running"
        ? `<button class="btn" onclick="cancelJob('rcp.job.wheat','${id}')">Cancel</button>`
        : `<button class="btn ${afford.ok?'primary':''}" ${afford.ok?'':'disabled'} onclick="startJob('rcp.job.wheat','${id}')">Start</button>`;
      tc.innerHTML = `
        <section class="panel section">
          <div class="section-head">⚒ Jobs / Recipes</div>
          <div class="section-body">
            <div class="item">
              <div class="icon">${j.icon}</div>
              <div>
                <div class="title">${j.name}</div>
                <div class="sub">${j.desc}</div>
                <div class="sub">Consumes: ${price} • Produces: +${j.produces["res.grain"]} Grain</div>
              </div>
              <div class="right">${btns}</div>
            </div>
          </div>
        </section>`;
    } else {
      tc.innerHTML = `
        <section class="panel section">
          <div class="section-head">⭐ Special</div>
          <div class="section-body"><div class="sub">TODO</div></div>
        </section>`;
    }
  }

  function addonRow(rid, x, backId){
    const price = renderCostColored(x.price,true);
    const afford = canAfford(x.price);
    const btn = x.owned ? `<span class="badge owned">Owned</span>` :
      `<button class="btn ${afford.ok?'primary':''}" ${afford.ok?'':'disabled'} onclick="confirmBuyAddon('${rid}','${backId}')">${afford.ok?'Buy':'Need more'}</button>`;
    return `
      <div class="item">
        <div class="icon">${x.icon||"🧩"}</div>
        <div>
          <div class="title">${x.name}</div>
          <div class="sub">${x.effect||""}</div>
        </div>
        <div class="right">
          <div>${price}</div>
          ${btn}
        </div>
      </div>
    `;
  }
}

// ===== Actions (DUMMY) =====
function fakeBuild(id){ state.owned.bld[id]=true; renderHeader(); renderSidebar(); renderBuildingsPage(); }
function startResearch(id){ defs.rsd[id].progress=0.1; renderResearchPage(); }
function continueResearch(id){ const cur=defs.rsd[id].progress||0; defs.rsd[id].progress=Math.min(1,cur+0.2); if(defs.rsd[id].progress>=1) state.research[id]=true; renderResearchPage(); }
function cancelResearch(id){
  openConfirm({title:"Cancel research?", body:"Ingen refund i demo.", confirmText:"Cancel research", onConfirm:()=>{ defs.rsd[id].progress=0; renderResearchPage(); }});
}
function confirmBuyAddon(rid, backTo){ const txt=renderCostColored(defs.rcp[rid].price,true); openConfirm({title:"Buy addon?", body:`Price: ${txt}`, confirmText:"Buy", onConfirm:()=>buyAddon(rid,backTo)}); }
function buyAddon(rid, backTo){ const cost=defs.rcp[rid].price||{}; if(canAfford(cost).ok){ spend(cost); defs.rcp[rid].owned=true; renderHeader(); renderBuildingDetail(backTo);} }
function startJob(rid, backId){ const j=defs.rcp[rid]; if(canAfford(j.consumes).ok){ spend(j.consumes); j.state="running"; renderBuildingDetail(backId); } }
function cancelJob(rid, backId){ openConfirm({title:"Cancel job?", body:"Stopper jobbet (ingen refund i demo).", confirmText:"Stop", onConfirm:()=>{ defs.rcp[rid].state="idle"; renderBuildingDetail(backId);} }); }

// ===== Cost helpers =====
function canAfford(price){
  const miss=[];
  for(const [rid,need] of Object.entries(price||{})){
    if(rid.startsWith("res.")){
      const have=state.res[rid]||0;
      if(have<need) miss.push({rid,need,have});
    }
  }
  return {ok: miss.length===0, miss};
}
function spend(price){
  for(const [rid,need] of Object.entries(price||{})){
    if(rid.startsWith("res.")) state.res[rid]=(state.res[rid]||0)-need;
  }
}
function renderCostColored(map, inline=false){
  if(!map) return "";
  const parts = Object.entries(map).map(([rid,need])=>{
    if(rid.startsWith("res.")){
      const d=defs.res[rid], have=state.res[rid]||0, ok=have>=need;
      const haveHtml = `<span class="${ok?'price-ok':'price-bad'}">${d.emoji} ${have}</span>`;
      const needHtml = `<span class="sub" style="opacity:.8">/ ${need}</span>`;
      return haveHtml + needHtml;
    }
    // tekst-krav (fx "Farm L3")
    return `<span title="${rid}">🛈 ${map[rid]}</span>`;
  });
  return inline? parts.join(" • ") : parts.join(" ");
}
function renderReqLine(d){
  const price = renderCostColored(d.price,true);
  const reqs = (d.req||[]).map(r=>{
    const done = (r.type==="rsd" && state.research[r.id]) || (r.type==="bld" && state.owned.bld[r.id]);
    const cls = done?'price-ok':'price-bad';
    const href = r.type==="rsd" ? "#/research" : "#/buildings";
    return `<a class="${cls}" href="${href}" title="${r.id}">${r.label}</a>`;
  }).join(" • ");
  const both = [price, reqs].filter(Boolean).join(" • ");
  return both? `<div class="price-pill">${both}</div>` : "";
}
function missingRequirements(d){
  const lacks = (d.req||[]).filter(r=> (r.type==="rsd" && !state.research[r.id]) || (r.type==="bld" && !state.owned.bld[r.id]));
  if(!lacks.length) return "";
  const list = lacks.map(r=> `<a href="${r.type==='rsd'?'#/research':'#/buildings'}">${r.label}</a>`).join(", ");
  return `Mangler krav: ${list}`;
}

// ===== Pages =====
function renderBuildingsPage(){
  const main=$("#main");
  const blds = Object.entries(defs.bld).map(([id,d])=>{
    const owned=!!state.owned.bld[id];
    const reqTxt = renderReqLine(d);
    const thumb = getBldMedium(id);
    const icon = thumb ? `<img src="${thumb}" alt="" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border)">` : d.icon||"🏗️";
    return `
      <div class="item">
        <div class="icon">${icon}</div>
        <div>
          <div class="title"><a href="#/building/${id}" class="link">${d.name}</a></div>
          <div class="sub">Level ${d.level}</div>
          ${reqTxt}
        </div>
        <div class="right">${owned?`<span class="badge owned">Owned</span>`:`<button class="btn primary" onclick="fakeBuild('${id}')">Build</button>`}</div>
      </div>
    `;
  }).join("");
  main.innerHTML = `<section class="panel section"><div class="section-head">🏗️ Buildings</div><div class="section-body">${blds}</div></section>`;
}
function renderResearchPage(){
  const main=$("#main");
  const rsd = Object.entries(defs.rsd).map(([id,d])=>{
    const completed=d.progress>=1 || !!state.research[id];
    const pct=Math.round((completed?1:d.progress||0)*100);
    const btn = completed
      ? `<span class="badge">✓ Complete</span>`
      : (pct>0
          ? `<div style="display:flex;gap:8px"><button class="btn" onclick="continueResearch('${id}')">Continue</button><button class="btn" onclick="cancelResearch('${id}')">Cancel</button></div>`
          : `<button class="btn primary" onclick="startResearch('${id}')">Start</button>`);
    return `
      <div class="item">
        <div class="icon">${d.icon||"🧪"}</div>
        <div>
          <div class="title">${d.name}</div>
          <div class="sub">${renderCostColored(d.cost)}</div>
          <div class="progress"><span style="width:${pct}%"></span><div class="pct">${pct}%</div></div>
        </div>
        <div class="right">${btn}</div>
      </div>
    `;
  }).join("");
  main.innerHTML = `<section class="panel section"><div class="section-head">🔬 Research</div><div class="section-body">${rsd}</div></section>`;
}
function renderInventoryPage(){
  const main=$("#main");
  const liq = Object.keys(defs.res).filter(id=>defs.res[id].type==="liquid");
  const sol = Object.keys(defs.res).filter(id=>defs.res[id].type==="solid");
  const animals = []; // placeholder

  const block = (title, ids)=>`
    <section class="panel section">
      <div class="section-head">${title}</div>
      <div class="section-body">
        ${ids.map(id=>{
          const d=defs.res[id], amt=state.res[id]||0;
          const space = (d.spacePerUnit||1)*amt;
          const unit = d.unit ? ` ${d.unit}` : "";
          return `<div class="item"><div class="icon">${d.emoji}</div><div><div class="title">${d.name}</div><div class="sub">Unitspace: ${space}</div></div><div class="right"><strong>${fmt(amt)}${unit}</strong></div></div>`;
        }).join("") || `<div class="sub">Ingen</div>`}
      </div>
    </section>
  `;

  main.innerHTML = block("💧 Liquid", liq) + block("🧱 Solid", sol) + block("🐄 Animals", animals);
}
function renderAnimalsPage(){ $("#main").innerHTML = `<section class="panel section"><div class="section-head">🐄 Animals</div><div class="section-body"><div class="sub">TODO</div></div></section>`; }
function renderStatsPage(){ $("#main").innerHTML = `<section class="panel section"><div class="section-head">📊 Statistics</div><div class="section-body"><div class="sub">TODO</div></div></section>`; }
function renderLogsPage(){ $("#main").innerHTML = `<section class=" panel section"><div class="section-head">📝 Logs</div><div class="section-body"><div class="sub">TODO</div></div></section>`; }
function renderUserPage(){ const p=state.player; $("#main").innerHTML = `<section class="panel section"><div class="section-head">👤 User</div><div class="section-body"><div class="item"><div class="title">Code</div><div class="right">${p.code}</div></div><div class="item"><div class="title">World</div><div class="right">${p.world}</div></div><div class="item"><div class="title">Land</div><div class="right">${p.land}</div></div><div class="item"><div class="title">Map</div><div class="right">${p.map}</div></div><div class="item"><div class="title">Field</div><div class="right">${p.field}</div></div></div></section>`; }

function renderMapSelectPage(){
  const main = document.getElementById("main");
  main.innerHTML = `
    <section class="panel section">
      <div class="section-head">🗺️ Vælg startfelt</div>
      <div class="section-body">
        <div class="item">
          <div class="icon">🌍</div>
          <div>
            <div class="title">World / Map / Land / Field</div>
            <div class="sub">(Placeholder – vælg senere via rigtig kort)</div>
          </div>
          <div class="right">
            <a href="#/dashboard" class="btn">Tilbage</a>
            <button class="btn primary" onclick="location.hash='#/dashboard'">Bekræft</button>
          </div>
        </div>
      </div>
    </section>
  `;
  highlightQuickbar(""); // ingen menuvalg markeres
}
// ===== Boot =====
function boot(){ renderHeader(); renderSidebar(); route();}
boot();
