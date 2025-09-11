/* =========================================================
   ui/research.js
   - Viser en komplet, filtrerbar liste over al research.
   - RETTET: Knap-logik og progress bar er nu korrekt.
========================================================= */

window.__activeResearchFilter = 'all';

function createResearchRow(key, def) {
    const id = `rsd.${key}`;
    const completed = window.hasResearch(id);
    const active = window.ActiveBuilds?.[id];
    const reqLineParts = renderReqLine({ id, price: def.cost, req: def.require, duration_s: def.duration_s }, { returnParts: true });
    
    let btnHtml = '';
    // RETTELSE: Korrekt rækkefølge for knap-logik
    if (active) {
        btnHtml = `<button class="btn" data-cancel-build="${id}">Cancel</button>`;
    } else if (completed) {
        btnHtml = `<span class="badge owned">✓ Fuldført</span>`;
    } else if (reqLineParts.allOk) {
        btnHtml = `<button class="btn primary" data-start-research-id="${id}">Research</button>`; // Omdøbt fra "Start"
    } else {
        btnHtml = `<button class="btn" disabled>Need more</button>`;
    }
    
    const reqLineHTML = renderReqLine({ id, price: def.cost, req: def.require, duration_s: def.duration_s });

    // RETTELSE: Progress bar HTML med korrekt størrelse
    const progressHTML = active ? `
        <div class="build-progress" data-pb-for="${id}" style="display:block; margin-top: 8px; width: 160px;">
            <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
            </div>
            <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
        </div>` : '';

    return `
      <div class="item">
        <div class="icon">${def.icon || "🧪"}</div>
        <div>
          <div class="title">${def.name}</div>
          <div class="sub">${def.desc || ''}</div>
          <div class="sub" style="margin-top: 4px;">${reqLineHTML}</div>
        </div>
        <div class="right">
            ${btnHtml}
            ${!active ? progressHTML.replace('display:block', 'display:none') : progressHTML}
        </div>
      </div>
    `;
}

// ... (resten af filen: renderResearchPage og event listener er uændrede) ...
window.renderResearchPage = () => { /* ... din kode ... */ };
if (!window.__ResearchPageStartWired__) { /* ... din kode ... */ }