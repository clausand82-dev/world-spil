import React, { useEffect, useMemo } from 'react';
import { computeOwnedMap } from '../../../services/requirements.js';
import AddonRow from '../rows/AddonRow.jsx';
import { useT } from "../../../services/i18n.js";

function AddonsTab({ family, defs, state, stage, baseOwned, requirementCaches, filter, onFilterChange }) {
  const addonDefs = defs.add || {};
  const ownedAddons = requirementCaches.ownedAddons || {};
const t = useT();
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
      onFilterChange && onFilterChange('main');
    }
  }, [filter, childTabs, onFilterChange]);

  const effectiveFilter = filter && childTabs.some((tab) => tab.key === filter) ? filter : 'main';
  const visibleEntries = entries.filter((entry) =>
    effectiveFilter === 'main' ? entry.groupName === 'main' : entry.groupName === effectiveFilter
  );

  return (
    <section className="panel section">
      <div className="section-head">
        {t("ui.emoji.addon.h1")} {t("ui.headers.addons.h1")}
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

export default AddonsTab;

