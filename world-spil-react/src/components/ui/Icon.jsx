import React from 'react';

/*
  Icon component — PNG only workflow
  - def: object (may contain def.icon (React element), def.iconUrl (string), def.iconFilename)
  - src: override string (URL or filename)
  - alt: alt text
  - size: number (px) or string token 'sm'|'md'|'lg'
  Fallback image: /assets/icons/default.png
*/
function looksLikeUrl(s) {
  if (!s || typeof s !== 'string') return false;
  return s.startsWith('/') || /^https?:\/\//i.test(s) || /\.(png|jpe?g|gif|svg|webp)$/i.test(s);
}

export default function Icon({ def, src, alt = '', size = 'md', className = '', fallback = '/assets/icons/default.png' }) {
  try {
    // If def.icon is a React element, render it directly (backwards compatibility)
    if (def && React.isValidElement(def.icon)) {
      return <span className={`icon-inline ${className}`} aria-hidden>{def.icon}</span>;
    }

    // Determine candidate src: priority src prop -> def.iconUrl -> def.iconFilename (converted) -> fallback
    let candidate = src || (def && def.iconUrl) || (def && def.iconFilename) || '';

    if (candidate && !looksLikeUrl(candidate)) {
      // treat as filename and prepend base asset path
      candidate = `/assets/icons/${candidate}`;
    }

    const finalSrc = candidate || fallback;

    // size handling
    const style = {};
    if (typeof size === 'number') {
      style.width = size;
      style.height = size;
    } else {
      // token sizes can be styled via CSS classes, keep inline minimal
    }

    return <img src={finalSrc} alt={alt} className={`icon-inline ${className}`} style={{ ...style, objectFit: 'contain', verticalAlign: '-0.15em' }} />;
  } catch (e) {
    return <img src={fallback} alt={alt} className={`icon-inline ${className}`} style={{ objectFit: 'contain', verticalAlign: '-0.15em' }} />;
  }
}