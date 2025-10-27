import React, { useMemo, useEffect } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import * as H from '../../services/helpers.js';
import { collectActiveBuffs, requirementInfo } from '../../services/requirements.js';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';
import Icon from '../common/Icon.jsx';
import { useT } from '../../services/i18n.js';
import { formatDurationFull } from '../../services/time.js';
import * as Hhelpers from '../../services/helpers.js';

/*
  RequirementPanel — robustified and unified requirement checks:
  - Fall back to global state if state prop is not provided
  - Use H helpers for requirement checks (hasResearch, parseBldKey, computeOwnedMaxBySeries) so results
    match DemandToken / DemandList behavior across pages.
*/

export default function RequirementPanel({
  def,
  defs,
  state, // optional, fallback used if not supplied
  requirementCaches = {},
  show = { resources: true, requirements: true, footprint: true, duration: true },
}) {
  const t = useT();
  const { data } = useGameData(); // fallback source of truth
  const gameState = state || data?.state || {};

  const activeBuffs = requirementCaches?.activeBuffs ?? useMemo(() => collectActiveBuffs(defs), [defs]);

  const requirement = useMemo(() => {
    if (!def) return null;
    const info = requirementInfo(
      {
        id: def.id || def.key || '',
        price: def.cost || {},
        req: def.require || def.requirements || '',
        duration_s: Number(def.duration_s ?? def.time ?? 0),
      },
      gameState,
      requirementCaches,
    );
    return info;
  }, [def, defs, gameState, requirementCaches]);

  const costEntries = useMemo(() => {
    if (!def || !show.resources) return [];
    const map = H.normalizePrice(def.cost || {});
    const out = [];
    Object.values(map).forEach((entry, idx) => {
      const rawId = String(entry.id || '');
      let effRid;
      if (rawId.startsWith('res.') || rawId.startsWith('ani.')) {
        effRid = rawId;
      } else if (defs?.res?.[rawId]) {
        effRid = `res.${rawId}`;
      } else if (defs?.ani?.[rawId]) {
        effRid = `ani.${rawId}`;
      } else {
        effRid = rawId;
      }

      const baseAmt = Number(entry.amount || 0);
      const buffedAmt = (typeof effRid === 'string')
        ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
        : baseAmt;

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

  // --- NYT: yieldsEntries (produktion / yield) - normaliseret til samme form som costEntries
  const yieldsEntries = useMemo(() => {
    if (!def || !show.resources) return [];
    const maybeObj = def.yields || def.produces || def.produce || def.output || def.outputs || def.yield || null;
    if (!maybeObj) return [];

    const list = [];
    if (Array.isArray(maybeObj)) {
      maybeObj.forEach((it, idx) => {
        if (!it) return;
        if (typeof it === 'string') {
          const id = it.startsWith('res.') ? it : `res.${it.replace(/^res\./, '')}`;
          list.push({ id, amount: 1, _idx: idx });
        } else if (typeof it === 'object') {
          const key = String(it.id || it.res || it.resource || it.resId || '').trim();
          if (!key) return;
          const id = key.startsWith('res.') ? key : `res.${key.replace(/^res\./, '')}`;
          const amount = Number(it.amount || it.qty || it.count || 0) || 0;
          list.push({ id, amount, _idx: idx });
        }
      });
    } else if (typeof maybeObj === 'object') {
      Object.entries(maybeObj).forEach(([k, v], idx) => {
        const id = String(k).startsWith('res.') ? String(k) : `res.${String(k).replace(/^res\./, '')}`;
        const amount = Number(v || 0);
        list.push({ id, amount, _idx: idx });
      });
    } else if (typeof maybeObj === 'string') {
      const id = maybeObj.startsWith('res.') ? maybeObj : `res.${maybeObj.replace(/^res\./, '')}`;
      list.push({ id, amount: 1, _idx: 0 });
    }

    // enrich with name/icon similarly to costEntries
    return list.map((it) => {
      const raw = String(it.id || '');
      const resKey = raw.replace(/^res\./, '');
      const resDef = defs?.res?.[resKey];
      const name = resDef?.name || resKey;
      const icon = resDef ? (resDef.iconUrl ? { iconUrl: resDef.iconUrl } : { emoji: resDef.emoji }) : null;
      return { id: it.id, amount: Number(it.amount || 0), name, icon, _idx: it._idx };
    });
  }, [def, defs, show.resources]);

  const getHave = (resId) => {
    if (!gameState) return 0;
    const key = String(resId).replace(/^res\./, '');
    const liquid = Number(gameState.inv?.liquid?.[key] || 0);
    const solid = Number(gameState.inv?.solid?.[key] || 0);
    return liquid + solid;
  };

  const resourceStatus = useMemo(() => {
    const shortfalls = requirement?.shortfalls || {};
    const map = {};
    costEntries.forEach((e) => {
      const rid = e.effRid || e.id;
      const sf = shortfalls[rid] || shortfalls[e.id] || null;
      const have = sf ? Number(sf.have || 0) : getHave(rid);
      const need = sf ? Number(sf.need || 0) : Number(e.buffedAmt || 0);
      map[e.id] = { have, need, ok: have >= need };
    });
    return map;
  }, [costEntries, requirement, gameState]);

  const footprint = useMemo(() => {
    const baseFP = Number(def?.stats?.footprint ?? def?.footprint ?? 0);
    const buffedFP = baseFP;
    const totalFP = Number(data?.cap?.footprint?.total ?? 0);
    const usedFP = Number(data?.cap?.footprint?.used ?? 0);
    // Apply sign semantics:
    const ok = (baseFP >= 0) ? true : ((usedFP + Math.abs(baseFP)) <= totalFP);
    return { base: baseFP, buffed: buffedFP, ok, totalFP, usedFP };
  }, [def, data]);

  const duration = useMemo(() => {
    const baseS = Number(def?.duration_s ?? def?.time ?? 0);
    const buffedS = requirement?.duration?.final_s ?? baseS;
    return { base: baseS, buffed: buffedS };
  }, [def, requirement]);

  const parseReqIds = (reqStr) => {
    if (!reqStr) return [];
    return String(reqStr)
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  // --- REWRITTEN: Use existing helpers so checks match DemandToken/DemandList ---
  const isReqSatisfied = (reqId) => {
    if (!reqId) return false;
    try {
      // Research check (use helper)
      if (reqId.startsWith('rsd.') || reqId.startsWith('research.')) {
        return H.hasResearch(reqId, gameState);
      }

      // Building key (bld.family.lN)
      if (reqId.startsWith('bld.')) {
        // Try parse helper (if available)
        const p = H.parseBldKey ? H.parseBldKey(reqId) : null;
        if (p) {
          const ownedBySeries = H.computeOwnedMaxBySeries ? H.computeOwnedMaxBySeries('bld', gameState) : null;
          if (ownedBySeries) return (ownedBySeries[p.series] || 0) >= p.level;
        }
        // fallback: direct state lookup
        return Boolean(gameState.bld && reqId in gameState.bld);
      }

      // Addon check
      if (reqId.startsWith('add.')) {
        const m = reqId.match(/^add\.(.+)\.l(\d+)$/);
        if (m) {
          const series = `add.${m[1]}`;
          const ownedAdd = H.computeOwnedMaxBySeries ? H.computeOwnedMaxBySeries('add', gameState) : null;
          if (ownedAdd) return (ownedAdd[series] || 0) >= Number(m[2]);
        }
        return Boolean(gameState.add && reqId in gameState.add);
      }

      // Resource or generic flag: check inventory or state
      const plain = String(reqId).replace(/^res\./, '');
      if (plain) {
        const have = (gameState.inv?.solid?.[plain] || 0) + (gameState.inv?.liquid?.[plain] || 0);
        return have > 0;
      }
    } catch (e) {
      // if anything blows up, treat as not satisfied
      return false;
    }
    return false;
  };

  const requirementEntries = useMemo(() => {
    if (!show.requirements) return [];
    const raw = def?.require || def?.req || def?.requirements || '';
    const ids = parseReqIds(raw);
    const out = ids.map((id, idx) => {
      const reqId = String(id).trim();
      let name = reqId;
      let defObj = null;

      if (reqId.startsWith('bld.')) {
        const key = reqId.replace(/^bld\./, '');
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
  }, [def, defs, gameState, show.requirements, t]);

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
        <div style={{ marginBottom: 8 }}>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 0, display: 'grid', gap: 4, fontSize: 12 }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.resources', 'Ressourcekrav')}</div>
          {costEntries.length ? (
            <div
              className="rc-inline"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 8,
                alignItems: 'start',
              }}
            >
              {costEntries.map((e, idx) => {
                const st = resourceStatus[e.id] || resourceStatus[e.effRid] || { ok: true };
                const ok = !!st.ok;
                const key = `res::${e._idx}::${(e.effRid || e.id)}`;
                // Single icon spanning two rows, right column shows name (row1) and amount (row2)
                const IconNode = e.icon?.iconUrl
                  ? <Icon iconUrl={e.icon.iconUrl} size={24} />
                  : <Icon value={e.icon?.emoji || undefined} size={24} />;

                return (
                  <div key={key} style={{ padding: 0}}>
                    <div className={`${ok ? 'price-ok' : 'price-bad'}`} style={{ width: '100%' }}>
                      <div
                        className="rc-tile"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '48px 1fr',
                          gridTemplateRows: 'auto auto',
                          gap: 0,
                          alignItems: 'center',
                          textAlign: 'left',
                          padding: 0,
                          minHeight: 34,
                        }}
                      >
                        <div style={{ gridRow: '1 / span 2', gridColumn: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {IconNode}
                        </div>

                        <div className="rc-name" style={{ gridRow: 1, gridColumn: 2, fontWeight: 600, fontSize: 12 , overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.name}
                        </div>

                        <div className="rc-need" style={{ gridRow: 2, gridColumn: 2, fontSize: 12 }}>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Hhelpers.fmt(e.buffedAmt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sub">{t('ui.text.none.h1', 'Ingen')}</div>
          )}

          {/* --- Yield / Produktion (samme layout som resourcekrav) --- */}
          {yieldsEntries.length ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.yields', 'Yield / Produktion')}</div>
              <div
                className="rc-inline"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                  alignItems: 'start',
                }}
              >
                {yieldsEntries.map((e) => {
                  const key = `yield::${e._idx}::${e.id}`;
                  const IconNode = e.icon?.iconUrl ? <Icon iconUrl={e.icon.iconUrl} size={24} /> : <Icon value={e.icon?.emoji || undefined} size={24} />;
                  return (
                    <div key={key} style={{ padding: 0 }}>
                      <div style={{ width: '100%' }}>
                        <div
                          className="rc-tile"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '48px 1fr',
                            gridTemplateRows: 'auto auto',
                            gap: 0,
                            alignItems: 'center',
                            textAlign: 'left',
                            padding: 0,
                            minHeight: 34,
                          }}
                        >
                          <div style={{ gridRow: '1 / span 2', gridColumn: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {IconNode}
                          </div>

                          <div className="rc-name" style={{ gridRow: 1, gridColumn: 2, fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.name}
                          </div>

                          <div className="rc-need" style={{ gridRow: 2, gridColumn: 2, fontSize: 12 }}>
                            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Hhelpers.fmt(e.amount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {show.requirements && requirementEntries.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.requirements', 'Øvrige krav')}</div>

          <div
            className="demand-list-inline"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              whiteSpace: 'nowrap',
              overflowX: 'auto',
              padding: '4px 0'
            }}
          >
            {requirementEntries.map((r) => {
              // same link logic, kept compact
              let maybeLink = null;
              if (r.id && (r.id.startsWith('bld.') || r.id.startsWith('add.'))) maybeLink = `#/building/${r.id}`;
              else if (r.id && (r.id.startsWith('rsd.') || r.id.startsWith('research.'))) {
                const rid = r.id.startsWith('rsd.') ? r.id : r.id.replace(/^research\./, '');
                maybeLink = `#/research?focus=${rid}`;
              }

              // compact icon lookup
              let iconUrl = undefined;
              let value = undefined;
              try {
                if (r.id.startsWith('bld.')) {
                  const key = r.id.replace(/^bld\./, '');
                  const d = defs?.bld?.[key] ?? defs?.bld?.[key.replace(/\.l\d+$/, '')];
                  iconUrl = '/assets/icons/symbol_building.png'; value = d?.iconFilename || d?.emoji;
                } else if (r.id.startsWith('add.')) {
                  const key = r.id.replace(/^add\./, '');
                  const d = defs?.add?.[key] ?? defs?.add?.[key.replace(/\.l\d+$/, '')];
                  iconUrl = '/assets/icons/symbol_addon.png'; value = d?.iconFilename || d?.emoji;
                } else if (r.id.startsWith('rsd.') || r.id.startsWith('research.')) {
                  const key = r.id.replace(/^rsd\.|^research\./, '');
                  const d = defs?.rsd?.[key] ?? defs?.rsd?.[key.replace(/\.l\d+$/, '')];
                  iconUrl = '/assets/icons/symbol_research.png'; value = d?.iconFilename || d?.emoji;
                }
              } catch (e) { /* ignore */ }

              const colorClass = r.ok ? 'price-ok' : 'price-bad';
              const tokenNode = (
                <div
                  key={`req-token-${r._idx}`}
                  className={`demand-token ${colorClass}`}
                  style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '4px 8px', borderRadius: 6 }}
                  title={r.name}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon iconUrl={iconUrl || '/assets/icons/default.png'} value={value} size={18} alt={r.name} />
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{r.name}</span>
                </div>
              );

              return maybeLink ? (
                <a key={r.id} href={maybeLink} className="demand-token-link" style={{ textDecoration: 'none' }}>
                  {tokenNode}
                </a>
              ) : (
                <span key={r.id}>
                  {tokenNode}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {(show.footprint || show.duration) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{t('ui.labels.footprint', 'Footprint')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Icon iconUrl={'/assets/icons/symbol_footprint.png'} size={20} alt="footprint" />
              <div className="sub" style={{ color: footprint.ok ? '#0a0' : '#c33', fontWeight: 700 }}>
                {Hhelpers.fmt(footprint.base)}
                {footprint.ok ? <span style={{ color: '#0a0', marginLeft: 8 }}>✓</span> : <span style={{ color: '#c33', marginLeft: 8 }}>✕</span>}
              </div>
            </div>            
          </div>

          <div>
            <div style={{ fontWeight: 700 }}>{t('ui.labels.duration', 'Byggetid')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Icon iconUrl={'/assets/icons/symbol_time.png'} size={20} alt="time" />
              <div className="sub" style={{ fontWeight: 700 }}>
                {formatDurationFull(duration.base)}
                {duration.base !== duration.buffed ? <span style={{ marginLeft: 8 }}>→ {formatDurationFull(duration.buffed)}</span> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {requirement?.shortfalls && Object.keys(requirement.shortfalls).length > 0 && (
        <div style={{ marginTop: 10, color: '#c33' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.shortfalls', 'Manglende ressourcer')}</div>
          <div style={{ fontSize: 13 }}>
            {Object.entries(requirement.shortfalls).map(([rid, s], i) => (
              <div key={`short::${i}::${rid}`}>
                {rid.replace(/^res\./, '')}: mangler {Hhelpers.fmt(Math.max(0, (s.need || 0) - (s.have || 0)))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}