import { useState, useCallback } from 'react';
import { triggerSummaryRefresh } from '../events/summaryEvents.js';
import { useGameData } from '../context/GameDataContext.jsx';


export default function useCitizensReproductionTick() {
  const { refreshData } = useGameData() || {};
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const tick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/world-spil/backend/api/actions/reproduction_tick.php', { credentials: 'include' });
      const json = await res.json();
      if (json.ok) {
        setResult(json.data);
        // Opdater både alldata (inv/user) og summary (stats)
        try {
          // kør refreshData i en microtask (ikke synkront i samme call-stack)
          if (typeof refreshData === 'function') {
            await Promise.resolve().then(() => refreshData());
          }
        } catch (e) {
          console.error('useCitizensReproductionTick: refreshData failed', e);
        }

        // Dispatch summary-refresh asynkront (macrotask) for at undgå at trigge hooks midt i render
        setTimeout(() => {
          try { triggerSummaryRefresh(); } catch (e) { console.error('useCitizensReproductionTick: triggerSummaryRefresh failed', e); }
        }, 0);
      } else {
        setError(json.error?.message || 'Ukendt fejl');
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [refreshData]);

  return { loading, result, error, tick };
}