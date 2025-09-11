/* =========================================================
   ui/research.js
   - Research-liste (samme logik som på dashboard)
========================================================= */

window.renderResearchPage = () => {
  const main = $("#main");
  const rsdHtml = Object.entries(defs.rsd).map(([id, d]) => {
    const completed = d.progress>=1 || !!state.research[id];
    const pct = Math.round((completed?1:d.progress||0) * 100);
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

  main.innerHTML = `
    <section class="panel section">
      <div class="section-head">🔬 Research</div>
      <div class="section-body">${rsdHtml}</div>
    </section>
  `;
};

// Enkle demo-handlers (ingen backend endnu)
window.startResearch    = (id) => { defs.rsd[id].progress=0.1; renderResearchPage(); };
window.continueResearch = (id) => { const c=defs.rsd[id].progress||0; defs.rsd[id].progress=Math.min(1,c+0.2); if(defs.rsd[id].progress>=1) state.research[id]=true; renderResearchPage(); };
window.cancelResearch   = (id) => {
  openConfirm({ title:"Cancel research?", body:"Ingen refund i demo.", confirmText:"Cancel research",
    onConfirm:()=>{ defs.rsd[id].progress=0; renderResearchPage(); }
  });
};
