// Parser og helpers til "requires" i policy schema
const DOMAIN_ALIASES = {
  bld: 'bld',
  building: 'bld',
  buildings: 'bld',
  add: 'add',
  addon: 'add',
  addons: 'add',
  rsd: 'rsd',
  research: 'rsd',
  researches: 'rsd'
};

export function parseRequirementToken(token) {
  if (typeof token !== 'string') return null;
  // domain er nu valgfri: "rsd.tools.l3" eller "tools.l3"
  const m = token.trim().match(/^(?:([a-zA-Z]+)\.)?([A-Za-z0-9_.-]+?)(?:\.l(\d+))?$/);
  if (!m) return null;
  const rawDomain = m[1] ? m[1].toLowerCase() : undefined;
  const domain = rawDomain ? (DOMAIN_ALIASES[rawDomain] || rawDomain) : undefined;
  const id = m[2];
  const minLevel = m[3] ? Number(m[3]) : undefined;
  return { domain, id, minLevel };
}

// Forsøg at udtrække "state" fra forskellige kilder:
// - direkte state-objekt (med bld/add/rsd)
// - { state: {...} }
// - { summary: { state: {...} } }
// - { gameData: { state: {...} } }
function extractState(input) {
  if (!input) return {};
  // Hvis input ligner et state-objekt direkte
  if (typeof input === 'object' && (input.bld || input.add || input.rsd)) return input;
  if (input.state) return input.state;
  if (input.summary && input.summary.state) return input.summary.state;
  if (input.gameData && input.gameData.state) return input.gameData.state;
  return {};
}

/**
 * Hent niveau for en entry i state[domain].
 * - Supporterer forskellige nøgle- og objektformater:
 *   - state[domain][id] (eks: 'basecamp')
 *   - state[domain]['domain.id.lN'] (eks: 'bld.basecamp.l3')
 *   - objekt med .level / .lv / .lvl
 *   - fallback: hvis ingen nøgle matcher, scan keys og find key that contains id token
 */
export function getOwnedLevel(state, domain, id) {
  const tree = state?.[domain];
  if (!tree || typeof tree !== 'object') return 0;

  // Prioriteter for søgning:
  // 1) eksakt id
  if (Object.prototype.hasOwnProperty.call(tree, id)) {
    const slot = tree[id];
    if (typeof slot === 'number') return slot;
    if (slot && typeof slot === 'object') {
      if (typeof slot.level === 'number') return slot.level;
      if (typeof slot.lv === 'number') return slot.lv;
      if (typeof slot.lvl === 'number') return slot.lvl;
      return 1;
    }
    return slot ? 1 : 0;
  }

  // 2) domain.id (fx 'bld.basecamp')
  const domId = `${domain}.${id}`;
  if (Object.prototype.hasOwnProperty.call(tree, domId)) {
    const slot = tree[domId];
    if (typeof slot === 'number') return slot;
    if (slot && typeof slot === 'object') {
      if (typeof slot.level === 'number') return slot.level;
      if (typeof slot.lv === 'number') return slot.lv;
      if (typeof slot.lvl === 'number') return slot.lvl;
      // prøv at udtrække niveau fra nøgle, fx 'bld.basecamp.l3'
      const match = domId.match(/\.l(\d+)$/);
      if (match) return Number(match[1]);
      return 1;
    }
    return slot ? 1 : 0;
  }

  // 3) domain.id.lN (fx 'bld.basecamp.l3')
  // Scan keys for key that startsWith(domain + '.' + id) eller indeholder '.'+id
  for (const key of Object.keys(tree)) {
    if (key === id || key === domId) continue;
    // direkte suffix match: '... .id' eller '... .id.lN'
    if (key.endsWith(`.${id}`) || key.includes(`.${id}.`)) {
      const slot = tree[key];
      // prøv udtrække level fra objekt
      if (typeof slot === 'number') return slot;
      if (slot && typeof slot === 'object') {
        if (typeof slot.level === 'number') return slot.level;
        if (typeof slot.lv === 'number') return slot.lv;
        if (typeof slot.lvl === 'number') return slot.lvl;
      }
      // hvis nøglen indeholder .lN suffix, læs niveau fra nøglen
      const m = key.match(/\.l(\d+)$/);
      if (m) return Number(m[1]);
      // ellers antag niveau 1 hvis objekt/til stede
      return slot ? 1 : 0;
    }
    // også tillad match hvis nøgle indeholder id et eller andet sted (fallback)
    if (key.includes(id)) {
      const slot = tree[key];
      if (typeof slot === 'number') return slot;
      if (slot && typeof slot === 'object') {
        if (typeof slot.level === 'number') return slot.level;
        if (typeof slot.lv === 'number') return slot.lv;
        if (typeof slot.lvl === 'number') return slot.lvl;
      }
      const m = key.match(/\.l(\d+)$/);
      if (m) return Number(m[1]);
      return slot ? 1 : 0;
    }
  }

  // Ingen match
  return 0;
}

