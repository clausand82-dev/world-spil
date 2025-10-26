import React, { useEffect, useRef, useState, useMemo } from "react";
import { useGameData } from "../context/GameDataContext.jsx";
import { notifyActiveBuildsChanged, updateActiveBuilds } from "../services/activeBuildsStore.js";
import useSharedTicker from "../hooks/useSharedTicker.js";
import ProgressBar from "./ui/ProgressBar.jsx"; // samme komponent som dashboard bruger

function toTs(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  const d = Date.parse(v);
  return Number.isFinite(d) ? d : 0;
}

export default function BuildProgress({ bldId, style }) {
  const { refreshData, applyResourceDeltaMap } = useGameData() || {};
  const [pct, setPct] = useState(0);
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("0%");
  const [completedOnce, setCompletedOnce] = useState(false);
  const completingRef = useRef(false);
  const lastAttemptRef = useRef(0);

  // Use shared ticker (single interval for app) to reduce per-row intervals
  const now = useSharedTicker(500); // 500ms is usually a good tradeoff

  const getActive = () => {
    const job = window.ActiveBuilds?.[bldId];
    if (!job) return null;
    let startTs = job.startTs ?? toTs(job.start_utc);
    let endTs = job.endTs ?? toTs(job.end_utc);
    if ((!startTs || !endTs) && job.durationS) {
      if (startTs) endTs = startTs + job.durationS * 1000;
    }
    return { startTs, endTs, jobId: job?.jobId };
  };

  // compute pct/label based on current time; memo not strictly necessary but keeps function stable
  useEffect(() => {
    const a = getActive();
    if (!a || !a.startTs || !a.endTs) {
      if (active) {
        setActive(false);
        setPct(0);
        setLabel("0%");
      }
      return;
    }

    const span = Math.max(1, a.endTs - a.startTs);
    const p = Math.max(0, Math.min(1, (now - a.startTs) / span));
    const percent = Math.round(p * 100);

    setActive(true);
    setPct(p * 100);
    setLabel(`${percent}%`);

    // completion check (best-effort); throttle attempts
    if (p >= 1 && !completedOnce) {
      const overMs = now - a.endTs;
      // small slack for clock skew
      if (overMs < 2000) return;
      if (completingRef.current) return;
      if (now - lastAttemptRef.current < 1500) return;

      completingRef.current = true;
      lastAttemptRef.current = now;

      // fire-and-forget completion attempt (do not block UI)
      (async () => {
        try {
          const jobId = a.jobId;
          if (jobId) {
            const resp = await fetch("/world-spil/backend/api/actions/build_complete.php", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ job_id: jobId }),
            });

            if (resp.ok) {
              const json = await resp.json();
              if (json.ok) {
                setCompletedOnce(true);
                // avoid in-place mutation; notify store
                updateActiveBuilds((map) => { delete map[bldId]; });
                if (json.delta && json.delta.resources) {
                  applyResourceDeltaMap && applyResourceDeltaMap(json.delta.resources);
                }
                // refresh in background (do not await here to keep UI snappy)
                refreshData && refreshData().catch((e) => console.warn("refreshData failed", e));
              } else {
                // server not ready yet
                completingRef.current = false;
              }
            } else {
              // server returned non-ok (try again later)
              completingRef.current = false;
            }
          } else {
            completingRef.current = false;
          }
        } catch (e) {
          completingRef.current = false;
        }
      })();
    }
  }, [now, bldId, completedOnce, applyResourceDeltaMap, refreshData, active]);

  if (!active) return null;

  // Keep presentation consistent with dashboard's ProgressBar, and add accessible wrapper
  return (
    <div className="build-progress" style={{ minWidth: 120, ...style }}>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{ width: '100%' }}>
        <ProgressBar percent={pct} height={10} color="#2c7be5" />
      </div>
      <div className="label" style={{ fontSize: 12, marginTop: 4, textAlign: "right" }}>{label}</div>
    </div>
  );
}