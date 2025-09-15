import React, { useEffect, useRef } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

export default function ResourceAutoRefresh({ intervalMs = 5000 }) {
  const { refreshData } = useGameData() || {};
  const timerRef = useRef(null);

  useEffect(() => {
    function tick() {
      if (document.visibilityState !== 'visible') return;
      const hasJobs = !!(window.ActiveBuilds && Object.keys(window.ActiveBuilds).length > 0);
      if (hasJobs) refreshData && refreshData();
    }
    timerRef.current = setInterval(tick, Math.max(2000, intervalMs));
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshData, intervalMs]);

  return null;
}

