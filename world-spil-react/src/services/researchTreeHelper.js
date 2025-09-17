// src/services/researchTreeHelper.js
import dagre from 'dagre';
import * as H from './helpers.js';

const nodeWidth = 250;
const nodeHeight = 120;

// Denne funktion er hjernen. Den bygger hele træ-strukturen.
export function buildResearchTree(defs, state) {
    if (!defs || !defs.rsd) return { initialNodes: [], initialEdges: [] };

    const researchDefs = defs.rsd;
    const allNodes = new Map();
    const allEdges = [];

    // Trin 1: Opret en node for hver research-definition
    for (const [key, def] of Object.entries(researchDefs)) {
        const id = `rsd.${key}`;
        allNodes.set(id, {
            id,
            type: 'researchNode', // Vigtigt for custom-komponenten
            data: { def, id }, // Send hele definitionen med
            position: { x: 0, y: 0 }, // Positionen beregnes senere
        });
    }

    // Trin 2: Find relationer (kanter) baseret på `require`-feltet
    for (const [key, def] of Object.entries(researchDefs)) {
        const childId = `rsd.${key}`;
        const reqs = String(def.require || '').split(/[,;]/).map(r => r.trim()).filter(Boolean);
        
        for (const req of reqs) {
            if (req.startsWith('rsd.')) {
                const parentId = req;
                if (allNodes.has(parentId)) {
                    allEdges.push({
                        id: `e-${parentId}-${childId}`,
                        source: parentId,
                        target: childId,
                        type: 'smoothstep'
                    });
                }
            }
        }
    }

    // Trin 3: Brug Dagre til at beregne et pænt, horisontalt layout
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR' }); // LR = Left to Right

    allNodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
    allEdges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));

    dagre.layout(dagreGraph);

    // Trin 4: Opdater node-positioner med de beregnede koordinater fra Dagre
    const layoutedNodes = Array.from(allNodes.values()).map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };
        
        // Trin 5: Tilføj status (completed, available, locked) til hver node
        const parents = allEdges.filter(e => e.target === node.id).map(e => e.source);
        const parentsCompleted = parents.every(pId => H.hasResearch(pId, state));
        
        if (H.hasResearch(node.id, state)) {
            node.data.status = 'completed';
        } else if (parentsCompleted) {
            node.data.status = 'available';
        } else {
            node.data.status = 'locked';
        }

        return node;
    });

    return { initialNodes: layoutedNodes, initialEdges: allEdges };
}