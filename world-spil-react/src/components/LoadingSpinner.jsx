import React from 'react';

export default function LoadingSpinner({ size = 24 }) {
  const style = { width: size, height: size };
  return (
    <svg className="spinner" viewBox="0 0 50 50" style={style} aria-hidden>
      <circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5" />
    </svg>
  );
}