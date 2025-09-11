/* =========================================================
   services/api.js
   - Ét sted til data-adgang
   - Lige nu: MOCK (samme data som din v4.3)
   - Senere: byt ud med rigtige fetch() til PHP (samme metode-navne)
========================================================= */

// Flag: mock-tilstand (true = brug hardcodet data)
const MOCK = false;

// Base-URL til backend API (når du kobler på PHP)
const API_BASE = "../../backend/api/"; // ændres senere når du er klar
/*
// --- Offentlige API-funktioner (bruges af app.js / UI) ----
window.api = {
  // Hent definitions (res, bld, rsd, rcp)
  async getDefs() {
    if (MOCK) return mockDefs();
    const rsp = await fetch(API_BASE + "defs/all.php");
    if (!rsp.ok) throw new Error("defs failed");
    return rsp.json();
  },

  // Hent spillerens state
  async getState() {
    if (MOCK) return mockState();
    const rsp = await fetch(API_BASE + "state/load.php", { credentials: "include" });
    if (!rsp.ok) throw new Error("state failed");
    return rsp.json();
  },

  // Actions (rigtige endpoints senere)
  async action(name, payload) {
    if (MOCK) return mockAction(name, payload);
    const rsp = await fetch(API_BASE + "actions/" + name + ".php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload || {})
    });
    return rsp.json();
  }
};*/

// --- MOCK DATA (kopi fra v4.3 – trimmet en smule) ----------- BRUGER RIGTIGE TAL NU
/*async function mockDefs() {
  await window.dataReady;

  const res = {};

  // Liquid ressourcer
  for (const [key, amount] of Object.entries(window.data.state.inv.liquid)) {
    const rid = `res.${key}`;
    const getDef = (k) => window.data.defs.res[k] 
                  || window.data.defs.res[`res.${k}`] 
                  || window.data.defs.res[k.replace(/^res\./, '')];

const def = getDef(key);   // <— brug 'key' (uden prefix) her
    res[rid] = {
      type: "liquid",
      amount: amount ?? 0,
      name: def.name ?? key,
      desc: def.desc ?? "",
      unit: def.unit ?? "L",            // fallback
      unitSpace: def.unitSpace ?? null, // fallback
      max: def.max ?? 1000,             // placeholder
      emoji: def.emoji ?? "💧"          // placeholder
    };
  }

  // Solid ressourcer
  for (const [key, amount] of Object.entries(window.data.state.inv.solid)) {
    const rid = `res.${key}`;
    const getDef = (k) => window.data.defs.res[k] 
                  || window.data.defs.res[`res.${k}`] 
                  || window.data.defs.res[k.replace(/^res\./, '')];

const def = getDef(key);   // <— brug 'key' (uden prefix) her
    res[rid] = {
      type: "solid",
      amount: amount ?? 0,
      name: def.name ?? key,
      desc: def.desc ?? "",
      unit: def.unit ?? "kg",           // fallback
      unitSpace: def.unitSpace ?? null,
      max: def.max ?? 1000,             // placeholder
      emoji: def.emoji ?? "🪵"          // placeholder
    };
  }


  
  
  return { res,
    version: "v4.5.0",

    bld: {/*
      "bld.farm.l2": {
        name:"Farm", icon:"🚜", level:2, desc:"A productive farming facility.",
        yield:[{res:"res.grain", amount:12, time:"1h"}],
        durability:0.85, footprintDelta:+5, animalCapDelta:+2,
        repairPrice:{"res.money":120},
        price:{"res.money":300},
        req:[{type:"rsd", id:"rsd.agri.adv", label:"Advanced Agriculture"}],
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
      }*//*
    },
    rsd: {
      "rsd.agri.adv": { name:"Advanced Agriculture", icon:"🎋", desc:"Better crop yield.", cost:{"res.money":600}, progress:1.0 },
      "rsd.mining.t1":{ name:"Mining Techniques",   icon:"⛏️", desc:"Improve extraction.", cost:{"res.money":300}, progress:0.60 },
      "rsd.forest.m1":{ name:"Forestry Management", icon:"🌲", desc:"Manage woodlands.",   cost:{"res.money":450}, progress:0.0 }
    },
    rcp: {
      "rcp.farm.irrigation": { name:"Irrigation System", icon:"💧", effect:"+20% water efficiency", price:{"res.money":300, "res.wood":10}, kind:"addon", owned:true },
      "rcp.farm.fertilizer": { name:"Fertilizer Storage", icon:"🌱", effect:"+15% crop yield",     price:{"res.money":150, "res.stone":5}, kind:"addon", owned:false },
      "rcp.farm.greenhouse": { name:"Greenhouse Extension", icon:"🏡", effect:"Year-round production", price:{"res.money":800, "res.wood":20, "res.stone":10}, kind:"addon", owned:false },
      "rcp.job.wheat": { name:"Grow Wheat", icon:"🌾", kind:"job", desc:"Produces grain in 1h", consumes:{"res.water":5}, produces:{"res.grain":12}, duration:"1h", state:"idle" }
    }
  };
}

async function mockState() {
  await window.dataReady;

   const res = {};
    for (const [key, val,] of Object.entries(window.data.state.inv.liquid)) {
     res[`res.${key}`] = val;
    }

    for (const [key, val] of Object.entries(window.data.state.inv.solid)) {
      res[`res.${key}`] = val;
    }

    
return { res, 
  player:{ code:"Player", world:"W:W001", land:"L:L001", map:"M:M001", field:"F:10" },
    session:{ loggedIn:false },
    //res: { "res.water": ${data.state.inv.liquid.water}, },
    //res:{ "res.water": window.data.state.inv.liquid.water, "res.oil":12, "res.milk":8, "res.grain":156, "res.wood":window.data.state.inv.solid.wood, "res.stone":34, "res.iron":7, "res.food":23, "res.money":1250 },
    
    owned:{ bld:{ "bld.farm.l2":true, "bld.barn.l1":true } },
    research:{ "rsd.agri.adv":true },
    footprint:{ used:18, total:40 },
    animalCap:{ used:3, total:10 }
  };

  return {
    
  };
}

async function mockAction(name, payload){
  // NOTE: meget simpel “mutation” – kun for demo
  if (name === "repair") {
    const id = payload?.bldId;
    if (window.defs?.bld?.[id]) window.defs.bld[id].durability = 1.0;
    if (window.state?.res) window.state.res["res.money"] = (window.state.res["res.money"]||0) - 120;
    return { ok:true, statePatch:{} };
  }
  return { ok:true, message:"noop" };
}*/

