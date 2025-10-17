import React, { useEffect, useRef } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

export default function ResourceAutoRefresh({
  activeIntervalMs = 5000, // når der er jobs
  idleIntervalMs = 30000   // når der ikke er jobs
}) {
  const { refreshData } = useGameData() || {};
  const timerRef = useRef(null);

  const hasJobs = () =>
    !!(window.ActiveBuilds && Object.keys(window.ActiveBuilds).length > 0);

  const schedule = (ms) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(tick, Math.max(500, Number(ms) || 0));
  };

  const tick = async () => {
    if (document.visibilityState !== 'visible') {
      schedule(5000);
      return;
    }
    try {
      refreshData && (await refreshData());
    } finally {
      schedule(hasJobs() ? Math.max(2000, activeIntervalMs) : Math.max(10000, idleIntervalMs));
    }
  };

  useEffect(() => {
    schedule(0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshData && refreshData();
        schedule(hasJobs() ? Math.max(2000, activeIntervalMs) : Math.max(10000, idleIntervalMs));
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