// Evaluer ét krav (string "bld.x.l3" eller objekt)
export function meetsRequirementEntry(inputCtxOrState, entry) {
  // extract state from various contexts
  const state = extractState(inputCtxOrState);

  let spec = null;
  if (typeof entry === 'string') {
    spec = parseRequirementToken(entry);
  } else if (entry && typeof entry === 'object') {
    if (entry.id && typeof entry.id === 'string' && !entry.domain) {
      spec = parseRequirementToken(entry.id);
      if (spec && typeof entry.minLevel === 'number') spec.minLevel = entry.minLevel;
    } else if (entry.domain && entry.id) {
      const domain = DOMAIN_ALIASES[String(entry.domain).toLowerCase()] || null;
      if (!domain) return false;
      const id = String(entry.id);
      const minLevel = typeof entry.minLevel === 'number' ? entry.minLevel :
                       typeof entry.level === 'number' ? entry.level : undefined;
      spec = { domain, id, minLevel };
    }
  }

  if (!spec) return false;

  // Hvis domain er specificeret, brug den direkte
  if (spec.domain) {
    const haveLevel = getOwnedLevel(state, spec.domain, spec.id);
    if (typeof spec.minLevel === 'number') return haveLevel >= spec.minLevel;
    return haveLevel > 0;
  }

  // Hvis ingen domain angivet: scan sandsynlige domæner
  const domainCandidates = ['rsd','bld','add','res','building','research'];
  for (const d of domainCandidates) {
    const lvl = getOwnedLevel(state, d, spec.id);
    if (typeof spec.minLevel === 'number') {
      if (lvl >= spec.minLevel) return true;
    } else if (lvl > 0) {
      return true;
    }
  }

  // Endelig fallback: ingen match
  return false;
}

/**
 * Krav-objekt kan have nøgler: buildings|bld, addons|add, research|rsd
 * Hver nøgle er en liste (AND per type); alle typer skal opfyldes for true.
 *
 * inputCtxOrState: kan være summary, gameData eller en object med state-property
 */
export function meetsRequires(inputCtxOrState, requires) {
  if (!requires) return true;
  const state = extractState(inputCtxOrState);

  const groups = {
    bld: requires.buildings ?? requires.bld,
    add: requires.addons ?? requires.add,
    rsd: requires.research ?? requires.rsd
  };
  for (const [domain, list] of Object.entries(groups)) {
    if (!list) continue;
    const arr = Array.isArray(list) ? list : [list];
    for (const entry of arr) {
      if (!meetsRequirementEntry(state, entry)) return false;
    }
  }
  return true;
}

export function requiresToLabel(requires) {
  if (!requires) return '';
  const out = [];
  const push = (items) => {
    if (!items) return;
    const arr = Array.isArray(items) ? items : [items];
    for (const it of arr) {
      if (typeof it === 'string') { out.push(it); continue; }
      if (it && typeof it === 'object') {
        if (typeof it.id === 'string' && !it.domain) { out.push(it.id); continue; }
        const dom = it.domain || '';
        const id  = it.id || '';
        const lvl = it.minLevel ?? it.level;
        const domNorm = DOMAIN_ALIASES[String(dom).toLowerCase()] || dom;
        out.push(`${domNorm}.${id}${typeof lvl === 'number' ? `.l${lvl}` : ''}`);
      }
    }
  };
  push(requires.buildings ?? requires.bld);
  push(requires.addons ?? requires.add);
  push(requires.research ?? requires.rsd);
  return out.join(', ');
}