/* =========================================================
   services/api.js
   - Ét sted til data-adgang
   - Lige nu: MOCK (samme data som din v4.3)
   - Senere: byt ud med rigtige fetch() til PHP (samme metode-navne)
========================================================= */

// Flag: mock-tilstand (true = brug hardcodet data)
const MOCK = true;

// Base-URL til backend API (når du kobler på PHP)
const API_BASE = "/backend/api/"; // ændres senere når du er klar

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
};

// --- MOCK DATA (kopi fra v4.3 – trimmet en smule) -----------
function mockDefs() {
  return {
    version: "v4.3.0",
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
      "rcp.farm.irrigation": { name:"Irrigation System", icon:"💧", effect:"+20% water efficiency", price:{"res.money":300, "res.wood":10}, kind:"addon", owned:true },
      "rcp.farm.fertilizer": { name:"Fertilizer Storage", icon:"🌱", effect:"+15% crop yield",     price:{"res.money":150, "res.stone":5}, kind:"addon", owned:false },
      "rcp.farm.greenhouse": { name:"Greenhouse Extension", icon:"🏡", effect:"Year-round production", price:{"res.money":800, "res.wood":20, "res.stone":10}, kind:"addon", owned:false },
      "rcp.job.wheat": { name:"Grow Wheat", icon:"🌾", kind:"job", desc:"Produces grain in 1h", consumes:{"res.water":5}, produces:{"res.grain":12}, duration:"1h", state:"idle" }
    }
  };
}

function mockState() {
  return {
    player:{ code:"Player", world:"W:W001", land:"L:L001", map:"M:M001", field:"F:10" },
    session:{ loggedIn:false },
    res:{ "res.water":245, "res.oil":12, "res.milk":8, "res.grain":156, "res.wood":315, "res.stone":34, "res.iron":7, "res.food":23, "res.money":1250 },
    owned:{ bld:{ "bld.farm.l2":true, "bld.barn.l1":true } },
    research:{ "rsd.agri.adv":true },
    footprint:{ used:18, total:40 },
    animalCap:{ used:3, total:10 }
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
}
