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

function BuildingHero({ heroDef, heroId, durabilityPct, jobActiveId, footprintText, animalCapText, actionTarget, requirementState }) {
  const { data } = useGameData();
  const defs = data?.defs || {};
  const t = useT(); // bruges til sprog
  // Toggle: vis kilde-opdeling for yields (true = vis breakdown pr. resource)
  const SHOW_YIELD_SOURCES = true; // HER TÆNDES OG SLUKKES FOR UDVIDES YIELDS INFORMATION
  const jobActive = !!jobActiveId;
  const hasBuffedTime = Number.isFinite(actionTarget?.duration) && Number.isFinite(actionTarget?.durationBase)
    ? Math.round(actionTarget.duration) !== Math.round(actionTarget.durationBase)
    : false;
  const timeValue = actionTarget?.duration != null ? prettyTime(actionTarget.duration) : '-';
  const timeTitle = hasBuffedTime ? `Normal: ${prettyTime(actionTarget.durationBase ?? 0)}` : undefined;
  
  const imgKey = String(heroId || '').replace(/^bld\./, '').replace(/\.l\d+$/i, '');

  const yieldsEntries = useMemo(() => {
    const def = heroDef || actionTarget;
    if (!def || !defs) return [];

    const state = data?.state || {};
    const activeBuffs = data?.activeBuffs || state.activeBuffs || {};
    // map rid -> { total: number, sources: { bld: number, addons: {k:amt}, rsd: {k:amt} } }
    const totals = {};

    const pushAmount = (resId, amount = 0, sourceType = 'misc', sourceId = null) => {
      if (!resId) return;
      const rid = String(resId).startsWith('res.') ? String(resId) : `res.${String(resId).replace(/^res\./, '')}`;
      const val = Number(amount || 0);
      const entry = totals[rid] || (totals[rid] = { total: 0, sources: { bld: 0, addons: {}, rsd: {} , misc: 0 } });
      entry.total += val;
      if (!SHOW_YIELD_SOURCES) return;
      if (sourceType === 'bld') entry.sources.bld += val;
      else if (sourceType === 'add') entry.sources.addons[sourceId || 'unknown'] = (entry.sources.addons[sourceId || 'unknown'] || 0) + val;
      else if (sourceType === 'rsd') entry.sources.rsd[sourceId || 'unknown'] = (entry.sources.rsd[sourceId || 'unknown'] || 0) + val;
      else entry.sources.misc += val;
    };

    // helper: process def that uses def.yield + def.yield_period_s (same logic as PassiveYieldList)
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
        // if we have a period, compute per-hour and apply yield buffs (then convert back to per-cycle)
        if (period_s > 0) {
          const basePerHour = baseAmt * (3600 / period_s);
          const ridForBuff = rawRes.startsWith('res.') ? rawRes : `res.${rawRes}`;
          const buffedPerHour = typeof applyYieldBuffsToAmount === 'function'
            ? applyYieldBuffsToAmount(basePerHour, ridForBuff, { appliesToCtx: ctxId, activeBuffs })
            : basePerHour;
          const buffedPerCycle = buffedPerHour * (period_s / 3600);
          pushAmount(ridForBuff, buffedPerCycle * qty, sourceType, sourceId);
        } else {
          // no period — treat as simple amount (apply generic yield buff if available)
          const ridForBuff = rawRes.startsWith('res.') ? rawRes : `res.${rawRes}`;
          const buffed = typeof applyYieldBuffsToAmount === 'function'
            ? applyYieldBuffsToAmount(baseAmt, ridForBuff, { appliesToCtx: ctxId, activeBuffs })
            : baseAmt;
          pushAmount(ridForBuff, buffed * qty, sourceType, sourceId);
        }
      }
    };

    // 1) building's own yields
    const baseKey = String(heroId || heroDef?.id || '').replace(/^bld\./, '').replace(/\.l\d+$/, '');
    const bldCtx = `bld.${baseKey}`;
    processYieldDef(def, bldCtx, 1, 'bld', baseKey);

    // --- New logic: find addons & research by family and count them only if owned in state ---
    const baseFamily = heroDef?.family || (heroDef && heroDef.family === undefined ? null : heroDef.family);

    // 2) installed addons: prefer explicit installed list, but also include any addon defs that share family and are owned in state
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
    // Add explicit sources (instance-level)
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
    // Also detect by family: include any addon defs whose def.family matches baseFamily and that are OWNED in state
    if (baseFamily) {
      const stateAddMap = state.add || state.adds || state.installedAddons || {};
      Object.keys(defs?.add || {}).forEach((addKey) => {
        const addDef = defs.add[addKey];
        if (!addDef) return;
        if (String(addDef.family) !== String(baseFamily)) return;
        // canonical addon id variants
        const variants = [
          addKey,
          `add.${addKey}`,
          `add.${String(addDef.id || '')}`.replace(/^add\./, '') ? addKey : addKey,
        ];
        // check several possible places in state for ownership
        let owned = false;
        // 1) positional/collection-based state where addons are stored keyed by id
        if (stateAddMap && (stateAddMap[`add.${addKey}`] || stateAddMap[addKey] || stateAddMap[`add.${addDef.id}`] || stateAddMap[String(addDef.id)])) {
          owned = true;
        }
        // 2) sometimes addon instances live under state.add or state.adds with full id keys
        if (!owned) {
          if (state.add && (state.add[`add.${addKey}`] || state.add[addKey] || state.add[`add.${addDef.id}`])) owned = true;
          if (state.adds && (state.adds[`add.${addKey}`] || state.adds[addKey])) owned = true;
        }
        // 3) check if this addon is listed as installed on the specific building in state.buildings/blds/etc.
        if (!owned) {
          for (const p of tryPaths) {
            if (Array.isArray(p) && p.some(x => String(gatherAddonId(x || '')).includes(addKey))) {
              owned = true;
              break;
            }
          }
        }
        if (owned) installedAddons.add(addKey);
      });
    }

    // Process installedAddons defs (only the ones we actually found/own)
    installedAddons.forEach((aid) => {
      const key = String(aid).replace(/^add\./, '');
      const adddef = defs?.add?.[key] || defs?.add?.[String(aid)] || null;
      if (!adddef) return;
      const ctx = `add.${key}`;
      processYieldDef(adddef, ctx, 1, 'add', key);
    });

    // 3) research that applies to this building OR completed research with global yields
    const completed = new Set();
    // collect from several possible state paths; some snapshots use state.research.completed, others use state.rsd
    (state.research?.completed || state.completedResearch || state.completedRsd || state.rsdCompleted || []).forEach(r => r && completed.add(String(r)));
    // include legacy list paths
    (state.rsd && Object.keys(state.rsd)).forEach(k => {
      if (!k) return;
      // keys may be like 'rsd.tools.13' or 'tools.13' — normalize to full id when possible
      const norm = String(k);
      completed.add(norm);
    });
    // include activeBuffs keys as potential research ids (already used in previous logic)
    Object.keys(activeBuffs || {}).forEach(k => {
      const candidate = String(k).replace(/^rsd\.|^research\./, '');
      if (candidate) completed.add(candidate);
    });

    // Additionally: include any research defs that share family and are present/owned in state.rsd (explicit family matching)
    const processedResearch = new Set();
    if (baseFamily) {
      Object.keys(defs?.rsd || {}).forEach((rsdKey) => {
        const rdef = defs.rsd[rsdKey];
        if (!rdef) return;
        if (String(rdef.family) !== String(baseFamily)) return;
        // determine if owned: state.rsd might contain entries keyed by 'rsd.<key>' or '<key>'
        const stateRsd = state.rsd || state.rsdCompleted || {};
        const owned = !!(stateRsd[`rsd.${rsdKey}`] || stateRsd[rsdKey] || stateRsd[String(rdef.id)] || state.rsd?.[String(rdef.id)]);
        if (owned) {
          // add to completed set using a normalized id
          completed.add(rsdKey);
        }
      });
    }

    // Now process unique completed research defs; ensure we don't double-process same def twice
    completed.forEach((rid) => {
      const key = String(rid).replace(/^rsd\.|^research\./, '');
      if (processedResearch.has(key)) return;
      const rdef = defs?.rsd?.[key] || defs?.rsd?.[rid] || null;
      if (!rdef) return;
      // Only include research yields if owned (we try to be permissive about state shapes)
      const stateRsd = state.rsd || state.research || {};
      const owned = !!(
        stateRsd[`rsd.${key}`] ||
        stateRsd[key] ||
        (state.research?.completed && state.research.completed.includes(rid)) ||
        (state.completedResearch && state.completedResearch.includes(rid))
      );
      // if activeBuffs includes it, consider it as applied (some research show via buffs)
      const buffKeyMatch = Object.keys(activeBuffs || {}).some(k => String(k).includes(key) || String(k).includes(rid));
      if (owned || buffKeyMatch) {
        processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
        processedResearch.add(key);
      } else {
        // Extra safety: if rdef.family matches baseFamily and completed set included it (from earlier family scan), include it
        if (String(rdef.family) === String(baseFamily) && completed.has(key)) {
          processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
          processedResearch.add(key);
        }
      }

      // Also: some research definitions explicitly target this building; if so, ensure yields are applied (but avoid duplicates)
      const maybeTargets = [].concat(rdef.for || rdef.targets || rdef.appliesTo || []);
      const heroKeys = new Set([String(heroId), baseKey, heroDef?.id, heroDef?.key].filter(Boolean));
      if (!processedResearch.has(key) && maybeTargets.some(t => heroKeys.has(String(t)))) {
        processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
        processedResearch.add(key);
      }
    });

    // convert totals to array with names/icons
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

  // collect active buffs samme måde som RequirementPanel
  const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);

  // --- priceEntries: normaliser opgraderings-/build-pris med buff anvendt
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
        // Samme kald som RequirementPanel for ens adfærd
        amount = applyCostBuffsToAmount(baseAmount, rid, { appliesToCtx: 'all', activeBuffs });
        if (typeof amount !== 'number' || Number.isNaN(amount)) amount = baseAmount;
      } catch (err) {
        amount = baseAmount;
      }

      return { id: rid, amount: Number(amount || 0), baseAmount, name, icon, _idx: idx };
    });
  }, [actionTarget, defs, activeBuffs]);

  // helper to find player's current amount for a resource (be permissive about paths)
  const getPlayerResAmount = (rid) => {
    const state = data?.state || {};
    const resKey = String(rid).replace(/^res\./, '');
    // prefer the game's canonical resource containers; from your screenshot many things live under state.inv and state.rsd (research state)
    // For resources we check common containers in order:
    const candidates = [
      state?.inv?.liquid, // sometimes resources stored under inv.liquid / inv.solid
      state?.inv?.solid
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (resKey in c) return Number(c[resKey] || 0);
      if (rid in c) return Number(c[rid] || 0);
    }
    // fallback: some snapshots use state.rsd for research-level values; this is not typical resource count but check anyway
    if (state?.rsd && (state.rsd[resKey] || state.rsd[rid])) {
      return Number(state.rsd[resKey] || state.rsd[rid] || 0);
    }
    return 0;
  };

