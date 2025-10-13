export function getPath(obj, path) {
  const parts = String(path || '').split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return 0;
  }
  if (typeof cur === 'number') return cur;
  if (typeof cur === 'boolean') return cur ? 1 : 0;
  const n = Number(cur);
  return Number.isFinite(n) ? n : 0;
}

// Evaluér simple matematik ’expr’ med choice() + summary.* referencer
export function evalExpr(expr, ctx) {
  if (!expr) return 0;
  let s = String(expr);

  // choice('key')
  s = s.replace(/choice\('([^']+)'\)/g, (_, k) => {
    const v = ctx?.choices?.[k];
    if (typeof v === 'number') return String(v);
    return v === true ? '1' : '0';
  });

  // summary.a.b.c
  s = s.replace(/summary\.([A-Za-z0-9_.]+)/g, (_, path) => String(getPath(ctx?.summary || {}, path)));

  // whitelist kun tal, + - * / ( ) og whitespace
  const rest = s.replace(/[\d.\+\-\*\/\(\)\s]/g, '');
  if (rest !== '') return 0;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return ( ${s} );`);
    const v = fn();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

// Interpolér strings med ${...}
export function interpolate(str, ctx) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}/g, (_, inner) => String(evalExpr(inner, ctx)));
}

// Byg et preview over “stats” for et enkelt felt ud fra schema.effects
export function computeFieldEffectsPreview(fieldDef, choices, summary) {
  const ctx = { choices, summary };
  const stats = {};
  const effects = Array.isArray(fieldDef?.effects) ? fieldDef.effects : [];
  // startværdier: add/sub starter i 0, mul/div starter i 1
  const acc = new Map(); // stat -> {add:0, mul:1}
  for (const eff of effects) {
    const stat = String(eff?.stat || '');
    if (!stat) continue;
    const op = String(eff?.op || 'add');
    const val = (eff?.value && typeof eff.value === 'object' && 'expr' in eff.value)
      ? evalExpr(String(eff.value.expr), ctx)
      : Number(eff?.value ?? 0);

    const cur = acc.get(stat) || { add: 0, mul: 1 };
    if (op === 'add') cur.add += val;
    else if (op === 'sub') cur.add -= val;
    else if (op === 'mul') cur.mul *= (val || 1);
    else if (op === 'div') cur.mul /= (val || 1);
    acc.set(stat, cur);
  }

  // Præsenter: hvis mul != 1 → vis “xX.XXX”, hvis add != 0 → vis ±tal
  for (const [stat, { add, mul }] of acc.entries()) {
    if (Math.abs(mul - 1) > 1e-12 && Math.abs(add) > 1e-12) {
      stats[stat] = `${add >= 0 ? '' : ''}${add.toFixed(2)} & x${mul.toFixed(3)}`;
    } else if (Math.abs(mul - 1) > 1e-12) {
      stats[stat] = `x${mul.toFixed(3)}`;
    } else if (Math.abs(add) > 1e-12) {
      stats[stat] = `${add >= 0 ? '' : ''}${add.toFixed(2)}`;
    } else {
      // Ingen effekt → udelad eller vis 0
    }
  }
  return stats;
}