/* =========================================================
   ui/recipes.js
   - Viser en komplet liste over alle tilgængelige opskrifter
     baseret på spillerens stage og ejede bygninger.
========================================================= */

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

    return `
      <div class="item">
        <div class="icon">${def.icon || "🍲"}</div>
        <div>
          <div class="title">${def.name}</div>
          <div class="sub">${def.desc || ''}</div>
          <div class="sub" style="margin-top: 4px;">${reqLineParts.bothInline}</div>
          ${active ? `<div class="build-progress" data-pb-for="${id}" style="display:block; margin-top: 8px; width: 160px;"><div class="pb-track"><div class="pb-fill"></div></div><div class="pb-label">0%</div></div>` : ''}
        </div>
        <div class="right">${btnHtml}</div>
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

    // Find alle unikke bygnings-familier, som spilleren ejer
    const ownedBuildingFamilies = new Set(
        Object.keys(WS.bld || {}).map(bldId => {
            const parts = bldId.replace(/^bld\./, '').split('.');
            parts.pop(); // Fjerner '.l1' etc.
            return parts.join('.');
        }).filter(Boolean)
    );

    // Filtrer opskrifter baseret på stage og bygnings-familie
    const availableRecipes = Object.entries(WD.rcp)
        .filter(([key, def]) => {
            const meetsStage = (def.stage || 0) <= currentStage;
            const meetsFamily = def.family ? def.family.split(',').some(f => ownedBuildingFamilies.has(f.trim())) : false;
            return meetsStage && meetsFamily;
        });

    const recipesHtml = availableRecipes.length > 0
        ? availableRecipes.map(([key, def]) => createRecipeRow(key, def)).join("")
        : `<div class="sub">Ingen opskrifter er tilgængelige med dine nuværende bygninger.</div>`;

    main.innerHTML = `
        <section class="panel section">
            <div class="section-head">🍲 Recipes</div>
            <div class="section-body">
                ${recipesHtml}
            </div>
        </section>
    `;
    
    window.BuildingsProgress?.rehydrate?.(main);
};
