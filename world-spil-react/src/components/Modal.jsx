import React from 'react';
import ReactDOM from 'react-dom';

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal__header">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Luk">✕</button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}