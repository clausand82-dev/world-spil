import React from 'react';

function isFileLike(v) {
  if (!v) return false;
  const s = String(v).trim();
  return /\.(png|jpe?g|gif|svg|webp)$/i.test(s) || /^https?:\/\//i.test(s) || s.startsWith('/');
}

/**
 * value: enten emoji-tegn eller filnavn/URL (fx "straw.png" eller "/img/straw.png")
 * iconUrl: eksplicit URL hvis allerede normaliseret (foretrukket)
 * basePath: præpender hvis value er blot et filnavn
 */
export default function Icon({ value, iconUrl, alt = '', basePath = '/assets/icons/', size = '1em', fallback = null }) {
  const v = (iconUrl || value || '').toString().trim();
  // hvis explicit iconUrl er givet, brug den
  if (iconUrl) {
    return <img src={iconUrl} alt={alt} style={{ width: size, height: size, objectFit: 'contain', verticalAlign: '-0.15em' }} />;
  }
  if (isFileLike(v)) {
    const src = (/^(https?:)?\/\//.test(v) || v.startsWith('/')) ? v : (basePath + v);
    return <img src={src} alt={alt} style={{ width: size, height: size, objectFit: 'contain', verticalAlign: '-0.15em' }} />;
  }
  if (v) {
    return <span role="img" aria-label={alt} style={{ fontSize: size, lineHeight: 1, verticalAlign: '-0.15em' }}>{v}</span>;
  }
  return fallback ? <span style={{ fontSize: size }}>{fallback}</span> : null;
}