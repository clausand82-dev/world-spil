import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, title = '', size = 'medium', children, className = '' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { small: 420, medium: 720, large: 1000 };
  const width = widths[size] || widths.medium;

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 10000
  };
  const boxStyle = {
          color: 'var(--text, #e6eef8)',
    background: 'var(--panel-bg, #071128)', borderRadius: 8, width: Math.min(width, window.innerWidth - 32),
    maxHeight: '90vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(2,6,23,0.7)'
  };
  const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #eee' };
  const bodyStyle = { padding: 12 };

  return createPortal(
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={boxStyle} className={className} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Luk" style={{ color: 'var(--text)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={bodyStyle}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}