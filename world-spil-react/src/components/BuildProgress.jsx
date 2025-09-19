import React, { useEffect, useRef, useState } from "react";
import { useGameData } from "../context/GameDataContext.jsx";
import { notifyActiveBuildsChanged, updateActiveBuilds } from "../services/activeBuildsStore.js";

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
  const intervalRef = useRef(null);
  const [completedOnce, setCompletedOnce] = useState(false);
  const completingRef = useRef(false);
  const lastAttemptRef = useRef(0);

  const getActive = () => {
    const job = window.ActiveBuilds?.[bldId];
    if (!job) return null;
    let startTs = job.startTs ?? toTs(job.start_utc);
    let endTs = job.endTs ?? toTs(job.end_utc);
    if ((!startTs || !endTs) && job.durationS) {
      if (startTs) endTs = startTs + job.durationS * 1000;
    }
    return { startTs, endTs };
  };

  useEffect(() => {
    async function tick() {
      const a = getActive();
      if (!a || !a.startTs || !a.endTs) {
        setActive(false);
        setPct(0);
        setLabel("0%");
        return;
      }
      const now = Date.now();
      const span = Math.max(1, a.endTs - a.startTs);
      const p = Math.max(0, Math.min(1, (now - a.startTs) / span));
      setActive(true);
      setPct(p * 100);
      setLabel(`${Math.round(p * 100)}%`);

      if (p >= 1 && !completedOnce) {
        const overMs = now - a.endTs;
        // Lidt slack for clocks skew/server diff
        if (overMs < 2000) return;
        if (completingRef.current) return;
        if (now - lastAttemptRef.current < 1500) return;

        completingRef.current = true;
        lastAttemptRef.current = now;
        try {
          const jobId = window.ActiveBuilds?.[bldId]?.jobId;
          if (jobId) {
            const resp = await fetch("/world-spil/backend/api/actions/build_complete.php", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ job_id: jobId }),
            });
            if (resp.ok) {
              const json = await resp.json();
              if (json.ok) {
                setCompletedOnce(true);

                // VIGTIGT: undgå in-place mutation og notifér subscribers
                updateActiveBuilds((map) => {
                  delete map[bldId];
                });

                if (json.delta && json.delta.resources) {
                  applyResourceDeltaMap && applyResourceDeltaMap(json.delta.resources);
                }
                refreshData && refreshData();
              } else {
                // Server siger "endnu ikke færdig" -> prøv igen senere
                completingRef.current = false;
              }
            } else {
              // fx 400 = ikke færdig endnu
              completingRef.current = false;
            }
          } else {
            completingRef.current = false;
          }
        } catch {
          completingRef.current = false;
        }
      }
    }

    tick();
    intervalRef.current = setInterval(tick, 250);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [bldId, completedOnce, applyResourceDeltaMap, refreshData]);

  if (!active) return null;

  return (
    <div className="build-progress" style={{ minWidth: 120, ...style }}>
      <div className="bar-wrap" style={{ background: "#eee", borderRadius: 6, height: 10 }}>
        <div
          className="bar"
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "#2c7be5",
            borderRadius: 6,
            transition: "width 150ms linear",
          }}
        />
      </div>
      <div className="label" style={{ fontSize: 12, marginTop: 4, textAlign: "right" }}>{label}</div>
    </div>
  );
}