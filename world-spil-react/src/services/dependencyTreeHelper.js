import dagre from 'dagre';

// Konstanter til at styre layoutet
const nodeWidth = 180;
const nodeHeight = 60;

/**
 * Hovedfunktionen, der bygger det komplette afhængighedstræ.
 * @param {object} defs - Det fulde defs-objekt fra din spildata.
 * @returns {object} - Et objekt med `initialNodes` og `initialEdges` klar til React Flow.
 */
export function buildGlobalDependencyTree(defs) {
    if (!defs) return { initialNodes: [], initialEdges: [] };

    const nodes = new Map();
    const edges = new Set(); // Brug et Set for at undgå duplikerede kanter

    // --- Trin 1: Opret en node for hver enhed i spillet ---
    
    // Funktion til at tilføje en node til vores map
    const addNode = (id, type, data) => {
        if (!nodes.has(id)) {
            nodes.set(id, {
                id,
                type: 'universalNode', // Vi bruger én custom node-type
                data: { id, type, def: data },
                position: { x: 0, y: 0 }, // Position beregnes senere
            });
        }
    };
    
    // Tilføj alle enheder fra defs
    Object.entries(defs.bld || {}).forEach(([key, def]) => addNode(`bld.${key}`, 'building', def));
    Object.entries(defs.add || {}).forEach(([key, def]) => addNode(`add.${key}`, 'addon', def));
    Object.entries(defs.rsd || {}).forEach(([key, def]) => addNode(`rsd.${key}`, 'research', def));
    /*Object.entries(defs.rcp || {}).forEach(([key, def]) => addNode(`rcp.${key}`, 'recipe', def));
    /*Object.entries(defs.res || {}).forEach(([key, def]) => addNode(`res.${key}`, 'resource', def));
    Object.entries(defs.ani || {}).forEach(([key, def]) => addNode(`ani.${key}`, 'animal', def));*/


    // --- Trin 2: Opret kanter baseret på afhængigheder ---

    // Funktion til at tilføje en kant
    const addEdge = (source, target, label, type = 'requires') => {
        if (nodes.has(source) && nodes.has(target)) {
            edges.add(JSON.stringify({
                id: `e-${source}-${target}-${label}`,
                source,
                target,
                label,
                type: 'smoothstep',
                markerEnd: { type: 'arrowclosed' },
                data: { type }
            }));
        }
    };

    // Gennemgå alle noder og find deres afhængigheder
    for (const node of nodes.values()) {
        const { id: childId, type, data: { def } } = node;

        // 1. Krav fra `require`-feltet
        const reqs = String(def.require || '').split(/[,;]/).map(r => r.trim()).filter(Boolean);
        for (const reqId of reqs) {
            addEdge(reqId, childId, 'requires');
        }

        // 2. Krav fra `cost`-feltet
        /*const costs = def.cost || [];
        for (const costItem of costs) {
            const costId = costItem.id || costItem.rid || costItem.resource;
            if (costId) {
                // Find den korrekte fulde ID (f.eks. 'wood' -> 'res.wood')
                const fullCostId = defs.res?.[costId] ? `res.${costId}` : (defs.ani?.[costId] ? `ani.${costId}` : costId);
                addEdge(fullCostId, childId, `costs ${costItem.amount}`);
            }
        }*/
        
        // 3. Output fra `yield`-feltet (omvendt pil)
        /*const yields = def.yield || [];
        for (const yieldItem of yields) {
            const yieldId = yieldItem.id || yieldItem.rid || yieldItem.resource;
            if (yieldId) {
                const fullYieldId = defs.res?.[yieldId] ? `res.${yieldId}` : (defs.ani?.[yieldId] ? `ani.${yieldId}` : yieldId);
                addEdge(childId, fullYieldId, `produces ${yieldItem.amount}`, 'produces');
            }
        }*/
    }
    
    // --- Trin 3: Beregn automatisk layout med Dagre ---
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    //dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 25, ranksep: 60 }); // Left-to-Right layout
    dagreGraph.setGraph({ rankdir: 'TB', align: 'UL', nodesep: 15, ranksep: 160 });

    nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
    const finalEdges = Array.from(edges).map(e => JSON.parse(e));
    finalEdges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));

    dagre.layout(dagreGraph);

    // Opdater node-positioner med de beregnede koordinater
    const layoutedNodes = Array.from(nodes.values()).map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        if (nodeWithPosition) {
            node.position = {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            };
        }
        return node;
    });

    return { initialNodes: layoutedNodes, initialEdges: finalEdges };
}