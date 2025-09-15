import React from 'react';
import { fmt } from '../services/helpers.js';

/**
 * En mere fleksibel, genbrugelig komponent til at vise en række.
 * Den kan nu håndtere et "children"-element for mere komplekst indhold.
 */
export default function ItemRow({ icon, title, subtitle, value, children }) {
    return (
        <div className="item">
            <div className="icon">{icon}</div>
            {/* Hvis der er "children", render dem. Ellers, brug standard-layout. */}
            {children ? (
                children
            ) : (
                <>
                    <div>
                        <div className="title">{title}</div>
                        {subtitle && <div className="sub">{subtitle}</div>}
                    </div>
                    <div className="right">
                        <strong>{value}</strong>
                    </div>
                </>
            )}
        </div>
    );
}