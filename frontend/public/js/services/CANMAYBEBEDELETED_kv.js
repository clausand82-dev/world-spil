/* =========================================================
   services/kv.js – simpel key/value-ordbog på klienten
   - loader backend/api/alldata.php én gang
   - get(key): returnerer værdi eller kaster fejl
   - list(prefix): returnerer { key: value } for alle nøgler m. prefix
========================================================= */

(function(){
  const API_BASE = (() => {
    const root = location.pathname.split("/frontend/")[0];
    return root + "/backend/api/";
  })();

  async function loadKV(strict=false) {
    const url = API_BASE + "alldata.php" + (strict ? "?strict=1" : "");
    const r = await fetch(url, { credentials:"include" });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok || !j.data) throw new Error("KV load failed");
    window.kv = j.data;
    return window.kv;
  }

  function get(key) {
    if (!window.kv) throw new Error("KV not loaded yet");
    if (!(key in window.kv)) throw new Error("KV missing key: " + key);
    return window.kv[key];
  }

  function list(prefix) {
    if (!window.kv) throw new Error("KV not loaded yet");
    const out = {};
    const p = String(prefix || "");
    for (const k in window.kv) {
      if (k.startsWith(p)) out[k] = window.kv[k];
    }
    return out;
  }

  // Eksportér
  window.kvapi = { loadKV, get, list };
})();