/* --- AUTH: append-only (overskriver intet eksisterende) --- */
(function(){
  window.api = window.api || {};

  const API_BASE = (() => {
    const root = location.pathname.split("/frontend/")[0];
    return root + "/backend/api/";
  })();

  async function _get(p){ const r=await fetch(API_BASE+p,{credentials:"include"}); try{return await r.json();}catch{return {ok:false};} }
  async function _post(p,b){ const r=await fetch(API_BASE+p,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(b||{})}); try{return await r.json();}catch{return {ok:false};} }

  const auth = {
    session:  () => _get("auth/session.php"),
    login:    (u,p) => _post("auth/login.php",   { username:u, password:p }),
    logout:   ()     => _post("auth/logout.php"),
    register: (u,p,e)=> _post("auth/register.php",{ username:u, password:p, email:e })
  };

  ["session","login","logout","register"].forEach(k=>{
    if (!(k in window.api)) window.api[k] = auth[k];
  });
})();

/* --- USER API: append-only --- */
(function(){
  if (!window.api) window.api = {};
  function _base(){ const root = location.pathname.split("/frontend/")[0]; return root + "/backend/api/"; }
  async function _get(p){ const r=await fetch(_base()+p,{credentials:"include"}); try{return await r.json();}catch{return {ok:false};} }
  if (!('getUser' in window.api)) window.api.getUser = () => _get("user/profile.php");
})();