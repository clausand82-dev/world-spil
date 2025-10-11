import React, { useEffect, useMemo, useState } from 'react';
import ConfirmModal from '../ConfirmModal.jsx';

function Section({ title, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {title ? <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 16 }}>{title}</div> : null}
      {children}
    </div>
  );
}

export default function StageUnlockModal({
  open,
  onClose,
  pages = [],              // [{ stage: number, title, desc, imageUrl, unlocked: [{id,label}] }]
  initialIndex = 0,        // hvilken side modal skal starte på
}) {
  const [idx, setIdx] = useState(() => {
    const maxIdx = Math.max(0, pages.length - 1);
    const wanted = Number.isFinite(initialIndex) ? initialIndex : 0;
    return Math.min(Math.max(0, wanted), maxIdx);
  });

  // Reset index når modal åbner / antal sider ændrer sig / initialIndex ændrer sig
  useEffect(() => {
    const maxIdx = Math.max(0, pages.length - 1);
    const wanted = Number.isFinite(initialIndex) ? initialIndex : 0;
    setIdx(Math.min(Math.max(0, wanted), maxIdx));
  }, [open, pages.length, initialIndex]);

  const page = pages[idx] || {};
  const isMulti = pages.length > 1;
  const isFirst = idx === 0;
  const isLast  = idx === (pages.length - 1);

  const actions = useMemo(() => {
    if (!isMulti) return { confirmText: 'OK', cancelText: 'Luk' };
    if (!isLast)  return { confirmText: 'Næste', cancelText: idx > 0 ? 'Tilbage' : 'Luk' };
    return { confirmText: 'Færdig', cancelText: idx > 0 ? 'Tilbage' : 'Luk' };
  }, [isMulti, isLast, idx]);

  const handleConfirm = () => {
    if (isMulti && !isLast) { setIdx(i => i + 1); return; }
    onClose?.();
  };
  const handleCancel = () => {
    if (isMulti && !isFirst) { setIdx(i => Math.max(0, i - 1)); return; }
    onClose?.();
  };

  if (!open) return null;

  return (
    <ConfirmModal
      isOpen={open}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      confirmText={actions.confirmText}
      cancelText={actions.cancelText}
      title={page?.title || `Nyt trin låst op (Stage ${page?.stage ?? ''})`}
      cardStyle={{ maxWidth: 720, minWidth: 360 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Hero image */}
        {page?.imageUrl ? (
          <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <img src={page.imageUrl} alt="" style={{ width: '100%', display: 'block' }} />
          </div>
        ) : null}

        {/* Description */}
        {page?.desc ? (
          <Section>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{page.desc}</div>
          </Section>
        ) : null}

        {/* Unlocked features */}
        {Array.isArray(page?.unlocked) && page.unlocked.length > 0 ? (
          <Section title="Nye muligheder">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {page.unlocked.map((u) => (
                <li key={u.id} style={{ marginBottom: 4 }}>
                  {u.label || u.id}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Pager indicator */}
        {isMulti ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4 }}>
            {pages.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: i === idx ? '#111827' : '#d1d5db'
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </ConfirmModal>
  );
}