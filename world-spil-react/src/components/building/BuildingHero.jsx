import React, { useMemo } from 'react';
import GameImage from '../GameImage.jsx';
import BuildProgress from '../BuildProgress.jsx';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import Icon from '../ui/Icon.jsx';
import * as Hhelpers from '../../services/helpers.js';
import { useT } from "../../services/i18n.js";
import { useGameData } from '../../context/GameDataContext.jsx';
import { prettyTime } from '../../services/helpers.js';
import { collectActiveBuffs } from '../../services/requirements.js';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';
import { applyYieldBuffsToAmount } from '../../services/yieldBuffs.js';

/*
  BuildingHero.jsx – include animals/units yields associated directly with building family

  Summary of behavior:
  - building has a family (heroDef.family or derived)
  - animal defs have a family string that directly references building family (e.g. 'farm')
  - owned animals are in state.ani (various shapes supported)
  - we aggregate yields from:
      * the building itself
      * owned & relevant addons (existing logic)
      * research
      * owned animals whose aniDef.family matches the building family
  - yields are buffed via applyYieldBuffsToAmount with the relevant context (bld.*, add.*, rsd.*, add.<family> for animals)
  - optional debug via window.WS_DEBUG_YIELDS = true
*/

function normalizeBaseKey(s) {
  if (!s) return '';
  let k = String(s);
  k = k.replace(/^add\./, '');
  k = k.replace(/^ani\./, '');
  k = k.replace(/\.l\d+$/i, '');
  return k.trim();
}

function gatherAnimalEntriesFromState(stateAni = {}) {
  // return array { key, qty }
  if (!stateAni) return [];
  const out = [];
  // If array shape
  if (Array.isArray(stateAni)) {
    stateAni.forEach((it) => {
      if (!it) return;
      const key = String(it.id || it.key || it.def || '').replace(/^ani\./, '');
      const qty = Number(it.quantity ?? it.qty ?? it.count ?? it.amount ?? 0);
      if (key && qty) out.push({ key, qty });
    });
    return out;
  }
  // object keyed shape
  Object.entries(stateAni || {}).forEach(([k, v]) => {
    const rawKey = String(k || '');
    const key = rawKey.startsWith('ani.') ? rawKey.replace(/^ani\./, '') : rawKey;
    let qty = 0;
    if (v == null) qty = 0;
    else if (typeof v === 'number') qty = Number(v);
    else if (typeof v === 'object') qty = Number(v.quantity ?? v.qty ?? v.count ?? v.amount ?? 0);
    else qty = Number(v || 0);
    if (key && qty > 0) out.push({ key, qty });
  });
  return out;
}

