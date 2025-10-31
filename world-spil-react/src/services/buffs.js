export function normalizeServerBuff(sb) {
  if (!sb || typeof sb !== 'object') return null;
  const copy = Object.assign({}, sb);

  // Hvis statistik-felt stil (operator/value) bruges
  if (copy.operator && (copy.value !== undefined || copy.amount !== undefined)) {
    const operator = String(copy.operator).toLowerCase();
    const value = (copy.value !== undefined) ? Number(copy.value) : Number(copy.amount || 0);

    if (operator === 'multiply' || operator === 'mult') {
      // convert multiplier -> pct: pct = (multiplier - 1) * 100
      const pct = (value - 1.0) * 100.0;
      copy.op = 'mult';
      copy.amount = pct;
    } else if (operator === 'add' || operator === 'adds') {
      copy.op = 'adds';
      copy.amount = value;
    } else if (operator === 'sub' || operator === 'subt') {
      copy.op = 'subt';
      copy.amount = value;
    }

    // target -> scope (sørg for res. prefix)
    if (copy.target && !copy.scope) {
      const t = String(copy.target);
      copy.scope = t.startsWith('res.') ? t : `res.${t}`;
    }

    if (!copy.source_id) copy.source_id = copy.id ? `stat.${copy.id}` : `stat.${Math.random().toString(36).slice(2,10)}`;

    delete copy.operator; delete copy.value; delete copy.target; delete copy.id;
  }

  // normaliser scope hvis nødvendigt
  if (copy.kind === 'res' && copy.scope && typeof copy.scope === 'string' && !copy.scope.startsWith('res.') && copy.scope !== 'all' && copy.scope !== 'solid' && copy.scope !== 'liquid') {
    copy.scope = `res.${copy.scope}`;
  }

  // unify applies_to / appliesTo
  if (copy.appliesTo && !copy.applies_to) copy.applies_to = copy.appliesTo;
  if (copy.applies_to && !copy.appliesTo) copy.appliesTo = copy.applies_to;

  return copy;
}