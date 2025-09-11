/* =========================================================
   ui/research.js
   - Viser en komplet, filtrerbar liste over al research.
   - RETTET: Knap-logik og HTML-struktur for progress bar er nu korrekt.
========================================================= */

window.__activeResearchFilter = 'all';

function createResearchRow(key, def) {
    const id = `rsd.${key}`;
    const completed = window.hasResearch(id);
    const active = window.ActiveBuilds?.[id];
    const reqLineParts = renderReqLine({ id, price: def.cost, req: def.require, duration_s: def.duration_s }, { returnParts: true });
    
    let rightHtml = '';

    // Korrekt logik for at bestemme, hvad der skal vises i højre kolonne
    if (active) {
        // Hvis aktiv: Vis KUN Cancel-knap og en synlig progress bar
        rightHtml = `
            <button class="btn" data-cancel-build="${id}">Cancel</button>
            <div class="build-progress" data-pb-for="${id}" style="display:block; margin-top: 8px; width: 160px;">
                <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                    <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                </div>
                <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
            </div>
        `;
    } else if (completed) {
        rightHtml = `<span class="badge owned">✓ Fuldført</span>`;
    } else if (reqLineParts.allOk) {
        // Hvis man har råd: Vis "Research"-knap og en SKJULT progress bar
        rightHtml = `
            <button class="btn primary" data-start-research-id="${id}">Research</button>
            <div class="build-progress" data-pb-for="${id}" style="display:none; margin-top: 8px; width: 160px;">
                <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                    <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                </div>
                <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
            </div>
        `;
    } else {
        rightHtml = `<button class="btn" disabled>Need more</button>`;
    }
    
    const reqLineHTML = renderReqLine({ id, price: def.cost, req: def.require, duration_s: def.duration_s });

    return `
      <div class="item">
        <div class="icon">${def.icon || "🧪"}</div>
        <div>
          <div class="title">${def.name}</div>
          <div class="sub">${def.desc || ''}</div>
          <div class="sub" style="margin-top: 4px;">${reqLineHTML}</div>
        </div>
        <div class="right">${rightHtml}</div>
      </div>
    `;
}

window.renderResearchPage = () => {
    const main = $("#main");
    const WD = window.data?.defs;
    const WS = window.data?.state;
    if (!WD?.rsd || !WS?.user) { main.innerHTML = `<section class="panel section"><div class="section-body"><div class="sub">Indlæser...</div></div></section>`; return; }
    const currentStage = Number(WS.user.currentstage || 0);
    const allResearch = Object.entries(WD.rsd);
    const filters = new Set(['all']);
    allResearch.forEach(([key, def]) => { const filterKey = def.type || def.family; if (filterKey) filterKey.split(',').forEach(f => filters.add(f.trim())); });
    const filterTabsHTML = Array.from(filters).sort().map(filter => `<button class="tab ${window.__activeResearchFilter === filter ? 'active' : ''}" data-filter="${filter}">${filter === 'all' ? 'Alle' : filter.charAt(0).toUpperCase() + filter.slice(1)}</button>`).join('');
    const filteredResearch = allResearch.filter(([key, def]) => {
        if (Number(def.stage || 0) > currentStage) return false;
        if (window.__activeResearchFilter !== 'all') {
            const filterKey = def.type || def.family || '';
            return filterKey.split(',').map(f => f.trim()).includes(window.__activeResearchFilter);
        }
        return true;
    });
    const rsdHtml = filteredResearch.length > 0 ? filteredResearch.map(([key, def]) => createResearchRow(key, def)).join("") : `<div class="sub">Ingen research tilgængelig for dette filter.</div>`;
    main.innerHTML = `
        <section class="panel section">
            <div class="section-head">🔬 Research</div>
            <div class="tabs" style="padding: 12px 14px; border-bottom: 1px solid var(--border);">
                ${filterTabsHTML}
            </div>
            <div class="section-body">${rsdHtml}</div>
        </section>
    `;
    window.BuildingsProgress?.rehydrate?.(main);
    main.querySelector('.tabs').addEventListener('click', (e) => {
        if (e.target.matches('.tab[data-filter]')) {
            window.__activeResearchFilter = e.target.dataset.filter;
            renderResearchPage();
        }
    });
};

if (!window.__ResearchPageStartWired__) {
    window.__ResearchPageStartWired__ = true;
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-start-research-id]');
        if (!btn) return;
        const mainElement = document.getElementById('main');
        const sectionHead = mainElement ? mainElement.querySelector('.section-head') : null;
        if (!sectionHead || !sectionHead.textContent.includes('Research')) return;
        e.preventDefault(); e.stopPropagation();
        const rsdId = btn.getAttribute('data-start-research-id');
        const key = rsdId.replace(/^rsd\./, '');
        const def = window.data?.defs?.rsd?.[key];
        if (def) {
            btn.disabled = true;
            try {
                await window.BuildJobs.start(rsdId, def.duration_s || 10);
                renderResearchPage();
            } catch (err) {
                console.error(`Failed to start research ${rsdId}`, err);
                btn.disabled = false;
            }
        }
    });
}