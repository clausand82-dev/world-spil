import React, { useEffect, useState } from 'react';
import CapacityBar from './CapacityBar.jsx';

export default function HousingHeader() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

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
      }
    })();
    return () => { alive = false; };
  }, []);

  if (err) return <div style={{ color: 'red' }}>Fejl: {err}</div>;
  if (!data) return null;

  const used = data?.capacities?.housing?.used || 0;
  const cap  = data?.capacities?.housing?.capacity || 0;
  const breakdown = data?.capacities?.housing?.breakdown || {};

  return (
    <CapacityBar
      label="Housing"
      used={used}
      capacity={cap}
      breakdown={breakdown}
      style={{ marginRight: 12 }}
    />
  );
}