/* Central PNG-only Icon component to use across lists and detail rows */
import React from 'react';

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
    if (def && def.icon && React.isValidElement(def.icon)) {
      return <span className={`icon-inline ${className}`} aria-hidden>{def.icon}</span>;
    }
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