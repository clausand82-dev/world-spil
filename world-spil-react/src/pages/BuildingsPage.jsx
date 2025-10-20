import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import GameImage from '../components/GameImage.jsx';
import ActionButton from '../components/ActionButton.jsx';
import BuildProgress from '../components/BuildProgress.jsx';
import LevelStatus from '../components/requirements/LevelStatus.jsx';
import { useRequirements as useReqAgg } from '../components/requirements/Requirements.jsx';
import DockHoverCard from '../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../components/ui/StatsEffectsTooltip.jsx';

/*function _page_canAfford(price, state) {
    for (const item of Object.values(H.normalizePrice(price))) {
        let have = 0;
        if (item.id.startsWith('ani.')) have = state.ani?.[item.id]?.quantity ?? 0;
        else { const key = item.id.replace(/^res\./, ''); have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0; }
        if (have < item.amount) return { ok: false };
    }
    return { ok: true };
}*/
function hasResearchInState(state, rsdIdFull) {
    if (!rsdIdFull) return false;
    const key = String(rsdIdFull).replace(/^rsd\./, '');
    return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[rsdIdFull]);
}
/*function _page_isReqSatisfied(reqId, state) {
    if (reqId.startsWith('bld.')) { const p = H.parseBldKey(reqId); return p ? (computeOwnedMaxBySeriesFromState(state, 'bld')[p.series] || 0) >= p.level : false; }
    if (reqId.startsWith('rsd.')) return hasResearchInState(state, reqId);
    if (reqId.startsWith('add.')) { const m = reqId.match(/^add\.(.+)\.l(\d+)$/); return m ? (computeOwnedMaxBySeriesFromState(state, 'add')[`add.${m[1]}`] || 0) >= Number(m[2]) : false; }
    return false;
}*/

// Compute owned max per series from provided state (not window)
function computeOwnedMaxBySeriesFromState(state, stateKey = 'bld') {
    const bySeries = {};
    const source = state?.[stateKey] || {};
    for (const key of Object.keys(source)) {
        const m = key.match(new RegExp(`^${stateKey}\\.(.+)\\.l(\\\d+)$`));
        if (!m) continue;
        const series = `${stateKey}.${m[1]}`;
        const level = Number(m[2]);
        bySeries[series] = Math.max(bySeries[series] || 0, level);
    }
    return bySeries;
}



