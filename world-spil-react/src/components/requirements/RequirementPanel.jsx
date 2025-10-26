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
            <div className="rc-inline">
              {costEntries.map((e, idx) => {
                const st = resourceStatus[e.id] || resourceStatus[e.effRid] || { ok: true };
                const ok = !!st.ok;
                const key = `res::${e._idx}::${(e.effRid || e.id)}`;
                return (
                  <React.Fragment key={key}>
                    <div className={`${ok ? 'price-ok' : 'price-bad'}`}>
                      <div className="rc-tile">
                        <div className="rc-icon">
                          {e.icon?.iconUrl ? <Icon iconUrl={e.icon.iconUrl} size={28} /> : <Icon value={e.icon?.emoji || undefined} size={28} />}
                        </div>
                        <div className="rc-name" style={{ fontWeight: 600 }}>{e.name}</div>
                        <div className="rc-need" style={{ fontSize: 12 }}>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Hhelpers.fmt(e.buffedAmt)}</span>
                        </div>
                      </div>
                    </div>
                    {/* plus between items - handled by CSS variant if necessary */}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="sub">{t('ui.text.none.h1', 'Ingen')}</div>
          )}
        </div>
      )}

      {show.requirements && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.requirements', 'Øvrige krav')}</div>

          {requirementEntries.length ? (
            <div className="demand-list" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {requirementEntries.map((r) => {
                // Build link when applicable: bld/add -> building detail, rsd -> research focus
                let maybeLink = null;
                if (r.id && (r.id.startsWith('bld.') || r.id.startsWith('add.'))) {
                  maybeLink = `#/building/${r.id}`;
                } else if (r.id && (r.id.startsWith('rsd.') || r.id.startsWith('research.'))) {
                  const rid = r.id.startsWith('rsd.') ? r.id : r.id.replace(/^research\./, '');
                  maybeLink = `#/research?focus=${rid}`;
                }

                // try to get icon info for this requirement (if defs expose it)
                let iconUrl = undefined;
                let value = undefined;
                try {
                  if (r.id.startsWith('bld.')) {
                    const key = r.id.replace(/^bld\./, '');
                    const d = defs?.bld?.[key] ?? defs?.bld?.[key.replace(/\.l\d+$/, '')];
                    iconUrl = '/assets/icons/symbol_building.png';
                    value = d?.iconFilename || d?.emoji || undefined;
                  } else if (r.id.startsWith('add.')) {
                    const key = r.id.replace(/^add\./, '');
                    const d = defs?.add?.[key] ?? defs?.add?.[key.replace(/\.l\d+$/, '')];
                    iconUrl = '/assets/icons/symbol_addon.png';
                    value = d?.iconFilename || d?.emoji || undefined;
                  } else if (r.id.startsWith('rsd.') || r.id.startsWith('research.')) {
                    const key = r.id.replace(/^rsd\.|^research\./, '');
                    const d = defs?.rsd?.[key] ?? defs?.rsd?.[key.replace(/\.l\d+$/, '')];
                    iconUrl = '/assets/icons/symbol_research.png';
                    value = d?.iconFilename || d?.emoji || undefined;
                  }
                } catch (e) {
                  iconUrl = undefined;
                  value = undefined;
                }

                const colorClass = r.ok ? 'price-ok' : 'price-bad';
                const token = (
                  <div key={`req-token-${r._idx}`} className={`demand-token ${colorClass}`}>
                    <span className="dt-icon"><Icon iconUrl={iconUrl || '/assets/icons/default.png'} value={value} size={22} alt={r.name} /></span>
                    <span className="dt-label">{r.name}</span>
                  </div>
                );

                return maybeLink ? (
                  <a key={r.id} href={maybeLink} className="demand-token-link" title={r.name}>
                    {token}
                  </a>
                ) : (
                  <span key={r.id} title={r.name}>
                    {token}
                  </span>
                );
              })}
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
            <div style={{ fontSize: 12, color: '#666' }}>({Hhelpers.fmt(footprint.usedFP || 0)} / {Hhelpers.fmt(footprint.totalFP || 0)})</div>
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