/* =========================================================
   services/helpers.js
   - Et rent JavaScript-modul, der eksporterer genbrugelige funktioner.
   - 100% kompatibel med Reacts import/export-system.
========================================================= */

// --- Simple Formatters ---
export const fmt = (n) => (typeof n === "number" ? n.toLocaleString("da-DK") : String(n));

export const prettyTime = (secs) => {
    if (secs == null) return '';
    const s = Math.max(0, Math.round(+secs));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}h ${m}m ${ss}s` : (m ? `${m}m ${ss}s` : `${ss}s`);
};

// --- Parsere ---
export const parseBldKey = (key) => {
    const re = /^(?:bld\.)?(.+)\.l(\d+)$/i;
    const m = re.exec(String(key || ""));
    if (!m) return null;
    return { series: `bld.${m[1]}`, family: m[1], level: Number(m[2]) };
};

// --- Normalisering ---
export const normalizePrice = (cost) => {
    if (!cost) return {};
    const out = {};
    if (Array.isArray(cost)) {
        cost.forEach((row) => {
            const id = row.id ?? row.rid ?? row.resource ?? row.type;
            const amount = row.amount ?? row.qty ?? row.value;
            if (id && Number(amount)) out[String(id)] = { id: String(id), amount: Number(amount) };
        });
    } else if (typeof cost === 'object') {
        for (const [key, spec] of Object.entries(cost)) {
            const amount = (typeof spec === 'object' && spec !== null) ? Number(spec.amount ?? 0) : Number(spec ?? 0);
            if (amount) out[key] = { id: key, amount };
        }
    }
    return out;
};

// --- State-relaterede funktioner ---
// Disse funktioner tager nu `state` som et argument for at være "rene"
// og uafhængige af det globale `window`-objekt.

export const computeOwnedMaxBySeries = (stateKey = 'bld', state) => {
    if (!state) return {};
    const bySeries = {};
    const prefix = stateKey;
    const source = state?.[stateKey] || {};
    for (const key of Object.keys(source)) {
        const m = key.match(new RegExp(`^${prefix}\\.(.+)\\.l(\\d+)$`));
        if (m) {
            const series = `${prefix}.${m[1]}`;
            const level = Number(m[2]);
            bySeries[series] = Math.max(bySeries[series] || 0, level);
        }
    }
    return bySeries;
};

export const ownedResearchMax = (seriesFull, state) => {
    if (!state?.research) return 0;
    let max = 0;
    const seriesKey = seriesFull.replace(/^rsd\./, '');
    for (const key in state.research) {
        if (key.startsWith(seriesKey + ".l")) {
            const m = key.match(/\.l(\d+)$/);
            if (m) max = Math.max(max, Number(m[1]));
        }
    }
    return max;
};

// =====================================================================
// RETTELSE: Denne funktion er nu simplificeret og korrekt.
// Den kigger kun i `state.research` og håndterer levels korrekt.
// =====================================================================
export const hasResearch = (rsdIdFull, state) => {
    if (!rsdIdFull || !state?.research) return false;

    // Først, tjek for et eksakt match i `state.research`
    const key = String(rsdIdFull).replace(/^rsd\./, '');
    if (state.research[key]) {
        return true;
    }
    
    // Dernæst, håndter level-baseret logik:
    // Hvis man ejer et højere level, ejer man også de lavere.
    const m = String(rsdIdFull).match(/^rsd\.(.+)\.l(\d+)$/);
    if (!m) {
        // Hvis der ikke er et level i ID'et, og den ikke blev fundet ovenfor,
        // så ejer spilleren den ikke.
        return false;
    }
    
    const seriesName = m[1];
    const requiredLevel = Number(m[2]);
    const seriesFull = `rsd.${seriesName}`;

    // Find det højeste level, spilleren ejer i denne serie
    const ownedMax = ownedResearchMax(seriesFull, state);

    // Kravet er opfyldt, hvis spillerens højeste ejede level er >= det krævede.
    return ownedMax >= requiredLevel;
};

// --- Defs-relaterede funktioner ---
export const groupDefsBySeriesInStage = (defs, currentStage, prefix) => {
    const out = {};
    for (const [key, def] of Object.entries(defs || {})) {
        const stage = Number(def?.stage ?? 0);
        if (stage > currentStage) continue;
        const m = key.match(/^(.+)\.l(\d+)$/i);
        if (m) {
            const series = `${prefix}.${m[1]}`;
            (out[series] ||= []).push({ key, def, level: Number(m[2]) });
        }
    }
    for (const s in out) {
        out[s].sort((a, b) => a.level - b.level);
    }
    return out;
};

export const pickNextTargetInSeries = (seriesItems, ownedMaxLevel) => {
    if (!Array.isArray(seriesItems) || seriesItems.length === 0) return null;
    const targetLevel = (ownedMaxLevel || 0) + 1;
    return seriesItems.find(x => x.level === targetLevel) || null;
};