import React from 'react';
import { Handle, Position } from 'reactflow';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';

// En lille hjælpefunktion til at få den rigtige status-klasse
function getStatus(id, state) {
    if (id.startsWith('bld.')) {
        return state.bld?.[id] ? 'owned' : 'unowned';
    }
    if (id.startsWith('rsd.')) {
        return H.hasResearch(id, state) ? 'owned' : 'unowned';
    }
    if (id.startsWith('add.')) {
        return state.add?.[id] ? 'owned' : 'unowned';
    }
    return 'neutral';
}

export default function UniversalNode({ data }) {
    const { state } = useGameData().data;
    const { id, type, def } = data;
    
    const status = getStatus(id, state);
    const statusClass = `universal-node--${status}`;

    return (
        <div className={`universal-node ${statusClass}`} title={id}>
            {/* Indgående pile forbinder her */}
            <Handle type="target" position={Position.Left} />

            <div className="universal-node__header">
                <div className="icon">{def.emoji || def.icon || '❔'}</div>
                <div className="title">{def.name || id.split('.').pop()}</div>
            </div>
            
            <div className="universal-node__type">
                {type}
            </div>

            {/* Udgående pile starter her */}
            <Handle type="source" position={Position.Right} />
        </div>
    );
}