import React from 'react';

export default function LevelStatus({ isOwned, isUpgrade, ownedMax, stageLocked = false, stageReq }) {
  let text = '🏠 Ikke bygget';
  if (isOwned) text = `⛔ Level ${ownedMax} (maks)`;
  else if (isUpgrade) text = `⏫ Level ${ownedMax} → Level ${ownedMax + 1}`;
  if (!isOwned && stageLocked && ownedMax > 0) {
    text = `Level ${ownedMax} (stage låst${stageReq ? `: kræver Stage ${stageReq}` : ''})`;
  }
  return <span>{text}</span>;
}

