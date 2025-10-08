import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';

/**
 * TabLivePanel
 * Live panel tilknyttet aktivt tab. Understøtter:
 * - placement: 'bar' | 'dock' | 'inline'
 * - draggable (dock): brug header som "drag handle", gem position i localStorage
 * - collapsible: vis/skjul og husk tilstand i localStorage
 *
 * Props:
 * - placement: 'bar' | 'dock' | 'inline' (default: 'bar')
 * - choices: objekt med dine valg
 * - compute: (choices, ctx) => {
 *     title?: string,
 *     subtitle?: string,
 *     rows?: Array<{ label: string, value: any, desc?: string }>,
 *     total?: { label: string, value: any, desc?: string },
 *     notes?: string[],
 *   }
 * - draggable?: boolean (default: false) — kun relevant for placement='dock'
 * - collapsible?: boolean (default: true)
 * - initialCollapsed?: boolean (default: false)
 * - storageKey?: string (anbefales, fx 'health-tab-live')
 * - stickyTop?: number (kun for placement='bar', default 56)
 * - defaultPosition?: { right?: number, bottom?: number } — initial anchor-pos for dock (default { right:16, bottom:76 })
 * - className?: string, style?: object
 */
export default function TabLivePanel({
  placement = 'bar',
  choices,
  compute,
  draggable = false,
  collapsible = true,
  initialCollapsed = false,
  storageKey = '',
  stickyTop = 56,
  defaultPosition = { right: 16, bottom: 76 },
  className = '',
  style = {},
}) {
  const { data: summary } = useHeaderSummary();
  const { data: gameData } = useGameData();
  const ctx = useMemo(() => ({ summary, gameData }), [summary, gameData]);

  const panelRef = useRef(null);

  // "abs" = bruger top/left; "anchor" = bruger right/bottom fra defaultPosition indtil første drag
  const [posMode, setPosMode] = useState('anchor'); // 'anchor' | 'abs'
  const [pos, setPos] = useState({ top: 0, left: 0 }); // bruges kun når posMode === 'abs'

  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, top: 0, left: 0 });

  // load persisted state
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`TabLivePanel:${storageKey}`);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved?.collapsed === 'boolean') setCollapsed(saved.collapsed);
      if (typeof saved?.top === 'number' && typeof saved?.left === 'number') {
        setPosMode('abs');
        setPos({ top: saved.top, left: saved.left });
      }
    } catch (e) {
      // ignore
    }
  }, [storageKey]);

  const persist = useCallback((next) => {
    if (!storageKey) return;
    try {
      const prev = localStorage.getItem(`TabLivePanel:${storageKey}`);
      const base = prev ? JSON.parse(prev) : {};
      const data = { ...base, ...next };
      localStorage.setItem(`TabLivePanel:${storageKey}`, JSON.stringify(data));
    } catch (e) {
      // ignore
    }
  }, [storageKey]);

  // compute result
  const result = useMemo(() => {
    try {
      return typeof compute === 'function' ? compute(choices, ctx) : null;
    } catch (e) {
      console.warn('TabLivePanel compute error', e);
      return null;
    }
  }, [choices, ctx, compute]);

  // drag handlers (kun dock + draggable)
  const onPointerDown = useCallback((e) => {
    if (placement !== 'dock' || !draggable) return;
    if (!panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    // Skift til absolut top/left ved første drag
    if (posMode !== 'abs') setPosMode('abs');

    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      top: rect.top,
      left: rect.left,
    };
    try { panelRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }, [placement, draggable, posMode]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const nextTop = Math.max(0, dragStart.current.top + dy);
    const nextLeft = Math.max(0, dragStart.current.left + dx);

    // clamp til viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = panelRef.current?.offsetWidth || 320;
    const h = panelRef.current?.offsetHeight || 200;

    setPos({
      top: Math.min(vh - h, nextTop),
      left: Math.min(vw - w, nextLeft),
    });
  }, [dragging]);

  const endDrag = useCallback((e) => {
    if (!dragging) return;
    setDragging(false);
    try { panelRef.current?.releasePointerCapture(e.pointerId); } catch (_) {}
    // persist pos
    persist({ top: pos.top, left: pos.left });
  }, [dragging, pos, persist]);

  const toggleCollapsed = useCallback(() => {
    if (!collapsible) return;
    setCollapsed((c) => {
      const next = !c;
      persist({ collapsed: next });
      return next;
    });
  }, [collapsible, persist]);

  // Render helpers
  const Title = result?.title ? <div style={{ fontWeight: 700 }}>{result.title}</div> : null;
  const Subtitle = result?.subtitle ? (
    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{result.subtitle}</div>
  ) : null;

  const Rows = Array.isArray(result?.rows) && result.rows.length > 0 ? (
    <ul style={{ margin: 8, marginTop: 6, paddingLeft: 0, listStyle: 'none' }}>
      {result.rows.map((r, idx) => (
        <li key={idx} style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontWeight: 600 }}>{r.label}</span>
            <span style={{ textAlign: 'right' }}>{fmtVal(r.value)}</span>
          </div>
          {r.desc ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{r.desc}</div> : null}
        </li>
      ))}
    </ul>
  ) : null;

  const Total = result?.total ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 700, marginTop: 6 }}>
      <span>{result.total.label}</span>
      <span style={{ textAlign: 'right' }}>{fmtVal(result.total.value)}</span>
    </div>
  ) : null;

  const Notes = Array.isArray(result?.notes) && result.notes.length > 0 ? (
    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
      {result.notes.map((n, i) => (
        <li key={i} style={{ fontSize: 12, opacity: 0.8 }}>{n}</li>
      ))}
    </ul>
  ) : null;

  const hasBody = Rows || Total || Notes;

  const Header = (
    <div
      className="tablive-header"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        cursor: (placement === 'dock' && draggable) ? 'move' : 'default',
        paddingBottom: hasBody ? 8 : 0,
        borderBottom: hasBody ? '1px solid var(--border)' : 'none',
        userSelect: dragging ? 'none' : 'auto',
      }}
      role="toolbar"
      aria-label="Live panel"
    >
      <div style={{ minWidth: 0 }}>
        {Title}
        {Subtitle}
      </div>
      {collapsible ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="btn"
          style={{ padding: '2px 8px' }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandér live panel' : 'Kollaps live panel'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      ) : null}
    </div>
  );

  const Core = (
    <div
      ref={panelRef}
      className={`panel ${className}`.trim()}
      role="complementary"
      aria-live="polite"
      style={{
        background: 'var(--panel, #fff)',
        color: 'var(--text, #222)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        boxShadow: '0 8px 28px rgba(0,0,0,0.08)',
        padding: 12,
        minWidth: 280,
        maxWidth: 560,
        ...style,
      }}
    >
      {Header}
      {!collapsed && (
        <div style={{ marginTop: 8 }}>
          {Rows}
          {Total}
          {Notes}
        </div>
      )}
      {collapsed && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          Klik {placement === 'dock' && draggable ? 'og træk for at flytte, ' : ''}▸ for at åbne
        </div>
      )}
    </div>
  );

  if (placement === 'dock') {
    const positionStyle =
      posMode === 'abs'
        ? { position: 'fixed', top: Math.round(pos.top), left: Math.round(pos.left) }
        : { position: 'fixed', right: defaultPosition.right ?? 16, bottom: defaultPosition.bottom ?? 76 };

    return (
      <div style={{ zIndex: 1400, pointerEvents: 'auto', ...positionStyle }}>
        {Core}
      </div>
    );
  }

  if (placement === 'bar') {
    return (
      <div style={{ position: 'sticky', top: stickyTop, zIndex: 30 }}>
        {Core}
      </div>
    );
  }

  // inline
  return Core;
}

function fmtVal(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  return String(v);
}