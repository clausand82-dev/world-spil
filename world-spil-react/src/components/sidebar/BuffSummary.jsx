import React from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { useT } from '../../services/i18n.js';
import { collectActiveBuffs } from '../../services/requirements.js';
import Icon from '../../components/ui/Icon.jsx';

// Rich icon / label map — kan udvides eller ændres til filnavne fra defs
const ICON_MAP = {
  production: { file: 'menu_building.png', labelKey: 'ui.text.building.h1' },
  cost:       { file: 'menu_market.png',   labelKey: 'ui.text.market.h1' },
  capacity:   { file: 'menu_storage.png',  labelKey: 'ui.text.storage.h1' },
  research:   { file: 'menu_research.png', labelKey: 'ui.text.research.h1' },
  unit:       { file: 'menu_unit.png',     labelKey: 'ui.text.unit.h1' },
  addon:      { file: 'menu_addon.png',    labelKey: 'ui.text.addon.h1' },
  default:    { file: 'default.png',       labelKey: 'ui.buffs.unknown' },
};

// family-specific icons (prioritet for bld/add/rsd/stat)
const FAMILY_ICONS = {
  bld:  'symbol_building.png',
  add:  'symbol_addon.png',
  rsd:  'symbol_research.png',
  stat: 'tab_market.png', // bruges til stat-buffs
};

// exact overrides (behold hvis du vil specifikke overrides)
const SOURCE_OVERRIDES = {
  'stat.happy_under_35': { file: 'default.png', labelKey: 'ui.statsbuff_badhappiness.h1' },
  'stat.happy_under_10': { file: 'default.png', labelKey: 'ui.statsbuff_badhappiness.h1' },
  'stat.pop_over_70': { file: 'default.png', labelKey: 'ui.statsbuff_verygoodpopularity.h1' },
  'stat.pop_under_50': { file: 'default.png', labelKey: 'ui.statsbuff_badpopularity.h1' },
  'stat.pop_under_10': { file: 'default.png', labelKey: 'ui.statsbuff_verybadpopularity.h1' },

};

// prettier stat-name (konverterer stat.x_y -> "X Y")
function prettifyStatName(srcId) {
  const s = String(srcId || '').replace(/^stat\./, '').replace(/[_\-\.]+/g, ' ').trim();
  return s.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * getIconDefForBuff: prioritet
 * 1) eksplicit ikonfelt i buff
 * 2) exact source_id override
 * 3) family prefix (bld/add/rsd/stat)
 * 4) kind -> ICON_MAP
 * 5) default
 */
