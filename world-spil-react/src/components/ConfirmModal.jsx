// ConfirmModal.jsx
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function usePortalContainer() {
  const elRef = useRef(null);
  if (!elRef.current) {
    elRef.current = document.createElement('div');
    elRef.current.setAttribute('data-confirm-modal-root', ''); // debug-friendly
  }
  useEffect(() => {
    document.body.appendChild(elRef.current);
    return () => {
      if (elRef.current && elRef.current.parentNode) {
        elRef.current.parentNode.removeChild(elRef.current);
      }
    };
  }, []);
  return elRef.current;
}

export default function ConfirmModal({
  isOpen,
  open,                 // alias understøttelse
  title = 'Bekræft',
  body = '',
  confirmText = 'OK',
  cancelText = 'Annuller',
  onConfirm,
  onCancel,
  children,             // vis indhold fra ReproSummaryModal
}) {
  const container = usePortalContainer();
  const visible = (typeof isOpen !== 'undefined') ? isOpen : !!open;

  // Lås baggrundsscroll når åben
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  // ESC luk
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancel && onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onCancel]);

  if (!visible) return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel && onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 'min(560px, 96vw)',
          background: '#0f172a',           // dark slate
          color: '#e2e8f0',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 18px 0 18px' }}>
          <h3 id="confirm-title" style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        </div>

        {/* Body som ren tekst/HTML, hvis givet */}
        {body && (
          <div
            style={{ padding: '12px 18px 0 18px', lineHeight: 1.5, color: '#cbd5e1' }}
            dangerouslySetInnerHTML={{ __html: body }}
          />
        )}

        {/* Render children (React-indhold) */}
        {children && (
          <div style={{ padding: '12px 18px 0 18px' }}>
            {children}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            padding: '16px 18px 18px 18px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: '#e2e8f0',
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, container);
}