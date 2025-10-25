// helpTopicHelpers.js
import React from 'react';

/**
 * makeHelpers(defs, t, options)
 * - defs: game definitions (fra GameDataContext)
 * - t: translate function (useT)
 * - options.baseIconPath: hvor ikoner bor (default '/assets/icons/')
 *
 * Producerer helpers der er sikre at kalde inde i topic.render / topic.component
 */
export function makeHelpers(defs = {}, t = (k, d) => (d ?? k), options = {}) {
  const baseIconPath = (options.baseIconPath || '/assets/icons/').replace(/\/+$/, '/') ;

  // Normalize id: accept 'res.water' or 'water'
  const resKey = (id) => {
    if (!id) return '';
    const s = String(id);
    if (s.startsWith('res.')) return s.slice(4);
    return s;
  };

  // Return a URL for an icon name or defs entry
  const iconUrl = (nameOrId) => {
  if (!nameOrId) return '';
  const s = String(nameOrId).trim();
  // Hvis allerede en fuld URL eller absolut sti, brug som-is
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('/')) return s;

  // check defs for explicit icon/url
  const key = resKey(s);
  const r = defs?.res?.[key] || defs?.[key] || null;
  if (r) {
    const url = r.iconUrl || r.icon || (r.emoji && typeof r.emoji === 'object' && (r.emoji.iconUrl || r.emoji.url)) || '';
    if (url) {
      if (/^(https?:)?\/\//i.test(url) || url.startsWith('/')) return url;
      return baseIconPath + url;
    }
  }

  // Hvis name allerede har extension (fx ".png" / ".svg"), returner direkte
  if (/\.[a-z0-9]{2,5}$/i.test(s)) return baseIconPath + s;

  // Ingen extension fundet — tilføj fallback-extension (png) automatisk
  // Du kan ændre rækkefølgen eller bruge en liste af extensions hvis ønsket.
  return baseIconPath + s + '.png';
};

  // return a React <img/> element (JSX)
  const iconElement = (nameOrId, { size = '1em', alt = '', className = 'res-icon-inline', style = {} } = {}) => {
    const src = iconUrl(nameOrId);
    if (!src) return null;
    const st = { width: size, height: size, objectFit: 'contain', verticalAlign: '-0.15em', ...style };
    return React.createElement('img', { src, alt: alt || String(nameOrId), style: st, className });
  };

  // return HTML string (useful when you return HTML string from render callback)
  const escapeAttr = (s = '') => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const iconHtml = (nameOrId, { size = '1em', alt = '' } = {}) => {
    const src = iconUrl(nameOrId);
    if (!src) return '';
    const a = escapeAttr(alt || String(nameOrId));
    const s = escapeAttr(size);
    return `<img src="${escapeAttr(src)}" alt="${a}" style="width:${s};height:${s};object-fit:contain;vertical-align:-0.15em;display:inline-block" />`;
  };

  // Emoji helper: returns either a unicode string or a React element (if defs stores element)
  const emoji = (nameOrId, { size = '1em', alt = '' } = {}) => {
    const key = resKey(nameOrId);
    const r = defs?.res?.[key];
    if (!r) return String(nameOrId || '');
    // If defs provides emoji as React element/object (normalizeDefsForIcons does this), return it
    if (r.emoji && typeof r.emoji === 'object') return r.emoji;
    // If emoji is a file/url, return an img element
    if (r.iconUrl || r.icon) {
      return iconElement(key, { size, alt });
    }
    // Otherwise emoji is a string / unicode char
    if (typeof r.emoji === 'string' && r.emoji.trim()) return r.emoji;
    return '';
  };

  const nameFor = (nameOrId, fallback = null) => {
    const key = resKey(nameOrId);
    const r = defs?.res?.[key] || defs?.[key];
    if (r) return r.name || r.display_name || r.label || key;
    return fallback ?? String(nameOrId || '');
  };

  const tt = (k, d) => {
    try {
      if (typeof t === 'function') return t(k, d);
      return d ?? k;
    } catch (e) {
      return d ?? k;
    }
  };

  return {
    iconUrl,
    iconElement,
    iconHtml,
    emoji,
    name: nameFor,
    t: tt,
    baseIconPath,
  };
}