import React from 'react';
export default function StatRequirement({ icon, value, isOk = true, title = '' }) {
    if (!value && value !== 0) return null;
    return <span className={isOk ? 'price-ok' : 'price-bad'} title={title}>{icon} {value}</span>;
}