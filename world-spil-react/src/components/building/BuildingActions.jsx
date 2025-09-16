import React from 'react';
import ActionButton from '../ActionButton.jsx';
import BuildProgress from '../BuildProgress.jsx';

function BuildingActions({ actionItem, canStart, jobActiveId }) {
  const progressTarget = jobActiveId || actionItem?.id;
  return (
    <div className="actions-bar">
      {actionItem ? (
        <>
          <ActionButton item={actionItem} allOk={canStart} />
          {progressTarget ? <BuildProgress bldId={progressTarget} /> : null}
        </>
      ) : (
        <span className="badge owned">Owned</span>
      )}
      <button className="btn" disabled>Repair</button>
      <button className="btn" disabled>Demolish</button>
    </div>
  );
}

export default BuildingActions;
