import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';

export default function Activity({ activity: activityProp }) {
  const { data } = useGameData();
  const activity = useMemo(() => activityProp || data?.userActivity || [
    { title: 'Logget ind', when: 'for 2 timer siden' },
    { title: 'Afsluttet mission', when: 'i går' },
  ], [data, activityProp]);

  if (!activity.length) return <div className="muted">Ingen aktivitet</div>;

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {activity.map((a, i) => (
        <li
          key={i}
          style={{
            padding: 8,
            borderRadius: 6,
            background: 'var(--panel-row-bg, #0f172a)',
            border: `1px solid var(--panel-border, #f0f0f0)`,
            color: 'var(--text-color, inherit)'
          }}
        >
          <div style={{ fontSize: 13 }}>{a.title}</div>
          <div className="sub" style={{ fontSize: 12, color: 'var(--muted-color, #666)' }}>{a.when}</div>
        </li>
      ))}
    </ul>
  );
}