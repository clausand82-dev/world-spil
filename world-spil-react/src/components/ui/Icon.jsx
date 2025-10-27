import React from 'react';

function resolveIconSrc(candidate, { baseIconPath = '/assets/icons/', fallback = '/assets/icons/default.png' } = {}) {
  if (!candidate) return fallback;
  const str = String(candidate).trim();
  if (!str) return fallback;
  if (str.startsWith('/') || /^https?:\/\//i.test(str)) return str;
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(str)) return baseIconPath + str;
  return fallback;
}

export default function Icon({ def, src, alt = '', size = 24, className = '', fallback = '/assets/icons/default.png' }) {
  try {
    // Backwards compat: if def.icon is a React element, render it directly
    if (def && def.icon && React.isValidElement(def.icon)) {
      return <span className={className} style={{ display: 'inline-flex', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{def.icon}</span>;
    }

    // Candidate priority: src prop -> def.iconUrl -> def.iconFilename -> def.emoji (object.url)
    let candidate = src || (def && (def.iconUrl || def.iconFilename || (def.emoji && typeof def.emoji === 'object' && (def.emoji.iconUrl || def.emoji.url)) || def.icon));
    const finalSrc = resolveIconSrc(candidate, { fallback });

    // If finalSrc is the fallback but def.emoji is a string, render emoji instead
    const emojiStr = (def && typeof def.emoji === 'string') ? def.emoji : (def && def.emojiChar) || null;
    if ((!finalSrc || finalSrc === fallback) && emojiStr) {
      return <span className={className} style={{ fontSize: typeof size === 'number' ? size : parseInt(size, 10) || 24, lineHeight: 1 }}>{emojiStr}</span>;
    }

    // Render image with explicit inline size so CSS can't easily override it
    const px = typeof size === 'number' ? size : parseInt(String(size), 10) || 24;
    const imgStyle = { width: px, height: px, objectFit: 'contain', display: 'inline-block', verticalAlign: '-0.15em' };

    return <img className={className} src={finalSrc} alt={alt || (def && def.name) || ''} style={imgStyle} />;
  } catch (e) {
    // fallback visual
    const px = typeof size === 'number' ? size : parseInt(String(size), 10) || 24;
    return <span className={className} style={{ fontSize: px }}>📦</span>;
  }
}