function BuildingRow({ bld, state, defs }) {
    // bld is the row object we constructed in BuildingsPage. We prefer to use bld.def (real definition)
    const def = bld?.def || (defs?.bld ? (defs.bld[(bld.id || '').replace(/^bld\./, '')] || null) : null);

    const { allOk, Component: ReqLine } = useReqAgg(bld);

    // translations for tooltip labels, if available
    const { data } = useGameData();
    const translations = data?.i18n?.current ?? {};

    // Build normalized price list (if any) and render each resource on its own line with emoji + label
    const normalizedPrice = H.normalizePrice(def?.cost || def?.price || bld.price || {});
    const priceItems = Object.values(normalizedPrice);

    // ---------- Buffs / modifiers handling (generic, defensive) ----------
    // Looks for possible modifiers in state: state.buffs, state.effects or state.modifiers
    const getActiveModifiers = () => {
      const list = [];
      if (!state) return list;
      if (Array.isArray(state.effects)) list.push(...state.effects);
      if (Array.isArray(state.buffs)) list.push(...state.buffs);
      // also accept object keyed variants
      if (state.modifiers && typeof state.modifiers === 'object') {
        for (const k of Object.keys(state.modifiers)) {
          const v = state.modifiers[k];
          if (typeof v === 'number') list.push({ type: k, value: v });
          else if (v && typeof v === 'object') list.push({ ...v, type: k });
        }
      }
      // merge any explicit arrays at top-level
      if (Array.isArray(state.buffsList)) list.push(...state.buffsList);
      return list;
    };

    // Calculate multiplier for given resource id (cost). Modifiers may be:
    // - { type: 'costMult', target: 'res.money'|'all', mult: 0.9 }  (mult applied)
    // - { type: 'discount', resource: 'res.money', pct: 10 }  (pct percent)
    const getResourceCostMultiplier = (resId) => {
      let mult = 1;
      const mods = getActiveModifiers();
      for (const m of mods) {
        try {
          if (m.type === 'costMult' && (m.target === 'all' || m.target === resId)) {
            mult *= Number(m.mult ?? m.value ?? 1);
          } else if ((m.type === 'discount' || m.type === 'cost_discount') && (m.resource === resId || m.resource === 'all')) {
            const pct = Number(m.pct ?? m.value ?? 0);
            mult *= (1 - pct / 100);
          } else if (m.type === 'globalCostMult' && (m.target === undefined || m.target === 'all')) {
            mult *= Number(m.mult ?? m.value ?? 1);
          }
        } catch (e) { /* ignore malformed modifier */ }
      }
      return Math.max(0, mult);
    };

    // Calculate overall time multiplier (applies to build/upgrade time)
    // Supports modifiers: { type: 'timeMult', target: 'build'|'all', mult: 0.8 } or { type:'buildTimePct', pct:10 }
    const getTimeMultiplier = () => {
      let mult = 1;
      const mods = getActiveModifiers();
      for (const m of mods) {
        try {
          if ((m.type === 'timeMult' || m.type === 'buildTimeMult') && (m.target === 'all' || m.target === 'build' || m.target === undefined)) {
            mult *= Number(m.mult ?? m.value ?? 1);
          } else if ((m.type === 'timeDiscount' || m.type === 'buildTimePct') && (m.target === 'all' || m.target === 'build')) {
            const pct = Number(m.pct ?? m.value ?? 0);
            mult *= (1 - pct / 100);
          } else if (m.type === 'globalTimeMult') {
            mult *= Number(m.mult ?? m.value ?? 1);
          }
        } catch (e) { /* ignore malformed modifier */ }
      }
      return Math.max(0.01, mult);
    };

    // Create adjusted price items (amount after cost buffs). Use Math.ceil to keep integer quantities.
    const priceItemsAdjusted = priceItems.map(p => {
      const mult = getResourceCostMultiplier(p.id);
      const adjusted = Math.max(0, Math.ceil(Number(p.amount || 0) * mult));
      return { ...p, adjustedAmount: adjusted, costMult: mult };
    });

    // Prefer translations -> defs; no hardcoded fallback list
    const findDefResource = (id) => {
      if (!defs) return null;
      const clean = id.replace(/^res\.|^ani\./, '');
      return defs.resources?.[id] || defs.resources?.[clean] || defs.res?.[clean] || defs.res?.[id] || null;
    };

    const emojiFor = (id) => {
      if (!id) return '';
      const tEmoji = translations?.resources?.[id]?.emoji;
      if (tEmoji) return tEmoji;
      const defRes = findDefResource(id);
      if (defRes?.emoji) return defRes.emoji;
      if (id.startsWith('ani.')) return '🐾';
      return ''; // intentionally no fallback emoji
    };

    const labelFor = (id) => {
      if (!id) return id;
      const tLabel = translations?.resources?.[id]?.label;
      if (tLabel) return tLabel;
      const defRes = findDefResource(id);
      if (defRes?.name) return defRes.name;
      return id.replace(/^res\.|^ani\./, '');
    };

    // helper: check if player has enough of a resource in state (respect adjustedAmount if present)
    const hasEnoughResource = (item) => {
      if (!item || !item.id) return false;
      const required = Number(item.adjustedAmount ?? item.amount ?? 0);
      if (item.id.startsWith('ani.')) {
        return (state?.ani?.[item.id]?.quantity ?? 0) >= required;
      }
      const key = item.id.replace(/^res\./, '');
      const solid = state?.inv?.solid?.[key] ?? 0;
      const liquid = state?.inv?.liquid?.[key] ?? 0;
      return (solid + liquid) >= required;
    };

    // split into two columns for display (resources) - use adjusted list
    const leftItems = priceItemsAdjusted.filter((_, i) => i % 2 === 0);
    const rightItems = priceItemsAdjusted.filter((_, i) => i % 2 === 1);

    const renderPriceRow = (p, i) => {
      const ok = hasEnoughResource(p);
      // show original amount and adjusted if different (e.g. "8 -> 7")
      const displayAmount = (p.adjustedAmount !== undefined && Number(p.adjustedAmount) !== Number(p.amount))
        ? `${p.amount} → ${p.adjustedAmount}`
        : `${p.adjustedAmount ?? p.amount}`;
      return (
        <div key={i} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 20 }}>{emojiFor(p.id)}</span>
          <span style={{ minWidth: 64, fontWeight: 600, color: ok ? 'green' : 'crimson' }}>{displayAmount}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{labelFor(p.id)}</span>
        </div>
      );
    };

    const priceList = priceItems.length ? (
      <div style={{ marginBottom: 8 }}>
        <strong>Koster:</strong>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>{leftItems.map(renderPriceRow)}</div>
          <div>{rightItems.map(renderPriceRow)}</div>
        </div>
      </div>
    ) : null;

    // Requirements (buildings/addons/research) + footprint + build time
    const rawReq = (def?.require || def?.req || bld.req || '') + '';
    const reqItems = rawReq ? rawReq.split(/\s*,\s*/).filter(Boolean) : [];

    // helpers for checking ownership / research in provided state
    const ownedBldBySeries = computeOwnedMaxBySeriesFromState(state, 'bld');
    const ownedAddBySeries = computeOwnedMaxBySeriesFromState(state, 'add');

    const isReqSatisfied = (reqId) => {
      if (!reqId) return false;
      // building requirement e.g. bld.basecamp.l3
      let m = String(reqId).match(/^bld\.(.+)\.l(\d+)$/);
      if (m) {
        const series = `bld.${m[1]}`;
        const level = Number(m[2]);
        return (ownedBldBySeries[series] || 0) >= level;
      }
      // addon requirement e.g. add.barn.l2
      m = String(reqId).match(/^add\.(.+)\.l(\d+)$/);
      if (m) {
        const series = `add.${m[1]}`;
        const level = Number(m[2]);
        return (ownedAddBySeries[series] || 0) >= level;
      }
      // research requirement e.g. rsd.seed.l1
      if (String(reqId).startsWith('rsd.')) {
        return hasResearchInState(state, reqId);
      }
      // fallback: not satisfied
      return false;
    };

    const resolveReqLabel = (reqId) => {
      if (!reqId) return reqId;
      if (reqId.startsWith('bld.')) {
        const key = reqId.replace(/^bld\./, '');
        return defs?.bld?.[key]?.name || key;
      }
      if (reqId.startsWith('add.')) {
        const key = reqId.replace(/^add\./, '');
        return defs?.add?.[key]?.name || key;
      }
      if (reqId.startsWith('rsd.')) {
        const key = reqId.replace(/^rsd\./, '');
        return defs?.rsd?.[key]?.name || key;
      }
      return reqId;
    };
    const reqIcon = (id) => id.startsWith('bld.') ? '🏠' : id.startsWith('add.') ? '🧩' : id.startsWith('rsd.') ? '🔬' : '❓';

    // split requirements into two columns (same sizing as resources)
    const leftReqs = reqItems.filter((_, i) => i % 2 === 0);
    const rightReqs = reqItems.filter((_, i) => i % 2 === 1);

    const renderReqRow = (r, i) => {
      const ok = isReqSatisfied(r);
      return (
        <div key={i} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 20 }}>{reqIcon(r)}</span>
          <span style={{ color: ok ? 'green' : 'crimson', fontWeight: 600 }}>{resolveReqLabel(r)}</span>
        </div>
      );
    };

    const requirementsList = reqItems.length ? (
      <div style={{ marginBottom: 8 }}>
        <strong>Krav:</strong>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>{leftReqs.map(renderReqRow)}</div>
          <div>{rightReqs.map(renderReqRow)}</div>
        </div>
      </div>
    ) : null;

    // footprint value and build/upgrade time (side-by-side)
    const footprintVal = def?.stats?.footprint ?? def?.stats?.footprintDelta ?? def?.footprint ?? 0;
    const footprintNode = (typeof footprintVal === 'number' && footprintVal !== 0) ? (
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        <strong>Footprint:</strong> {footprintVal > 0 ? `+${footprintVal}` : footprintVal}
      </div>
    ) : null;

    // compute build time (seconds) and pretty format; label depends on new build vs upgrade
    const buildSeconds = Number(def?.duration_s ?? def?.time_s ?? bld.duration_s ?? 0);
    const timeMult = getTimeMultiplier();
    const buildSecondsAdjusted = Math.max(0, Math.round(buildSeconds * timeMult));
     const fmtBuildTime = (() => {
      const s = buildSecondsAdjusted;
      if (!s) return null;
      if (s >= 3600) return `${Math.round(s/3600)}h`;
      if (s >= 60) return `${Math.round(s/60)}m`;
      return `${s}s`;
    })();

    const isNewBuild = (!bld.isUpgrade && Number(bld.level) === 1);
    const buildLabel = isNewBuild ? 'Byggetid' : 'Opgraderingstid';

    const buildTimeNode = fmtBuildTime ? (
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
        <strong>{buildLabel}:</strong> {fmtBuildTime}
      </div>
    ) : null;

    // Hover content: price list, then two-column (footprint | build time), requirements, stats tooltip
    const hoverContent = (
      <div style={{ maxWidth: 480 }}>
        {priceList}
        {/* footprint + build time row (columns same size as resources/requirements) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div>{footprintNode}</div>
          <div>{buildTimeNode}</div>
        </div>
        {requirementsList}
        <StatsEffectsTooltip def={def || bld} translations={translations} />
      </div>
    );

    const row = (
        <div className="item" data-bld-id={bld.id}>
            <div className="icon">
                <GameImage src={`/assets/art/${bld.id}.medium.png`} fallback="/assets/art/placeholder.medium.png" className="bld-thumb" width={50} height={50} style={{ width: 50, height: 50, borderRadius: '6px', border: '1px solid var(--border)' }} />
           
            </div>
            <div>
                <div className="title"><a href={`#/building/${bld.displayLinkId}`} className="link">{bld.displayName}</a></div>
                {bld.displayDesc ? <div className="sub">🛈 {bld.displayDesc}</div> : null}
                <div className="sub" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <LevelStatus isOwned={bld.owned} isUpgrade={bld.isUpgrade} ownedMax={bld.ownedMax} stageLocked={bld.stageLocked} stageReq={bld.stageReq} />
                    <span> • </span>
                    <ReqLine showLabels={true} inline={true} />
                </div>
            </div>
            <div className="right">
                <ActionButton item={bld} allOk={allOk} />
                <BuildProgress bldId={bld.id} />
            </div>
        </div>
    );

  // Wrapper: HoverCard skal fylde hele rækken, så vi sætter style display:block,width:100%
  return (
    <DockHoverCard  content={hoverContent} style={{ display: 'block', width: '100%' }}>
      {row}
    </DockHoverCard >
  );

}

export default function BuildingsPage() {
    const { data, isLoading, error } = useGameData();
    if (isLoading) return <div className="sub">Indlæser...</div>;
    if (error) return <div className="sub">Fejl.</div>;
    const { defs, state } = data;
    const currentStage = Number(state.user?.currentstage || state.user?.stage || 0);
    const ownedMaxBySeries = computeOwnedMaxBySeriesFromState(state, 'bld');
    const groups = H.groupDefsBySeriesInStage(defs.bld, currentStage, 'bld');

    const bldList = [];
    for (const [series, items] of Object.entries(groups)) {
        const ownedMax = ownedMaxBySeries[series] || 0;
        const target = H.pickNextTargetInSeries(items, ownedMax);
        const family = series.replace(/^bld\./, '');

        const ownedDef = ownedMax > 0
            ? (defs.bld[`${family}.l${ownedMax}`] || items.find(x => x.level === ownedMax)?.def)
            : null;
        const l1Def = defs.bld[`${family}.l1`];

        const displayName = (ownedDef?.name) || (l1Def?.name) || (target?.def?.name) || family;
        const displayDesc = (ownedDef?.desc) || (l1Def?.desc) || '';
        const displayLinkId = ownedMax > 0 ? `bld.${family}.l${ownedMax}` : `bld.${family}.l1`;

        const nextDefKey = `${family}.l${(ownedMax || 0) + 1}`;
        const nextDefAll = defs.bld[nextDefKey];
        const nextReqStage = Number(nextDefAll?.stage ?? nextDefAll?.stage_required ?? 0);

        let displayLevelText = '';
        let stageLocked = false;
        if (ownedMax <= 0) {
            displayLevelText = 'Ikke bygget';
        } else if (!nextDefAll) {
            displayLevelText = `Level ${ownedMax} (maks)`;
        } else {
            if (!nextReqStage || nextReqStage <= currentStage) {
                displayLevelText = `Level ${ownedMax} → Level ${ownedMax + 1}`;
            } else {
                stageLocked = true;
                displayLevelText = `Level ${ownedMax} (stage låst)`;
            }
        }

        if (!target) {
            const top = items[items.length - 1];
            bldList.push({
                id: `bld.${top.key}`,
                name: target?.def?.name || top?.def?.name || family,
                level: Math.max(ownedMax, top.level),
                owned: true,
                isUpgrade: false,
                price: {},
                req: top.def?.require || '',
                duration_s: Number(top.def?.duration_s ?? 0),
                displayName,
                displayDesc,
                displayLinkId,
                displayLevelText,
                stageLocked,
                stageReq: nextReqStage || 0,
                desc: top.def?.desc || '',
                yield: top.def?.yield || [],
                durability: top.def?.durability || 0,
                footprintDelta: top.def?.stats?.footprint || 0,
                animalCapDelta: top.def?.stats?.animalCap || 0,
                ownedMax,
                def: top.def || null, // <= include original def here
            });
            continue;
        }

        const fullId = `bld.${target.key}`;
        const price = H.normalizePrice(target.def?.cost || target.def?.price || {});
        const stageOk = !nextReqStage || nextReqStage <= currentStage;

        bldList.push({
            id: fullId,
            name: target.def?.name || target.key,
            level: target.level,
            owned: false,
            isUpgrade: ownedMax > 0,
            price,
            req: target.def?.require || target.def?.req || '',
            duration_s: Number(target.def?.duration_s ?? 10),
            displayName,
            displayDesc,
            displayLinkId,
            displayLevelText,
            stageLocked: !stageOk && !!nextReqStage,
            stageReq: nextReqStage || 0,
            desc: target.def?.desc || '',
            yield: target.def?.yield || [],
            durability: target.def?.durability || 0,
            footprintDelta: target.def?.stats?.footprint || 0,
            animalCapDelta: target.def?.stats?.animalCap || 0,
            ownedMax,
            def: target.def || null, // <= include original def here
        });
    }

    return (
        <section className="panel section">
            <div className="section-head">🧱 Buildings</div>
            <div className="section-body">
                {bldList.map((bld) => (
                    <BuildingRow key={bld.id} bld={bld} state={state} defs={defs} />
                ))}
            </div>
        </section>
    );
}