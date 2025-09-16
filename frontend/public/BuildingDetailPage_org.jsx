import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import GameImage from '../components/GameImage.jsx';
import ActionButton from '../components/ActionButton.jsx';
import BuildProgress from '../components/BuildProgress.jsx';
import ResourceCost from '../components/requirements/ResourceCost.jsx';
import DemandList from '../components/requirements/DemandList.jsx';
import StatRequirement from '../components/requirements/StatRequirement.jsx';
import { parseBldKey, normalizePrice, prettyTime } from '../services/helpers.js';

const DETAIL_TABS = ['addons', 'research', 'recipes', 'special'];

function canonicalizeBuildingId(param) {
  if (!param) return null;
  return param.startsWith('bld.') ? param : `bld.${param}`;
}

function computeOwnedMap(stateSection = {}) {
  const result = {};
  for (const key of Object.keys(stateSection || {})) {
    const match = key.match(/^(\w+)\.(.+)\.l(\d+)$/);
    if (!match) continue;
    const [, prefix, family, level] = match;
    const series = `${prefix}.${family}`;
    result[series] = Math.max(result[series] || 0, Number(level));
  }
  return result;
}

function computeResearchOwned(state) {
  const owned = {};
  const legacy = state?.rsd || {};
  for (const key of Object.keys(legacy)) {
    const match = key.match(/^rsd\.(.+)\.l(\d+)$/);
    if (!match) continue;
    const [, family, level] = match;
    const series = `rsd.${family}`;
    owned[series] = Math.max(owned[series] || 0, Number(level));
  }
  const modernCompleted = state?.research?.completed;
  if (modernCompleted) {
    const items = modernCompleted instanceof Set ? Array.from(modernCompleted) : Object.keys(modernCompleted);
    for (const entry of items) {
      const match = String(entry).match(/^rsd\.(.+)\.l(\d+)$/);
      if (!match) continue;
      const [, family, level] = match;
      const series = `rsd.${family}`;
      owned[series] = Math.max(owned[series] || 0, Number(level));
    }
  }
  return owned;
}

function normalizeReq(entry) {
  if (!entry) return { array: [], text: '' };
  if (Array.isArray(entry)) {
    const arr = entry.map((x) => String(x)).filter(Boolean);
    return { array: arr, text: arr.join(', ') };
  }
  const arr = String(entry)
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return { array: arr, text: arr.join(', ') };
}

function requirementInfo(item, state, caches = {}) {
  if (!item) {
    return {
      normalizedPrice: {},
      priceOk: false,
      reqIds: [],
      reqString: '',
      footprintCost: 0,
      footprintOk: true,
      allOk: false,
    };
  }

  const normalizedPrice = normalizePrice(item.price || {});
  let priceOk = true;
  for (const costItem of Object.values(normalizedPrice)) {
    let have = 0;
    if (costItem.id.startsWith('ani.')) {
      have = state.ani?.[costItem.id]?.quantity ?? 0;
    } else {
      const key = costItem.id.replace(/^res\./, '');
      have = state.inv?.solid?.[key] ?? state.inv?.liquid?.[key] ?? 0;
    }
    if (have < costItem.amount) {
      priceOk = false;
      break;
    }
  }

  const { array: reqIds, text: reqString } = normalizeReq(item.req);
  const ownedBuildings = caches.ownedBuildings || computeOwnedMap(state.bld);
  const ownedAddons = caches.ownedAddons || computeOwnedMap(state.add);

  const hasResearch = caches.hasResearch || ((rid) => {
    const key = String(rid).replace(/^rsd\./, '');
    return !!(state?.research?.[key] || state?.rsd?.[key] || state?.rsd?.[rid]);
  });

  let reqOk = true;
  for (const reqId of reqIds) {
    let satisfied = false;
    if (reqId.startsWith('bld.')) {
      const parsed = parseBldKey(reqId);
      if (parsed) satisfied = (ownedBuildings[parsed.series] || 0) >= parsed.level;
    } else if (reqId.startsWith('add.')) {
      const match = reqId.match(/^add\.(.+)\.l(\d+)$/);
      if (match) satisfied = (ownedAddons[`add.${match[1]}`] || 0) >= Number(match[2]);
    } else if (reqId.startsWith('rsd.')) {
      satisfied = hasResearch(reqId);
    }
    if (!satisfied) {
      reqOk = false;
      break;
    }
  }

  const footprintCost = Math.abs(item.footprintDelta || 0);
  let footprintOk = true;
  if (footprintCost > 0) {
    const cap = state.cap?.footprint || { total: 0, used: 0 };
    const available = (cap.total || 0) - Math.abs(cap.used || 0);
    footprintOk = available >= footprintCost;
  }

  const allOk = priceOk && reqOk && footprintOk;
  return { normalizedPrice, reqIds, reqString, footprintCost, footprintOk, allOk };
}

