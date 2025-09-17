import React, { useMemo } from 'react';
import ReactFlow, { ReactFlowProvider, Background } from 'reactflow';
import { useGameData } from '../context/GameDataContext.jsx';
import { buildResearchTree } from '../services/researchTreeHelper.js';
import ResearchNode from '../components/ResearchNode.jsx';

// Importer React Flow's CSS
import 'reactflow/dist/style.css';

// Fortæl React Flow om vores custom node-type
const nodeTypes = { researchNode: ResearchNode };

export default function ResearchTreePage() {
    const { data, isLoading, error } = useGameData();

    // useMemo er afgørende her for at undgå at genberegne træet på hver render
    const { initialNodes, initialEdges } = useMemo(() => {
        if (!data) return { initialNodes: [], initialEdges: [] };
        return buildResearchTree(data.defs, data.state);
    }, [data]);

    if (isLoading) return <div className="sub">Bygger forskningstræ...</div>;
    if (error) return <div className="sub">Fejl.</div>;

    return (
        <div style={{ height: 'calc(100vh - 100px)', width: '100%' }}>
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                nodeTypes={nodeTypes}
                fitView // Zoomer automatisk ud, så hele træet kan ses
            >
                <Background />
            </ReactFlow>
        </div>
    );
}