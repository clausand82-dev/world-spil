import React, { useEffect, useState } from 'react';

export default function UserProfileCard({ endpoint = '/world-spil/backend/api/user/profile.php' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let abort = false;
    async function run() {
      setLoading(true); setErr(null);
      try {
        const res = await fetch(endpoint, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error?.message || 'Ukendt fejl');
        if (!abort) setData(json.data);
      } catch (e) {
        if (!abort) setErr(String(e.message || e));
      } finally {
        if (!abort) setLoading(false);
      }
    }
    run();
    return () => { abort = true; };
  }, [endpoint]);

  if (loading) return <div className="panel"><div className="section-head">Bruger</div><div className="section-body">Indlæser…</div></div>;
  if (err)     return <div className="panel"><div className="section-head">Bruger</div><div className="section-body error">{err}</div></div>;
  if (!data)   return null;

  return (
    <div className="panel">
      <div className="section-head">Bruger</div>
      <div className="section-body">
        <div><strong>Brugernavn:</strong> {data.username}</div>
        <div><strong>Email:</strong> {data.email || '—'}</div>
        <div><strong>Rolle:</strong> {data.role || 'player'}</div>
        <div><strong>Oprettet:</strong> {data.created_at || '—'}</div>
        <div><strong>Sidst logget ind:</strong> {data.last_login || '—'}</div>
        {/* Plads til “skift kodeord” senere */}
      </div>
    </div>
  );
}