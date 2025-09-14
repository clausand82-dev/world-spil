/* =========================================================
   ui/recipes.js
   - Viser en komplet liste over alle tilgængelige opskrifter
     baseret på spillerens stage og ejede bygninger.
========================================================= */
window.__activeRecipeFilter = 'all';

/**
 * Genererer HTML for en enkelt opskrifts-række.
 */
function createRecipeRow(key, def) {
    const id = `rcp.${key}`;
    const active = window.ActiveBuilds?.[id];

    // Brug renderReqLine til at tjekke, om spilleren opfylder alle krav
    const reqLineParts = renderReqLine(
        { id: id, price: def.cost, req: def.require, duration_s: def.duration_s },
        { returnParts: true }
    );
    // renderReqLine sætter global status for pris i window.data.extra.priceok
    const priceOk = (window.data?.extra?.priceok !== 'price-bad');
    
    let btnHtml = '';
    if (active) {
        btnHtml = `<button class="btn" data-cancel-build="${id}">Cancel</button>`;
    } else if (reqLineParts.allOk && priceOk) {
        btnHtml = `<button class="btn primary" data-fakebuild-id="${id}" data-buildmode="timer" data-buildscope="recipe">Build 1x</button>`;
    } else {
        btnHtml = `<button class="btn" disabled>Need more</button>`;
    }

    const progressHTML = `
        <div class="build-progress" data-pb-for="${id}" style="display: ${active ? 'block' : 'none'}; margin-top: 8px; width: 160px;">
            <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
            </div>
            <div class="pb-label" style="font-size:12px; margin-top:4px; opacity:0.8;">0%</div>
        </div>
    `;

    return `
      <div class="item">
        <div class="icon">${def.icon || "🍲"}</div>
        <div>
          <div class="title">${def.name}</div>
          <div class="sub">${def.desc || ''}</div>
          <div class="sub" style="margin-top: 4px;">${reqLineParts.bothInline}</div>
          ${active ? `<div class="build-progress" data-pb-for="${id}" style="display:block; margin-top: 8px; width: 160px;"><div class="pb-track"><div class="pb-fill"></div></div><div class="pb-label">0%</div></div>` : ''}
        </div>
        <div class="right">${btnHtml}${progressHTML}</div>
      </div>
    `;
}

/**
 * Hovedfunktionen der renderer hele Recipes-siden.
 */
window.renderRecipesPage = () => {
    const main = $("#main");
    const WD = window.data?.defs;
    const WS = window.data?.state;

    if (!WD?.rcp || !WS?.user) {
        main.innerHTML = `<section class="panel section"><div class="section-body"><div class="sub">Indlæser...</div></div></section>`;
        return;
    }

    const currentStage = Number(WS.user.currentstage || 0);

    // 1. Find alle bygnings-familier, som spilleren ejer (uændret).
    const ownedBuildingFamilies = new Set(
        Object.keys(WS.bld || {}).map(bldId => {
            const parts = bldId.replace(/^bld\./, '').split('.');
            parts.pop();
            return parts.join('.');
        }).filter(Boolean)
    );
    
    // 2. Find alle opskrifter, der er potentielt tilgængelige (baseret på stage og bygningsejerskab).
    const allAvailableRecipes = Object.entries(WD.rcp).filter(([key, def]) => {
        const meetsStage = (def.stage || 0) <= currentStage;
        const recipeFamilies = def.family ? def.family.split(',').map(f => f.trim()) : [];
        const hasRequiredBuilding = recipeFamilies.some(f => ownedBuildingFamilies.has(f));
        return meetsStage && hasRequiredBuilding;
    });

    // =====================================================================
    // RETTELSE: Byg kun faner for familier, der rent faktisk HAR opskrifter.
    // =====================================================================
    // 3. Find de unikke familier fra den *filtrerede* liste af opskrifter.
    const familiesWithRecipes = new Set();
    allAvailableRecipes.forEach(([key, def]) => {
        if (def.family) {
            def.family.split(',').forEach(f => {
                const family = f.trim();
                // Tilføj kun, hvis spilleren ejer en bygning af denne type
                if (ownedBuildingFamilies.has(family)) {
                    familiesWithRecipes.add(family);
                }
            });
        }
    });

    // 4. Byg HTML for filter-tabs.
    const filterTabs = ['all', ...Array.from(familiesWithRecipes).sort()];
    const filterTabsHTML = filterTabs.map(familyKey => {
        let label = 'Alle';
        if (familyKey !== 'all') {
            const buildingDef = WD.bld?.[`${familyKey}.l1`];
            label = buildingDef?.name || familyKey.charAt(0).toUpperCase() + familyKey.slice(1);
        }
        return `<button class="tab ${window.__activeRecipeFilter === familyKey ? 'active' : ''}" data-filter="${familyKey}">${label}</button>`;
    }).join('');

    // 5. Anvend det aktive tab-filter på den allerede filtrerede liste.
    const filteredRecipes = allAvailableRecipes.filter(([key, def]) => {
        if (window.__activeRecipeFilter !== 'all') {
            const recipeFamilies = def.family ? def.family.split(',').map(f => f.trim()) : [];
            return recipeFamilies.includes(window.__activeRecipeFilter);
        }
        return true;
    });

    // =====================================================================
    // SLUT PÅ RETTELSE
    // =====================================================================

    const recipesHtml = filteredRecipes.length > 0
        ? filteredRecipes.map(([key, def]) => createRecipeRow(key, def)).join("")
        : `<div class="sub">Ingen opskrifter er tilgængelige for dette filter.</div>`;

    main.innerHTML = `
        <section class="panel section">
            <div class="section-head">🍲 Recipes</div>
            <div class="tabs" style="padding: 12px 14px; border-bottom: 1px solid var(--border);">
                ${filterTabsHTML}
            </div>
            <div class="section-body">
                ${recipesHtml}
            </div>
        </section>
    `;
    
    window.BuildingsProgress?.rehydrate?.(main);

    main.querySelector('.tabs').addEventListener('click', (e) => {
        if (e.target.matches('.tab[data-filter]')) {
            window.__activeRecipeFilter = e.target.dataset.filter;
            renderRecipesPage();
        }
    });
};
