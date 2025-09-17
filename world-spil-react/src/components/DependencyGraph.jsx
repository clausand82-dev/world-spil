import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import { useCategoryTree } from '../hooks/useCategoryTree.js';
import UniversalNode from './UniversalNode.jsx';

import 'reactflow/dist/style.css';

const nodeTypes = { universalNode: UniversalNode };

/**
 * En genbrugelig komponent, der kan vise et afhængighedstræ for en given kategori.
 */
export default function DependencyGraph({ type }) {
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