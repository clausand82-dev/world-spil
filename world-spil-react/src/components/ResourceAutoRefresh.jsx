import React, { useEffect, useRef } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

// To-trins auto-refresh:
// - Hurtigt når der er aktive jobs
// - Langsommere når der ikke er jobs
// - Pause når fanen er skjult
// - Revalidate straks ved fokus/visning
export default function ResourceAutoRefresh({
  activeIntervalMs = 5000, // når der er jobs
  idleIntervalMs = 30000   // når der ikke er jobs
}) {
  const { refreshData } = useGameData() || {};
  const timerRef = useRef(null);

  function hasJobs() {
    try {
      return !!(window.ActiveBuilds && Object.keys(window.ActiveBuilds).length > 0);
    } catch {
      return false;
    }
  }

  function schedule(nextMs) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(tick, Math.max(500, Number(nextMs) || 0));
  }

  async function tick() {
    // Skån ressourcer når fanen ikke er synlig
    if (document.visibilityState !== 'visible') {
      schedule(5000);
      return;
    }

    try {
      refreshData && (await refreshData());
    } finally {
      const interval = hasJobs()
        ? Math.max(2000, activeIntervalMs)
        : Math.max(10000, idleIntervalMs);
      schedule(interval);
    }
  }

  useEffect(() => {
    // Start straks
    schedule(0);

    // Revalidate når brugeren vender tilbage til fanen
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // Kør en hurtig revalidate nu
        refreshData && refreshData();
        // Genplanlæg med passende interval
        const interval = hasJobs()
          ? Math.max(2000, activeIntervalMs)
          : Math.max(10000, idleIntervalMs);
        schedule(interval);
      }
    };

    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshData, activeIntervalMs, idleIntervalMs]);

  return null;
}