// src/pages/ResearchTreePage.jsx

import React, { useMemo } from 'react'; // <-- TRIN 1: Importer `useMemo`
import ReactFlow, { ReactFlowProvider, Background, Controls } from 'reactflow';
import { useGameData } from '../context/GameDataContext.jsx';
import { buildResearchTree } from '../services/researchTreeHelper.js';
import ResearchNode from '../components/ResearchNode.jsx';

import 'reactflow/dist/style.css';

export default function ResearchTreePage() {
    const { data, isLoading, error } = useGameData();
    
    // Vi bruger useMemo her også for at være sikre
    const memoizedNodeTypes = useMemo(() => ({ researchNode: ResearchNode }), []);

    const { initialNodes, initialEdges } = useMemo(() => {
        if (!data) return { initialNodes: [], initialEdges: [] };
        return buildResearchTree(data.defs, data.state);
    }, [data]);

    if (isLoading) return <div className="sub">Bygger forskningstræ...</div>;
    if (error) return <div className="sub">Fejl.</div>;

    return (
        <div style={{ height: 'calc(100vh - 50px)', width: '100%' }}>
            <ReactFlowProvider>
                <ReactFlow
                    nodes={initialNodes}
                    edges={initialEdges}
                    nodeTypes={memoizedNodeTypes}
                    fitView
                    proOptions={{ hideAttribution: true }}
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}