export default function BuildingHero({ heroDef, heroId, durabilityPct, jobActiveId, footprintText, animalCapText, actionTarget, requirementState }) {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const t = useT();
  const SHOW_YIELD_SOURCES = true;
  const jobActive = !!jobActiveId;
  const hasBuffedTime = Number.isFinite(actionTarget?.duration) && Number.isFinite(actionTarget?.durationBase)
    ? Math.round(actionTarget.duration) !== Math.round(actionTarget.durationBase)
    : false;
  const timeValue = actionTarget?.duration != null ? prettyTime(actionTarget.duration) : '-';
  const timeTitle = hasBuffedTime ? `Normal: ${prettyTime(actionTarget.durationBase ?? 0)}` : undefined;
  const imgKey = String(heroId || heroDef?.id || '').replace(/^bld\./, '').replace(/\.l\d+$/i, '');

  const yieldsEntries = useMemo(() => {
    const def = heroDef || actionTarget;
    if (!def || !defs) return [];

    const state = data?.state || {};
    const activeBuffs = data?.activeBuffs || state.activeBuffs || {};

    const totals = {}; // rid -> { total, sources: { bld, addons:{}, rsd:{}, animals, misc } }

    const pushAmount = (resId, amount = 0, sourceType = 'misc', sourceId = null) => {
      if (!resId) return;
      const rid = String(resId).startsWith('res.') ? String(resId) : `res.${String(resId).replace(/^res\./, '')}`;
      const val = Number(amount || 0);
      if (!val) return;
      const e = totals[rid] || (totals[rid] = { total: 0, sources: { bld: 0, addons: {}, rsd: {}, animals: 0, misc: 0 } });
      e.total += val;
      if (!SHOW_YIELD_SOURCES) return;
      if (sourceType === 'bld') e.sources.bld += val;
      else if (sourceType === 'add') e.sources.addons[sourceId || 'unknown'] = (e.sources.addons[sourceId || 'unknown'] || 0) + val;
      else if (sourceType === 'rsd') e.sources.rsd[sourceId || 'unknown'] = (e.sources.rsd[sourceId || 'unknown'] || 0) + val;
      else if (sourceType === 'ani') e.sources.animals += val;
      else e.sources.misc += val;
    };

    const processYieldDef = (itemDef, ctxId = null, qty = 1, sourceType = 'misc', sourceId = null) => {
      if (!itemDef) return;
      const yields = itemDef.yield || itemDef.yields || itemDef.produces || itemDef.output || itemDef.outputs;
      const period_s = Number(itemDef.yield_period_s || itemDef.period_s || 0);
      if (!yields) return;
      for (const y of yields) {
        const baseAmt = Number(y.amount ?? y.qty ?? y.count ?? 0);
        if (!baseAmt) continue;
        const rawRes = String(y.id ?? y.res_id ?? y.res ?? y.resource ?? '');
        if (!rawRes) continue;
        const ridForBuff = rawRes.startsWith('res.') ? rawRes : `res.${rawRes}`;
        if (period_s > 0) {
          const basePerHour = baseAmt * (3600 / period_s);
          const buffedPerHour = typeof applyYieldBuffsToAmount === 'function'
            ? applyYieldBuffsToAmount(basePerHour, ridForBuff, { appliesToCtx: ctxId, activeBuffs })
            : basePerHour;
          const buffedPerCycle = buffedPerHour * (period_s / 3600);
          pushAmount(ridForBuff, buffedPerCycle * qty, sourceType, sourceId);
        } else {
          const buffed = typeof applyYieldBuffsToAmount === 'function'
            ? applyYieldBuffsToAmount(baseAmt, ridForBuff, { appliesToCtx: ctxId, activeBuffs })
            : baseAmt;
          pushAmount(ridForBuff, buffed * qty, sourceType, sourceId);
        }
      }
    };

    // building own yields
    const baseKey = String(heroId || heroDef?.id || '').replace(/^bld\./, '').replace(/\.l\d+$/i, '');
    const bldCtx = `bld.${baseKey}`;
    processYieldDef(def, bldCtx, 1, 'bld', baseKey);

    // installed addons (existing detection)
    const installedAddons = new Set();
    const gatherAddonId = (a) => {
      if (!a) return null;
      if (typeof a === 'string') return a;
      if (typeof a === 'object') {
        if (a.id) return a.id;
        if (a.key) return a.key;
        if (a.def) return a.def;
      }
      return null;
    };
    (def.addons || def.installedAddons || actionTarget?.addons || []).forEach(a => {
      const aid = gatherAddonId(a);
      if (aid) installedAddons.add(aid);
    });
    const tryPaths = [
      state.buildings?.[heroId]?.addons,
      state.units?.[heroId]?.addons,
      state.blds?.[heroId]?.addons,
      state[heroId]?.addons,
    ];
    tryPaths.forEach(p => Array.isArray(p) && p.forEach(a => {
      const aid = gatherAddonId(a);
      if (aid) installedAddons.add(aid);
    }));

    // also include owned addons by family as before
    const baseFamily = heroDef?.family ?? null;
    if (baseFamily) {
      const stateAddMapCandidates = [ state.add, state.adds, state.installedAddons, state.addon || {} ];
      Object.keys(defs?.add || {}).forEach((addKey) => {
        const addDef = defs.add[addKey];
        if (!addDef) return;
        if (String(addDef.family) !== String(baseFamily)) return;
        let owned = false;
        for (const m of stateAddMapCandidates) {
          if (!m) continue;
          if (m[`add.${addKey}`] || m[addKey] || m[`add.${addDef.id}`] || m[String(addDef.id)]) {
            owned = true;
            break;
          }
        }
        if (!owned) {
          for (const p of tryPaths) {
            if (Array.isArray(p) && p.some(x => {
              const aid = gatherAddonId(x);
              return aid && (String(aid).includes(addKey) || String(aid) === `add.${addKey}`);
            })) {
              owned = true;
              break;
            }
          }
        }
        if (owned) installedAddons.add(addKey);
      });
    }

    // process installed addons yields
    const installedAddonBaseKeys = new Set();
    installedAddons.forEach(aid => {
      let s = String(aid || '');
      s = s.replace(/^add\./, '');
      s = s.replace(/\.l\d+$/i, '');
      installedAddonBaseKeys.add(s);
    });
    installedAddons.forEach((aid) => {
      const key = String(aid).replace(/^add\./, '').replace(/\.l\d+$/i, '');
      const adddef = defs?.add?.[key] || defs?.add?.[String(aid).replace(/^add\./, '')] || null;
      if (!adddef) return;
      const ctx = `add.${key}`;
      processYieldDef(adddef, ctx, 1, 'add', key);
    });

    // research (existing)
    const completed = new Set();
    (state.research?.completed || state.completedResearch || state.completedRsd || state.rsdCompleted || []).forEach(r => {
      if (r) completed.add(String(r));
    });
    if (state.rsd && typeof state.rsd === 'object') {
      Object.keys(state.rsd).forEach(k => {
        if (!k) return;
        completed.add(k);
        if (!String(k).startsWith('rsd.')) completed.add(`rsd.${k}`);
      });
    }
    Object.keys(activeBuffs || {}).forEach(k => {
      const candidate = String(k).replace(/^rsd\.|^research\./, '');
      if (candidate) completed.add(candidate);
    });
    if (baseFamily) {
      const stateRsd = state.rsd || {};
      Object.keys(defs?.rsd || {}).forEach((rsdKey) => {
        const rdef = defs.rsd[rsdKey];
        if (!rdef) return;
        if (String(rdef.family) !== String(baseFamily)) return;
        const owned =
          !!(stateRsd[`rsd.${rsdKey}`] || stateRsd[rsdKey] || stateRsd[String(rdef.id)] || (state.research?.completed && state.research.completed.includes(rsdKey)));
        if (owned) {
          completed.add(rsdKey);
        }
      });
    }
    const processedResearch = new Set();
    completed.forEach((rid) => {
      const key = String(rid).replace(/^rsd\.|^research\./, '');
      if (processedResearch.has(key)) return;
      const rdef = defs?.rsd?.[key] || defs?.rsd?.[rid] || null;
      if (!rdef) return;
      const stateRsd = state.rsd || state.research || {};
      const owned = !!(
        stateRsd[`rsd.${key}`] ||
        stateRsd[key] ||
        (state.research?.completed && state.research.completed.includes(rid)) ||
        (state.completedResearch && state.completedResearch.includes(rid))
      );
      const buffKeyMatch = Object.keys(activeBuffs || {}).some(k => String(k).includes(key) || String(k).includes(rid));
      if (owned || buffKeyMatch) {
        processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
        processedResearch.add(key);
      } else {
        if (String(rdef.family) === String(baseFamily) && completed.has(key)) {
          processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
          processedResearch.add(key);
        }
      }
      const maybeTargets = [].concat(rdef.for || rdef.targets || rdef.appliesTo || []);
      const heroKeys = new Set([String(heroId), baseKey, heroDef?.id, heroDef?.key].filter(Boolean));
      if (!processedResearch.has(key) && maybeTargets.some(t => heroKeys.has(String(t)))) {
        processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
        processedResearch.add(key);
      }
    });

    // ANIMALS: directly associate animals by animal.family === building family
    try {
      const aniMap = state?.ani || {};
      const aniEntries = gatherAnimalEntriesFromState(aniMap);
      const matchedAnimals = [];
      const targetFamilyBase = normalizeBaseKey(baseFamily || '');

      aniEntries.forEach((ae) => {
        const aniKey = String(ae.key || '').replace(/^ani\./, '');
        const aniDef = defs?.ani?.[aniKey] || defs?.ani?.[String(ae.key)];
        if (!aniDef) return;
        const familyRaw = String(aniDef.family || '').trim();
        if (!familyRaw) return;
        const familyBase = normalizeBaseKey(familyRaw);
        // match directly to building family
        if (familyBase !== targetFamilyBase) return;
        matchedAnimals.push({ aniKey, qty: ae.qty, family: familyBase, def: aniDef });
      });

      matchedAnimals.forEach((ma) => {
        const family = ma.family || 'unknown';
        const qty = Number(ma.qty || 0);
        if (!qty) return;
        const ctx = `add.${family}`; // reuse addon context so yield-buffs applying to add.<family> work
        const aDef = ma.def;
        const yields = aDef.yield || aDef.yields || aDef.produces || aDef.output || aDef.outputs;
        const period_s = Number(aDef.yield_period_s || aDef.period_s || 0);
        if (!yields) return;
        for (const y of yields) {
          const baseAmt = Number(y.amount ?? y.qty ?? y.count ?? 0);
          if (!baseAmt) continue;
          const rawRes = String(y.id ?? y.res_id ?? y.res ?? y.resource ?? '');
          if (!rawRes) continue;
          const ridForBuff = rawRes.startsWith('res.') ? rawRes : `res.${rawRes}`;
          if (period_s > 0) {
            const basePerHour = baseAmt * (3600 / period_s);
            const buffedPerHour = typeof applyYieldBuffsToAmount === 'function'
              ? applyYieldBuffsToAmount(basePerHour, ridForBuff, { appliesToCtx: ctx, activeBuffs })
              : basePerHour;
            const buffedPerCycle = buffedPerHour * (period_s / 3600);
            pushAmount(ridForBuff, buffedPerCycle * qty, 'ani', family);
          } else {
            const buffed = typeof applyYieldBuffsToAmount === 'function'
              ? applyYieldBuffsToAmount(baseAmt, ridForBuff, { appliesToCtx: ctx, activeBuffs })
              : baseAmt;
            pushAmount(ridForBuff, buffed * qty, 'ani', family);
          }
        }
      });

      if (typeof window !== 'undefined' && window.WS_DEBUG_YIELDS) {
        console.debug('[YIELDS] targetFamilyBase:', targetFamilyBase);
        console.debug('[YIELDS] aniEntries:', aniEntries);
        console.debug('[YIELDS] matchedAnimals:', matchedAnimals);
        console.debug('[YIELDS] totals pre-convert:', totals);
      }
    } catch (e) {
      // don't break
    }

    // convert totals -> array
    const out = Object.keys(totals).map((rid, idx) => {
      const resKey = String(rid).replace(/^res\./, '');
      const resDef = defs?.res?.[resKey];
      const name = resDef?.name || resKey;
      const icon = resDef ? (resDef.iconUrl ? { iconUrl: resDef.iconUrl } : { emoji: resDef.emoji }) : { emoji: rid };
      const entry = totals[rid];
      return { id: rid, amount: Number(entry.total || 0), name, icon, sources: SHOW_YIELD_SOURCES ? entry.sources : undefined, _idx: idx };
    });

    out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    return out;
  }, [heroDef, heroId, actionTarget, defs, data, SHOW_YIELD_SOURCES]);

  const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);

  const priceEntries = useMemo(() => {
    const priceObj = actionTarget?.price || {};
    const norm = Hhelpers.normalizePrice(priceObj || {});
    return Object.values(norm).map((p, idx) => {
      const rid = String(p.id || '');
      const resKey = rid.replace(/^res\./, '');
      const resDef = defs?.res?.[resKey];
      const name = resDef?.name || resKey;
      const icon = resDef ? (resDef.iconUrl ? { iconUrl: resDef.iconUrl } : { emoji: resDef.emoji }) : { emoji: rid };
      const baseAmount = Number(p.amount || 0);
      let amount = baseAmount;
      try {
        amount = applyCostBuffsToAmount(baseAmount, rid, { appliesToCtx: 'all', activeBuffs });
        if (typeof amount !== 'number' || Number.isNaN(amount)) amount = baseAmount;
      } catch (err) {
        amount = baseAmount;
      }
      return { id: rid, amount: Number(amount || 0), baseAmount, name, icon, _idx: idx };
    });
  }, [actionTarget, defs, activeBuffs]);

  const getPlayerResAmount = (rid) => {
    const state = data?.state || {};
    const resKey = String(rid).replace(/^res\./, '');
    const candidates = [
      state?.inv?.liquid,
      state?.inv?.solid,
      state?.inv,
      state?.res,
      state?.resources,
      state?.inventory,
      state?.stock,
      data?.res,
      data?.resources
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (resKey in c) return Number(c[resKey] || 0);
      if (rid in c) return Number(c[rid] || 0);
    }
    if (state?.rsd && (state.rsd[resKey] || state.rsd[rid])) {
      return Number(state.rsd[resKey] || state.rsd[rid] || 0);
    }
    return 0;
  };

  return (
    <div className="detail-hero">
      <div className="photo">
        <GameImage
          src={`/assets/art/${imgKey}.png`}
          fallback="/assets/art/placeholder.big.png"
          alt={heroDef?.name || heroId}
          width={256}
          height={256}
        />
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon src="/assets/icons/symbol_building.png" size={24} alt={heroDef?.name || heroId} />
          </div>
          <div>
            {heroDef?.name || heroId}
            {heroDef?.lvl ? <span className="sub" style={{ marginLeft: 8 }}>(Level {heroDef.lvl})</span> : null}
          </div>
        </div>
        {heroDef?.desc ? <div className="sub" style={{ marginBottom: 10 }}>{heroDef.desc}</div> : null}
        <div className="statgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto auto', gap: 12 }}>
          {/* Row 1, Col 1: Produktion */}
          <div style={{ gridColumn: '1', gridRow: '1' }}>
            <div className="label" style={{ bottomGap: 10 }}>{t("ui.production.h1")}</div>
            <div className="value">
              {yieldsEntries.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                  {yieldsEntries.map((y) => (
                    <div key={y._idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, flex: '0 0 20px' }}>
                        {y.icon?.iconUrl
                          ? <Icon src={y.icon.iconUrl} size={20} alt={y.name} />
                          : <Icon def={{ emoji: y.icon?.emoji }} size={20} alt={y.name} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{y.name}</div>
                        <div style={{ fontSize: 11, }}>{Hhelpers.fmt(y.amount)}</div>
                        {SHOW_YIELD_SOURCES && y.sources ? (
                          <div style={{ fontSize: 10, color: 'var(--subtext, #8b8b8b)', marginTop: 4 }}>
                            {y.sources.bld ? <div>Bygning: +{Hhelpers.fmt(y.sources.bld)}</div> : null}
                            {y.sources.animals ? <div>Dyr: +{Hhelpers.fmt(y.sources.animals)}</div> : null}
                            {y.sources.misc ? <div>Andet: +{Hhelpers.fmt(y.sources.misc)}</div> : null}
                            {y.sources.addons && Object.keys(y.sources.addons).length ? (
                              <div>
                                Addons:
                                <div style={{ marginLeft: 8 }}>
                                  {Object.entries(y.sources.addons).map(([aid, amt]) => {
                                    const addName = defs?.add?.[String(aid)]?.name || String(aid);
                                    const addLvl = defs?.add?.[String(aid)]?.lvl || 1;
                                    return <div key={aid}>{addName} (Level {addLvl}): +{Hhelpers.fmt(amt)}</div>;
                                  })}
                                </div>
                              </div>
                            ) : null}
                            {y.sources.rsd && Object.keys(y.sources.rsd).length ? (
                              <div>
                                Research:
                                <div style={{ marginLeft: 8 }}>
                                  {Object.entries(y.sources.rsd).map(([rid, amt]) => {
                                    const rname = defs?.rsd?.[String(rid)]?.name || String(rid);
                                    return <div key={rid}>{rname}: +{Hhelpers.fmt(amt)}</div>;
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : '-'}
            </div>
          </div>

          {/* Row 1, Col 2: Opgraderingspris */}
          <div style={{ gridColumn: '2', gridRow: '1' }}>
            <div className="label">{t("ui.upgradecost.h1")}</div>
            <div className="value">
              {actionTarget ? (
                priceEntries.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                    {priceEntries.map((p) => {
                      const have = getPlayerResAmount(p.id);
                      const ok = Number(have || 0) >= Number(p.amount || 0);
                      const color = ok ? 'green' : 'crimson';
                      return (
                        <div key={p._idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 20, flex: '0 0 20px' }}>
                            {p.icon?.iconUrl
                              ? <Icon src={p.icon.iconUrl} size={20} alt={p.name} />
                              : <Icon def={{ emoji: p.icon?.emoji }} size={20} alt={p.name} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140, color }}>{p.name}</div>
                            <div style={{ fontSize: 11, color }}>{Hhelpers.fmt(have)} / {Hhelpers.fmt(p.amount)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : '-'
              ) : '-'}
            </div>
          </div>

          {/* Row 2, Col 1: Krav (tidligere kapacitet-plads) */}
          <div style={{ gridColumn: '1', gridRow: '2' }}>
            <div className="label">{t("ui.demands.h1")}</div>
            <div className="value">
              {actionTarget?.reqString ? <DemandList req={actionTarget.reqString} /> : '-'}
            </div>
          </div>

          {/* Row 2, Col 2: Durability */}
          <div style={{ gridColumn: '2', gridRow: '2' }}>
            <div className="label">{jobActive ? 'In progress' : 'Durability'}</div>
            <div className="value">
              {jobActive ? (
                <BuildProgress bldId={jobActiveId} style={{ width: '100%' }} />
              ) : (
                <div className="progress">
                  <span style={{ width: `${durabilityPct}%` }} />
                  <div className="pct">{durabilityPct}%</div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3, Col 1: Bygge point (footprint) */}
          <div style={{ gridColumn: '1', gridRow: '3' }}>
            <div className="label">{t("ui.footprint.h1")}</div>
            <div className="value">
              {actionTarget?.footprint > 0 ? (
                <StatRequirement label={t("ui.labels.buildpoints", "Bygge point")} value={`${actionTarget.footprint} BP`} isOk={requirementState.footprintOk} />
              ) : '-'}
            </div>
          </div>

          {/* Row 3, Col 2: Byggetid */}
          <div style={{ gridColumn: '2', gridRow: '3' }}>
            <div className="label">{t("ui.time.h1")}</div>
            <div className="value" title={timeTitle}><Icon src="/assets/icons/symbol_time.png" size={18} alt={t("ui.time.h1", "Bygge point")} />
              {timeValue}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}