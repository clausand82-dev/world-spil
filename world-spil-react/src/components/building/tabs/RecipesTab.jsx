import React, { useMemo } from 'react';
import RecipeRow from '../rows/RecipeRow.jsx';
import { useT } from "../../../services/i18n.js";

function RecipesTab({ family, defs, state, stage, baseOwned, requirementCaches }) {
  const recipeDefs = defs.rcp || {};
const t = useT();
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
        <div className="section-head">{t("ui.emoji.research.h1")} {t("ui.headers.recipe.h1")}</div>
        <div className="section-body"><div className="sub">Ingen</div></div>
      </section>
    );
  }

  return (
    <section className="panel section">
      <div className="section-head">{t("ui.emoji.research.h1")} {t("ui.headers.recipe.h1")}</div>
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

export default RecipesTab;
