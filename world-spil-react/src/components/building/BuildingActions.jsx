import React from 'react';
import ActionButton from '../ActionButton.jsx';
import BuildProgress from '../BuildProgress.jsx';
import { useT } from "../../services/i18n.js";

function BuildingActions({ actionItem, canStart, jobActiveId }) {
  const t = useT();
  const progressTarget = jobActiveId || actionItem?.id;
  return (
    <div className="actions-bar">
      {actionItem ? (
        <>
          <ActionButton item={actionItem} allOk={canStart} />
          {progressTarget ? <BuildProgress bldId={progressTarget} /> : null}
        </>
      ) : (
        <span className="badge owned">{t("ui.btn.owned.h1")}</span>
      )}
      <button className="btn" disabled>{t("ui.btn.repair.h1")}</button>
      <button className="btn" disabled>{t("ui.btn.demolish.h1")}</button>
    </div>
  );
}

export default BuildingActions;
