// src/hooks/useRequirements.js
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';

// Lokal hjælpefunktion til at tjekke, om en spiller har råd
function _canAfford(price, state) {
    for (const item of Object.values(H.normalizePrice(price))) {
        let have = 0;
        if (item.id.startsWith('ani.')) have = state.ani?.[item.id]?.quantity ?? 0;
        else { const key = item.id.replace(/^res\./, ''); have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0; }
        if (have < item.amount) return { ok: false };
    }
    return { ok: true };
}

// Lokal hjælpefunktion til at tjekke `req`-krav
function _isReqSatisfied(reqId, state) {
    if (reqId.startsWith('bld.')) { const p = H.parseBldKey(reqId); return p ? (H.computeOwnedMaxBySeries('bld', state)[p.series] || 0) >= p.level : false; }
    if (reqId.startsWith('rsd.')) return H.hasResearch(reqId, state);
    if (reqId.startsWith('add.')) { const m = reqId.match(/^add\.(.+)\.l(\d+)$/); return m ? (H.computeOwnedMaxBySeries('add', state)[`add.${m[1]}`] || 0) >= Number(m[2]) : false; }
    return false;
}

/**
 * En genbrugelig "hook", der indeholder den komplekse logik til at analysere et items krav.
 */
export function useRequirements(item) {
    const { data } = useGameData();
    if (!data || !item) return { allOk: false };

    const { state } = data;
    const { price, req, footprintDelta } = item;
    
    const priceOk = _canAfford(price, state).ok;
    
    let reqOk = true;
    for (const reqId of String(req || '').split(/[,;]/).filter(Boolean)) {
        if (!_isReqSatisfied(reqId, state)) {
            reqOk = false;
            break;
        }
    }
    
    let footprintOk = true;
    if ((footprintDelta || 0) < 0) {
        const cap = state.cap?.footprint || {};
        const available = (cap.total || 0) - Math.abs(cap.used || 0);
        footprintOk = available >= Math.abs(footprintDelta);
    }
    
    return { allOk: priceOk && reqOk && footprintOk };
}