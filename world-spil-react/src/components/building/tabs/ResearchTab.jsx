import React, { useMemo } from 'react';
import { computeResearchOwned } from '../../../services/requirements.js';
import ResearchRow from '../rows/ResearchRow.jsx';

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
        <div className="section-head">🔬 Related Research</div>
        <div className="section-body"><div className="sub">Ingen</div></div>
      </section>
    );
  }

  return (
    <section className="panel section">
      <div className="section-head">🔬 Related Research</div>
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

export default ResearchTab;
