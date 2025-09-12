/* =========================================================
   ui/animals.js
   - RETTET: Håndterer nu korrekt dyre-ID'er uden levels.
========================================================= */

let animalsToBuy = {};

function renderOwnedAnimals() {
    const owned = window.data?.state?.ani || {};
    if (Object.keys(owned).length === 0) return `<div class="sub">Du ejer ingen dyr endnu.</div>`;

    return Object.entries(owned).map(([aniId, data]) => {
        const key = aniId.replace(/^ani\./, '');
        const def = window.data.defs.ani?.[key];
        if (!def) return '';

        return `
            <div class="item">
                <div class="icon">${def.icon || '🐾'}</div>
                <div>
                    <div class="title">${def.name} (x${data.quantity})</div>
                    <div class="sub">Optager ${def.stats?.animal_cap || 1} staldplads pr. stk.</div>
                </div>
                <div class="right">
                    <button class="btn" data-sell-animal-id="${aniId}">Sælg 1</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderAvailableAnimals() {
    const defs = window.data.defs;
    const state = window.data.state;
    const currentStage = Number(state.user?.currentstage || 0);
    
    // RETTELSE: Simpel metode til at finde bygnings-familier uden parseBldKey
    const ownedBuildingFamilies = new Set(
        Object.keys(state.bld || {}).map(bldId => {
            const parts = bldId.replace(/^bld\./, '').split('.');
            parts.pop(); // Fjerner '.l1' delen
            return parts.join('.');
        })
    );

    const availableAnimals = Object.entries(defs.ani || {})
        .filter(([key, def]) => {
            const meetsStage = (def.stage || 0) <= currentStage;
            const meetsFamily = def.family ? def.family.split(',').some(f => ownedBuildingFamilies.has(f.trim())) : false;
            return meetsStage && meetsFamily;
        });

    if (availableAnimals.length === 0) {
        return `<div class="sub">Ingen nye dyr er tilgængelige. Byg eller opgrader relevante bygninger.</div>`;
    }

    const totalCap = state.cap.animalCap.total;
    const usedCap = state.cap.animalCap.used;
    const availableCap = totalCap - usedCap;

    return availableAnimals.map(([key, def]) => {
        const aniId = `ani.${key}`;
        const capCost = def.stats?.animal_cap || 1;
        const currentVal = animalsToBuy[aniId] || 0;
        
        const remainingCapAfterOthers = availableCap - Object.entries(animalsToBuy).reduce((sum, [id, qty]) => {
            if (id === aniId) return sum;
            const otherDef = defs.ani[id.replace(/^ani\./, '')];
            return sum + (otherDef.stats?.animal_cap || 1) * qty;
        }, 0);
        
        const maxVal = Math.floor(Math.max(0, remainingCapAfterOthers / capCost));

        return `
            <div class="item">
                <div class="icon">${def.icon || '🐾'}</div>
                <div class="grow">
                    <div class="title">${def.name}</div>
                    <div class="sub">${renderCostColored(window.helpers.normalizePrice(def.cost), true)}</div>
                    <div class="sub">Kræver ${capCost} staldplads</div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                        <input type="range" class="slider" data-animal-slider-id="${aniId}" min="0" max="${maxVal}" value="${currentVal}" style="flex-grow: 1;">
                        <span id="slider-value-${aniId.replace(/\./g, '-')}" style="font-weight: bold; width: 30px;">${currentVal}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('') + `
        <div class="actions-bar" style="margin-top: 16px;">
            <div id="animal-purchase-summary"></div>
            <button id="buy-animals-btn" class="btn primary">Køb Valgte Dyr</button>
        </div>
    `;
}

function updatePurchaseUI() { /* ... Denne funktion er uændret ... */ }
window.renderAnimalsPage = () => { /* ... Denne funktion er uændret ... */ };
if (!window.__AnimalPageWired__) { /* ... Denne event listener er uændret ... */ }