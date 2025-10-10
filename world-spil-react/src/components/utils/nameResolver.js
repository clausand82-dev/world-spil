// Byg en hurtig navne-resolver oven på gameData.defs.
// Understøtter family: 'bld' | 'add' | 'rsd' | 'ani' | 'res' og id med/uden scope/levels.

const FAMILIES = ['bld','add','rsd','ani','res'];

function stripScope(id) {
  return String(id || '').replace(/^(bld|add|rsd|ani|res)\./, '');
}
function stripLevel(id) {
  return String(id || '').replace(/\.l\d+$/i, '');
}

export function makeDefsNameResolver(defs) {
  // Byg index: family -> key -> name
  const index = {};
  for (const fam of FAMILIES) {
    const branch = defs?.[fam] || {};
    const map = {};
    for (const key of Object.keys(branch)) {
      const node = branch[key];
      if (!node) continue;
      const name = node.name || node.label || node.title || key;

      // Gem flere nøgler til samme navn for hurtige opslag
      const scoped = key;                       // fx 'bld.basecamp.l3'
      const noScope = stripScope(key);          // fx 'basecamp.l3'
      const base = stripLevel(noScope);         // fx 'basecamp'

      map[scoped]  = name;
      map[noScope] = map[noScope] || name;
      map[base]    = map[base]    || name;
    }
    index[fam] = map;
  }

  function resolve(familyKey, idOrItem) {
    // 1) brug evt. backend-navn hvis det ikke er rå id
    if (idOrItem && typeof idOrItem === 'object' && idOrItem.name && idOrItem.name !== idOrItem.id) {
      return idOrItem.name;
    }

    // 2) udled id-varianter
    const raw = typeof idOrItem === 'string'
      ? idOrItem
      : String(idOrItem?.id ?? idOrItem?.type ?? '');

    if (!raw) return 'Ukendt';

    const fam = index[familyKey] || {};
    const noScope = stripScope(raw);
    const base = stripLevel(noScope);

    // 3) opslag i index
    const hit = fam[raw] || fam[noScope] || fam[base] || null;
    if (hit) return hit;

    // 4) fallback: pænt format
    const pretty = base
      .replace(/_/g, ' ')
      .replace(/\./g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
    return pretty.split(' ').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
  }

  return { resolve };
}