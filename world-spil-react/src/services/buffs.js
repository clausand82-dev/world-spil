// merge server-buffs with client-buffs (avoid duplicates, normalize minor format diffs)

export function normalizeBuffActions(buff) {
  if (!buff) return buff;
  if (buff.actions === undefined && buff.target !== undefined) {
    buff.actions = buff.target;
    delete buff.target;
  }
  // keep 'all' as string; keep arrays as arrays
  if (Array.isArray(buff.actions)) {
    // trim strings inside array
    buff.actions = buff.actions.map(a => (typeof a === 'string' ? a.trim() : a));
  }
  return buff;
}

export function mergeServerBuffs(serverBuffs = [], clientBuffs = []) {
  const out = Array.isArray(clientBuffs) ? clientBuffs.slice() : [];
  const existing = new Set(out.map(b => (b && b.source_id) ? String(b.source_id) : Symbol()));

  for (const sb of (Array.isArray(serverBuffs) ? serverBuffs : [])) {
    if (!sb || typeof sb !== 'object') continue;
    normalizeBuffActions(sb);
    const sid = sb.source_id ? String(sb.source_id) : null;
    if (sid && existing.has(sid)) continue;
    out.push(sb);
    if (sid) existing.add(sid);
  }
  return out;
}