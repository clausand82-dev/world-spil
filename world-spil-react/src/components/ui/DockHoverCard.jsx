import React, {
  useCallback,
  useRef,
  useState,
  Children,
  isValidElement,
  cloneElement
} from 'react';

export default function DockHoverCard({
  children,
  content,
  cardStyle,
  delayOpen = 100,
  delayClose = 120,
  dockBottom = 78, // justér hvis quickbar-højden ændres
  dockRight = 16,
}) {
  const [open, setOpen] = useState(false);
  const [hasContent, setHasContent] = useState(!!content);
  const openT = useRef(null);
  const closeT = useRef(null);

  const clearTimers = () => {
    if (openT.current) { clearTimeout(openT.current); openT.current = null; }
    if (closeT.current) { clearTimeout(closeT.current); closeT.current = null; }
  };

  const onEnter = useCallback(() => {
    clearTimers();
    if (!content) return;
    setHasContent(true);
    openT.current = setTimeout(() => setOpen(true), delayOpen);
  }, [content, delayOpen]);

  const onLeave = useCallback(() => {
    clearTimers();
    closeT.current = setTimeout(() => setOpen(false), delayClose);
  }, [delayClose]);

  const onDockEnter = useCallback(() => {
    clearTimers();
  }, []);

  const onDockLeave = useCallback(() => {
    clearTimers();
    closeT.current = setTimeout(() => setOpen(false), delayClose);
  }, [delayClose]);

  // Bevar DOM-strukturen: injicér handlers direkte på child (ingen wrapper)
  let childOut = children;
  if (isValidElement(children)) {
    const prevEnter = children.props?.onMouseEnter;
    const prevLeave = children.props?.onMouseLeave;
    childOut = cloneElement(children, {
      onMouseEnter: (e) => {
        prevEnter?.(e);
        onEnter();
      },
      onMouseLeave: (e) => {
        prevLeave?.(e);
        onLeave();
      },
    });
  } else {
    // Fallback: hvis children ikke er et React-element, wrap med en blok-div (ændrer sjældent layout)
    childOut = (
      <div onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ display: 'block' }}>
        {children}
      </div>
    );
  }

  return (
    <>
      {childOut}

      {open && hasContent && (
        <div
          onMouseEnter={onDockEnter}
          onMouseLeave={onDockLeave}
          style={{
            position: 'fixed',
            zIndex: 1000,
            bottom: dockBottom,
            right: dockRight,
            maxWidth: 440,
            minWidth: 280,
            pointerEvents: 'auto',
          }}
        >
          <div
            className="panel"
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 8px 28px rgba(255, 255, 255, 0.28)',
              padding: 12,
              color: '#222',
            fontSize: 14,
              ...cardStyle,
            }}
          >
            {content}
          </div>
        </div>
      )}
    </>
  );
}
