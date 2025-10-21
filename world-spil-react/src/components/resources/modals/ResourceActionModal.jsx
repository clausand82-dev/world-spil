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

export default function ResourceActionModal({ isOpen, onClose, onPick, canGlobal, resId, resName, resEmoji, anchorRect, click }) {
  const ref = useRef(null);
  // Helper: pænere label hvis der ikke er en eksplicit resName
  const formatResName = (id) => {
    if (!id) return '';
    return String(id)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  };
  const displayName = resName || formatResName(resId);
  // Renderer for provided resEmoji (string/url/html/object) -> returns JSX node
  const renderEmojiNode = (e) => {
    if (!e && e !== 0) return null;
    // If it's already a React node
    if (React.isValidElement(e)) return e;
    // If object with iconUrl
    if (typeof e === 'object') {
      const url = e.iconUrl ?? e.url ?? e.src ?? '';
      if (url) return <img src={url} alt="" style={{ width: '2em', height: '2em', objectFit: 'contain', verticalAlign: '-0.15em', display: 'inline-block' }} />;
      if (typeof e.emoji === 'string') return <span style={{ fontSize: '2em', lineHeight: 1 }}>{e.emoji}</span>;
      return null;
    }
    let s = String(e).trim();
    // strip a leading + or - if present (some sources prefix sign)
    s = s.replace(/^[+\-]\s*/, '');
    // raw <img ...> HTML -> extract src
    const m = s.match(/<img[^>]+src=(?:'|")?([^'">\s]+)/i);
    if (m && m[1]) {
      const src = m[1].startsWith('/') || m[1].startsWith('http') ? m[1] : `/assets/icons/${m[1]}`;
      return <img src={src} alt="" style={{ width: '2em', height: '2em', objectFit: 'contain', verticalAlign: '-0.15em', display: 'inline-block' }} />;
    }
    // if looks like URL or filename
    if (/^(\/|https?:\/\/)/.test(s) || /\.(png|jpe?g|svg|webp|gif)$/i.test(s)) {
      const src = (s.startsWith('/') || s.startsWith('http')) ? s : `/assets/icons/${s}`;
      return <img src={src} alt="" style={{ width: '2em', height: '2em', objectFit: 'contain', verticalAlign: '-0.15em', display: 'inline-block' }} />;
    }
    // otherwise treat as unicode/text emoji
    return <span style={{ fontSize: '2em', lineHeight: 1 }}>{s}</span>;
  };

  // Debug: log incoming emoji value (remove in production)
  useEffect(() => {
    if (!isOpen) return;
    console.debug('ResourceActionModal resEmoji:', resEmoji);
  }, [isOpen, resEmoji]);
  
  // keep a ready-to-use node (preserves older code that referenced displayEmoji)
  const displayEmoji = renderEmojiNode(resEmoji);

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
    const base = { zIndex: 9999, minWidth: 160, maxWidth: 420, boxShadow: '0 8px 30px rgba(2,6,23,0.6)', borderRadius: 10, background: 'var(--panel-bg,#0f1724)', color: 'var(--text,#e6eef8)', padding: 10 };
    // use helper to compute robust client-fixed coords
    const pos = computePopoverPosition({ click, rect: anchorRect });
    // ensure the popover uses fixed positioning (no scroll double-count)
    return { ...base, position: pos.position || 'fixed', left: pos.left, top: pos.top, transform: pos.transform || undefined };
  }, [anchorRect, click]);

  if (!isOpen) return null;

  return (
    <div ref={ref} style={style} role="dialog" aria-modal="true" aria-label="Vælg handels-type">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Vælg handels-type</div>
        <button className="icon-btn" onClick={onClose} aria-label="Luk">✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#cbd5e1' }}>
          Ressource:{' '}
          <b style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ marginRight: 8 }}>{displayEmoji}</span>
             <span>{displayName}</span>
           </b>
        </div>

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

function computePopoverPosition({ click, rect }) {
  // viewport størrelser (client coords)
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const viewportH = window.innerHeight || document.documentElement.clientHeight;

  // target client coordinates (relative to viewport)
  let clientX = null;
  let clientY = null;

  // Heuristik for click: kan være client eller page coords
  const normalizeClick = (c) => {
    if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') return null;
    const looksLikePageX = c.x > viewportW + 2;
    const looksLikePageY = c.y > viewportH + 2;
    return {
      x: looksLikePageX ? (c.x - window.scrollX) : c.x,
      y: looksLikePageY ? (c.y - window.scrollY) : c.y
    };
  };

  const normClick = normalizeClick(click);

  if (rect && typeof rect.left === 'number' && typeof rect.bottom === 'number') {
    // use rect for vertical placement (under element), but prefer click.x for horizontal if present
    clientY = rect.bottom - window.scrollY;
    if (normClick) {
      clientX = normClick.x; // horizontal from click
    } else {
      // fallback to center of rect horizontally
      clientX = (rect.left + (rect.width || 0) / 2) - window.scrollX;
    }
  } else if (normClick) {
    clientX = normClick.x;
    clientY = normClick.y;
  } else {
    // fallback: center of viewport
    clientX = viewportW / 2;
    clientY = viewportH / 2;
  }

  // desired offsets (px)
  const OFFSET_X = 8;
  const OFFSET_Y = 8;
  const approxW = 260; // estimeret popover width
  const approxH = 180; // estimeret popover height

  // initial client placement (slightly right/down from point)
  let leftClient = clientX + OFFSET_X;
  let topClient = clientY + OFFSET_Y;

  // adjust to avoid overflow right/bottom
  if (leftClient + approxW > viewportW - 12) leftClient = Math.max(12, viewportW - 12 - approxW);
  if (topClient + approxH > viewportH - 12) topClient = Math.max(12, viewportH - 12 - approxH);

  // convert client coords to CSS for a fixed-positioned element (no scroll needed)
  const leftCss = `${Math.round(leftClient)}px`;
  const topCss = `${Math.round(topClient)}px`;

  return { left: leftCss, top: topCss, position: 'fixed' };
}