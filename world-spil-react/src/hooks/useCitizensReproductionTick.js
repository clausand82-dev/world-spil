import { useState, useCallback } from 'react';

export default function useCitizensReproductionTick() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // API endpoint til tick
  const tick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/world-spil/backend/api/actions/reproduction_tick.php', {
        credentials: 'include',
      });
      const json = await res.json();
      if (json.ok) setResult(json.data);
      else setError(json.error?.message || 'Ukendt fejl');
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, error, tick };
}