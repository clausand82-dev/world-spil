import React, { useMemo, useEffect } from 'react';
import * as H from '../../services/helpers.js';
import { collectActiveBuffs, requirementInfo } from '../../services/requirements.js';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';
import Icon from '../common/Icon.jsx';
import { useT } from '../../services/i18n.js';
import { formatDurationFull, formatDurationSmart } from '../../services/time.js';

/**
 * RequirementPanel
 * Props:
 * - def: entity definition (bld/add/ani/rcp/rsd)
 * - defs: all defs
 * - state: current state
 * - requirementCaches: optional cache object (can include activeBuffs)
 * - show: { resources: true, requirements: true, footprint: true, duration: true }
 */
export default function RequirementPanel({
  def,
  defs,
  state,
  requirementCaches = {},
  show = { resources: true, requirements: true, footprint: true, duration: true },
}) {
  const t = useT();

  // activeBuffs: reuse if passed in caches, otherwise compute
  const activeBuffs = requirementCaches?.activeBuffs ?? useMemo(() => collectActiveBuffs(defs), [defs]);

  // Use requirementInfo to compute duration/shortfalls/reqString (passes caches through)
  const requirement = useMemo(() => {
    if (!def) return null;
    const info = requirementInfo(
      {
        id: def.id || def.key || '',
        price: def.cost || {},
        req: def.require || def.requirements || '',
        duration_s: Number(def.duration_s ?? def.time ?? 0),
      },
      state,
      requirementCaches,
    );
    return info;
  }, [def, defs, state, requirementCaches]);

  // Normalize cost entries and compute base/buffed amounts
const costEntries = useMemo(() => {
    if (!def || !show.resources) return [];
    const map = H.normalizePrice(def.cost || {});
    const out = [];
    Object.values(map).forEach((entry, idx) => {
      const rawId = String(entry.id || '');
      // EffRid: prefer explicit prefixes, otherwise try defs.res / defs.ani
      let effRid;
      if (rawId.startsWith('res.') || rawId.startsWith('ani.')) {
        effRid = rawId;
      } else if (defs?.res?.[rawId]) {
        effRid = `res.${rawId}`;
      } else if (defs?.ani?.[rawId]) {
        effRid = `ani.${rawId}`;
      } else {
        effRid = rawId; // unknown, keep as-is
      }

      const baseAmt = Number(entry.amount || 0);

      // compute buffed amount — allow buffs to target animals as well if defined
      const buffedAmt = (typeof effRid === 'string')
        ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
        : baseAmt;

      // Resolve display name + icon depending on type (res / ani / fallback)
      let name = String(entry.id || rawId);
      let icon = null;
      if (String(effRid).startsWith('res.')) {
        const resKey = String(effRid).replace(/^res\./, '');
        const resDef = defs?.res?.[resKey];
        name = resDef?.name || resKey;
        icon = resDef ? (resDef.iconUrl ? { iconUrl: resDef.iconUrl } : { emoji: resDef.emoji }) : null;
      } else if (String(effRid).startsWith('ani.')) {
        const aniKey = String(effRid).replace(/^ani\./, '');
        const aniDef = defs?.ani?.[aniKey];
        name = aniDef?.name || aniKey;
        icon = aniDef ? (aniDef.iconUrl ? { iconUrl: aniDef.iconUrl } : { emoji: aniDef.emoji }) : null;
      } else {
        // fallback: try generic defs lookup (maybe other categories)
        const key = String(effRid).replace(/^[^.]+\./, '');
        const generic = defs?.[key] || {};
        name = generic?.name || key || rawId;
        icon = generic?.iconUrl ? { iconUrl: generic.iconUrl } : (generic?.emoji ? { emoji: generic.emoji } : null);
      }

      out.push({
        id: entry.id,
        effRid,
        baseAmt,
        buffedAmt,
        icon,
        name,
        _idx: idx,
      });
    });
    return out;
  }, [def, defs, activeBuffs, show.resources]);

  // helper: how much player has of res id (res.<key> or key)
  const getHave = (resId) => {
    if (!state) return 0;
    const key = String(resId).replace(/^res\./, '');
    const liquid = Number(state.inv?.liquid?.[key] || 0);
    const solid = Number(state.inv?.solid?.[key] || 0);
    return liquid + solid;
  };

  // determine sufficiency for each resource entry
  const resourceStatus = useMemo(() => {
    const shortfalls = requirement?.shortfalls || {};
    const map = {};
    costEntries.forEach((e) => {
      const rid = e.effRid || e.id;
      // prefer requirement shortfalls if available (they are already buff-aware)
      const sf = shortfalls[rid] || shortfalls[e.id] || null;
      const have = sf ? Number(sf.have || 0) : getHave(rid);
      const need = sf ? Number(sf.need || 0) : Number(e.buffedAmt || 0);
      map[e.id] = { have, need, ok: have >= need };
    });
    return map;
  }, [costEntries, requirement, state]);

  // footprint & duration
  const footprint = useMemo(() => {
    const baseFP = Number(def?.stats?.footprint ?? def?.footprint ?? 0);
    // If you have buffs that affect footprint, apply them here (not implemented by default)
    const buffedFP = baseFP;
    // determine if player has enough footprint (state.cap.footprint.used + needed <= total)
    const totalFP = Number(state?.cap?.footprint?.total ?? 0);
    const usedFP = Number(state?.cap?.footprint?.used ?? 0);
    const ok = (usedFP + baseFP) <= totalFP;
    return { base: baseFP, buffed: buffedFP, ok, totalFP, usedFP };
  }, [def, state]);

  const duration = useMemo(() => {
    const baseS = Number(def?.duration_s ?? def?.time ?? 0);
    // requirementInfo returns duration.final_s (buffed)
    const buffedS = requirement?.duration?.final_s ?? baseS;
    return { base: baseS, buffed: buffedS };
  }, [def, requirement]);

  // Requirements parsing: split req string into individual ids (commas/space/; separated)
  const parseReqIds = (reqStr) => {
    if (!reqStr) return [];
    return String(reqStr)
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  // Helper: decide if a requirement id is satisfied using state & defs
// Erstat den eksisterende isReqSatisfied funktion med denne:
const isReqSatisfied = (reqId) => {
  if (!reqId || !state) return false;

  const normalize = (s) => String(s || '').trim();

  // helper: try presence/positive value in an object for a set of keys
  const anyKeyTruthy = (obj, keys) => {
    if (!obj) return false;
    for (const k of keys) {
      if (!(k in obj)) continue;
      const v = obj[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'boolean') {
        if (v) return true;
      } else if (typeof v === 'number') {
        if (v > 0) return true;
      } else if (typeof v === 'object') {
        // object presence (e.g. stored meta) counts as satisfied
        return true;
      } else if (String(v).length > 0) {
        return true;
      }
    }
    return false;
  };

  // helper: check keys like 'rsd.foo.lN' existing with level >= needed
  const anyLevelAtLeast = (obj, prefix, key, needed) => {
    if (!obj) return false;
    // exact forms first
    const candidates = [
      `${prefix}.${key}.l${needed}`,
      `${prefix}.${key}`,
      key,
      `${key}.l${needed}`
    ];
    if (anyKeyTruthy(obj, candidates)) return true;

    // then check any stored keys with .lX where X >= needed (e.g. 'rsd.foo.l3')
    for (const k of Object.keys(obj)) {
      const m = k.match(new RegExp(`^${prefix}\\.${key}\\.l(\\d+)$`));
      if (m) {
        const lvl = Number(m[1]);
        if (lvl >= needed) return true;
      }
      // also check keys like 'foo.l3' (without prefix)
      const m2 = k.match(new RegExp(`^${key}\\.l(\\d+)$`));
      if (m2) {
        const lvl2 = Number(m2[1]);
        if (lvl2 >= needed) return true;
      }
    }

    // also if obj[prefix.key] holds a numeric level or object with level
    const alt = obj[`${prefix}.${key}`];
    if (typeof alt === 'number' && alt >= needed) return true;
    if (alt && typeof alt === 'object' && typeof alt.level === 'number' && alt.level >= needed) return true;

    return false;
  };

  // BUILDINGS: bld.family.lN
  if (reqId.startsWith('bld.')) {
    // extract family and level (if any)
    const m = reqId.match(/^bld\.([^.]*)\.l?(\d+)$/);
    if (m) {
      const family = m[1]; const levelNeeded = Number(m[2]);
      // scan state.bld for owned levels of same family
      let ownedMax = 0;
      for (const key of Object.keys(state.bld || {})) {
        const mm = key.match(/^bld\.([^.]*)\.l(\d+)$/);
        if (!mm) continue;
        if (mm[1] === family) ownedMax = Math.max(ownedMax, Number(mm[2]));
      }
      // also accept state.bld entries that are objects with .level property
      for (const key of Object.keys(state.bld || {})) {
        const obj = state.bld[key];
        if (obj && typeof obj === 'object' && typeof obj.level === 'number') {
          const m2 = key.match(/^bld\.([^.]*)/);
          if (m2 && m2[1] === family) ownedMax = Math.max(ownedMax, obj.level);
        }
      }
      return ownedMax >= levelNeeded;
    }
    // fallback: treat any presence of exact key as satisfied
    if (state.bld && reqId in state.bld) return true;
    return false;
  }

  // RESEARCH: rsd.foo.lN or rsd.foo
  if (reqId.startsWith('rsd.') || reqId.startsWith('research.')) {
    const raw = normalize(reqId).replace(/^research\./, '').replace(/^rsd\./, '');
    const rawNoLevel = raw.replace(/\.l\d+$/, '');
    const m = raw.match(/^(.+)\.l(\d+)$/);
    if (m) {
      const key = m[1];
      const need = Number(m[2]);
      // check state.rsd and state.research for any key with level >= need (or boolean presence)
      if (anyLevelAtLeast(state.rsd, 'rsd', key, need)) return true;
      if (anyLevelAtLeast(state.research, 'rsd', key, need)) return true;
      // also direct object keyed by key
      if (anyLevelAtLeast(state.rsd, '', key, need)) return true;
      if (anyLevelAtLeast(state.research, '', key, need)) return true;
      return false;
    } else {
      // no level specified – accept presence in multiple possible storages
      const candidates = [
        `rsd.${rawNoLevel}`,
        rawNoLevel,
        `research.${rawNoLevel}`
      ];
      if (anyKeyTruthy(state.rsd, candidates)) return true;
      if (anyKeyTruthy(state.research, candidates)) return true;
      return false;
    }
  }

  // ADDONS: add.key.lN or add.key
  if (reqId.startsWith('add.')) {
    const raw = normalize(reqId).replace(/^add\./, '');
    const m = raw.match(/^(.+)\.l(\d+)$/);
    if (m) {
      const key = m[1];
      const need = Number(m[2]);
      // check state.add for any matching keys with level >= need
      if (anyLevelAtLeast(state.add, 'add', key, need)) return true;
      // some systems store addons as state.add['add.key'] = { level: X } or state.add['add.key.lX']
      // the anyLevelAtLeast helper already scans for these
      return false;
    } else {
      // no level -> any presence counts
      const candidates = [`add.${raw}`, raw];
      if (anyKeyTruthy(state.add, candidates)) return true;
      return false;
    }
  }

  // fallback: if a simple id (maybe 'farming' or 'rsdHealth') exists in top-level state
  const plain = normalize(reqId).replace(/^res\./, '');
  if (plain && (plain in (state || {}))) {
    const v = state[plain];
    if (typeof v === 'number') return v > 0;
    if (typeof v === 'boolean') return v;
    if (v && typeof v === 'object') return true;
  }

  return false;
};

  // Build requirement entries for UI (translated names where possible)
  const requirementEntries = useMemo(() => {
    if (!show.requirements) return [];
    const raw = def?.require || def?.req || def?.requirements || '';
    const ids = parseReqIds(raw);
    const out = ids.map((id, idx) => {
      // Normalize id (strip whitespace)
      const reqId = String(id).trim();
      // user-visible name: try translate from defs (alldata already localized into defs)
      let name = reqId;
      let defObj = null;

      if (reqId.startsWith('bld.')) {
        const key = reqId.replace(/^bld\./, '');
        // try exact match
        defObj = defs?.bld?.[key] ?? defs?.bld?.[key.replace(/\.l\d+$/,'')];
      } else if (reqId.startsWith('add.')) {
        const key = reqId.replace(/^add\./, '');
        defObj = defs?.add?.[key] ?? defs?.add?.[key.replace(/\.l\d+$/,'')];
      } else if (reqId.startsWith('rsd.') || reqId.startsWith('research.')) {
        const key = reqId.replace(/^rsd\.|^research\./, '');
        defObj = defs?.rsd?.[key] ?? defs?.rsd?.[key.replace(/\.l\d+$/,'')];
      }

      if (defObj && defObj.name) {
        name = defObj.name;
      } else {
        // fallback: try translation lookup (useT) with the id as key,
        // or humanize the id (remove prefix and replace dots with spaces)
        const translated = t(reqId, null);
        if (translated && translated !== reqId) name = translated;
        else {
          name = reqId.replace(/^(bld\.|add\.|rsd\.|research\.)/, '').replace(/\./g, ' ').replace(/_+/g, ' ');
        }
      }

      const ok = isReqSatisfied(reqId);
      return { id: reqId, name, ok, _idx: idx };
    });
    return out;
  }, [def, defs, state, show.requirements, t]);

  // Layout helpers: split arrays into two roughly equal columns
  const twoColumnSplit = (arr) => {
    if (!Array.isArray(arr)) return [[], []];
    const mid = Math.ceil(arr.length / 2);
    return [arr.slice(0, mid), arr.slice(mid)];
  };

  // CSS helpers inline (keeps component self-contained)
  const gridTwoColsStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' };
  const entryStyle = { display: 'flex', alignItems: 'center', gap: 8 };

  // Debug: detect duplicate keys in rendered lists and log them (helps track down remaining warnings)
  useEffect(() => {
    const resourceKeys = costEntries.map(e => `res::${e._idx}::${e.effRid || e.id}`);
    const reqKeys = requirementEntries.map(r => `req::${r._idx}::${r.id}`);
    const shortKeys = requirement && requirement.shortfalls ? Object.keys(requirement.shortfalls).map((k, i) => `short::${i}::${k}`) : [];
    const all = [...resourceKeys, ...reqKeys, ...shortKeys];
    const dupes = all.filter((k, i) => all.indexOf(k) !== i);
    if (dupes.length) {
      console.warn('[RequirementPanel] duplicate keys detected in lists:', [...new Set(dupes)]);
      console.log('resourceKeys:', resourceKeys);
      console.log('requirementKeys:', reqKeys);
      console.log('shortfallKeys:', shortKeys);
    }
  }, [costEntries, requirementEntries, requirement]);

  return (
    <div className="requirement-panel" style={{ minWidth: 280 }}>
      {show.resources && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 0, display: 'grid', gap: 4, fontSize: 12 }}></div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('ui.labels.resources', 'Ressourcekrav')}</div>
          {costEntries.length ? (
            <div style={gridTwoColsStyle}>
              {(() => {
                const [left, right] = twoColumnSplit(costEntries);
                const renderCol = (col, colName) => (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {col.map((e) => {
                      const st = resourceStatus[e.id] || resourceStatus[e.effRid] || { ok: true };
                      const ok = !!st.ok;
                      const color = ok ? '#0a0' : '#c33';
                      const key = `res::${e._idx}::${(e.effRid || e.id)}`;
                      return (
                        <div key={key} style={entryStyle}>
                          <div style={{ width: 28, textAlign: 'center' }}>
                            {e.icon?.iconUrl ? <Icon iconUrl={e.icon.iconUrl} size="2em" /> : <span style={{ fontSize: 16 }}>{e.icon?.emoji || '📦'}</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{e.name}</div>
                            <div style={{ fontSize: 12, color }}>
                              {H.fmt(e.buffedAmt)} {ok ? <span style={{ marginLeft: 8 }}>✓</span> : <span style={{ marginLeft: 8 }}>✕</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
                // return fragment with two columns (keys inside items are stable)
                return (<>{renderCol(left, 'left')}{renderCol(right, 'right')}</>);
              })()}
            </div>
          ) : (
            <div className="sub">{t('ui.text.none.h1', 'Ingen')}</div>
          )}
        </div>
      )}

      {show.requirements && (
        <div style={{ marginBottom: 10 }}>
            
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('ui.labels.requirements', 'Øvrige krav')}</div>
          {requirementEntries.length ? (
            <div style={gridTwoColsStyle}>
              {(() => {
                const [left, right] = twoColumnSplit(requirementEntries);
                const renderReqCol = (col) => (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {col.map((r) => {
                      const key = `req::${r._idx}::${r.id}`;
                      return (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ color: r.ok ? '#0a0' : '#c33' }}>{r.name}</div>
                          <div style={{ color: r.ok ? '#0a0' : '#c33', fontWeight: 700 }}>{r.ok ? '✓' : '✕'}</div>
                        </div>
                      );
                    })}
                  </div>
                );
                return (<>{renderReqCol(left)}{renderReqCol(right)}</>);
              })()}
            </div>
          ) : (
            <div className="sub">{t('ui.text.none.h1', 'Ingen')}</div>
          )}
        </div>
      )}

      {(show.footprint || show.duration) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{t('ui.labels.footprint', 'Footprint')}</div>
            <div className="sub" style={{ color: footprint.ok ? '#0a0' : '#c33' }}>
              {footprint.base} {footprint.ok ? <span style={{ color: '#0a0' }}>✓</span> : <span style={{ color: '#c33' }}>✕</span>}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>({H.fmt(footprint.usedFP || 0)} / {H.fmt(footprint.totalFP || 0)})</div>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{t('ui.labels.duration', 'Byggetid')}</div>
            <div className="sub">
  {formatDurationFull(duration.base)}
  {duration.base !== duration.buffed ? ` → ${formatDurationFull(duration.buffed)}` : ''}
</div>
          </div>
        </div>
      )}

      {/* show shortfalls block if present */}
      {requirement?.shortfalls && Object.keys(requirement.shortfalls).length > 0 && (
        <div style={{ marginTop: 10, color: '#c33' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.shortfalls', 'Manglende ressourcer')}</div>
          <div style={{ fontSize: 13 }}>
            {Object.entries(requirement.shortfalls).map(([rid, s], i) => (
              <div key={`short::${i}::${rid}`}>
                {rid.replace(/^res\./, '')}: mangler {H.fmt(Math.max(0, (s.need || 0) - (s.have || 0)))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}