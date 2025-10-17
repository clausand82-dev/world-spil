import React, { useEffect, useRef } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

export default function ResourceAutoRefresh({
  activeIntervalMs = 5000, // when jobs run
  idleIntervalMs = 30000   // when idle
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

  function schedule(ms) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(tick, Math.max(500, Number(ms) || 0));
  }

  async function tick() {
    if (document.visibilityState !== 'visible') {
      schedule(5000);
      return;
    }
    try {
      refreshData && (await refreshData());
    } finally {
      const next = hasJobs() ? Math.max(2000, activeIntervalMs) : Math.max(10000, idleIntervalMs);
      schedule(next);
    }
  }

  useEffect(() => {
    schedule(0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshData && refreshData();
        const next = hasJobs() ? Math.max(2000, activeIntervalMs) : Math.max(10000, idleIntervalMs);
        schedule(next);
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