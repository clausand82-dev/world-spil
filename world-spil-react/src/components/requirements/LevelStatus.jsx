import React from 'react';
export default function LevelStatus({ isOwned, isUpgrade, ownedMax }) {
    let text = 'Ikke bygget';
    if(isOwned) text = `Level ${ownedMax} (maks)`;
    else if (isUpgrade) text = `Level ${ownedMax} → Level ${ownedMax + 1}`;
    return <span>{text}</span>;
}