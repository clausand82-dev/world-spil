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
  const SHOW_YIELD_SOURCES = true;
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

    // 2) installed addons (try def.addons and instance state paths)
    const installedAddons = new Set();
    (def.addons || def.installedAddons || actionTarget?.addons || []).forEach(a => a && installedAddons.add(a));
    const tryPaths = [
      state.buildings?.[heroId]?.addons,
      state.units?.[heroId]?.addons,
      state.blds?.[heroId]?.addons,
      state[heroId]?.addons,
    ];
    tryPaths.forEach(p => Array.isArray(p) && p.forEach(a => a && installedAddons.add(a)));

    installedAddons.forEach((aid) => {
      const key = String(aid).replace(/^add\./, '');
      const adddef = defs?.add?.[key] || defs?.add?.[String(aid)] || null;
      if (!adddef) return;
      const ctx = `add.${key}`;
      processYieldDef(adddef, ctx, 1, 'add', key);
    });

    // 3) research that applies to this building OR completed research with global yields
    const completed = new Set();
    (state.research?.completed || state.completedResearch || state.completedRsd || state.rsdCompleted || []).forEach(r => r && completed.add(r));
    // include activeBuffs keys as potential research ids
    Object.keys(activeBuffs || {}).forEach(k => {
      const candidate = String(k).replace(/^rsd\.|^research\./, '');
      if (candidate) completed.add(candidate);
    });

    completed.forEach((rid) => {
      const key = String(rid).replace(/^rsd\.|^research\./, '');
      const rdef = defs?.rsd?.[key] || defs?.rsd?.[rid] || null;
      if (!rdef) return;
      // include yields if research directly yields resources
      processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);

      // include research yields only if research targets this building (common fields: for, targets, appliesTo)
      const maybeTargets = [].concat(rdef.for || rdef.targets || rdef.appliesTo || []);
      const heroKeys = new Set([String(heroId), baseKey, heroDef?.id, heroDef?.key].filter(Boolean));
      if (maybeTargets.some(t => heroKeys.has(String(t)))) {
        processYieldDef(rdef, `rsd.${key}`, 1, 'rsd', key);
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
                    {priceEntries.map((p) => (
                      <div key={p._idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 20, flex: '0 0 20px' }}>
                          {p.icon?.iconUrl
                            ? <Icon src={p.icon.iconUrl} size={20} alt={p.name} />
                            : <Icon def={{ emoji: p.icon?.emoji }} size={20} alt={p.name} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{p.name}</div>
                          <div style={{ fontSize: 11, }}>{Hhelpers.fmt(p.amount)}</div>
                        </div>
                      </div>
                    ))}
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
            <div className="value"><Icon src="/assets/icons/symbol_footprint.png" size={18} alt={t("ui.labels.buildpoints", "Bygge point")} />
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

export default BuildingHero;
