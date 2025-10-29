import React, { useMemo } from 'react';
import GameImage from '../GameImage.jsx';
import BuildProgress from '../BuildProgress.jsx';
import ResourceCost from '../requirements/ResourceCost.jsx';
import DemandList from '../requirements/DemandList.jsx';
import StatRequirement from '../requirements/StatRequirement.jsx';
import Icon from '../ui/Icon.jsx';
import HoverCard from '../ui/HoverCard.jsx';
import * as Hhelpers from '../../services/helpers.js';
import { useT } from "../../services/i18n.js";
import { useGameData } from '../../context/GameDataContext.jsx';
import { prettyTime } from '../../services/helpers.js';
import { collectActiveBuffs } from '../../services/requirements.js';
import { applyCostBuffsToAmount } from '../../services/calcEngine-lite.js';
import { applyYieldBuffsToAmount } from '../../services/yieldBuffs.js';

/*
  BuildingHero.jsx – include animals/units yields associated directly with building family

  Changes compared to previous:
  - Removed humanize fallback.
  - Added small resolveAddDef / resolveRsdDef helpers that try likely candidate keys
    and return the matching def if found. When rendering, we ONLY use def.name / def.displayName
    if present — otherwise we fall back to the raw id (same behaviour as earlier).
  - Ensures addon source ids are normalized to base keys when we push amounts.
*/

function normalizeBaseKey(s) {
  if (!s) return '';
  let k = String(s);
  k = k.replace(/^add\./i, '');
  k = k.replace(/^ani\./i, '');
  k = k.replace(/\.l\d+$/i, '');
  return k.trim();
}

