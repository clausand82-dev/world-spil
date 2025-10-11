import React, { useEffect, useMemo, useRef } from 'react';

/**
 * Popover-style ResourceActionModal that anchors at click coords if present,
 * otherwise falls back to bounding rect or centered fallback.
 *
 * Props:
 * - isOpen, onClose, onPick, canGlobal, resId
 * - anchorRect: { top,left,width,height,right,bottom } absolute page coords
 * - click: { x, y } absolute page coords (preferred)
 */

export default function ResourceActionModal({ isOpen, onClose, onPick, canGlobal, resId, anchorRect, click }) {
  const ref = useRef(null);

  // click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [isOpen, onClose]);

  // compute position; prefer click coords (exact), then anchorRect, then center
  const style = useMemo(() => {
    const base = { position: 'absolute', zIndex: 9999, minWidth: 160, maxWidth: 420, boxShadow: '0 8px 30px rgba(2,6,23,0.6)', borderRadius: 10, background: 'var(--panel-bg,#0f1724)', color: 'var(--text,#e6eef8)', padding: 10 };
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const gap = 8;

    // 1) Use exact click position if provided (preferred) — place slightly below/right of cursor
    if (click && typeof click.x === 'number' && typeof click.y === 'number') {
      let left = click.x + 8;
      let top = click.y + 8;
      // adjust to avoid overflow right/bottom
      const approxW = 240;
      const approxH = 140;
      if (left + approxW > viewportW - 12) left = Math.max(12, viewportW - 12 - approxW);
      if (top + approxH > viewportH - 12) top = Math.max(12, viewportH - 12 - approxH);
      // convert to page coords (account scroll)
      left = left + window.scrollX;
      top = top + window.scrollY;
      return { ...base, left: `${left}px`, top: `${top}px` };
    }

    // 2) anchorRect
    if (anchorRect) {
      let left = anchorRect.left + (anchorRect.width / 2) - 110;
      let top = anchorRect.bottom + gap;
      if (left + 220 > viewportW - 12) left = Math.max(12, viewportW - 12 - 220);
      if (left < 12) left = 12;
      if (top + 160 > viewportH - 12) {
        top = Math.max(12, anchorRect.top - gap - 160);
      }
      left = left + window.scrollX;
      top = top + window.scrollY;
      return { ...base, left: `${left}px`, top: `${top}px` };
    }

    // 3) fallback center
    return { ...base, left: '50%', top: '40%', transform: 'translate(-50%,-50%)' };
  }, [anchorRect, click]);

  if (!isOpen) return null;

  return (
    <div ref={ref} style={style} role="dialog" aria-modal="true" aria-label="Vælg handels-type">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Vælg handels-type</div>
        <button className="icon-btn" onClick={onClose} aria-label="Luk">✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#cbd5e1' }}>Ressource: <b style={{ color: '#fff' }}>{resId}</b></div>

        <button className="tab" onClick={() => onPick('local')} style={{ display: 'block', width: '100%', textAlign: 'center' }}>
          Lokal handel
        </button>

        {canGlobal ? (
          <button className="tab" onClick={() => onPick('global')} style={{ display: 'block', width: '100%', textAlign: 'center' }}>
            Globalt marked
          </button>
        ) : (
          <div style={{ fontSize: 12, color: '#6b7280', padding: '6px 8px', borderRadius: 6 }}>
            Globalt marked låst ved nuværende stage.
          </div>
        )}
      </div>
    </div>
  );
}