/* =========================================================
   ui/dashboard.js
   - Viser nu den nye interaktive yield-oversigt.
========================================================= */

let dashboardTimer = null;

function dashboardTick() { /* ... din eksisterende tick-funktion er uændret ... */ }

window.renderDashboard = () => {
    if (dashboardTimer) clearInterval(dashboardTimer);
    
    const main = $("#main");
    if (!window.data?.defs || typeof renderActiveJobs !== 'function') {
        main.innerHTML = `<div class="sub">Indlæser...</div>`;
        return;
    }

    const activeBuildingsHTML = renderActiveJobs('bld');
    const activeAddonsHTML = renderActiveJobs('add');
    const activeResearchHTML = renderActiveJobs('rsd');
    
    // Kald den nye, interaktive funktion
    const interactiveYieldsHTML = renderInteractiveYields();

    main.innerHTML = `
        <section class="panel section"><div class="section-head">🏗️ Aktive Bygge-jobs</div><div class="section-body">${activeBuildingsHTML}</div></section>
        <section class="panel section"><div class="section-head">➕ Aktive Addon-jobs</div><div class="section-body">${activeAddonsHTML}</div></section>
        <section class="panel section"><div class="section-head">🔬 Igangværende Forskning</div><div class="section-body">${activeResearchHTML}</div></section>
        <section class="panel section">
            <div class="section-head">📊 Passiv Produktion</div>
            <div class="section-body">
                ${interactiveYieldsHTML}
            </div>
        </section>`;

    dashboardTick();
    dashboardTimer = setInterval(dashboardTick, 1000);
};

window.addEventListener('hashchange', () => {
    if (location.hash !== '#/dashboard' && dashboardTimer) {
        clearInterval(dashboardTimer);
        dashboardTimer = null;
    }
});

// =========================================================
// NY EVENT LISTENER for "fold-ud" funktionalitet
// =========================================================
if (!window.__DashboardCollapseWired__) {
    window.__DashboardCollapseWired__ = true;
    
    document.addEventListener('click', (e) => {
        const header = e.target.closest('.collapsible-item');
        if (!header) return;

        const resId = header.dataset.yieldResId;
        if (!resId) return;

        const content = document.getElementById(`details-${resId.replace(/\./g, '-')}`);
        const chevron = header.querySelector('.chevron');

        if (content && chevron) {
            const isVisible = content.style.maxHeight && content.style.maxHeight !== '0px';
            if (isVisible) {
                content.style.maxHeight = '0px';
                chevron.style.transform = 'rotate(0deg)';
            } else {
                // Sæt maxHeight til den faktiske højde af indholdet for en glidende animation
                content.style.maxHeight = `${content.scrollHeight}px`;
                chevron.style.transform = 'rotate(90deg)';
            }
        }
    });
}