function getIconDefForBuff(b, defs = {}) {
  const explicit = b?.icon || b?.iconUrl || b?.iconFilename || b?.emoji || '';
  // hvis eksplicit filnavn
  if (explicit && /^[^\/\\]+\.(png|jpe?g|svg|gif)$/i.test(explicit)) {
    const src = (/^\/|https?:\/\//i.test(explicit)) ? explicit : `/assets/icons/${explicit}`;
    return { iconUrl: src, icon: src, src };
  }

  const srcId = String(b?.source_id ?? '').toLowerCase();

  // exact source override
  if (srcId && SOURCE_OVERRIDES[srcId]) {
    const file = SOURCE_OVERRIDES[srcId].file;
    const src = `/assets/icons/${file}`;
    return { iconUrl: src, icon: src, src };
  }

  // prøv at læse icon fra defs for bld/add/rsd
  if (srcId.startsWith('bld.')) {
    const key = srcId.replace(/^bld\./, '');
    const d = defs?.bld ?? defs?.building ?? {};
    const icon = d[key]?.icon || d[key]?.iconFilename || d[key]?.iconUrl;
    if (icon && /^[^\/\\]+\.(png|jpe?g|svg|gif)$/i.test(icon)) {
      const src = (/^\/|https?:\/\//i.test(icon)) ? icon : `/assets/icons/${icon}`;
      return { iconUrl: src, icon: src, src };
    }
    const src = `/assets/icons/${FAMILY_ICONS.bld}`;
    return { iconUrl: src, icon: src, src };
  }
  if (srcId.startsWith('add.')) {
    const key = srcId.replace(/^add\./, '');
    const d = defs?.add ?? defs?.addon ?? {};
    const icon = d[key]?.icon || d[key]?.iconFilename || d[key]?.iconUrl;
    if (icon && /^[^\/\\]+\.(png|jpe?g|svg|gif)$/i.test(icon)) {
      const src = (/^\/|https?:\/\//i.test(icon)) ? icon : `/assets/icons/${icon}`;
      return { iconUrl: src, icon: src, src };
    }
    const src = `/assets/icons/${FAMILY_ICONS.add}`;
    return { iconUrl: src, icon: src, src };
  }
  if (srcId.startsWith('rsd.')) {
    const key = srcId.replace(/^rsd\./, '');
    const d = defs?.rsd ?? defs?.research ?? {};
    const icon = d[key]?.icon || d[key]?.iconFilename || d[key]?.iconUrl;
    if (icon && /^[^\/\\]+\.(png|jpe?g|svg|gif)$/i.test(icon)) {
      const src = (/^\/|https?:\/\//i.test(icon)) ? icon : `/assets/icons/${icon}`;
      return { iconUrl: src, icon: src, src };
    }
    const src = `/assets/icons/${FAMILY_ICONS.rsd}`;
    return { iconUrl: src, icon: src, src };
  }

  if (srcId.startsWith('stat.')) {
    const src = `/assets/icons/${FAMILY_ICONS.stat}`;
    return { iconUrl: src, icon: src, src };
  }

  // fallback til kind map
  const kind = (b?.kind ?? '').toString().toLowerCase();
  if (ICON_MAP[kind]) {
    const file = ICON_MAP[kind].file;
    const src = `/assets/icons/${file}`;
    return { iconUrl: src, icon: src, src };
  }

  const src = `/assets/icons/${ICON_MAP.default.file}`;
  return { iconUrl: src, icon: src, src };
}

function getBuffDisplayName(b, t, defs) {
  if (!b) return t('ui.buffs.unknown') || 'Buff';
  if (b.label) return b.label;

  const srcId = String(b?.source_id ?? '').toLowerCase();

  if (srcId && SOURCE_OVERRIDES[srcId]?.labelKey) {
    const txt = t(SOURCE_OVERRIDES[srcId].labelKey);
    if (txt && txt !== SOURCE_OVERRIDES[srcId].labelKey) return txt;
  }

  // bld/add/rsd -> lookup name in defs (safe)
  if (srcId.startsWith('bld.')) {
    const key = srcId.replace(/^bld\./, '');
    const defsBld = defs?.bld ?? defs?.building ?? {};
    return defsBld[key]?.label || defsBld[key]?.name || key;
  }
  if (srcId.startsWith('add.')) {
    const key = srcId.replace(/^add\./, '');
    const defsAdd = defs?.add ?? defs?.addon ?? {};
    return defsAdd[key]?.label || defsAdd[key]?.name || key;
  }
  if (srcId.startsWith('rsd.')) {
    const key = srcId.replace(/^rsd\./, '');
    const defsRsd = defs?.rsd ?? defs?.research ?? {};
    return defsRsd[key]?.label || defsRsd[key]?.name || key;
  }

  if (srcId.startsWith('stat.')) {
    return prettifyStatName(srcId);
  }

  const kind = (b?.kind ?? '').toString().toLowerCase();
  if (ICON_MAP[kind]?.labelKey) {
    const txt = t(ICON_MAP[kind].labelKey);
    if (txt && txt !== ICON_MAP[kind].labelKey) return txt;
  }

  return b.name || b.title || String(b.source_id ?? '').replace(/^stat\./, '') || (t('ui.buffs.unknown') || 'Buff');
}

function shortEffectText(b) {
  if (!b) return { label: '', type: 'unknown', rawAmount: null };
  const op = String(b.op ?? b.operator ?? '').toLowerCase();
  const rawRaw = b.amount ?? b.value ?? b.multiplier ?? b.amount_pct ?? null;
  const rawNum = (rawRaw === null || rawRaw === undefined) ? null : Number(rawRaw);
  const mode = String(b.mode ?? b.kind ?? b.affects ?? '').toLowerCase();

  // prefer explicit multiplier field or explicit op
  if ('multiplier' in b || op === 'mult' || op === 'multiply' || mode.includes('mult')) {
    if (Number.isFinite(rawNum)) {
      // rawNum may be 1.2 (mult) or 20 (percent). Decide:
      if (rawNum > 0 && rawNum < 2) {
        const pct = Math.round((rawNum - 1) * 100);
        return { label: (pct >= 0 ? `+${pct}%` : `${pct}%`), type: 'mult', rawAmount: pct };
      }
      const pct = Math.round(rawNum);
      return { label: (pct >= 0 ? `+${pct}%` : `${pct}%`), type: 'mult', rawAmount: pct };
    }
    return { label: String(rawRaw ?? ''), type: 'mult', rawAmount: rawRaw };
  }

  // explicit add/sub ops
  if (op === 'add' || op === 'adds' || op === 'plus') {
    return { label: `${rawRaw}`, type: 'add', rawAmount: Number(rawRaw) };
  }
  if (op === 'sub' || op === 'subtract' || op === 'minus') {
    return { label: `${rawRaw}`, type: 'sub', rawAmount: Number(rawRaw) };
  }

  // fallback: if b.multiplier exists or numeric amount looks like percent (abs > 1)
  if (b.multiplier) {
    const m = Number(b.multiplier);
    if (Number.isFinite(m)) {
      const pct = Math.round((m - 1) * 100);
      return { label: (pct >= 0 ? `+${pct}%` : `${pct}%`), type: 'mult', rawAmount: pct };
    }
  }
  if (Number.isFinite(rawNum)) {
    // treat values >1 as percent, <=1 ambiguous so show raw
    if (Math.abs(rawNum) > 1) {
      const pct = Math.round(rawNum);
      return { label: (pct >= 0 ? `+${pct}%` : `${pct}%`), type: 'mult', rawAmount: pct };
    }
    return { label: String(rawNum), type: 'value', rawAmount: rawNum };
  }

  return { label: String(rawRaw ?? ''), type: 'unknown', rawAmount: rawRaw ?? null };
}

/**
 * detectEffectType: return 'yield'|'cost'|'both'|'speed'|'capacity'|'other'
 */
function detectEffectType(b) {
  const f = String(b.kind ?? b.affects ?? b.target ?? b.applies_to ?? b.mode ?? '').toLowerCase();
  if (!f) return 'other';
  if (f.includes('cost')) return 'cost';
  if (f.includes('yield') || f.includes('production') || f.includes('res')) {
    // if buff explicitly says applies_to cost/yield both, check mode
    if (String(b.mode ?? '').toLowerCase() === 'both') return 'both';
    return 'yield';
  }
  if (f.includes('both')) return 'both';
  if (f.includes('speed') || f.includes('time')) return 'speed';
  if (f.includes('cap') || f.includes('capacity') || f.includes('storage')) return 'capacity';
  return 'other';
}

/**
 * describeScope: håndterer scope som:
 * - 'all' / 'res' -> All resources
 * - 'res.x' -> Resource name via defs
 * - array of scopes (['res.x','res.y']) -> comma list of names
 * - 'solid'/'liquid' -> category
 * - applies_to array field on buff
 */
function describeScope(scope, defs, t) {
  const tr = (typeof t === 'function') ? t : (k => undefined);
  if (!scope) return tr('ui.text.global') || 'global';
  if (Array.isArray(scope)) {
    const parts = scope.map(s => describeScope(s, defs, t));
    return parts.join(', ');
  }
  const s = String(scope);
  if (s === 'all' || s === 'any' || s === 'res') return (tr('ui.text.allresources.h1') || 'All resources');
  if (s.startsWith('res.')) {
    const rid = s.slice(4);
    const name = (defs?.res?.[rid]?.label ?? defs?.res?.[rid]?.name) || rid;
    return name;
  }
  if (s === 'solid' || s === 'liquid') return (tr(`ui.text.category.${s}`) || `Category: ${s}`);
  return s;
}

// In JSX render: use getBuffDisplayName(b,t,defs), getIconDefForBuff(b) and shortEffectText(b) as already wired

export default function BuffSummary() {
  const { data } = useGameData();
  const t = useT();
  const defs = data?.defs ?? {};
  const activeBuffs = Array.isArray(data?.activeBuffs) ? data.activeBuffs : (Array.isArray(data?.state?.buffs) ? data.state.buffs : (Array.isArray(data?.state?.activeBuffs) ? data.state.activeBuffs : []));
  

  if (!activeBuffs || activeBuffs.length === 0) {
    return (
      <section className="panel section res-panel">
        <div className="section-head">{t('ui.buffs.h1') || 'Buffs'}</div>
        <div className="section-body" style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t('ui.buffs.none') || 'Ingen aktive buffs'}
        </div>
      </section>
    );
  }

  return (
    <section className="panel section res-panel">
      <div className="section-head">{t('ui.text.buffs.h1') || 'Buffs'}</div>
      <div className="section-body">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeBuffs.slice(0, 20).map((b, i) => {
            const iconDef = getIconDefForBuff(b, defs);
            const title = getBuffDisplayName(b, t, defs);
            const eff = shortEffectText(b);
            const effectType = detectEffectType(b);
            const scope = describeScope(b.scope ?? b.applies_to ?? b.target ?? b.res ?? 'all', defs, t);

            // ensure unique key: prefer source_id but fallback to index
            const srcKey = String(b.source_id ?? b.name ?? `buff-${i}`);
            return (
              <li key={`${srcKey}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <Icon def={iconDef} size={18} alt={title} fallback="/assets/icons/default.png" />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                    {eff?.label ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>{eff.label}</div> : null}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, color: 'var(--muted)' }}>{effectType}</span>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scope}</span>
                    </div>
                  </div>
                  {b.desc ? <div style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.desc}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
        {activeBuffs.length > 20 ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{t('ui.buffs.more', { n: activeBuffs.length - 20 }) || `+${activeBuffs.length - 20} flere`}</div> : null}
      </div>
    </section>
  );
}