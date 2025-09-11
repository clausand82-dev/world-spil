(function () {
  const API_BASE = (() => {
    const root = location.pathname.split("/frontend/")[0];
    return root + "/backend/api/";
  })();

  async function loadData() {
    const r = await fetch(API_BASE + "alldata.php", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error(j?.error?.message || "alldata failed");
    window.data = j.data;    // <-- hele træet
    return window.data;
  }

  window.dataApi = { loadData };
})();