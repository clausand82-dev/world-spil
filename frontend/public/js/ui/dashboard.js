/* =========================================================
   ui/dashboard.js
   - Viser et samlet overblik ved at kalde funktioner fra overview.js
========================================================= */

window.renderDashboard = () => {
    const main = $("#main");
    if (!window.data || !window.data.defs) {
        main.innerHTML = `<div class="sub">Indlæser data...</div>`;
        return;
    }

    // Tjek om funktionerne fra overview.js er tilgængelige
    if (typeof renderActiveJobs !== 'function' || typeof renderPassiveYields !== 'function') {
        main.innerHTML = `<div class="sub">Fejl: Oversigts-funktioner er ikke indlæst.</div>`;
        console.error("renderActiveJobs eller renderPassiveYields er ikke defineret. Sørg for at overview.js er inkluderet korrekt i index.html.");
        return;
    }

    // Kald de globale funktioner for at få HTML-indholdet
    const activeBuildingsHTML = renderActiveJobs('bld');
    const activeAddonsHTML = renderActiveJobs('add');
    const activeResearchHTML = renderActiveJobs('rsd'); // <-- NYT KALD
    const passiveYieldsHTML = renderPassiveYields();

    // Sæt den endelige HTML for dashboardet
    main.innerHTML = `
        <section class="panel section">
            <div class="section-head">🏗️ Aktive Bygge-jobs</div>
            <div class="section-body">
                ${activeBuildingsHTML}
            </div>
        </section>
        
        <section class="panel section">
            <div class="section-head">➕ Aktive Addon-jobs</div>
            <div class="section-body">
                ${activeAddonsHTML}
            </div>
        </section>

        <!-- ======================================================== -->
        <!-- NY SEKTION: Viser igangværende forskning                 -->
        <!-- ======================================================== -->
        <section class="panel section">
            <div class="section-head">🔬 Igangværende Forskning</div>
            <div class="section-body">
                ${activeResearchHTML}
            </div>
        </section>

        <section class="panel section">
            <div class="section-head">📊 Passiv Produktion</div>
            <div class="section-body">
                ${passiveYieldsHTML}
            </div>
        </section>
    `;

    // Sørg for, at de nye progress bars også bliver opdateret med det samme
    window.BuildingsProgress?.rehydrate?.(main);
};
