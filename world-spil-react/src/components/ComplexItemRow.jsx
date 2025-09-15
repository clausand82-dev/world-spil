import React from 'react';

/**
 * En mere avanceret række-komponent, der tillader fuld kontrol
 * over midter- og højre-sektionerne.
 */
export default function ComplexItemRow({ icon, middleContent, rightContent }) {
    return (
        <div className="item">
            <div className="icon">{icon}</div>
            <div>{middleContent}</div>
            <div className="right">{rightContent}</div>
        </div>
    );
}