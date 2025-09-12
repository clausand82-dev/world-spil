/* =========================================================
   ui/animals.js
   - Viser en oversigt over ejede dyr og købsmuligheder.
   - RETTET: Fuldstændig selvstændig. Alle nødvendige hjælpefunktioner
     er inkluderet lokalt for at fjerne alle eksterne afhængigheder.
========================================================= */

let animalsToBuy = {};

// =========================================================
// SECTION: LOKALE HJÆLPEFUNKTIONER
// Disse funktioner er kopieret fra common.js for at gøre denne fil 100% uafhængig.
// =========================================================

/**
 * Privat, lokal hjælpefunktion til at parse bygnings-ID'er.
 */
function _animalsParseBldKey(key) {
    if (!key) return null;
    const re = /^bld\.(.+)\.l(\d+)$/i;
    const m = re.exec(String(key));
    if (!m) return null;
    return { family: m[1], level: Number(m[2]) };
}

/**
 * Privat, lokal hjælpefunktion til at normalisere et cost/price objekt.
 */
function _animalsNormalizePrice(cost) {
    if (!cost) return {};
    const out = {};
    if (Array.isArray(cost)) {
        cost.forEach((row, i) => {
            const id = row.id ?? row.rid ?? row.resource ?? row.type;
            const amount = row.amount ?? row.qty ?? row.value;
            if (id && Number(amount)) out[id] = { id: String(id), amount: Number(amount) };
        });
    } else if (typeof cost === 'object') {
        for (const [key, spec] of Object.entries(cost)) {
            const amount = (typeof spec === 'object' && spec !== null) ? Number(spec.amount ?? 0) : Number(spec ?? 0);
            if (amount) out[key] = { id: key, amount };
        }
    }
    return out;
}

/**
 * Privat, lokal version af renderCostColored.
 */
function _animalsRenderCostColored(map, inline = false) {
    if (!map || Object.keys(map).length === 0) return "";
    const parts = Object.values(map).map(needData => {
        const id = needData.id;
        const needAmount = needData.amount;
        const resShort = String(id).replace(/^res\./, '');
        const def = window.data?.defs?.res?.[resShort] ?? { emoji: '❓', name: resShort };
        const haveAmount = window.data?.state?.inv?.solid?.[resShort] ?? window.data?.state?.inv?.liquid?.[resShort] ?? 0;
        const ok = haveAmount >= needAmount;
        // Bruger den globale `fmt`, da den er defineret tidligt i state.js og er sikker at bruge
        const haveHtml = `<span class="${ok ? 'price-ok' : 'price-bad'}">${def.emoji} ${fmt(haveAmount)}</span>`;
        const needHtml = `<span class="sub" style="opacity:.8">/ ${fmt(needAmount)}</span>`;
        return haveHtml + needHtml;
    });
    return inline ? parts.join(" • ") : parts.join(" ");
}

/**
 * Hent samlet staldkapacitet fra state og udled total/used/available.
 */
function _animalsGetAnimalCap() {
    const cap = window.data?.state?.cap?.animal_cap || {};
    const total = cap.total ?? ((cap.base || 0) + (cap.bonus || 0));
    const used = Math.abs(cap.used || 0);
    return { total, used, available: Math.max(0, total - used) };
}

// =========================================================
// SECTION: SIDENS FUNKTIONER
// =========================================================

function renderOwnedAnimals() {
    const owned = window.data?.state?.ani || {};
    if (Object.keys(owned).length === 0) return `<div class="sub">Du ejer ingen dyr endnu!</div>`;
    return Object.entries(owned).map(([aniId, data]) => {
        const key = aniId.replace(/^ani\./, '');
        const def = window.data.defs.ani?.[key];
        if (!def) return '';
        return `
            <div class="item">
                <div class="icon">${def.emoji || '🐾'}</div>
                <div>
                    <div class="title">${def.name} (x${data.quantity})</div>
                    <div class="sub">Optager ${Math.abs(def.stats?.animal_cap ?? 1) || 1} staldplads pr. stk.</div>
                </div>
                <div class="right">
                    <button class="btn" data-sell-animal-id="${aniId}">Sælg 1</button>
                    <button class="btn" data-sell-all-animal-id="${aniId}">Sælg alle</button>
                </div>
            </div>`;
    }).join('');
}

