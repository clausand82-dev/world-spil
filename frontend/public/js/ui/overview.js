/* =========================================================
   ui/overview.js
   - RETTET: Mere robust og sikker mod fejl i data.
========================================================= */

function formatTimeRemaining(totalSeconds) { /* ... uændret ... */ }

function renderActiveJobs(type) {
    const H = window.helpers;
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
        // RETTELSE: Ny, robust HTML-struktur for progress baren
        // Den fylder nu hele bunden og indeholder både tid og procent-label.
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
                    <div class="build-progress" data-pb-for="${jobId}" style="display:block; width: 100%;">
                        <div class="pb-track" style="position:relative; height:12px; background:var(--border,#ddd); border-radius:6px; overflow:hidden;">
                            <div class="pb-fill" style="height:100%; width:0%; background:var(--primary,#4aa);"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; opacity: 0.8;">
                            <span id="time-remaining-${jobId.replace(/\./g, '-')}"></span>
                            <span class="pb-label">0%</span>
                        </div>
                    </div>
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