function getEmojiForId(id, defs) {
  if (!id) return '';
  if (id.startsWith('res.')) {
    const key = id.replace(/^res\./, '');
    return defs.res?.[key]?.emoji || '';
  }
  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    return defs.ani?.[key]?.emoji || '';
  }
  return '';
}

function formatProduction(def, defs) {
  const list = def?.yield;
  if (!Array.isArray(list) || list.length === 0) return '-';
  const parts = list.map((entry) => {
    const id = String(entry.id ?? entry.res_id ?? '');
    const amount = Number(entry.amount ?? entry.qty ?? 0);
    const sign = amount > 0 ? '+' : '';
    const emoji = getEmojiForId(id, defs);
    return `${sign}${amount}${emoji}`;
  });
  const period = def?.yield_period_str;
  return period ? `${parts.join(' � ')} / ${period}` : parts.join(' � ');
}

function RequirementSummary({ price, reqString, duration, footprint, footprintOk }) {
  const nodes = [];
  if (price && Object.keys(price).length) {
    nodes.push(<ResourceCost key="price" cost={price} />);
  }
  if (reqString) {
    nodes.push(<DemandList key="req" req={reqString} />);
  }
  if (footprint > 0) {
    nodes.push(<StatRequirement key="fp" icon="?" label="" value={`${footprint} BP`} isOk={footprintOk} />);
  }
  if (duration != null) {
    nodes.push(<StatRequirement key="time" icon="?" label="" value={prettyTime(duration)} isOk />);
  }
  if (!nodes.length) return <div className="sub" style={{ marginTop: 4 }}>-</div>;
  const interleaved = nodes.flatMap((node, idx) => (idx === 0 ? [node] : [<span key={`sep-${idx}`}>�</span>, node]));
  return (
    <div className="sub" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
      {interleaved}
    </div>
  );
}

