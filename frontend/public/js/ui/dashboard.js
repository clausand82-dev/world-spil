/* =========================================================
   ui/dashboard.js
   - RETTET: Har nu sin egen live-timer til progress bars og tid.
========================================================= */

let dashboardTimer = null;

function dashboardTick() {
    const now = Date.now();
    for (const jobId in (window.ActiveBuilds || {})) {
        const job = window.ActiveBuilds[jobId];
        const elementId = jobId.replace(/\./g, '-');
        
        // Opdater tid
        const timeElement = document.getElementById(`time-remaining-${elementId}`);
        if (timeElement) {
            timeElement.textContent = formatTimeRemaining((job.endTs - now) / 1000);
        }

        // Opdater progress bar
        const progressWrapper = document.querySelector(`.build-progress[data-pb-for="${jobId}"]`);
        if (progressWrapper) {
            const fill = progressWrapper.querySelector(".pb-fill");
            const label = progressWrapper.parentElement.querySelector(".pb-label"); // Label er nu ved siden af
            if (fill && label) {
                const pct = Math.min(100, Math.round(Math.max(0, (now - job.startTs) / (job.endTs - job.startTs)) * 100));
                fill.style.width = `${pct}%`;
                label.textContent = `${pct}%`;
            }
        }
    }
}

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
    const passiveYieldsHTML = renderPassiveYields();

    main.innerHTML = `
        <section class="panel section"><div class="section-head">🏗️ Aktive Bygge-jobs</div><div class="section-body">${activeBuildingsHTML}</div></section>
        <section class="panel section"><div class="section-head">➕ Aktive Addon-jobs</div><div class="section-body">${activeAddonsHTML}</div></section>
        <section class="panel section"><div class="section-head">🔬 Igangværende Forskning</div><div class="section-body">${activeResearchHTML}</div></section>
        <section class="panel section"><div class="section-head">📊 Passiv Produktion</div><div class="section-body">${passiveYieldsHTML}</div></section>`;

    // Kør tick én gang med det samme og start derefter intervallet
    dashboardTick();
    dashboardTimer = setInterval(dashboardTick, 1000);
};

// Sørg for at stoppe timeren, når vi forlader dashboardet
window.addEventListener('hashchange', () => {
    if (location.hash !== '#/dashboard' && dashboardTimer) {
        clearInterval(dashboardTimer);
        dashboardTimer = null;
    }
});