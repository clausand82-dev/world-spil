import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts';

function z(n){ return n<10?'0'+n:''+n; }
function utcNow(){ const d=new Date(); return `${d.getUTCFullYear()}-${z(d.getUTCMonth()+1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}`; }
function utcMinus(days){
  const d=new Date(Date.now() - days*24*3600*1000);
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth()+1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}`;
}
function fmtSec(s){
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return `${h}t ${m}m`;
}
function resName(defs, rid){
  const id = String(rid||'');
  const key = id.startsWith('res.') ? id.slice(4) : id;
  const n = defs?.res?.[key]?.name || defs?.res?.[key]?.display_name;
  return n || id;
}

export default function UserStats({ endpoint = '/world-spil/backend/api/log/stats.php', defaultDays = 30 }) {
  const { data } = useGameData();
  const defs = data?.defs || null;

  const [dateFrom, setDateFrom] = useState(utcMinus(defaultDays));
  const [dateTo, setDateTo] = useState(utcNow());
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [topN, setTopN] = useState(10);

  async function fetchStats() {
    setLoading(true); setErr(null);
    try {
      const u = new URL(endpoint, window.location.origin);
      u.searchParams.set('date_from', dateFrom);
      u.searchParams.set('date_to', dateTo);
      u.searchParams.set('top_n', String(topN));
      const res = await fetch(u.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'Ukendt fejl');
      setStats(json);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ fetchStats(); /* eslint-disable-next-line react-hooks/exhaustive-deps */}, [endpoint, dateFrom, dateTo, topN]);

  const yieldTop = stats?.yields?.top || [];
  const consumedTop = stats?.consumed?.top || [];
  const netTop = stats?.net?.top || [];
  const buildsSeries = stats?.series?.builds_per_day || [];
  const yieldSeries = stats?.series?.yield_per_day || [];

  // Visningsdata m/ navne
  const yieldTopView = useMemo(() => yieldTop.map(r => ({ ...r, name: resName(defs, r.res_id) })), [yieldTop, defs]);
  const consumedTopView = useMemo(() => consumedTop.map(r => ({ ...r, name: resName(defs, r.res_id) })), [consumedTop, defs]);
  const netTopView = useMemo(() => netTop.map(r => ({ ...r, name: resName(defs, r.res_id) })), [netTop, defs]);

  return (
    <div className="panel">
      <div className="section-head">Statistik</div>
      <div className="section-body">
        <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12}}>
          <div>
            <label>Fra (UTC)</label><br/>
            <input type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" style={{width:200}} />
          </div>
          <div>
            <label>Til (UTC)</label><br/>
            <input type="text" value={dateTo} onChange={e=>setDateTo(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" style={{width:200}} />
          </div>
          <div>
            <label>Top N</label><br/>
            <input type="number" min={1} max={100} value={topN} onChange={e=>setTopN(Number(e.target.value||10))} style={{width:80}} />
          </div>
          <button onClick={fetchStats} disabled={loading}>{loading ? 'Opdaterer…' : 'Opdater'}</button>
        </div>

        {err && <div className="error" style={{marginBottom:12}}>{err}</div>}

        {stats && (
          <>
            <div style={{display:'flex', gap:24, flexWrap:'wrap'}}>
              <div>
                <h4>Bygninger</h4>
                <div>Færdige: {stats.totals?.buildings_completed ?? 0}</div>
                <div>Afbrudt: {stats.totals?.by_scope?.bld?.canceled ?? 0}</div>
                <div>Tid brugt: {fmtSec(stats.totals?.time_spent_seconds?.building ?? 0)}</div>
              </div>
              <div>
                <h4>Addons</h4>
                <div>Færdige: {stats.totals?.addons_completed ?? 0}</div>
                <div>Afbrudt: {stats.totals?.by_scope?.add?.canceled ?? 0}</div>
                <div>Tid brugt: {fmtSec(stats.totals?.time_spent_seconds?.addons ?? 0)}</div>
              </div>
              <div>
                <h4>Research</h4>
                <div>Færdige: {stats.totals?.research_completed ?? 0}</div>
                <div>Afbrudt: {stats.totals?.by_scope?.rsd?.canceled ?? 0}</div>
                <div>Tid brugt: {fmtSec(stats.totals?.time_spent_seconds?.research ?? 0)}</div>
              </div>
              <div>
                <h4>Samlet</h4>
                <div>Færdige i alt: {stats.totals?.builds_completed ?? 0}</div>
                <div>Afbrudt i alt: {stats.totals?.builds_canceled ?? 0}</div>
                <div>Tid brugt i alt: {fmtSec(stats.totals?.time_spent_seconds?.total ?? 0)}</div>
              </div>
            </div>

            <hr/>

            <h4>Top ressourcer (Yield)</h4>
            <ul>
              {yieldTopView.map(r => (
                <li key={r.res_id}>{r.name} — {r.amount.toLocaleString()}</li>
              ))}
            </ul>

            <h4>Top ressourcer (Forbrug)</h4>
            <ul>
              {consumedTopView.map(r => (
                <li key={r.res_id}>{r.name} — {r.amount.toLocaleString()}</li>
              ))}
            </ul>

            <h4>Top nettogevinst</h4>
            <ul>
              {netTopView.map(r => (
                <li key={r.res_id}>{r.name} — {r.net.toLocaleString()} (Y:{r.yielded.toLocaleString()} | F:{r.consumed.toLocaleString()})</li>
              ))}
            </ul>

            <hr/>

            <div style={{display:'grid', gridTemplateColumns:'minmax(250px,1fr) minmax(250px,1fr)', gap:20}}>
              <div>
                <h4>Byg-events pr. dag</h4>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={buildsSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ymd"/>
                    <YAxis allowDecimals={false}/>
                    <Tooltip/>
                    <Legend />
                    <Line type="monotone" dataKey="completed" stroke="#4caf50" name="Færdige"/>
                    <Line type="monotone" dataKey="canceled" stroke="#f44336" name="Afbrudt"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h4>Yield pr. dag (sum)</h4>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={yieldSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date"/>
                    <YAxis/>
                    <Tooltip/>
                    <Bar dataKey="total_yield" fill="#2196f3" name="Yield"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}