function BuildingHero({ heroDef, heroId, productionText, durabilityPct, jobActiveId, footprintText, animalCapText, actionTarget, requirementState }) {
  const jobActive = !!jobActiveId;
  return (
    <div className="detail-hero">
      <div className="photo">
        <GameImage
          src={`/assets/art/${heroId}.big.png`}
          fallback="/assets/art/placeholder.big.png"
          alt={heroDef?.name || heroId}
          width={256}
          height={256}
        />
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
          {heroDef?.icon || ''} {heroDef?.name || heroId}
          {heroDef?.lvl ? <span className="sub" style={{ marginLeft: 8 }}>Level {heroDef.lvl}</span> : null}
        </div>
        {heroDef?.desc ? <div className="sub" style={{ marginBottom: 10 }}>{heroDef.desc}</div> : null}
        <div className="statgrid">
          <div className="statitem">
            <div className="label">Production</div>
            <div className="value">{productionText}</div>
          </div>
          <div className="statitem">
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
          <div className="statitem">
            <div className="label">Capacity</div>
            <div className="value">{footprintText} � {animalCapText}</div>
          </div>
          <div className="statitem">
            <div className="label">Build cost</div>
            <div className="value">{actionTarget ? (Object.keys(actionTarget.price || {}).length ? <ResourceCost cost={actionTarget.price} /> : '-') : '-'}</div>
          </div>
          <div className="statitem">
            <div className="label">Demands</div>
            <div className="value">{actionTarget?.reqString ? <DemandList req={actionTarget.reqString} /> : '-'}</div>
          </div>
          <div className="statitem">
            <div className="label">Time</div>
            <div className="value">{actionTarget?.duration != null ? prettyTime(actionTarget.duration) : '-'}</div>
          </div>
          {actionTarget?.footprint > 0 ? (
            <div className="statitem">
              <div className="label">Byggepoint</div>
              <div className="value">
                <StatRequirement icon="?" label="" value={`${actionTarget.footprint} BP`} isOk={requirementState.footprintOk} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BuildingActions({ actionItem, canStart, jobActiveId }) {
  const progressTarget = jobActiveId || actionItem?.id;
  return (
    <div className="actions-bar">
      {actionItem ? (
        <>
          <ActionButton item={actionItem} allOk={canStart} />
          {progressTarget ? <BuildProgress bldId={progressTarget} /> : null}
        </>
      ) : (
        <span className="badge owned">Owned</span>
      )}
      <button className="btn" disabled>Repair</button>
      <button className="btn" disabled>Demolish</button>
    </div>
  );
}

function AddonRow({ entry, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk, ownedLevel, displayLevel } = entry;
  const requirement = requirementInfo(
    {
      price: def.cost || {},
      req: def.require || def.req || '',
      duration_s: Number(def.duration_s ?? 0),
      footprintDelta: Number(def.stats?.footprint ?? 0),
    },
    state,
    requirementCaches,
  );
  const actionItem = {
    id: fullId,
    price: def.cost || {},
    req: def.require || def.req || '',
    duration_s: Number(def.duration_s ?? 0),
    footprintDelta: Number(def.stats?.footprint ?? 0),
    isUpgrade: ownedLevel > 0,
    isOwned: ownedLevel >= displayLevel,
    owned: ownedLevel >= displayLevel,
    ownedMax: ownedLevel,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  return (
    <div className="item" data-addon-row={fullId}>
      <div className="icon">{def.icon || '??'}</div>
      <div className="grow">
        <div className="title">
          {def.name || fullId}
          {!stageOk && (
            <span className="badge stage-locked price-bad" title={`Kr�ver Stage ${stageReq}`} style={{ marginLeft: 8 }}>
              Stage locked
            </span>
          )}
        </div>
        {def.desc ? <div className="sub">?? {def.desc}</div> : null}
        <RequirementSummary
          price={def.cost || {}}
          reqString={requirement.reqString}
          duration={def.duration_s}
          footprint={Number(def.stats?.footprint ?? 0)}
          footprintOk={requirement.footprintOk}
        />
      </div>
      <div className="right">
        {!baseOwned ? (
          <button className="btn" disabled>Kr�ver bygning</button>
        ) : (
          <>
            <ActionButton item={actionItem} allOk={requirement.allOk && stageOk} />
            <BuildProgress bldId={fullId} />
          </>
        )}
      </div>
    </div>
  );
}

function AddonsTab({ family, defs, state, stage, baseOwned, requirementCaches, filter, onFilterChange }) {
  const addonDefs = defs.add || {};
  const ownedAddons = requirementCaches.ownedAddons || {};

  const entries = useMemo(() => {
    const grouped = new Map();
    for (const [key, def] of Object.entries(addonDefs)) {
      const fam = String(def?.family || '');
      if (!fam) continue;
      const families = fam.split(',').map((x) => x.trim());
      if (!families.includes(family)) continue;
      const match = key.match(/^(.+)\.l(\d+)$/);
      if (!match) continue;
      const base = match[1];
      const level = Number(match[2]);
      const seriesKey = `add.${base}`;
      if (!grouped.has(seriesKey)) grouped.set(seriesKey, []);
      grouped.get(seriesKey).push({ key, def, level });
    }

    const result = [];
    for (const [seriesKey, items] of grouped.entries()) {
      items.sort((a, b) => a.level - b.level);
      const ownedLevel = ownedAddons[seriesKey] || 0;
      const next = items.find((item) => item.level === ownedLevel + 1) || null;
      let display = null;
      if (ownedLevel <= 0) {
        display = items.find((item) => item.level === 1) || items[0];
      } else if (next) {
        display = next;
      } else {
        display = items[Math.min(items.length - 1, Math.max(0, ownedLevel - 1))] || items[items.length - 1];
      }
      if (!display) continue;
      const stageSource = next || display;
      const stageReq = Number(stageSource.def?.stage ?? stageSource.def?.stage_required ?? 0);
      const stageOk = stageReq <= stage;
      if (!stageOk && ownedLevel <= 0) continue;
      const baseName = seriesKey.replace(/^add\./, '');
      const groupRaw = String(display.def?.group || 'main').trim();
      const groupName = groupRaw === '' ? 'main' : groupRaw;
      result.push({
        def: display.def,
        fullId: `add.${display.key}`,
        displayLevel: display.level,
        ownedLevel,
        stageReq,
        stageOk,
        base: baseName,
        groupName,
      });
    }
    result.sort((a, b) => (a.def.name || '').localeCompare(b.def.name || ''));
    return result;
  }, [addonDefs, family, ownedAddons, stage]);

  const childTabs = useMemo(() => {
    const tabs = [];
    const seen = new Set();
    for (const entry of entries) {
      const groupName = entry.groupName;
      if (groupName === 'main') continue;
      if (seen.has(groupName)) continue;
      const ownsParent = ownedAddons[`add.${groupName}`] || 0;
      if (!ownsParent) continue;
      const labelLevel = ownsParent || 1;
      const labelDef = addonDefs[`${groupName}.l${labelLevel}`] || addonDefs[`${groupName}.l1`];
      const label = labelDef?.name || groupName;
      tabs.push({ key: groupName, label });
      seen.add(groupName);
    }
    tabs.sort((a, b) => a.label.localeCompare(b.label));
    return tabs;
  }, [entries, ownedAddons, addonDefs]);

  useEffect(() => {
    if (filter !== 'main' && !childTabs.some((tab) => tab.key === filter)) {
      if (onFilterChange) onFilterChange('main');
    }
  }, [filter, childTabs, onFilterChange]);

  const effectiveFilter = filter && childTabs.some((tab) => tab.key === filter) ? filter : 'main';

  const visibleEntries = entries.filter((entry) =>
    effectiveFilter === 'main' ? entry.groupName === 'main' : entry.groupName === effectiveFilter
  );

  return (
    <section className="panel section">
      <div className="section-head">
        ?? Building Addons
        {childTabs.length > 0 ? (
          <div className="tabs secondary-tabs">
            <button
              type="button"
              className={`tab ${effectiveFilter === 'main' ? 'active' : ''}`}
              onClick={() => onFilterChange && onFilterChange('main')}
            >
              Main
            </button>
            {childTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`tab ${effectiveFilter === tab.key ? 'active' : ''}`}
                onClick={() => onFilterChange && onFilterChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="section-body">
        {visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <AddonRow
              key={entry.fullId}
              entry={entry}
              state={state}
              baseOwned={baseOwned}
              requirementCaches={requirementCaches}
            />
          ))
        ) : (
          <div className="sub">Ingen</div>
        )}
      </div>
    </section>
  );
}

function ResearchRow({ entry, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk, ownedLevel, displayLevel } = entry;
  const requirement = requirementInfo(
    {
      price: def.cost || {},
      req: def.require || def.req || '',
      duration_s: Number(def.duration_s ?? 0),
    },
    state,
    requirementCaches,
  );
  const actionItem = {
    id: fullId,
    price: def.cost || {},
    req: def.require || def.req || '',
    duration_s: Number(def.duration_s ?? 0),
    isUpgrade: displayLevel > 1,
    isOwned: ownedLevel >= displayLevel,
    owned: ownedLevel >= displayLevel,
    ownedMax: ownedLevel,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  return (
    <div className="item" data-research-row={fullId}>
      <div className="icon">??</div>
      <div className="grow">
        <div className="title">
          {def.name || fullId}
          {!stageOk && (
            <span className="badge stage-locked price-bad" title={`Kr�ver Stage ${stageReq}`} style={{ marginLeft: 8 }}>
              Stage locked
            </span>
          )}
        </div>
        {def.desc ? <div className="sub">?? {def.desc}</div> : null}
        <RequirementSummary
          price={def.cost || {}}
          reqString={requirement.reqString}
          duration={def.duration_s}
          footprint={0}
          footprintOk
        />
      </div>
      <div className="right">
        {!baseOwned ? (
          <button className="btn" disabled>Kr�ver bygning</button>
        ) : (
          <>
            <ActionButton item={actionItem} allOk={requirement.allOk && stageOk} />
            <BuildProgress bldId={fullId} />
          </>
        )}
      </div>
    </div>
  );
}

function ResearchTab({ family, defs, state, stage, baseOwned, requirementCaches }) {
  const researchDefs = defs.rsd || {};
  const researchOwned = useMemo(() => computeResearchOwned(state), [state]);
  const entries = useMemo(() => {
    const bySeries = new Map();
    for (const [key, def] of Object.entries(researchDefs)) {
      const fam = String(def?.family || '');
      if (!fam) continue;
      const families = fam.split(',').map((x) => x.trim());
      if (!families.includes(family)) continue;
      const match = key.match(/^(.+)\.l(\d+)$/);
      if (!match) continue;
      const base = match[1];
      const level = Number(match[2]);
      const seriesKey = `rsd.${base}`;
      if (!bySeries.has(seriesKey)) bySeries.set(seriesKey, []);
      bySeries.get(seriesKey).push({ key, def, level });
    }
    const result = [];
    for (const [seriesKey, items] of bySeries.entries()) {
      items.sort((a, b) => a.level - b.level);
      const ownedLevel = researchOwned[seriesKey] || 0;
      const next = ownedLevel <= 0 ? items.find((item) => item.level === 1) : items.find((item) => item.level === ownedLevel + 1);
      const display = next || items[items.length - 1];
      if (!display) continue;
      const stageReq = Number(display.def?.stage ?? display.def?.stage_required ?? 0);
      const stageOk = stageReq <= stage;
      if (!stageOk && ownedLevel <= 0) continue;
      result.push({
        def: display.def,
        fullId: `rsd.${display.key}`,
        displayLevel: display.level,
        ownedLevel,
        stageReq,
        stageOk,
      });
    }
    result.sort((a, b) => (a.def.name || '').localeCompare(b.def.name || ''));
    return result;
  }, [family, researchDefs, researchOwned, stage]);

  if (!entries.length) {
    return (
      <section className="panel section">
        <div className="section-head">?? Related Research</div>
        <div className="section-body"><div className="sub">Ingen</div></div>
      </section>
    );
  }

  return (
    <section className="panel section">
      <div className="section-head">?? Related Research</div>
      <div className="section-body">
        {entries.map((entry) => (
          <ResearchRow
            key={entry.fullId}
            entry={entry}
            state={state}
            baseOwned={baseOwned}
            requirementCaches={requirementCaches}
          />
        ))}
      </div>
    </section>
  );
}

function formatCost(cost, defs, sign) {
  const map = normalizePrice(cost);
  if (!Object.keys(map).length) return sign === '+' ? '' : '-';
  return Object.values(map)
    .map((entry) => {
      const emoji = getEmojiForId(entry.id, defs) || '';
      const amount = Number(entry.amount || 0);
      const prefix = sign === '+' ? '+' : '-';
      return `${prefix}${amount}${emoji}`;
    })
    .join(' � ');
}

function RecipeRow({ entry, defs, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk } = entry;
  const requirement = requirementInfo(
    {
      price: def.cost || {},
      req: def.require || def.req || '',
      duration_s: Number(def.duration_s ?? 0),
    },
    state,
    requirementCaches,
  );
  const actionItem = {
    id: fullId,
    price: def.cost || {},
    req: def.require || def.req || '',
    duration_s: Number(def.duration_s ?? 0),
    isUpgrade: entry.level > 1,
    isOwned: false,
    owned: false,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  const inputs = formatCost(def.cost || {}, defs, '-');
  const outputs = formatCost(def.yield || {}, defs, '+');
  const timeText = def.time_str || (def.duration_s != null ? prettyTime(def.duration_s) : '');

  return (
    <div className="item" data-recipe-row={fullId}>
      <div className="icon">??</div>
      <div className="grow">
        <div className="title">
          {def.name || fullId}
          {!stageOk && (
            <span className="badge stage-locked price-bad" title={`Kr�ver Stage ${stageReq}`} style={{ marginLeft: 8 }}>
              Stage locked
            </span>
          )}
        </div>
        {def.desc ? <div className="sub">?? {def.desc}</div> : null}
        <div className="sub">?? Recipe: {inputs || '-'} ? {outputs || '-'}{timeText ? ` / ${timeText}` : ''}</div>
        <RequirementSummary
          price={def.cost || {}}
          reqString={requirement.reqString}
          duration={def.duration_s}
          footprint={0}
          footprintOk
        />
      </div>
      <div className="right">
        {!baseOwned ? (
          <button className="btn" disabled>Kr�ver bygning</button>
        ) : (
          <>
            <ActionButton item={actionItem} allOk={requirement.allOk && stageOk} />
            <BuildProgress bldId={fullId} />
          </>
        )}
      </div>
    </div>
  );
}

function RecipesTab({ family, defs, state, stage, baseOwned, requirementCaches }) {
  const recipeDefs = defs.rcp || {};
  const entries = useMemo(() => {
    const result = [];
    for (const [key, def] of Object.entries(recipeDefs)) {
      const fam = String(def?.family || '');
      if (!fam) continue;
      const families = fam.split(',').map((x) => x.trim());
      if (!families.includes(family)) continue;
      const stageReq = Number(def?.stage ?? def?.stage_required ?? 0);
      if (stageReq > stage) continue;
      const match = key.match(/^(.+)\.l(\d+)$/);
      const level = match ? Number(match[2]) : def?.lvl || 1;
      result.push({ def, level, fullId: `rcp.${key}`, stageReq, stageOk: true });
    }
    result.sort((a, b) => a.stageReq - b.stageReq || a.level - b.level || (a.def.name || '').localeCompare(b.def.name || ''));
    return result;
  }, [recipeDefs, family, stage]);

  if (!entries.length) {
    return (
      <section className="panel section">
        <div className="section-head">?? Jobs / Recipes</div>
        <div className="section-body"><div className="sub">Ingen</div></div>
      </section>
    );
  }

  return (
    <section className="panel section">
      <div className="section-head">?? Jobs / Recipes</div>
      <div className="section-body">
        {entries.map((entry) => (
          <RecipeRow
            key={entry.fullId}
            entry={entry}
            defs={defs}
            state={state}
            baseOwned={baseOwned}
            requirementCaches={requirementCaches}
          />
        ))}
      </div>
    </section>
  );
}

function SpecialTab() {
  return (
    <section className="panel section">
      <div className="section-head">?? Special</div>
      <div className="section-body"><div className="sub">Ingen specielle funktioner endnu.</div></div>
    </section>
  );
}

function BuildingDetailPage({ buildingId }) {
  const { data } = useGameData();
  const { defs, state } = data;
  const canonicalId = canonicalizeBuildingId(buildingId);
  const defKey = canonicalId ? canonicalId.replace(/^bld\./, '') : null;
  const heroDef = defKey ? defs.bld?.[defKey] : null;

  const parsed = canonicalId ? parseBldKey(canonicalId) : null;
  const family = parsed?.family ?? defKey?.replace(/\.l\d+$/, '');
  const series = parsed?.series ?? (family ? `bld.${family}` : null);

  const ownedBuildings = useMemo(() => computeOwnedMap(state.bld), [state.bld]);
  const ownedAddons = useMemo(() => computeOwnedMap(state.add), [state.add]);
  const requirementCaches = useMemo(() => ({ ownedBuildings, ownedAddons }), [ownedBuildings, ownedAddons]);
  const activeJobs = useMemo(() => {
    const map = Object.create(null);
    const running = data?.state?.jobs?.running || [];
    for (const job of running) {
      map[job.bld_id] = job;
    }
    return map;
  }, [data?.state?.jobs?.running]);

  const currentStage = Number(state.user?.currentstage ?? state.user?.stage ?? 0);

  const ownedMax = series ? ownedBuildings[series] || 0 : 0;
  const baseOwned = ownedMax > 0;

  const firstLevelKey = family ? `${family}.l1` : null;
  const nextLevelKey = family ? `${family}.l${ownedMax + 1}` : null;
  const actionKey = baseOwned ? nextLevelKey : firstLevelKey;
  const actionDef = actionKey ? defs.bld?.[actionKey] : null;
  const actionStageReq = Number(actionDef?.stage ?? actionDef?.stage_required ?? 0);
  const actionStageOk = !actionDef || actionStageReq <= currentStage;

  const actionRequirement = requirementInfo(
    actionDef
      ? {
          price: actionDef.cost || actionDef.price || {},
          req: actionDef.require || actionDef.req || '',
          duration_s: Number(actionDef.duration_s ?? 0),
          footprintDelta: Number(actionDef.stats?.footprint ?? 0),
        }
      : null,
    state,
    requirementCaches,
  );

  const actionItem = actionDef
    ? {
        id: `bld.${actionKey}`,
        price: actionDef.cost || actionDef.price || {},
        req: actionDef.require || actionDef.req || '',
        duration_s: Number(actionDef.duration_s ?? 0),
        footprintDelta: Number(actionDef.stats?.footprint ?? 0),
        isUpgrade: baseOwned,
        isOwned: false,
        owned: false,
        ownedMax,
        stageLocked: !actionStageOk,
        stageReq: actionStageReq,
        def: actionDef,
      }
    : baseOwned
      ? { id: canonicalId, isOwned: true, owned: true, def: heroDef }
      : null;

  const stageFootprint = Number(actionDef?.stats?.footprint ?? 0);

  const productionText = heroDef ? formatProduction(heroDef, defs) : '-';
  const heroId = canonicalId || (family ? `bld.${family}.l1` : 'unknown');
  const durabilityMax = Number(heroDef?.durability ?? 0);
  const ownedId = baseOwned ? `bld.${family}.l${ownedMax}` : (canonicalId || `bld.${family}.l1`);
  const durabilityCurrent = Number(state.bld?.[ownedId]?.durability ?? 0);
  const durabilityPct = durabilityMax > 0 ? Math.max(0, Math.min(100, Math.round((durabilityCurrent / durabilityMax) * 100))) : 0;
  const footprintText = `${((heroDef?.stats?.footprint ?? 0) >= 0 ? '+' : '')}${heroDef?.stats?.footprint ?? 0} Byggepoint`;
  const animalCapText = `${((heroDef?.stats?.animalCap ?? 0) >= 0 ? '+' : '')}${heroDef?.stats?.animalCap ?? 0} Staldplads`;

  const actionFullId = actionItem && actionItem.id.startsWith('bld.') ? actionItem.id : null;
  const currentFullId = ownedId;
  const jobActiveId = (actionFullId && activeJobs[actionFullId]) ? actionFullId : (activeJobs[currentFullId] ? currentFullId : null);

  const [activeTab, setActiveTab] = useState(DETAIL_TABS[0]);
  const [addonFilter, setAddonFilter] = useState('main');
  useEffect(() => {setActiveTab(DETAIL_TABS[0]); setAddonFilter('main');}, [canonicalId]);

  if (!canonicalId || !heroDef || !family) {
    return <div className="panel section"><div className="section-body"><div className="sub">Building not found.</div></div></div>;
  }

  const actionTargetInfo = actionDef
    ? {
        price: actionDef.cost || actionDef.price || {},
        reqString: actionRequirement.reqString,
        duration: Number(actionDef.duration_s ?? 0),
        footprint: stageFootprint,
      }
    : null;

  const canStart = !!actionDef && actionStageOk && actionRequirement.allOk;

  const tabContent = (() => {
    switch (activeTab) {
      case 'addons':
        return (
          <AddonsTab 
          family={family}
          defs={defs} 
          state={state} 
          stage={currentStage}
          baseOwned={baseOwned}
          requirementCaches={requirementCaches}
          filter={addonFilter}
          onFilterChange={setAddonFilter}/>
        );
      case 'research':
        return (
          <ResearchTab
            family={family}
            defs={defs}
            state={state}
            stage={currentStage}
            baseOwned={baseOwned}
            requirementCaches={requirementCaches}
          />
        );
      case 'recipes':
        return (
          <RecipesTab
            family={family}
            defs={defs}
            state={state}
            stage={currentStage}
            baseOwned={baseOwned}
            requirementCaches={requirementCaches}
          />
        );
      default:
        return <SpecialTab />;
    }
  })();

  return (
    <section className="panel section">
      <div className="section-head">
        <a href="#/buildings" className="back">&larr;</a>
        Building
      </div>
      <div className="section-body">
        <BuildingHero
          heroDef={heroDef}
          heroId={heroId}
          productionText={productionText}
          durabilityPct={durabilityPct}
          jobActiveId={jobActiveId}
          footprintText={footprintText}
          animalCapText={animalCapText}
          actionTarget={actionTargetInfo}
          requirementState={actionRequirement}
        />
        <BuildingActions actionItem={actionItem} canStart={canStart} jobActiveId={jobActiveId} />
        <div className="tabs">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === 'addons' && 'Addons'}
              {tab === 'research' && 'Research'}
              {tab === 'recipes' && 'Recipes'}
              {tab === 'special' && 'Special'}
            </button>
          ))}
        </div>
        <div id="tabContent">
          {tabContent}
        </div>
      </div>
    </section>
  );
}

export default BuildingDetailPage;