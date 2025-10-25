import React from 'react';

function isFileLike(v) {
  if (!v) return false;
  const s = String(v).trim();
  return /\.(png|jpe?g|gif|svg|webp)$/i.test(s) || /^https?:\/\//i.test(s) || s.startsWith('/');
}

// <Icon iconUrl={`/assets/icons/NAVN.png`} size="2em" /> kan bruges til at sætte ikoner ind (kræver Icon.jsx er importeret)

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

function deriveBase() {
  return (import.meta?.env?.BASE_URL || '/') + 'assets/pic/';
}

/**
 * Icon component
 * - name: filnavn uden .png (kan indeholde dots/underscores/spaces)
 * - prefix: valgfri prefix (fx 'stats') hvis du vil auto-prefixe
 */
export function StatsIcon({ name, size = 18, className, style = {}, alt, prefix }) {
  if (!name) return null;
  // normaliser navn -> underscore, fjern extension
  let key = String(name).replace(/\.[a-z0-9]+$/i, '').trim();
  key = key.replace(/[.\s\-]+/g, '_');
  if (prefix) key = `${prefix}_${key}`;
  const filename = `${key}.png`;
  const base = deriveBase();
  const src = base + filename;
  const fallback = (import.meta?.env?.BASE_URL || '/') + 'assets/icons/' + filename;

  return (
    <img
      src={src}
      alt={alt || key}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', verticalAlign: 'middle', marginRight: 6, ...style }}
      onError={(e) => {
        try {
          if (e?.target?.src && e.target.src !== fallback) {
            e.target.src = fallback;
          } else {
            e.target.style.display = 'none';
          }
        } catch {
          if (e?.target) e.target.style.display = 'none';
        }
      }}
    />
  );
}

// kort helper så du kan skrive icon(name) i JSX
export const icon = (name, props = {}) => <StatsIcon name={name} {...props} />;