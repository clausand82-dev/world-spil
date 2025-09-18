// src/components/DependencyGraph.jsx

import React, { useMemo } from 'react'; // <-- TRIN 1: Importer `useMemo`
import ReactFlow, { Background, Controls } from 'reactflow';
import { useCategoryTree } from '../hooks/useCategoryTree.js';
import UniversalNode from './UniversalNode.jsx';

import 'reactflow/dist/style.css';

export default function DependencyGraph({ type }) {
    // =====================================================================
    // TRIN 2: Brug `useMemo` til at "låse" nodeTypes-objektet
    // =====================================================================
    const nodeTypes = useMemo(() => ({ universalNode: UniversalNode }), []);

    const { nodes, edges } = useCategoryTree(type);

    if (nodes.length === 0) {
        return <div className="sub" style={{padding: '20px'}}>Ingen data for denne kategori.</div>
    }

    return (
        <div style={{ height: '100%', width: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}