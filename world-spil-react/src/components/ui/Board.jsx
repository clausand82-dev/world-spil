import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoards } from './BoardProvider.jsx';
import './board.css';

function useMountEffect(fn) {
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      fn();
    }
  }, [fn]);
}

function useContainer(selector) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    let n = null;
    if (selector) n = document.querySelector(selector);
    if (!n) n = document.querySelector('#main') || document.querySelector('.page') || document.body;
    setEl(n || document.body);
  }, [selector]);
  return el;
}

export default function Board({
  id,
  title,
  icon,
  initialOpen = false,
  popup = false,
  width = 520,         // start-bredde (number eller string)
  defaultX = 16,       // start X (kun popup)
  defaultY = 16,       // start Y (kun popup)
  minWidth = 320,      // min bredde (kun popup)
  overlay = false,     // overlay bag popup
  // NYT: grid/snap & container
  containerSelector = '#main',
  snap = true,
  snapRows = 6,
  minRows = 1,
  allowHeightResize = true,
  children,
}) {
  const { isOpen, open, close, toggle, bringToFront, zIndexFor, getLayout, setLayout } = useBoards();
  const opened = isOpen(id);

  useMountEffect(() => { if (initialOpen) open(id); });

  const containerEl = useContainer(containerSelector);

  // Læs nuværende layout (x, y, width, height)
  const layout = useMemo(() => (getLayout(id) || {}), [getLayout, id]);

  // Board DOM-ref til at kunne måle faktisk højde/bredde
  const boardRef = useRef(null);

  // Container-rect
  const getContainerRect = useCallback(() => {
    const rect = containerEl?.getBoundingClientRect?.();
    if (!rect) {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, [containerEl]);

  // Effektiv bredde (string-bredde respekteres, ellers tal)
  const effectiveWidth = useMemo(() => {
    if (typeof width === 'string' && layout.width == null) return width;
    return typeof layout.width === 'number' ? layout.width : (typeof width === 'number' ? width : 520);
  }, [layout.width, width]);

  // Effektiv højde – kun hvis brugeren har sat en specifik højde (ellers auto)
  const effectiveHeight = useMemo(() => {
    return typeof layout.height === 'number' ? layout.height : null;
  }, [layout.height]);

  // X/Y med defaults
  const effectiveX = typeof layout.x === 'number' ? layout.x : defaultX;
  const effectiveY = typeof layout.y === 'number' ? layout.y : defaultY;

  // Snap helpers
  const quantize = useCallback((value, step) => {
    if (!snap || step <= 0) return value;
    return Math.round(value / step) * step;
  }, [snap]);

  const onToggle = useCallback((e) => {
    e?.stopPropagation?.();
    toggle(id);
    if (!isOpen(id)) bringToFront(id);
  }, [id, toggle, bringToFront, isOpen]);

  const onHeaderClick = useCallback(() => {
    if (popup && opened) bringToFront(id);
  }, [popup, opened, bringToFront, id]);

  // ESC lukker
  useEffect(() => {
    if (!popup || !opened) return;
    const onKey = (e) => { if (e.key === 'Escape') close(id); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popup, opened, close, id]);

  // DRAG
  const dragDataRef = useRef(null);
  const onDragStart = useCallback((e) => {
    if (!popup) return;
    const btn = e.target.closest('.board-toggle');
    if (btn) return;

    bringToFront(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = getContainerRect();

    dragDataRef.current = {
      startX, startY, rect,
      origX: typeof layout.x === 'number' ? layout.x : defaultX,
      origY: typeof layout.y === 'number' ? layout.y : defaultY,
    };

    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd, { once: true });
  }, [popup, id, layout.x, layout.y, defaultX, defaultY, bringToFront, getContainerRect]);

  const onDragMove = useCallback((e) => {
    const d = dragDataRef.current;
    if (!d) return;
    e.preventDefault();

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    const rect = d.rect || getContainerRect();

    const bw = typeof effectiveWidth === 'number' ? effectiveWidth : (boardRef.current?.offsetWidth || 400);
    const bh = (effectiveHeight ?? boardRef.current?.offsetHeight ?? 200);

    const maxX = Math.max(0, rect.width - 60); // lad mindst 60px være synligt
    const maxY = Math.max(0, rect.height - 60);

    let nextX = d.origX + dx;
    let nextY = d.origY + dy;

    // Clamp til containerens indre
    nextX = Math.max(-bw + 60, Math.min(maxX, nextX));
    nextY = Math.max(0, Math.min(maxY, nextY));

    // Snap i rækker
    const rowH = snapRows > 0 ? (rect.height / snapRows) : 0;
    if (rowH > 0) nextY = quantize(nextY, rowH);

    setLayout(id, { x: Math.round(nextX), y: Math.round(nextY) });
  }, [id, setLayout, effectiveWidth, effectiveHeight, getContainerRect, snapRows, quantize]);

  const onDragEnd = useCallback(() => {
    dragDataRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
  }, [onDragMove]);

  // RESIZE: BREDDE (højre håndtag)
  const resizeWRef = useRef(null);
  const onResizeWStart = useCallback((e) => {
    if (!popup) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);

    const rect = getContainerRect();
    resizeWRef.current = {
      startX: e.clientX,
      origW: (typeof layout.width === 'number' ? layout.width : (typeof width === 'number' ? width : (boardRef.current?.offsetWidth || 520))),
      x: (typeof layout.x === 'number' ? layout.x : defaultX),
      rect,
    };
    window.addEventListener('pointermove', onResizeWMove);
    window.addEventListener('pointerup', onResizeWEnd, { once: true });
  }, [popup, id, layout.width, layout.x, width, defaultX, bringToFront, getContainerRect]);

  const onResizeWMove = useCallback((e) => {
    const d = resizeWRef.current;
    if (!d) return;
    e.preventDefault();

    let nextW = d.origW + (e.clientX - d.startX);
    const maxW = Math.max(minWidth, d.rect.width - d.x - 8); // 8px margin til kant
    nextW = Math.max(minWidth, Math.min(maxW, nextW));

    setLayout(id, { width: Math.round(nextW) });
  }, [id, setLayout, minWidth]);

  const onResizeWEnd = useCallback(() => {
    resizeWRef.current = null;
    window.removeEventListener('pointermove', onResizeWMove);
  }, [onResizeWMove]);

  // RESIZE: HØJDE (bund-håndtag)
  const resizeHRef = useRef(null);
  const onResizeHStart = useCallback((e) => {
    if (!popup || !allowHeightResize) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);

    const rect = getContainerRect();
    const rowH = snapRows > 0 ? (rect.height / snapRows) : 0;

    resizeHRef.current = {
      startY: e.clientY,
      rect,
      rowH,
      minH: Math.max(1, minRows) * (rowH || 40),
      origH: (typeof layout.height === 'number'
        ? layout.height
        : (boardRef.current?.offsetHeight || (Math.max(1, minRows) * (rowH || 40)))),
      y: (typeof layout.y === 'number' ? layout.y : defaultY),
    };
    window.addEventListener('pointermove', onResizeHMove);
    window.addEventListener('pointerup', onResizeHEnd, { once: true });
  }, [popup, allowHeightResize, bringToFront, getContainerRect, layout.height, layout.y, defaultY, snapRows, minRows]);

  const onResizeHMove = useCallback((e) => {
    const d = resizeHRef.current;
    if (!d) return;
    e.preventDefault();

    let nextH = d.origH + (e.clientY - d.startY);
    const maxH = Math.max(d.minH, d.rect.height - d.y - 8);
    nextH = Math.max(d.minH, Math.min(maxH, nextH));

    // Snap højde i rækker
    if (d.rowH > 0 && snap) {
      nextH = Math.max(d.minH, Math.round(nextH / d.rowH) * d.rowH);
    }

    setLayout(id, { height: Math.round(nextH) });
  }, [id, setLayout, snap]);

  const onResizeHEnd = useCallback(() => {
    resizeHRef.current = null;
    window.removeEventListener('pointermove', onResizeHMove);
  }, [onResizeHMove]);

  // CORNER resize (valgfrit): både bredde og højde via nederste højre hjørne
  const resizeCRef = useRef(null);
  const onResizeCStart = useCallback((e) => {
    if (!popup) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);

    const rect = getContainerRect();
    const rowH = snapRows > 0 ? (rect.height / snapRows) : 0;

    resizeCRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      rect,
      rowH,
      minH: Math.max(1, minRows) * (rowH || 40),
      origW: (typeof layout.width === 'number' ? layout.width : (boardRef.current?.offsetWidth || (typeof width === 'number' ? width : 520))),
      origH: (typeof layout.height === 'number' ? layout.height : (boardRef.current?.offsetHeight || (Math.max(1, minRows) * (rowH || 40)))),
      x: (typeof layout.x === 'number' ? layout.x : defaultX),
      y: (typeof layout.y === 'number' ? layout.y : defaultY),
    };
    window.addEventListener('pointermove', onResizeCMove);
    window.addEventListener('pointerup', onResizeCEnd, { once: true });
  }, [popup, bringToFront, getContainerRect, layout.width, layout.height, layout.x, layout.y, defaultX, defaultY, width, snapRows, minRows]);

  const onResizeCMove = useCallback((e) => {
    const d = resizeCRef.current;
    if (!d) return;
    e.preventDefault();

    // bredde
    let nextW = d.origW + (e.clientX - d.startX);
    const maxW = Math.max(minWidth, d.rect.width - d.x - 8);
    nextW = Math.max(minWidth, Math.min(maxW, nextW));

    // højde
    let nextH = d.origH + (e.clientY - d.startY);
    const maxH = Math.max(d.minH, d.rect.height - d.y - 8);
    nextH = Math.max(d.minH, Math.min(maxH, nextH));

    if (d.rowH > 0 && snap) {
      nextH = Math.max(d.minH, Math.round(nextH / d.rowH) * d.rowH);
    }

    setLayout(id, { width: Math.round(nextW), height: Math.round(nextH) });
  }, [id, setLayout, minWidth, snap]);

  const onResizeCEnd = useCallback(() => {
    resizeCRef.current = null;
    window.removeEventListener('pointermove', onResizeCMove);
  }, [onResizeCMove]);

  // Selve boardet
  const sectionStyles = popup
    ? {
        zIndex: zIndexFor(id),
        position: 'absolute',
        left: typeof effectiveX === 'number' ? `${effectiveX}px` : effectiveX,
        top: typeof effectiveY === 'number' ? `${effectiveY}px` : effectiveY,
        width: typeof effectiveWidth === 'number' ? `${effectiveWidth}px` : effectiveWidth,
        ...(effectiveHeight != null ? { height: `${effectiveHeight}px` } : {}),
      }
    : undefined;

  const body = (
    <section
      ref={boardRef}
      className={`board panel section ${opened ? 'is-open' : 'is-closed'} ${popup ? 'is-popup' : 'is-inline'}`}
      style={sectionStyles}
      onMouseDown={() => popup && bringToFront(id)}
      role="group"
      aria-labelledby={`${id}__title`}
    >
      <div
        className="section-head board-head"
        onClick={onHeaderClick}
        onPointerDown={onDragStart}
        style={{ cursor: popup ? 'move' : 'default' }}
      >
        <div className="board-title">
          {icon ? <span className="board-icon">{icon}</span> : null}
          <span id={`${id}__title`}>{title}</span>
        </div>
        <button
          className="btn board-toggle"
          aria-expanded={opened}
          aria-controls={`${id}__content`}
          title={opened ? 'Luk' : 'Åbn'}
          onClick={onToggle}
          type="button"
        >
          <span className="chevron">{opened ? '▾' : '▸'}</span>
        </button>
      </div>

      <div id={`${id}__content`} className="section-body board-body" hidden={!opened}>
        {children}
      </div>

      {popup ? (
        <>
          {/* højre-kant (bredde) */}
          <div className="board-resize-handle board-resize-right" title="Juster bredde" onPointerDown={onResizeWStart} />
          {/* bund (højde) */}
          {allowHeightResize ? (
            <div className="board-resize-handle board-resize-bottom" title="Juster højde" onPointerDown={onResizeHStart} />
          ) : null}
          {/* hjørne (begge) */}
          {allowHeightResize ? (
            <div className="board-resize-handle board-resize-corner" title="Juster hjørne" onPointerDown={onResizeCStart} />
          ) : null}
        </>
      ) : null}
    </section>
  );

  if (!popup) return body;

  // Portal ind i containeren; sørg for at containeren har position: relative i dit layout
  const portalLayer = (
    <>
      {overlay && opened ? (
        <div className="board-overlay" style={{ zIndex: zIndexFor(id) - 1 }} onClick={() => close(id)} />
      ) : null}
      <div className="board-portal-layer" style={{ zIndex: zIndexFor(id) }}>
        {body}
      </div>
    </>
  );

  // Hvis vi ikke har container endnu, brug body midlertidigt
  return createPortal(portalLayer, containerEl || document.body);
}