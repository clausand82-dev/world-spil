import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceCost from './ResourceCost.jsx';
import DemandList from './DemandList.jsx';
import StatRequirement from './StatRequirement.jsx';

// =====================================================================
// RETTELSE: Importer de nødvendige funktioner fra din helpers-fil.
// =====================================================================
import { normalizePrice, parseBldKey, hasResearch, computeOwnedMaxBySeries } from '../../services/helpers.js';


/**
 * En "hook", der indeholder den komplekse logik til at analysere et items krav.
 */
export function useRequirements(item) {
    const { data } = useGameData();
    if (!data || !item) {
        return { allOk: false, Component: () => null };
    }

    const { state, defs } = data;
    const { id, price, req, duration_s, footprintDelta, isUpgrade } = item;

    // RETTELSE: Kalder nu den importerede `normalizePrice` i stedet for `window.helpers.normalizePrice`
    const normalizedPrice = normalizePrice(price);
    let priceOk = true;
    for (const costItem of Object.values(normalizedPrice)) {
        let have = 0;
        if(costItem.id.startsWith('ani.')) have = state.ani?.[costItem.id]?.quantity ?? 0;
        else { const key = costItem.id.replace(/^res\./, ''); have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0; }
        if (have < costItem.amount) {
            priceOk = false;
            break;
        }
    }

    let reqOk = true;
    const reqIds = Array.isArray(req) ? req : String(req || '').split(/[,;]/).filter(Boolean);
    for (const reqId of reqIds) {
        let satisfied = false;
        if(reqId.startsWith('bld.')) { const p = parseBldKey(reqId); if(p) satisfied = (computeOwnedMaxBySeries('bld')[p.series] || 0) >= p.level; }
        else if(reqId.startsWith('rsd.')) { satisfied = hasResearch(reqId); }
        else if(reqId.startsWith('add.')) { const m=reqId.match(/^add\.(.+)\.l(\d+)$/); if(m) satisfied = (computeOwnedMaxBySeries('add')[`add.${m[1]}`]||0)>=Number(m[2]);}
        if (!satisfied) {
            reqOk = false;
            break;
        }
    }

    let footprintOk = true;
    const footprintCost = Math.abs(footprintDelta || 0);
    if (footprintCost > 0) {
        const cap = state.cap?.footprint || { total: 0, used: 0 };
        const availableCap = (cap.total || 0) - Math.abs(cap.used || 0);
        footprintOk = availableCap >= footprintCost;
    }

    const allOk = priceOk && reqOk && footprintOk;

    const RequirementsComponent = ({ showLabels = true, inline = true }) => (
        <div className="reqline">
            {showLabels && <strong>Pris: </strong>}
            <ResourceCost cost={price} />
            
            {reqIds.length > 0 && (inline ? ' • ' : <br/>)}
            {reqIds.length > 0 && showLabels && <strong>Krav: </strong>}
            <DemandList req={req} />

            {footprintCost > 0 && (inline ? ' • ' : <br/>)}
            {footprintCost > 0 && <StatRequirement icon="⬛" label="Byggepoint" value={`${footprintCost} BP`} isOk={footprintOk} />}
            
            {duration_s != null && (inline ? ' • ' : <br/>)}
            {duration_s != null && <StatRequirement icon="⏱️" label="Tid" value={`${duration_s}s`} />}
        </div>
    );

    return { allOk, Component: RequirementsComponent };
}