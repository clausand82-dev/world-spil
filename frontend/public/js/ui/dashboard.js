/* =========================================================
   ui/dashboard.js
   - Viser nu den nye interaktive yield-oversigt.
========================================================= */

let dashboardTimer = null;

function dashboardTick() { /* ... din eksisterende tick-funktion er uændret ... */ }function dashboardTick() {
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

    // Kald de eksisterende funktioner for at få HTML-indholdet
    const activeBuildingsHTML = renderActiveJobs('bld');
    const activeAddonsHTML = renderActiveJobs('add');
    const activeResearchHTML = renderActiveJobs('rsd');
    const activeRecipesHTML = renderActiveJobs('rcp'); // <-- NYT KALD
    // Brug interaktiv/klap-ud version af yield-oversigten
    const passiveYieldsHTML = (typeof renderInteractiveYields === 'function')
        ? renderInteractiveYields()
        : renderPassiveYields();

    main.innerHTML = `
        <section class="panel section"><div class="section-head">🏗️ Aktive Bygge-jobs</div><div class="section-body">${activeBuildingsHTML}</div></section>
        <section class="panel section"><div class="section-head">➕ Aktive Addon-jobs</div><div class="section-body">${activeAddonsHTML}</div></section>
        <section class="panel section"><div class="section-head">🔬 Igangværende Forskning</div><div class="section-body">${activeResearchHTML}</div></section>
        
        <!-- ======================================================== -->
        <!-- NY SEKTION: Viser igangværende opskrifter                -->
        <!-- ======================================================== -->
        <section class="panel section">
            <div class="section-head">🍲 Aktive Opskrifter</div>
            <div class="section-body">
                ${activeRecipesHTML}
            </div>
        </section>

        <section class="panel section"><div class="section-head">📊 Passiv Produktion</div><div class="section-body">${passiveYieldsHTML}</div></section>`;

    dashboardTick();
    dashboardTimer = setInterval(dashboardTick, 1000);
};

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
