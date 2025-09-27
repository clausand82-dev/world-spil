import React, { useState, useRef, useEffect } from 'react';

/**
 * HoverCard
 * - Åbner på hover/focus/klik
 * - Lukker først efter en lille forsinkelse, så man kan flytte musen fra trigger → kort uden at det forsvinder
 * - Når musen er over selve kortet, forbliver det åbent
 */
export default function HoverCard({
  children,
  content,
  placement = 'bottom',
  offset = 8,
  style,
  cardStyle,
  interactive = true,
  closeDelay = 150, // ms forsinkelse på luk
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const closeTimerRef = useRef(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), closeDelay);
  };

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
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={scheduleClose}
      onClick={() => setOpen(v => !v)} // klik kan “pinne” åbent, stadig med luk-forsinkelse når man forlader
      tabIndex={0}
    >
      {children}
      {open && content && (
        <div
          style={{ ...posStyle, ...cardStyle }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()} // så klik i kortet ikke toggler wrapper
        >
          {content}
        </div>
      )}
    </div>
  );
}