function renderAvailableAnimals() {
    const defs = window.data.defs;
    const state = window.data.state;
    const currentStage = Number(state.user?.currentstage || 0);

    const ownedBuildingFamilies = new Set(
        Object.keys(state.bld || {}).map(bldId => _animalsParseBldKey(bldId)?.family).filter(Boolean)
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

    const { total: totalCap, used: usedCap, available: availableCap } = _animalsGetAnimalCap();

    return availableAnimals.map(([key, def]) => {
        const aniId = `ani.${key}`;
        // Animal stats store capacity consumption as negative numbers.
        // Use absolute value so sliders reflect how many we can fit.
        const capCost = Math.abs(def.stats?.animal_cap ?? 1) || 1;
        
        // RETTELSE: `max` er nu den absolutte maksimale mængde, der er plads til.
        const maxVal = Math.floor(Math.max(0, availableCap / capCost));

        return `
            <div class="item">
                <div class="icon">${def.emoji || '🐾'}</div>
                <div class="grow">
                    <div class="title">${def.name}</div>
                    <div class="sub">${_animalsRenderCostColored(_animalsNormalizePrice(def.cost), true)}</div>
                    <div class="sub">Kræver ${capCost} staldplads</div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                        <input type="range" class="slider" data-animal-slider-id="${aniId}" min="0" max="${maxVal}" value="0" style="flex-grow: 1;">
                        <span id="slider-value-${aniId.replace(/\./g, '-')}" style="font-weight: bold; width: 30px;">0</span>
                    </div>
                </div>
            </div>`;
    }).join('') + `
        <div class="actions-bar" style="margin-top: 16px;">
            <div id="animal-purchase-summary"></div>
            <button id="buy-animals-btn" class="btn primary">Køb Valgte Dyr</button>
        </div>`;
}

function updatePurchaseUI() {
    const defs = window.data.defs;
    const { total: totalCap, used: usedCap, available: availableCap } = _animalsGetAnimalCap();
    
    let totalCost = {};
    let capToUse = 0;
    
    for (const [aniId, qty] of Object.entries(animalsToBuy)) {
        if (qty > 0) {
            const def = defs.ani[aniId.replace(/^ani\./, '')];
            if (def) {
                const capCost = Math.abs(def.stats?.animal_cap ?? 1) || 1;
                capToUse += capCost * qty;
                const costs = _animalsNormalizePrice(def.cost);
                for (const c of Object.values(costs)) {
                    if (!totalCost[c.id]) totalCost[c.id] = { id: c.id, amount: 0 };
                    totalCost[c.id].amount += (c.amount * qty);
                }
            }
        }
    }

    const summaryEl = document.getElementById('animal-purchase-summary');
    if (summaryEl) {
        const costStr = _animalsRenderCostColored(totalCost, true) || '0';
        
        // =====================================================================
        // RETTELSE 1: Tilføj rød farve, hvis staldpladsen overskrides.
        // =====================================================================
        const finalUsedCap = usedCap + capToUse;
        const capColorClass = finalUsedCap > totalCap ? 'price-bad' : '';
        
        summaryEl.innerHTML = `<strong>Total:</strong> ${costStr} &nbsp; <strong>Staldplads:</strong> <span class="${capColorClass}">${finalUsedCap}</span> / ${totalCap}`;
    }
    
    const buyBtn = document.getElementById('buy-animals-btn');
    if (buyBtn) {
        // Tjekker nu også, om spilleren har råd.
        const affordCheck = _animalsCanAfford(totalCost);
        buyBtn.disabled = (capToUse === 0 || (usedCap + capToUse) > totalCap || !affordCheck.ok);
    }
}

window.renderAnimalsPage = () => {
    animalsToBuy = {};
    const main = $("#main");
    main.innerHTML = `
        <section class="panel section"><div class="section-head">Dine Dyr</div><div class="section-body">${renderOwnedAnimals()}</div></section>
        <section class="panel section"><div class="section-head">Køb Dyr</div><div class="section-body">${renderAvailableAnimals()}</div></section>`;
    updatePurchaseUI();
};

if (!window.__AnimalPageWired__) {
    window.__AnimalPageWired__ = true;
    
    // 'input' listeneren forbliver UÆNDRET
    document.addEventListener('input', (e) => {
        if (e.target.matches('[data-animal-slider-id]')) {
            const aniId = e.target.dataset.animalSliderId;
            const value = parseInt(e.target.value, 10);
            if (value > 0) {
                animalsToBuy[aniId] = value;
            } else {
                delete animalsToBuy[aniId];
            }
            document.getElementById(`slider-value-${aniId.replace(/\./g, '-')}`).textContent = value;
            updatePurchaseUI();
        }
    });

    // ERSTAT HELE DENNE 'click' LISTENER MED DEN NYE KODE
    document.addEventListener('click', async (e) => {
        const buyBtn = e.target.closest('#buy-animals-btn');
        if (buyBtn) {
            buyBtn.disabled = true;
            try {
                const payload = { action: 'buy', animals: animalsToBuy };
                const resp = await postJSON(`${BASE_API}/actions/animal.php`, payload);
                if (!resp.ok) throw new Error(resp.data.message);
                await dataApi.loadData();
                renderAnimalsPage();
                renderHeader?.();
                renderSidebar?.();
            } catch (err) {
                console.error("Failed to buy animals:", err);
                alert(`Køb fejlede: ${err.message}`);
                buyBtn.disabled = false;
            }
            return; // Vigtigt at stoppe her
        }
        
        // --- Helper funktion KUN for salg ---
        const getRefundInfo = (aniId, quantity) => {
            const key = aniId.replace(/^ani\./, '');
            const def = window.data?.defs?.ani?.[key];
            if (!def || !def.cost) return { text: '(Ukendt værdi)' };
            
            const costs = _animalsNormalizePrice(def.cost);
            const refundValue = {};
            for (const c of Object.values(costs)) {
                refundValue[c.id] = {
                    id: c.id,
                    amount: (c.amount * quantity) * 0.50 // 50% refusion
                };
            }
            
            // Brug den lokale _animalsRenderCostColored til at formatere teksten
            const refundText = _animalsRenderCostColored(refundValue, true);
            return { text: refundText };
        };

        const sellBtn = e.target.closest('[data-sell-animal-id]');
        if (sellBtn) {
            const aniId = sellBtn.dataset.sellAnimalId;
            const refund = getRefundInfo(aniId, 1);

            openConfirm({
                title: "Sælg 1 Dyr",
                body: `Er du sikker? Du får følgende tilbage:<br><div style="margin-top: 8px;">${refund.text}</div>`,
                confirmText: "Sælg",
                onConfirm: async () => {
                    try {
                        const payload = { action: 'sell', animal_id: aniId, quantity: 1 };
                        const resp = await postJSON(`${BASE_API}/actions/animal.php`, payload);
                        if (!resp.ok) throw new Error(resp.data.message);
                        await dataApi.loadData();
                        renderAnimalsPage();
                        renderHeader?.();
                        renderSidebar?.();
                    } catch (err) {
                        console.error("Failed to sell animal:", err);
                        alert(`Salg fejlede: ${err.message}`);
                    }
                }
            });
            return; // Vigtigt at stoppe her
        }
        
        const sellAllBtn = e.target.closest('[data-sell-all-animal-id]');
        if (sellAllBtn) {
            const aniId = sellAllBtn.dataset.sellAllAnimalId;
            const qty = Number(window.data?.state?.ani?.[aniId]?.quantity || 0);
            if (!qty) return;

            const refund = getRefundInfo(aniId, qty);
            
            openConfirm({
                title: "Sælg Alle Dyr",
                body: `Er du sikker på, at du vil sælge alle ${qty} dyr? Du får følgende tilbage:<br><div style="margin-top: 8px;">${refund.text}</div>`,
                confirmText: "Sælg Alle",
                onConfirm: async () => {
                    try {
                        const payload = { action: 'sell', animal_id: aniId, quantity: qty };
                        const resp = await postJSON(`${BASE_API}/actions/animal.php`, payload);
                        if (!resp.ok) throw new Error(resp.data.message);
                        await dataApi.loadData();
                        renderAnimalsPage();
                        renderHeader?.();
                        renderSidebar?.();
                    } catch (err) {
                        console.error("Failed to sell all animals:", err);
                        alert(`Salg fejlede: ${err.message}`);
                    }
                }
            });
        }
    });
}

// Check if player can afford a given aggregated price map: { rid: { id, amount } }
function _animalsCanAfford(map) {
    if (!map || Object.keys(map).length === 0) return { ok: true, miss: [] };
    const inv = window?.data?.state?.inv ?? {};
    const liquid = inv.liquid ?? {};
    const solid = inv.solid ?? {};
    const haveOf = (rid) => {
        const ridNoPrefix = String(rid).replace(/^res\./, "");
        const lastSeg = String(rid).split(".").pop();
        const v = liquid[rid] ?? solid[rid] ?? liquid[ridNoPrefix] ?? solid[ridNoPrefix] ?? liquid[lastSeg] ?? solid[lastSeg] ?? 0;
        return (typeof v === "object" && v !== null) ? +(v.amount ?? 0) : +v;
    };
    const miss = [];
    for (const row of Object.values(map)) {
        const rid = row?.id ?? "";
        const need = +(row?.amount ?? 0);
        if (!rid || need <= 0) continue;
        const have = haveOf(rid);
        if (have < need) miss.push({ rid, need, have });
    }
    return { ok: miss.length === 0, miss };
}
