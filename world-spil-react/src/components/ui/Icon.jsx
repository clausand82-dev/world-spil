import React from 'react';

/*
  Central PNG-only Icon component (common/Icon.jsx)
  - def: object (may contain def.icon (React element), def.iconUrl, def.iconFilename, def.emoji)
  - src: override string (URL or filename)
  - size: number (px) or string token
  - fallback: path to fallback PNG
*/
function resolveIconSrc(candidate, { baseIconPath = '/assets/icons/', fallback = '/assets/icons/default.png' } = {}) {
  if (!candidate) return fallback;
  const str = String(candidate).trim();
  if (!str) return fallback;
  if (str.startsWith('/') || /^https?:\/\//i.test(str)) return str;
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(str)) return baseIconPath + str;
  return fallback;
}

export default function Icon({ def, src, alt = '', size = 18, className = '', fallback = '/assets/icons/default.png' }) {
  try {
    // Backwards compat: if def.icon is a React element, render it directly
    if (def && def.icon && React.isValidElement(def.icon)) {
      return <span className={`icon-inline ${className}`} aria-hidden>{def.icon}</span>;
    }

    // Candidate priority: src prop -> def.iconUrl -> def.iconFilename -> def.emoji
    let candidate = src || (def && (def.iconUrl || def.iconFilename || def.emoji));
    const finalSrc = resolveIconSrc(candidate, { fallback });

    const style = {};
    if (typeof size === 'number') { style.width = size; style.height = size; }

    return (
      <img
        src={finalSrc}
        alt={alt || (def && def.name) || ''}
        className={`icon-inline ${className}`}
        style={{ objectFit: 'contain', verticalAlign: '-0.15em', ...style }}
        width={style.width || undefined}
        height={style.height || undefined}
        onError={(e) => { e.currentTarget.src = fallback; }}
      />
    );
  } catch (e) {
    return <img src={fallback} alt={alt} className={`icon-inline ${className}`} style={{ objectFit: 'contain', verticalAlign: '-0.15em' }} />;
  }
}