import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const DockCtx = createContext(null);

// No-op fallback så app ikke crasher, hvis provider mangler
const NOOP_CTX = {
  show: () => {},
  hide: () => {},
};

export function DockTooltipProvider({ children, position = { bottom: 78, right: 16 } }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(null);
  const hideTimer = useRef(null);

  const clearTimer = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };

  const show = useCallback((node) => {
    clearTimer();
    setContent(node);
    setOpen(true);
  }, []);

  const hide = useCallback((delay = 200) => {
    clearTimer();
    hideTimer.current = setTimeout(() => { setOpen(false); setContent(null); }, delay);
  }, []);

  const value = { show, hide };

  return (
    <DockCtx.Provider value={value}>
      {children}
      <div
        onMouseEnter={clearTimer}
        onMouseLeave={() => hide(200)}
        style={{
          position: 'fixed',
          zIndex: 1000,
          bottom: position.bottom,
          right: position.right,
          maxWidth: 420,
          minWidth: 280,
          pointerEvents: open ? 'auto' : 'none',
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0px)' : 'translateY(8px)',
          transition: 'opacity 120ms ease, transform 120ms ease',
        }}
      >
        {open && (
          <div
            className="panel"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
              padding: 12,
            }}
          >
            {content}
          </div>
        )}
      </div>
    </DockCtx.Provider>
  );
}

export function useDockTooltip() {
  const ctx = useContext(DockCtx);
  return ctx || NOOP_CTX;
}