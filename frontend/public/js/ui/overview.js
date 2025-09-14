/* =========================================================
   ui/overview.js
   - RETTET: Mere robust og sikker mod fejl i data.
========================================================= */

function formatTimeRemaining(totalSeconds) { /* ... uændret ... */ }

 /* Genererer HTML for en liste af aktive jobs (bygninger, addons, eller research).
  RETTET: Inkluderer nu en "Cancel"-knap for hvert aktivt job.
 */
function renderActiveJobs(type) {
    let rows = [];
    const typeName = type === 'bld' ? 'Bygger' : (type === 'add' ? 'Addon' : 'Forsker');

    for (const jobId in (window.ActiveBuilds || {})) {
        if (!jobId.startsWith(`${type}.`)) continue;

        const job = window.ActiveBuilds[jobId];
        const key = jobId.replace(new RegExp(`^${type}\\.`), '');
        const def = window.data?.defs?.[type]?.[key];
        if (!def) continue;

        const level = Number(key.match(/\.l(\d+)$/)?.[1] || 1);
        const actionType = (level > 1) ? 'Opgraderer' : typeName;
        
        let linkHref = `#/`;
        if (type === 'bld' || type === 'add') {
            const family = key.replace(/\.l\d+$/, '');
            linkHref = `#/building/${family}.l1`;
        } else if (type === 'rsd') {
            linkHref = '#/research';
        }

        // =====================================================================
        // NYT, KORREKT LAYOUT
        // - Progress bar er nu under titlen og fylder hele bredden.
        // - Cancel-knappen er i sin egen kolonne til højre.
        // =====================================================================
        rows.push(`
            <div class="item">
                <div class="icon">${def.icon || '⏱️'}</div>
                <div class="grow" style="display: flex; flex-direction: column; gap: 4px;">
                    <div class="title"><a href="${linkHref}" class="link">${def.name || key}</a></div>
                    <div class="sub">
                        <span class="badge ${level > 1 ? 'price-warn' : 'price-ok'}">${actionType}</span>
                        ${type !== 'rsd' ? `<span>Level ${level}</span>` : ''}
                    </div>
                    <div class="build-progress" data-pb-for="${jobId}" style="display:block; width: 100%; margin-top: 8px;">
                        <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                            <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; opacity: 0.8;">
                            <span id="time-remaining-${jobId.replace(/\./g, '-')}"></span>
                            <span class="pb-label">0%</span>
                        </div>
                    </div>
                </div>
                <div class="right">
                    <button class="btn" data-cancel-build="${jobId}">Cancel</button>
                </div>
            </div>
        `);
    }
    return rows.length > 0 ? rows.join('') : `<div class="sub">Ingen aktive ${typeName.toLowerCase()}-jobs.</div>`;
}

function renderPassiveYields() {
    const aggregateYields = {};
    const processSource = (ownedItems, defsSource) => {
        for (const itemId in (ownedItems || {})) {
            const key = itemId.replace(/^(bld|add)\./, '');
            const def = defsSource?.[key];
            if (def?.yield && def.yield_period_s > 0) {
                for (const y of def.yield) {
                    const resId = y.id || y.res_id;
                    const amount = Number(y.amount);
                    if(resId && amount) {
                        const yieldPerHour = (amount / def.yield_period_s) * 3600;
                        aggregateYields[resId] = (aggregateYields[resId] || 0) + yieldPerHour;
                    }
                }
            }
        }
    };
    processSource(window.data?.state?.bld, window.data?.defs?.bld);
    processSource(window.data?.state?.add, window.data?.defs?.add);
    
    if (Object.keys(aggregateYields).length === 0) return `<div class="sub">Ingen passiv produktion.</div>`;

    return Object.entries(aggregateYields).map(([resId, amount]) => {
        const resKey = resId.replace(/^res\./, '');
        const resDef = window.data?.defs?.res?.[resKey];
        const formattedAmount = fmt(Math.round(amount * 10) / 10);
        return `<div class="item"><div class="icon">${resDef?.emoji||'❔'}</div><div><div class="title">${resDef?.name||resKey}</div></div><div class="right"><strong>+${formattedAmount}/time</strong></div></div>`;
    }).join('');
}

/**
 * NY FUNKTION: Beregner og aggregerer alt passivt udbytte.
 * Returnerer et struktureret objekt, klar til at blive renderet.
 */
