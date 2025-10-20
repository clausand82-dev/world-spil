import React, { useMemo, useEffect } from 'react';
import * as H from '../../services/helpers.js';
import { collectActiveBuffs, requirementInfo } from '../../services/requirements.js';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';
import Icon from '../common/Icon.jsx';
import { useT } from '../../services/i18n.js';

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
      const effRid = rawId.startsWith('res.') ? rawId : (defs?.res?.[rawId] ? `res.${rawId}` : rawId);
      const baseAmt = Number(entry.amount || 0);
      const buffedAmt = String(effRid).startsWith('res.')
        ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
        : baseAmt;
      const resKey = String(effRid).replace(/^res\./, '');
      const resDef = defs?.res?.[resKey];
      const icon = resDef ? (resDef.iconUrl ? { iconUrl: resDef.iconUrl } : { emoji: resDef.emoji }) : null;
      // store stable index _idx for key generation
      out.push({ id: entry.id, effRid, baseAmt, buffedAmt, icon, name: resDef?.name || resKey, _idx: idx });
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

  // Helper: try several keys on an object (returns true if any exists/truthy)
  const anyKeyExists = (obj, keys) => {
    if (!obj) return false;
    for (const k of keys) {
      if (k in obj) {
        // some stored values may be objects/arrays - treat presence as satisfied
        const v = obj[k];
        if (v === null || v === undefined) continue;
        // if numeric qty or object, consider satisfied if qty>0 or object present
        if (typeof v === 'number') { if (v > 0) return true; }
        else if (typeof v === 'object') return true;
        else if (v) return true;
      }
    }
    return false;
  };

  // bld.<family>.lN pattern (level checks)
  if (reqId.startsWith('bld.')) {
    const m = reqId.match(/^bld\.([^.]*)\.l?(\d+)$/);
    if (m) {
      const family = m[1];
      const levelNeeded = Number(m[2]);
      // check state.bld keys for any matching series at equal/greater level
      let ownedMax = 0;
      for (const key of Object.keys(state.bld || {})) {
        const mm = key.match(/^bld\.([^.]*)\.l(\d+)$/);
        if (!mm) continue;
        if (mm[1] === family) ownedMax = Math.max(ownedMax, Number(mm[2]));
      }
      return ownedMax >= levelNeeded;
    }
    // fallback: check exact key presence
    if (state.bld && (reqId in state.bld)) return true;
    return false;
  }

  // research -- allow many key forms: 'rsd.foo.l1', 'rsd.foo', 'foo' and check state.rsd or state.research
  if (reqId.startsWith('rsd.') || reqId.startsWith('research.') || reqId.startsWith('rsd_') ) {
    const raw = normalize(reqId).replace(/^research\./, '').replace(/^rsd\./, '');
    const rawNoLevel = raw.replace(/\.l\d+$/,'');
    const candidates = [
      reqId,
      `rsd.${rawNoLevel}`,
      `rsd.${raw}`,
      raw,
      rawNoLevel,
    ];
    // check both state.rsd and state.research
    if (anyKeyExists(state.rsd, candidates)) return true;
    if (anyKeyExists(state.research, candidates)) return true;
    // also check state.rsd keyed by full id forms (sometimes keys include prefix)
    for (const k of candidates) {
      if (state.rsd && (k in state.rsd)) return true;
    }
    return false;
  }

  // addon 'add.<key>.lX' or 'add.<key>'
  if (reqId.startsWith('add.')) {
    const raw = normalize(reqId).replace(/^add\./,'');
    const noLevel = raw.replace(/\.l\d+$/,'');
    const candidates = [
      reqId,
      `add.${noLevel}`,
      `add.${raw}`,
      noLevel,
    ];
    if (anyKeyExists(state.add, candidates)) return true;
    // some state.add entries may be keyed by the exact id (with .lX) or by base add.<key>
    for (const k of candidates) {
      if (state.add && (k in state.add)) return true;
    }
    return false;
  }

  // Fallback: if requirement looks like a simple id that may be stored directly in state (rare)
  const plain = normalize(reqId).replace(/^res\./,'');
  if (plain && (plain in (state || {}))) return !!state[plain];

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
            <div className="sub" style={{ color: '#333' }}>
              {H.fmt(duration.base)}s{duration.base !== duration.buffed ? ` → ${H.fmt(duration.buffed)}s` : ''}
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