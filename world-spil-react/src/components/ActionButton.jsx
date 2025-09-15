import React from 'react';

export default function ActionButton({ item, allOk }) {
    if (!item) return null;
    const { id, isUpgrade, isOwned, stageLocked, def } = item;
    const isActive = !!window.ActiveBuilds?.[id];

    if (isActive) return <button className="btn" data-cancel-build={id}>Cancel</button>;
    if (isOwned) return <span className="badge owned">Owned</span>;
    if (stageLocked) return <span className="badge stage-locked price-bad" title={`Kræver Stage ${def.stage}`}>Stage Locked</span>;
    if (allOk) {
        const label = isUpgrade ? "Upgrade" : "Build";
        return <button className="btn primary" data-fakebuild-id={id} data-buildmode="timer">{label}</button>;
    }
    return <button className="btn" disabled>Need more</button>;
}