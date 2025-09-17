import React from 'react';
import { Handle, Position } from 'reactflow';
import { useRequirements } from '../hooks/useRequirements.js'; // Importer den nye hook

export default function ResearchNode({ data }) {
    const { def, status } = data;
    
    // Brug den nye hook til at tjekke, om kravene er opfyldt
    const { allOk } = useRequirements({
        price: def.cost,
        req: def.require,
        footprintDelta: def.stats?.footprint
    });

    const statusClass = `research-node--${status}`;

    return (
        <div className={`research-node ${statusClass}`}>
            <Handle type="target" position={Position.Left} />
            <div className="research-node__header">
                <div className="icon">{def.icon || '🧪'}</div>
                <div className="title">{def.name}</div>
            </div>
            <div className="research-node__body">
                <div className="sub">{def.desc}</div>
            </div>
            <div className="research-node__footer">
                {status === 'available' && allOk && <button className="btn primary small">Research</button>}
                {status === 'available' && !allOk && <button className="btn small" disabled>Need more</button>}
                {status === 'locked' && <span className="badge">Locked</span>}
                {status === 'completed' && <span className="badge owned">✓ Completed</span>}
            </div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
}