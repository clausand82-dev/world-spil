import React, { useState } from 'react';
import DependencyGraph from '../components/DependencyGraph.jsx';

export default function TechTreePage() {
    const [activeType, setActiveType] = useState('bld'); // Start med at vise bygninger
    const types = [
        { key: 'bld', label: 'Bygninger' },
        { key: 'add', label: 'Addons' },
        { key: 'rsd', label: 'Research' },
        { key: 'rcp', label: 'Recipes' }
    ];

    return (
        <section className="panel section" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 50px)' }}>
            <div className="section-head">
                🌳 Teknologitræ
                <div className="tabs" style={{ marginLeft: 'auto' }}>
                    {types.map(type => (
                        <button 
                            key={type.key}
                            className={`tab ${activeType === type.key ? 'active' : ''}`}
                            onClick={() => setActiveType(type.key)}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="section-body" style={{ flexGrow: 1, padding: 0 }}>
                <DependencyGraph type={activeType} />
            </div>
        </section>
    );
}