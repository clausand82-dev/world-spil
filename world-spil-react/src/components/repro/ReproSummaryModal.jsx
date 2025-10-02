import React from 'react';
import ConfirmModal from '../ConfirmModal.jsx';
import { fmt } from '../../services/helpers.js';

function GroupList({ title, map }) {
  const entries = Object.entries(map || {}).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 14 }}>
        {entries.map(([k, v]) => (
          <li key={k}>{k}: {fmt(v)}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ReproSummaryModal({ open, onClose, data }) {
  if (!open) return null;

  // Saml totals over alle cycles
  const totals = { births: 0, immigration: 0, emigration: 0, deaths: 0 };
  const byGroup = {
    births: {}, immigration: {}, emigration: {}, deaths: {}, homeless: { toHomeless: 0, rehoused: 0 }
  };

  for (const cyc of (data?.byCycle || [])) {
    totals.births      += Number(cyc.births?.total      || 0);
    totals.immigration += Number(cyc.immigration?.total || 0);
    totals.emigration  += Number(cyc.emigration?.total  || 0);
    totals.deaths      += Number(cyc.deaths?.total      || 0);

    for (const [g, v] of Object.entries(cyc.births?.byGroup || {}))       byGroup.births[g] = (byGroup.births[g] || 0) + v;
    for (const [g, v] of Object.entries(cyc.immigration?.byGroup || {}))  byGroup.immigration[g] = (byGroup.immigration[g] || 0) + v;
    for (const [g, v] of Object.entries(cyc.emigration?.byGroup || {}))   byGroup.emigration[g] = (byGroup.emigration[g] || 0) + v;
    for (const [g, v] of Object.entries(cyc.deaths?.byGroup || {}))       byGroup.deaths[g] = (byGroup.deaths[g] || 0) + v;
    byGroup.homeless.toHomeless += Number(cyc.homeless?.toHomeless || 0);
    byGroup.homeless.rehoused   += Number(cyc.homeless?.rehoused   || 0);
  }

  return (
    <ConfirmModal
      isOpen={open}          // vigtige ændring (var: open={open})
      onCancel={onClose}
      onConfirm={onClose}
      confirmText="OK"
      cancelText="Luk"
      title="Befolkning – sidste kørsel"
    >
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        <div style={{ marginBottom: 8 }}>
          <div>Cycles: {fmt(data?.cycles || 0)}</div>
          <div>Fødsler: {fmt(totals.births)} | Tilflyttere: {fmt(totals.immigration)} | Fraflyttere: {fmt(totals.emigration)} | Dødsfald: {fmt(totals.deaths)}</div>
          <div>Hjemløse: +{fmt(byGroup.homeless.toHomeless)} / Rehoused: {fmt(byGroup.homeless.rehoused)}</div>
        </div>
        <GroupList title="Fødsler (til)" map={byGroup.births} />
        <GroupList title="Tilflyttere (til)" map={byGroup.immigration} />
        <GroupList title="Fraflyttere (fra)" map={byGroup.emigration} />
        <GroupList title="Dødsfald (fra)" map={byGroup.deaths} />
      </div>
    </ConfirmModal>
  );
}