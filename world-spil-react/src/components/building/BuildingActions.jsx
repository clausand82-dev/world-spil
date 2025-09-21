import React, { useMemo, useState } from 'react';
import ActionButton from '../ActionButton.jsx';
import BuildProgress from '../BuildProgress.jsx';
import { useT } from "../../services/i18n.js";
import { useGameData } from '../../context/GameDataContext.jsx';
import { postJSON } from '../../services/api.js';

function fmtAmount(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '0';
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function costListToTitle(cost = [], prefix = '') {
  if (!Array.isArray(cost) || cost.length === 0) return '-';
  const body = cost
    .map(r => {
      const id = String(r.res_id || '').replace(/^res\./, '');
      const amt = fmtAmount(r.amount);
      return `${id}: ${amt}`;
    })
    .join(', ');
  return prefix ? `${prefix} ${body}` : body;
}

function spentListToResourceDelta(spent = []) {
  const map = {};
  if (!Array.isArray(spent)) return map;
  for (const row of spent) {
    const rid = String(row.res_id || '');
    const amt = Number(row.amount || 0);
    if (!rid || !amt) continue;
    map[rid] = (map[rid] ?? 0) - amt; // spent -> negativt delta
  }
  return map;
}

// Accepter både array og objekt-price
function normalizePriceLike(price) {
  if (!price) return [];
  if (Array.isArray(price)) {
    return price
      .map(p => ({ res_id: String(p.res_id || p.id || ''), amount: Number(p.amount || p.qty || 0) }))
      .filter(p => p.res_id && Number.isFinite(p.amount));
  }
  if (typeof price === 'object') {
    const out = [];
    const visitObj = (obj) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v == null) continue;
        if (typeof v === 'number') {
          const rid = k.startsWith('res.') ? k : `res.${k}`;
          out.push({ res_id: rid, amount: v });
        } else if (typeof v === 'object') {
          visitObj(v);
        }
      }
    };
    visitObj(price);
    return out;
  }
  return [];
}

function scaleCostList(costList, factor) {
  const f = Number.isFinite(factor) ? factor : 0;
  return (costList || []).map(it => ({ ...it, amount: Number(it.amount || 0) * f }));
}

function useDurabilityPct(buildingId) {
  const { data } = useGameData() || {};
  return useMemo(() => {
    if (!buildingId || !data?.state?.bld) return 100;
    return Number(data.state.bld[buildingId]?.durability_pct ?? 100);
  }, [data, buildingId]);
}

function useRepairPreview(buildingId) {
  const { data } = useGameData() || {};
  return useMemo(() => data?.repair_preview?.[buildingId] || null, [data, buildingId]);
}

function RepairButton({ buildingId, jobActiveId, repairBasePrice }) {
  const t = useT();
  const { refreshData, applyResourceDeltaMap } = useGameData() || {};
  const [busy, setBusy] = useState(false);

  const pct = useDurabilityPct(buildingId);
  const prev = useRepairPreview(buildingId);

  // Manglende holdbarhed (0..1)
  const missingFrac = (() => {
    const fromPreview = Number(prev?.missing_pct);
    if (Number.isFinite(fromPreview)) return Math.max(0, Math.min(1, fromPreview));
    const fallback = Math.max(0, (100 - Number(pct || 0)) / 100);
    return Math.min(1, fallback);
  })();

  // Estimat: NUVÆRENDE level-cost × missingFrac × 0.75
  const basePriceList = useMemo(() => normalizePriceLike(repairBasePrice), [repairBasePrice]);
  const estFactor = missingFrac * 0.75;
  const estCost = useMemo(() => scaleCostList(basePriceList, estFactor), [basePriceList, estFactor]);

  const canRepair = !!buildingId && !jobActiveId && missingFrac > 0 && !busy;
  const title =
    prev?.cost?.length ? costListToTitle(prev.cost) :
    estCost?.length ? costListToTitle(estCost, 'Estimeret:') :
    (pct < 100 ? 'Klik for at reparere' : '100%');

  const onClick = async () => {
    if (!canRepair) return;
    setBusy(true);
    try {
      const res = await postJSON('/world-spil/backend/api/actions/repair_building.php', { bld_id: buildingId });
      if (res?.ok) {
        if (Array.isArray(res.spent) && res.spent.length > 0) {
          applyResourceDeltaMap && applyResourceDeltaMap(spentListToResourceDelta(res.spent));
        }
        refreshData && refreshData();
      } else {
        alert(res?.message || 'Repair failed');
      }
    } catch (e) {
      alert(e?.message || 'Repair request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn" title={title} onClick={onClick} disabled={!canRepair}>
      {busy ? t("ui.btn.repair.working") : t("ui.btn.repair.h1")}
    </button>
  );
}

function BuildingActions({ actionItem, canStart, jobActiveId, buildingId, repairBasePrice }) {
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
      {buildingId ? (
        <RepairButton
          buildingId={buildingId}
          jobActiveId={jobActiveId}
          repairBasePrice={repairBasePrice}
        />
      ) : (
        <button className="btn" disabled>{t("ui.btn.repair.h1")}</button>
      )}
      <button className="btn" disabled>{t("ui.btn.demolish.h1")}</button>
    </div>
  );
}

export default BuildingActions;