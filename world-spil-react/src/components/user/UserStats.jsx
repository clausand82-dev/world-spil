import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import Icon from '../ui/Icon.jsx';
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

// helper: hent iconUrl eller fallback til assets/pic/{key}.png
function resIcon(defs, rid){
  const id = String(rid||'');
  const key = id.startsWith('res.') ? id.slice(4) : id;
  const u = defs?.res?.[key]?.iconUrl;
  if (u && typeof u === 'string') return u;

  // safe access to import.meta.env without using `typeof import`
  let base = '/';
  try {
    base = import.meta?.env?.BASE_URL || '/';
  } catch (e) {
    base = '/';
  }

  return `${base}assets/pic/${key}.png`;
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

  function StatCard({ title, lines = [] }) {
    return (
      <div style={{
        padding: 12,
        borderRadius: 8,
        background: 'var(--panel-surface, transparent)',
        border: '1px solid var(--panel-border, rgba(0,0,0,0.06))',
        boxShadow: 'var(--panel-shadow, none)',
        minWidth: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {lines.map((l, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-color, inherit)' }}>{l}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ background: 'var(--panel-bg, transparent)', padding: 12 }}>
      <div className="section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Statistik</div>
          <div className="sub" style={{ color: 'var(--muted-color, #666)' }}>Oversigt over aktivitet og ressourcer</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="sub" style={{ fontSize: 12, color: 'var(--muted-color, #666)' }}>Top N</label>
          <input type="number" min={1} max={100} value={topN} onChange={e=>setTopN(Number(e.target.value||10))} style={{ width: 80 }} />
          <button className="btn" onClick={fetchStats} disabled={loading} style={{ padding: '6px 10px' }}>{loading ? 'Opdaterer…' : 'Opdater'}</button>
        </div>
      </div>

      <div className="section-body" style={{ paddingTop: 12 }}>
        <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12}}>
          <div>
            <label>Fra (UTC)</label><br/>
            <input type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" style={{width:220}} />
          </div>
          <div>
            <label>Til (UTC)</label><br/>
            <input type="text" value={dateTo} onChange={e=>setDateTo(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" style={{width:220}} />
          </div>
        </div>

        {err && <div className="error" style={{marginBottom:12}}>{err}</div>}

        {stats && (
          <>
            {/* Stat cards - responsive grid så de fylder bredden */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginBottom: 12
            }}>
              <StatCard title="Bygninger" lines={[
                `Færdige: ${stats?.totals?.buildings_completed ?? 0}`,
                `Afbrudt: ${stats?.totals?.by_scope?.bld?.canceled ?? 0}`,
                `Tid brugt: ${fmtSec(stats?.totals?.time_spent_seconds?.building ?? 0)}`
              ]}/>
              <StatCard title="Addons" lines={[
                `Færdige: ${stats?.totals?.addons_completed ?? 0}`,
                `Afbrudt: ${stats?.totals?.by_scope?.add?.canceled ?? 0}`,
                `Tid brugt: ${fmtSec(stats?.totals?.time_spent_seconds?.addons ?? 0)}`
              ]}/>
              <StatCard title="Research" lines={[
                `Færdige: ${stats?.totals?.research_completed ?? 0}`,
                `Afbrudt: ${stats?.totals?.by_scope?.rsd?.canceled ?? 0}`,
                `Tid brugt: ${fmtSec(stats?.totals?.time_spent_seconds?.research ?? 0)}`
              ]}/>
              <StatCard title="Samlet" lines={[
                `Færdige i alt: ${stats?.totals?.builds_completed ?? 0}`,
                `Afbrudt i alt: ${stats?.totals?.builds_canceled ?? 0}`,
                `Tid brugt i alt: ${fmtSec(stats?.totals?.time_spent_seconds?.total ?? 0)}`
              ]}/>
            </div>

            {/* Resource lists - tre kolonner når muligt */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              marginBottom: 12
            }}>
              <div>
                <h4 style={{ marginTop: 0 }}>Top ressourcer (Yield)</h4>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  {yieldTopView.map(r => (
                    <li key={r.res_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 6 }}>
                      <Icon src={resIcon(defs, r.res_id)} size={18} alt={r.name} />
                      <span style={{ color: 'var(--text-color, inherit)' }}>{r.name}</span>
                      <span style={{ marginLeft: 'auto' }}>{r.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 style={{ marginTop: 0 }}>Top ressourcer (Forbrug)</h4>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  {consumedTopView.map(r => (
                    <li key={r.res_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 6 }}>
                      <Icon src={resIcon(defs, r.res_id)} size={18} alt={r.name} />
                      <span style={{ color: 'var(--text-color, inherit)' }}>{r.name}</span>
                      <span style={{ marginLeft: 'auto' }}>{r.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 style={{ marginTop: 0 }}>Top nettogevinst</h4>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  {netTopView.map(r => (
                    <li key={r.res_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 6 }}>
                      <Icon src={resIcon(defs, r.res_id)} size={18} alt={r.name} />
                      <span style={{ color: 'var(--text-color, inherit)' }}>{r.name}</span>
                      <span style={{ marginLeft: 'auto' }}>{r.net.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border, rgba(0,0,0,0.06))', margin: '12px 0' }} />

            {/* Charts - udnyt bredde og giv højere højde */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20
            }}>
              <div style={{ minHeight: 320, padding: 8, borderRadius: 6 }}>
                <h4 style={{ marginTop: 0 }}>Byg-events pr. dag</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={buildsSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ymd"/>
                    <YAxis allowDecimals={false}/>
                    <Tooltip/>
                    <Legend />
                    <Line type="monotone" dataKey="completed" stroke="var(--chart-success, #4caf50)" name="Færdige"/>
                    <Line type="monotone" dataKey="canceled" stroke="var(--chart-danger, #f44336)" name="Afbrudt"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ minHeight: 320, padding: 8, borderRadius: 6 }}>
                <h4 style={{ marginTop: 0 }}>Yield pr. dag (sum)</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={yieldSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date"/>
                    <YAxis/>
                    <Tooltip/>
                    <Bar dataKey="total_yield" fill="var(--chart-primary, #2196f3)" name="Yield"/>
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