function gatherAnimalEntriesFromState(stateAni = {}) {
  if (!stateAni) return [];
  const out = [];
  if (Array.isArray(stateAni)) {
    stateAni.forEach((it) => {
      if (!it) return;
      const key = String(it.id || it.key || it.def || '').replace(/^ani\./, '');
      const qty = Number(it.quantity ?? it.qty ?? it.count ?? it.amount ?? 0);
      if (key && qty) out.push({ key, qty });
    });
    return out;
  }
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

// Try to resolve an addon def by a few likely candidate keys (no humanize fallback)
function resolveAddDef(aid, defs) {
  if (!aid || !defs || !defs.add) return null;
  const raw = String(aid);
  // try exact key forms first
  if (defs.add[raw]) return defs.add[raw];
  const noPrefix = raw.replace(/^add\./i, '');
  if (defs.add[noPrefix]) return defs.add[noPrefix];
  const noLevel = noPrefix.replace(/\.l\d+$/i, '');
  if (defs.add[noLevel]) return defs.add[noLevel];

  // If none matched, try to find a defs.add key that starts with the base key + '.'
  // (handles defs keys like "well.11", "bigfireplace.12" when we only have "well" or "bigfireplace")
  const keys = Object.keys(defs.add);
  for (const k of keys) {
    if (!k) continue;
    const kNoPrefix = String(k).replace(/^add\./i, '').replace(/\.l\d+$/i, '');
    if (k === raw || k === noPrefix || kNoPrefix === noLevel) return defs.add[k];
    if (k.startsWith(noLevel + '.') || k.toLowerCase().startsWith(noLevel.toLowerCase() + '.')) return defs.add[k];
  }

  return null;
}

function resolveRsdDef(rid, defs) {
  if (!rid || !defs || !defs.rsd) return null;
  const raw = String(rid);
  if (defs.rsd[raw]) return defs.rsd[raw];
  const noPrefix = raw.replace(/^rsd\./i, '');
  if (defs.rsd[noPrefix]) return defs.rsd[noPrefix];
  const noLevel = noPrefix.replace(/\.l\d+$/i, '');
  if (defs.rsd[noLevel]) return defs.rsd[noLevel];

  // fallback: try keys that start with base
  const keys = Object.keys(defs.rsd);
  for (const k of keys) {
    if (!k) continue;
    const kNoPrefix = String(k).replace(/^rsd\./i, '').replace(/\.l\d+$/i, '');
    if (k === raw || k === noPrefix || kNoPrefix === noLevel) return defs.rsd[k];
    if (k.startsWith(noLevel + '.') || k.toLowerCase().startsWith(noLevel.toLowerCase() + '.')) return defs.rsd[k];
  }

  return null;
}

function resolveResDef(rid, defs) {
  if (!rid || !defs || !defs.res) return null;
  const key = String(rid).replace(/^res\./, '');
  if (defs.res[key]) return defs.res[key];
  return null;
}

export default function BuildingHero({ heroDef, heroId, durabilityPct, jobActiveId, footprintText, animalCapText, actionTarget, requirementState }) {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const t = useT();
  const SHOW_YIELD_SOURCES = true; // om hover kommer eller ej
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

    // installed addons detection
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

    // include owned addons by family
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

    // normalize and process installed addon defs (use base key as sourceId)
    const installedAddonBaseKeys = new Set();
    installedAddons.forEach(aid => {
      let s = String(aid || '');
      s = s.replace(/^add\./i, '');
      s = s.replace(/\.l\d+$/i, '');
      installedAddonBaseKeys.add(s);
    });
    installedAddons.forEach((aid) => {
      const key = String(aid).replace(/^add\./i, '').replace(/\.l\d+$/i, '');
      const adddef = defs?.add?.[key] || defs?.add?.[String(aid).replace(/^add\./i, '')] || null;
      if (!adddef) return;
      const ctx = `add.${key}`;
      processYieldDef(adddef, ctx, 1, 'add', key); // pass base key as sourceId
    });

    // research yields
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

    // ANIMALS: match by animal.family === building family
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
      // ignore
    }

    // convert totals -> array; resolve resource names from defs when possible (no humanize)
    const out = Object.keys(totals).map((rid, idx) => {
      const resKey = String(rid).replace(/^res\./, '');
      const resDef = resolveResDef(rid, defs) || defs?.res?.[resKey];
      const name = resDef?.name || resDef?.displayName || resKey;
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
      const resDef = resolveResDef(rid, defs) || defs?.res?.[resKey];
      const name = resDef?.name || resDef?.displayName || resKey;
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
                  {yieldsEntries.map((y) => {
                    // build hover card content as JSX
                    const hoverContent = (
                      <div style={{ minWidth: 240, maxWidth: 480, padding: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>Denne resource kommer fra:</span>
                        {y.sources?.bld ? <div>Bygning: +{Hhelpers.fmt(y.sources.bld)}</div> : null}
                        {y.sources?.animals ? <div>Dyr: +{Hhelpers.fmt(y.sources.animals)}</div> : null}
                        {y.sources?.misc ? <div>Andet: +{Hhelpers.fmt(y.sources.misc)}</div> : null}
                        {y.sources?.addons && Object.keys(y.sources.addons || {}).length ? (
                          <div style={{ marginTop: 6 }}>
                            <strong>Addons:</strong>
                            <div style={{ marginLeft: 8 }}>
                              {Object.entries(y.sources.addons).map(([aid, amt]) => {
                                const addDef = resolveAddDef(aid, defs);
                                const addName = addDef?.name || String(aid);
                                const addLvl = addDef?.lvl ?? addDef?.level ?? null;
                                return <div key={aid}>{addName}{addLvl ? ` (Lvl ${addLvl})` : ''}: +{Hhelpers.fmt(amt)}</div>;
                              })}
                            </div>
                          </div>
                        ) : null}
                        {y.sources?.rsd && Object.keys(y.sources.rsd || {}).length ? (
                          <div style={{ marginTop: 6 }}>
                            <strong>Research:</strong>
                            <div style={{ marginLeft: 8 }}>
                              {Object.entries(y.sources.rsd).map(([rid, amt]) => {
                                const rDef = resolveRsdDef(rid, defs);
                                const rname = rDef?.name || String(rid);
                                return <div key={rid}>{rname}: +{Hhelpers.fmt(amt)}</div>;
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );

                    return (
                      <HoverCard key={y._idx} content={hoverContent}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <div style={{ width: 20, flex: '0 0 20px' }}>
                            {y.icon?.iconUrl
                              ? <Icon src={y.icon.iconUrl} size={20} alt={y.name} />
                              : <Icon def={{ emoji: y.icon?.emoji }} size={20} alt={y.name} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{y.name}</div>
                            <div style={{ fontSize: 11 }}>{Hhelpers.fmt(y.amount)}</div>
                          </div>
                        </div>
                      </HoverCard>
                    );
                  })}
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