// LAYOUT DELEN

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
                        {/* Small debug/source breakdown if enabled */}
                        {SHOW_YIELD_SOURCES && y.sources ? (
                          <div style={{ fontSize: 10, color: 'var(--subtext, #8b8b8b)', marginTop: 4 }}>
                            {y.sources.bld ? <div>Bygning: +{Hhelpers.fmt(y.sources.bld)}</div> : null}
                            {y.sources.misc ? <div>Andet: +{Hhelpers.fmt(y.sources.misc)}</div> : null}
                            {y.sources.addons && Object.keys(y.sources.addons).length ? (
                              <div>
                                Addons:
                                <div style={{ marginLeft: 8 }}>
                                  {Object.entries(y.sources.addons).map(([aid, amt]) => {
                                    const addName = defs?.add?.[String(aid)]?.name || String(aid);
                                    const addlvl = defs?.add?.[String(aid)]?.lvl ? ` (Lvl ${defs.add[String(aid)].lvl})` : '';
                                    return <div key={aid}>{addName}: +{Hhelpers.fmt(amt)}{addlvl}</div>;
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
  <div className="value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Icon src="/assets/icons/symbol_footprint.png" size={18} alt={t("ui.labels.buildpoints", "Bygge point")} />

    {typeof actionTarget?.footprint === 'number' && actionTarget?.footprint !== 0 ? (
      <StatRequirement
        label={t("ui.labels.buildpoints", "Bygge point")}
        value={`${actionTarget.footprint > 0 ? `+${actionTarget.footprint}` : `${actionTarget.footprint}`} BP`}
        isOk={requirementState?.footprintOk}
      />
    ) : (
      '-'
    )}

    {/* vis tilgængelig / total ved siden af */}
    {data?.cap?.footprint ? (() => {
      // importér normalizeFootprintState i toppen af filen:
      // import { normalizeFootprintState } from '../../services/helpers.js';
      const norm = normalizeFootprintState(data.cap.footprint || {});
      return (
        <div style={{ marginLeft: 8, fontSize: 12, opacity: 0.95 }}>
          {Hhelpers.fmt(norm.available)} / {Hhelpers.fmt(norm.total)} BP
        </div>
      );
    })() : null}
  </div>
</div>

          {/* Row 3, Col 2: Byggetid */}
          <div style={{ gridColumn: '2', gridRow: '3' }}>
            <div className="label">
              {t("ui.time.h1")+': '}
              <Icon src="/assets/icons/symbol_time.png" size={18} alt={t("ui.time.h1", "Byggetid")} />
              {timeValue}

            </div>
            <div className="value" title={timeTitle}>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuildingHero;