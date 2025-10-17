import { useState, useCallback } from 'react';
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
        await refreshData?.();  // ensure UI reflects changes
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