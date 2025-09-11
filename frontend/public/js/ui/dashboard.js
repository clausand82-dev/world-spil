/* =========================================================
   ui/dashboard.js
   - Dashboard-side (liste af bygninger, research, produktion)
========================================================= */

window.renderDashboard = () => {
  const main = $("#main");

  // Bygninger (liste)
  const bldsHtml = Object.entries(defs.bld).map(([id, d]) => {
    const owned = !!state.owned.bld[id];
    const req   = renderReqLine(d);
    const thumb = id === "bld.farm.l2" ? d.photoMedium : ""; // demo: kun farm har thumb
    const icon  = thumb
      ? `<img src="${thumb}" alt="" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border)">`
      : (d.icon || "🏗️");
    return `
      <div class="item">
        <div class="icon">${icon}</div>
        <div>
          <div class="title"><a href="#/building/${id}" class="link">${d.name}</a></div>
          <div class="sub">Level ${d.level}</div>
          ${req}
        </div>
        <div class="right">
          ${owned ? `<span class="badge owned">Owned</span>` : `<button class="btn primary" onclick="fakeBuild('${id}')">Build</button>`}
        </div>
      </div>
    `;
  }).join("");

    // Research (liste + progress + start/continue/cancel)
  const rsdHtml = Object.entries(defs.rsd).map(([id, d]) => {
    const completed = d.progress >= 1 || !!state.research[id];
    const pct  = Math.round((completed ? 1 : d.progress || 0) * 100);
    const btns = completed
      ? `<span class="badge">✓ Complete</span>`
      : (pct>0
        ? `<div style="display:flex;gap:8px">
             <button class="btn" onclick="continueResearch('${id}')">Continue</button>
             <button class="btn" onclick="cancelResearch('${id}')">Cancel</button>
           </div>`
        : `<button class="btn primary" onclick="startResearch('${id}')">Start</button>`);
    return `
      <div class="item">
        <div class="icon">${d.icon||"🧪"}</div>
        <div>
          <div class="title">${d.name}</div>
          <div class="sub">${renderCostColored(d.cost)}</div>
          <div class="progress"><span style="width:${pct}%"></span><div class="pct">${pct}%</div></div>
        </div>
        <div class="right">${btns}</div>
      </div>
    `;
  }).join("");

  // Production overview (simpel aggregering / time)
  const prodRows = Object.values(defs.bld).flatMap(b => (b.yield||[]));
  const agg = {};
  for (const y of prodRows) agg[y.res] = (agg[y.res]||0) + y.amount;
  const prodHtml = Object.entries(agg).map(([rid, amt]) => {
    const r = defs.res[rid] || { name: rid, emoji: "" };
    return `<div class="item"><div class="icon">${r.emoji||"⚙️"}</div><div class="title">+${amt} ${r.name} / h</div></div>`;
  }).join("") || `<div class="sub" style="padding:10px 12px">Ingen produktion endnu.</div>`;

  // Sæt side
  main.innerHTML = `
    <section class="panel section">
      <div class="section-head">🏗️ Buildings</div>
      <div class="section-body">${bldsHtml}</div>
    </section>
    <section class="panel section">
      <div class="section-head">🔬 Research</div>
      <div class="section-body">${rsdHtml}</div>
    </section>
    <section class="panel section">
      <div class="section-head">📊 Production Overview</div>
      <div class="section-body">${prodHtml}</div>
    </section>
  `;
};
