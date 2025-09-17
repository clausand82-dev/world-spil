// src/hooks/useCategoryTree.js
import { useMemo } from 'react';
import dagre from 'dagre';
import { useGameData } from '../context/GameDataContext.jsx';

const nodeWidth = 200;
const nodeHeight = 80;

export function useCategoryTree(type) {
    const { data } = useGameData();

    return useMemo(() => {
        if (!data || !data.defs[type]) return { nodes: [], edges: [] };

        const { defs, state } = data;
        const nodes = new Map();
        const edges = new Set();

        // Funktion til at tilføje en node, hvis den ikke allerede findes
        const addNode = (id, nodeTypeOverride = null) => {
            if (nodes.has(id)) return;
            const itemType = nodeTypeOverride || id.split('.')[0];
            const key = id.replace(new RegExp(`^${itemType}\\.`), '');
            const def = defs[itemType]?.[key];
            if (def) {
                nodes.set(id, {
                    id,
                    type: 'universalNode',
                    data: { id, type: itemType, def },
                    position: { x: 0, y: 0 }
                });
            }
        };
        
        // 1. Tilføj alle noder af den primære type
        Object.keys(defs[type]).forEach(key => addNode(`${type}.${key}`));

        // 2. Find alle kanter (krav) der peger på vores noder
        for (const node of nodes.values()) {
            const reqs = String(node.data.def.require || '').split(/[,;]/).map(r => r.trim()).filter(Boolean);
            for (const reqId of reqs) {
                // Tilføj den krævede node (som kan være en anden type)
                addNode(reqId);
                // Tilføj kanten
                if (nodes.has(reqId)) {
                    edges.add(JSON.stringify({ id: `e-${reqId}-${node.id}`, source: reqId, target: node.id, type: 'smoothstep', markerEnd: {type: 'arrowclosed'} }));
                }
            }
        }

        // 3. Brug Dagre til at lave et pænt layout
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: 'LR', nodesep: 25, ranksep: 50 }); // Top-to-Bottom layout
        
        nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
        const finalEdges = Array.from(edges).map(e => JSON.parse(e));
        finalEdges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
        dagre.layout(dagreGraph);

        const layoutedNodes = Array.from(nodes.values()).map(node => {
            const nodePos = dagreGraph.node(node.id);
            if (nodePos) {
                node.position = { x: nodePos.x - nodeWidth / 2, y: nodePos.y - nodeHeight / 2 };
            }
            return node;
        });

        return { nodes: layoutedNodes, edges: finalEdges };
    }, [data, type]);
}