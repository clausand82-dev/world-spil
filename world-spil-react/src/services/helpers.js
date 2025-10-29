import React from 'react';
import Icon from '../components/common/Icon.jsx';
/* =========================================================
   services/helpers.js
   - Et rent JavaScript-modul, der eksporterer genbrugelige funktioner.
   - 100% kompatibel med Reacts import/export-system.
========================================================= */

// --- Simple Formatters ---
export const fmt = (n) => (typeof n === "number" ? n.toLocaleString("da-DK") : String(n));

export const prettyTime = (secs) => {
    if (secs == null) return '';
    const s = Math.max(0, Math.round(+secs));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}h ${m}m ${ss}s` : (m ? `${m}m ${ss}s` : `${ss}s`);
};

// --- Parsere ---
export const parseBldKey = (key) => {
    const re = /^(?:bld\.)?(.+)\.l(\d+)$/i;
    const m = re.exec(String(key || ""));
    if (!m) return null;
    return { series: `bld.${m[1]}`, family: m[1], level: Number(m[2]) };
};

// --- Normalisering ---
export const normalizePrice = (cost) => {
    if (!cost) return {};
    const out = {};
    if (Array.isArray(cost)) {
        cost.forEach((row) => {
            const id = row.id ?? row.rid ?? row.resource ?? row.type;
            const amount = row.amount ?? row.qty ?? row.value;
            if (id && Number(amount)) out[String(id)] = { id: String(id), amount: Number(amount) };
        });
    } else if (typeof cost === 'object') {
        for (const [key, spec] of Object.entries(cost)) {
            const amount = (typeof spec === 'object' && spec !== null) ? Number(spec.amount ?? 0) : Number(spec ?? 0);
            if (amount) out[key] = { id: key, amount };
        }
    }
    return out;
};

// --- State-relaterede funktioner ---
// Disse funktioner tager nu `state` som et argument for at være "rene"
// og uafhængige af det globale `window`-objekt.

export const computeOwnedMaxBySeries = (stateKey = 'bld', state) => {
    if (!state) return {};
    const bySeries = {};
    const prefix = stateKey;
    const source = state?.[stateKey] || {};
    for (const key of Object.keys(source)) {
        const m = key.match(new RegExp(`^${prefix}\\.(.+)\\.l(\\d+)$`));
        if (m) {
            const series = `${prefix}.${m[1]}`;
            const level = Number(m[2]);
            bySeries[series] = Math.max(bySeries[series] || 0, level);
        }
    }
    return bySeries;
};

export const ownedResearchMax = (seriesFull, state) => {
  if (!state) return 0;

  let max = 0;
  const seriesNoPrefix = String(seriesFull).replace(/^rsd\./, '');

  const considerKey = (key) => {
    const s = String(key);
    // Tillad både 'rsd.tools.lN' og 'tools.lN'
    const prefixes = [`${seriesFull}.l`, `${seriesNoPrefix}.l`];
    for (const pref of prefixes) {
      if (s.startsWith(pref)) {
        const m = s.match(/\.l(\d+)$/);
        const lvl = m ? Number(m[1]) : 0;
        if (lvl > max) max = lvl;
        return;
      }
    }
  };

  // Legacy: state.rsd kan have nøgler som 'rsd.tools.l2'
  if (state.rsd && typeof state.rsd === 'object') {
    for (const k of Object.keys(state.rsd)) considerKey(k);
  }

  // Modern: state.research kan have top-level nøgler (fx 'tools.l2')
  const R = state.research || {};
  for (const k of Object.keys(R)) {
    if (k === 'completed') continue;
    considerKey(k);
  }

  // Modern: state.research.completed kan være Set eller map-objekt
  const comp = R.completed;
  if (comp) {
    const iter = comp instanceof Set ? Array.from(comp) : Object.keys(comp);
    for (const k of iter) considerKey(k);
  }

  return max;
};

// Tjek om et research-krav er opfyldt. Håndterer:
// - eksakt match i state.rsd eller state.research(.completed)
// - level-krav (højere level dækker lavere)
// - med/uden 'rsd.' prefix i både krav og state
export const hasResearch = (rsdIdFull, state) => {
  if (!rsdIdFull || !state) return false;

  const id = String(rsdIdFull);
  const idNoPrefix = id.replace(/^rsd\./, '');

  // Hurtig eksakt match mod state.rsd eller state.research(.completed)
  const RS = state.rsd || {};
  const R = state.research || {};
  const inCompleted = (k) => {
    const c = R.completed;
    if (!c) return false;
    return c instanceof Set ? c.has(k) : !!c[k];
  };
  const exactHit =
    RS[id] || RS[idNoPrefix] ||
    R[id] || R[idNoPrefix] ||
    inCompleted(id) || inCompleted(idNoPrefix);
  if (exactHit) return true;

  // Level-baseret: rsd.<series>.lN
  const m = id.match(/^rsd\.(.+)\.l(\d+)$/);
  if (!m) {
    // Hvis der ikke er level i kravet, anser vi kravet for opfyldt,
    // hvis spilleren ejer et eller andet level i serien.
    const seriesFull = id.startsWith('rsd.') ? id : `rsd.${id}`;
    return ownedResearchMax(seriesFull, state) > 0;
  }

  const seriesName = m[1];
  const need = Number(m[2]);
  const seriesFull = `rsd.${seriesName}`;
  const ownedMax = ownedResearchMax(seriesFull, state);
  return ownedMax >= need;
};


// --- Defs-relaterede funktioner ---
export const groupDefsBySeriesInStage = (defs, currentStage, prefix) => {
    const out = {};
    for (const [key, def] of Object.entries(defs || {})) {
        const stage = Number(def?.stage ?? 0);
        if (stage > currentStage) continue;
        const m = key.match(/^(.+)\.l(\d+)$/i);
        if (m) {
            const series = `${prefix}.${m[1]}`;
            (out[series] ||= []).push({ key, def, level: Number(m[2]) });
        }
    }
    for (const s in out) {
        out[s].sort((a, b) => a.level - b.level);
    }
    return out;
};

export const pickNextTargetInSeries = (seriesItems, ownedMaxLevel) => {
    if (!Array.isArray(seriesItems) || seriesItems.length === 0) return null;
    const targetLevel = (ownedMaxLevel || 0) + 1;
    return seriesItems.find(x => x.level === targetLevel) || null;
};

 /* Returnerer HTML-string for et icon givet et id og defs.
 * - for resource/animal defs forventer vi normalizeDefsForIcons har sat emojiText eller iconUrl
 * - bruges når du skal bygge HTML-strings (helpTopics og andre string-renderers)
 */
export function emojiHtmlForId(fullId, defs, opts = {}) {
  const size = opts.size || '1.2em';
  if (!fullId) return '';

  // Normalize input
  const idStr = String(fullId || '').trim();
  let key = idStr;
  let def = null;

  // Detect namespace prefixes
  if (idStr.startsWith('res.')) {
    key = idStr.slice(4);
    def = defs?.res?.[key];
  } else if (idStr.startsWith('ani.')) {
    key = idStr.slice(4);
    def = defs?.ani?.[key];
  } else {
    // No explicit prefix: try common places
    def = defs?.res?.[key] || defs?.ani?.[key] || defs?.[key];
  }

  // Fallbacks: maybe caller passed unprefixed key but actual def uses namespace, try both
  if (!def) {
    def = defs?.res?.[key] || defs?.ani?.[key] || defs?.[idStr] || defs?.[key];
  }

  if (!def) return '';

  // If def provides absolute/relative iconUrl, use it
  if (def.iconUrl) {
    // If iconUrl looks relative and we want to preserve existing behaviour, do not alter
    return `<img src="${String(def.iconUrl)}" style="width:${size};height:${size};object-fit:contain;vertical-align:middle" />`;
  }
  // If def provides emoji (unicode or string), use that
  if (def.emoji) {
    return `<span style="font-size:${size};line-height:1;display:inline-block">${def.emoji}</span>`;
  }

  return '';
}

/**
 * Konverter en token-liste (fra getCostTokens) til en HTML-string (til string-renderers)
 * tokens format: [{ id, amount, prefix, icon: { iconUrl, emoji, name } }, ...]
 */
export function tokensToHtmlString(tokens) {
  if (!tokens || !tokens.length) return '';
  const escapeHtml = (str) => (str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  return tokens.map(t => {
    const parts = [];
    parts.push(`${t.prefix}${t.amount}`);
    if (t.icon?.iconUrl) {
      parts.push(`<img src="${escapeHtml(t.icon.iconUrl)}" alt="${escapeHtml(t.icon.name||'')}" style="width:1em;height:1em;vertical-align:-0.15em;object-fit:contain;display:inline-block;margin-left:6px;margin-right:6px" />`);
    } else if (t.icon?.emoji) {
      parts.push(escapeHtml(String(t.icon.emoji)));
    }
    return parts.join(' ');
  }).join(' • ');
}


export function renderTextWithIcons(str, { baseIconPath = '/assets/icons/' } = {}) {
  if (!str) return null;
  const parts = [];
  const re = /\[icon:([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(str.slice(last, m.index));
    const fname = m[1];
    const isFile = /\.(png|jpe?g|gif|svg|webp)$/i.test(fname) || fname.startsWith('/');
    const src = isFile ? (fname.startsWith('/') ? fname : baseIconPath + fname) : null;
    if (src) {
      // brug React.createElement i stedet for JSX
      parts.push(React.createElement(Icon, { key: parts.length, iconUrl: src, size: '1em' }));
    } else {
      parts.push(m[0]); // unknown token left as-is
    }
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push(str.slice(last));
  return parts;
}

// Tilføj / erstat i src/services/helpers.js
// Normaliserer footprint cap-objekt så frontend konsekvent kan beregne forbrug og tilgængelig plads.
//
// Semantik (som du beskrev):
// - base + bonus => total
// - used i state = -X betyder "vi forbruger X plads" -> consumed = abs(used)
// - available = total - consumed
export function normalizeFootprintState(capObj = {}) {
  const total = Number(capObj?.total || 0);
  const usedRaw = Number(capObj?.used || 0);

  // If used is stored as negative (your convention), the consumed space is abs(usedRaw).
  // If usedRaw is positive for some reason, treat that also as consumed (abs) to be robust.
  const consumed = Math.abs(usedRaw);

  // available = total - consumed. Clamp to 0 min.
  const available = Math.max(0, total - consumed);

  return {
    total,
    usedRaw,
    consumed,
    available,
  };
}