function calculatePassiveYields() {
    const aggregated = {};
    const processSource = (ownedItems, defsSource, type) => {
        for (const itemId in (ownedItems || {})) {
            const state = ownedItems[itemId];
            const key = itemId.replace(new RegExp(`^${type}\\.`), '');
            const def = defsSource?.[key];
            if (def?.yield && def.yield_period_s > 0) {
                // Use nullish coalescing so 0 stays 0 (skip later)
                const quantity = Number(state?.quantity ?? 1);
                if (quantity <= 0) continue;
                for (const y of def.yield) {
                    const resId = y.id || y.res_id;
                    const amount = Number(y.amount);
                    if (!resId || !amount) continue;
                    const yieldPerHour = (amount / def.yield_period_s) * 3600 * quantity;
                    if (!aggregated[resId]) {
                        aggregated[resId] = { total: 0, sources: [] };
                    }
                    aggregated[resId].total += yieldPerHour;
                    aggregated[resId].sources.push({
                        name: def.name,
                        icon: def.emoji || def.icon || '❔',
                        amount: amount,
                        res_id: resId,
                        quantity: quantity,
                        period_s: def.yield_period_s // <-- VIGTIGT: Send period_s med
                    });
                }
            }
        }
    };
    processSource(window.data?.state?.bld, window.data?.defs?.bld, 'bld');
    processSource(window.data?.state?.add, window.data?.defs?.add, 'add');
    processSource(window.data?.state?.ani, window.data?.defs?.ani, 'ani');
    
    return aggregated;
}


/*
  NY, FORBEDRET FUNKTION: Renderer den interaktive yield-oversigt
 med korrekt detaljevisning pr. ressource.
 */
function renderInteractiveYields() {
    const aggregated = calculatePassiveYields();
    
    if (Object.keys(aggregated).length === 0) {
        return `<div class="sub">Ingen passiv produktion.</div>`;
    }

    return Object.entries(aggregated).map(([resId, data]) => {
        const resKey = resId.replace(/^res\./, '');
        const resDef = window.data?.defs?.res?.[resKey];
        const formattedTotal = fmt(Math.round(data.total));

        const sourcesGrouped = {};
        data.sources.forEach(source => {
            const key = `${source.name}_${source.quantity}`;
            if (!sourcesGrouped[key]) {
                sourcesGrouped[key] = {
                    name: source.name,
                    icon: source.icon,
                    quantity: source.quantity,
                    yields: []
                };
            }
            sourcesGrouped[key].yields.push({
                res_id: source.res_id,
                amount: source.amount,
                period_s: source.period_s // Vi skal have period_s med fra calculate-funktionen
            });
        });

        const detailsHtml = Object.values(sourcesGrouped).map(group => {
            return group.yields.map(y => {
                const yieldResKey = y.res_id.replace(/^res\./, '');
                const yieldResDef = window.data?.defs?.res?.[yieldResKey];
                
                // =====================================================================
                // RETTELSE: Beregn produktion pr. time for denne specifikke kilde.
                // =====================================================================
                const amountPerHour = (y.amount / y.period_s) * 3600 * group.quantity;
                const formattedAmountPerHour = fmt(Math.round(amountPerHour * 10) / 10); // Rund til 1 decimal

                return `
                    <div class="yield-source-item">
                        <span>${group.icon} ${group.name} ${group.quantity > 1 ? `(x${group.quantity})` : ''}</span>
                        <span>
                            <span style="opacity: 0.8;">producerer</span>
                            <strong>+${formattedAmountPerHour}</strong> ${yieldResDef?.emoji || ''} ${yieldResDef?.name || yieldResKey}
                            <span style="opacity: 0.8;">/ time</span>
                        </span>
                    </div>
                `;
            }).join('');
        }).join('');

        return `
            <div class="item collapsible-item" data-yield-res-id="${resId}">
                <div class="icon">${resDef?.emoji || '❔'}</div>
                <div class="grow">
                    <div class="title">${resDef?.name || resKey}</div>
                </div>
                <div class="right">
                    <strong>+${formattedTotal} / time</strong>
                    <span class="chevron">▶</span>
                </div>
            </div>
            <div class="collapsible-content" id="details-${resId.replace(/\./g, '-') }">
                ${detailsHtml}
            </div>
        `;
    }).join('');
}
