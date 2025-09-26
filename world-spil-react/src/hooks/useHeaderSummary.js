import { useEffect, useState } from 'react';

export default function useHeaderSummary() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch('/world-spil/backend/api/header/summary.php');
        const json = await resp.json();
        if (!alive) return;
        if (json.ok) setData(json.data);
        else setErr(json.error?.message || 'Ukendt fejl');
      } catch (e) {
        if (alive) setErr(e.message || 'Netværksfejl');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { data, err, loading };
}