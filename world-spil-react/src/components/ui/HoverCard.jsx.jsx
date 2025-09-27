import React, { useState, useRef, useEffect } from 'react';

/**
 * Simpelt hovercard:
 * - Viser content på hover/focus, og på klik (mobil fallback).
 * - Placement: 'bottom' | 'right' (basic offset/align).
 * - Ingen eksterne dependencies.
 */
export default function HoverCard({
  children,
  content,
  placement = 'bottom',
  offset = 8,
  style,
  cardStyle,
  interactive = true,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const posStyle = (() => {
    const base = {
      position: 'absolute',
      zIndex: 1000,
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: 6,
      boxShadow: '0 6px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
      padding: 10,
      maxWidth: 320,
      color: '#222',
      fontSize: 12,
      lineHeight: 1.35,
      pointerEvents: interactive ? 'auto' : 'none',
    };
    if (placement === 'right') {
      return { ...base, left: `calc(100% + ${offset}px)`, top: 0 };
    }
    // default: bottom
    return { ...base, top: `calc(100% + ${offset}px)`, left: 0 };
  })();

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen(v => !v)} // mobil/tap fallback
      tabIndex={0}
    >
      {children}
      {open && content && (
        <div style={{ ...posStyle, ...cardStyle }}>
          {content}
        </div>
      )}
    </div>
  );
}