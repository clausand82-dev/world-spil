import React from 'react';
import ActionButton from '../../ActionButton.jsx';
import BuildProgress from '../../BuildProgress.jsx';
import RequirementSummary from '../RequirementSummary.jsx';
import { requirementInfo, /*formatCost,*/ getCostTokens } from '../../../services/requirements.js';
import Icon from '../../common/Icon.jsx';
import * as H from '../../../services/helpers.js';
import { useT } from "../../../services/i18n.js";
import DockHoverCard from '../../../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../../ui/StatsEffectsTooltip.jsx';
import RequirementPanel from '../../../components/requirements/RequirementPanel.jsx';
import { useGameData } from '../../../context/GameDataContext.jsx';
import { applyCostBuffsToAmount } from '../../../services/calcEngine-lite.js';

/**
 * Render an inline "formula" items but split into rows with up to `perRow` items each.
 * tokens shape: { id, amount, icon, prefix, ... }
 */
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function renderInlineFormulaRow(tokens, separator = ' + ') {
  // tokens: array of token objects
  return tokens.map((t, idx) => {
    const key = `${t.id || t.name || idx}::${idx}`;
    const amount = Number(t.amount || 0);
    const iconNode = t.icon?.iconUrl
      ? <Icon key={`i-${key}`} iconUrl={t.icon.iconUrl} size="1em" />
      : (t.icon?.emoji ? <span key={`i-${key}`} style={{ fontSize: 14 }}>{t.icon.emoji}</span> : <span key={`i-${key}`}>📦</span>);
    return (
      <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{H.fmt(amount)}</span>
        <span style={{ marginLeft: 2, marginRight: 2 }}>{'x'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{iconNode}</span>
        {idx < tokens.length - 1 ? <span style={{ margin: '0 6px', opacity: 0.8 }}>{separator}</span> : null}
      </span>
    );
  });
}

function renderInlineFormulaRows(tokens, perRow = 3, separator = ' + ') {
  if (!tokens || !tokens.length) return null;
  const rows = chunkArray(tokens, perRow);
  return rows.map((row, rIdx) => (
    <div key={`formula-row-${rIdx}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: rIdx < rows.length - 1 ? 6 : 0 }}>
      {renderInlineFormulaRow(row, separator)}
    </div>
  ));
}

function computeYieldSpace(def, defs) {
  const map = H.normalizePrice(def?.yield || {});
  let solid = 0, liquid = 0;

  for (const entry of Object.values(map)) {
    const id = String(entry.id || '');
    if (!id.startsWith('res.')) continue;

    const key = id.replace(/^res\./, '');
    const rDef = defs.res?.[key];
    if (!rDef) continue;

    const unitSpace = Number(rDef.unitSpace || 0);
    if (unitSpace <= 0) continue; // gratis, fylder ikke

    const amount = Number(entry.amount || 0);
    if (amount <= 0) continue;

    const unit = String(rDef.unit || '').toLowerCase();
    const addSpace = unitSpace * amount;
    if (unit === 'l') liquid += addSpace;
    else solid += addSpace;
  }

  return { solid, liquid };
}

function renderTokensAsNodes(tokens) {
  if (!tokens || !tokens.length) return null;
  return tokens.map((t, idx) => (
    <span key={`${t.id}-${idx}`} style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.prefix}{t.amount}</span>
      {t.icon?.iconUrl ? (
        <Icon iconUrl={t.icon.iconUrl} alt={t.icon.name} size="0.95em" />
      ) : t.icon?.emoji ? (
        <span style={{ fontSize: '0.95em', lineHeight: 1 }}>{t.icon.emoji}</span>
      ) : null}
      {idx < tokens.length - 1 ? <span style={{ marginLeft: 6, marginRight: 6, opacity: 0.65 }}>•</span> : null}
    </span>
  ));
}

/* compute yield entries (base + buffed) for hover preview */
function computeYieldEntries(def, defs, activeBuffs) {
  const map = H.normalizePrice(def?.yield || {});
  const out = [];
  Object.values(map).forEach((entry, idx) => {
    const rawId = String(entry.id || '');
    // determine effective id and def lookup (support res.* and ani.*)
    let effId;
    if (rawId.startsWith('res.') || rawId.startsWith('ani.')) effId = rawId;
    else if (defs?.res?.[rawId]) effId = `res.${rawId}`;
    else if (defs?.ani?.[rawId]) effId = `ani.${rawId}`;
    else effId = rawId;

    const baseAmt = Number(entry.amount || 0);
    const buffedAmt = (typeof effId === 'string')
      ? applyCostBuffsToAmount(baseAmt, effId, { appliesToCtx: 'all', activeBuffs })
      : baseAmt;

    // get display name + icon
    let name = rawId;
    let icon = null;
    if (String(effId).startsWith('res.')) {
      const key = String(effId).replace(/^res\./,'');
      const d = defs?.res?.[key];
      name = d?.name || key;
      icon = d ? (d.iconUrl ? { iconUrl: d.iconUrl } : { emoji: d.emoji }) : null;
    } else if (String(effId).startsWith('ani.')) {
      const key = String(effId).replace(/^ani\./,'');
      const d = defs?.ani?.[key];
      name = d?.name || key;
      icon = d ? (d.iconUrl ? { iconUrl: d.iconUrl } : { emoji: d.emoji }) : null;
    } else {
      const key = String(effId).replace(/^[^.]+\./,'');
      const d = defs?.[key] || {};
      name = d?.name || key || rawId;
      icon = d?.iconUrl ? { iconUrl: d.iconUrl } : (d?.emoji ? { emoji: d.emoji } : null);
    }

    out.push({ id: entry.id, effId, baseAmt, buffedAmt, name, icon, _idx: idx });
  });
  return out;
}

function RecipeRow({ entry, defs: passedDefs, state, baseOwned, requirementCaches }) {
  const { def, fullId, stageReq, stageOk } = entry;
  const t = useT();
  const { data } = useGameData();
  const defs = passedDefs || data?.defs || {};
  const translations = data?.i18n?.current ?? {};

  const requirement = requirementInfo(
    {
      id: fullId,
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
    // Use buffed/final duration from requirementInfo when available
    duration_s: Number(requirement?.duration?.final_s ?? Number(def.duration_s ?? 0)),
    isUpgrade: entry.level > 1,
    isOwned: false,
    owned: false,
    stageLocked: !stageOk,
    stageReq,
    def,
  };

  // tokens for the various displays
  const inputTokens = getCostTokens(def.cost || {}, defs, '-');
  const outputTokens = getCostTokens(def.yield || {}, defs, '+');
  const formulaInputTokens = getCostTokens(def.cost || {}, defs, ''); // tom prefix - vi udskriver amount selv
  const formulaOutputTokens = getCostTokens(def.yield || {}, defs, '');

  const durationValue = requirement.duration?.final_s ?? null;
  const durationBase = requirement.duration?.base_s ?? null;

  // Pladstjek for outputs
  const { solid: needSolid, liquid: needLiquid } = computeYieldSpace(def, defs);
  const capSolid = state?.cap?.solid || { total: 0, used: 0 };
  const capLiquid = state?.cap?.liquid || { total: 0, used: 0 };
  const availSolid = Math.max(0, (capSolid.total || 0) - (capSolid.used || 0));
  const availLiquid = Math.max(0, (capLiquid.total || 0) - (capLiquid.used || 0));

  const spaceOk = (needSolid <= availSolid) && (needLiquid <= availLiquid);
  const allOk = requirement.allOk && stageOk && spaceOk;

  // Hjælpetekst når pladsen mangler (valgfrit)
  const spaceTitle = !spaceOk
    ? `Mangler plads: Solid +${needSolid} (tilgængelig ${availSolid}), Liquid +${needLiquid} (tilgængelig ${availLiquid})`
    : undefined;

  // compute yield entries (per single start) using activeBuffs
  const activeBuffs = requirementCaches?.activeBuffs ?? [];
  const yieldEntries = computeYieldEntries(def, defs, activeBuffs);

  // Hover content: Stats + compact formula (max 3 pr række) + Yield preview (grid med 3 kolonner) + RequirementPanel
  const hoverContent = (
    <div style={{ minWidth: 340 }}>
      <StatsEffectsTooltip def={def} translations={translations} />
      <div style={{ height: 8 }} />

      <div style={{ marginBottom: 8 }}>
        {/* Compact formula lines (maks 3 pr række) */}
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.formula', 'Opskrift')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, fontSize: '1.2em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {renderInlineFormulaRows(formulaInputTokens, 3)}
            </div>
            <div style={{ fontWeight: 700, marginLeft: 4, marginRight: 4, alignSelf: 'center', }}>→</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '1.5'   }}>
              {renderInlineFormulaRows(formulaOutputTokens, 3, '')}
            </div>
          </div><div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 0, display: 'grid', gap: 4, fontSize: 12 }}></div>
        </div>

        <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('ui.labels.products', 'Produkter (per start)')}</div>
        {yieldEntries.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {yieldEntries.map((y) => {
              const changed = Math.abs((y.buffedAmt || 0) - (y.baseAmt || 0)) > 1e-6;
              return (
                <div key={`${y.effId}::${y._idx}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ width: 28, textAlign: 'center' }}>
                    {y.icon?.iconUrl ? <Icon iconUrl={y.icon.iconUrl} size="2em" /> : <span style={{ fontSize: 18 }}>{y.icon?.emoji || '📦'}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{y.name}</div>
                    <div style={{ fontSize: 12, color: changed ? '#0a0' : '#333' }}>
                      {changed ? `${H.fmt(y.baseAmt)} → ${H.fmt(y.buffedAmt)}` : H.fmt(y.baseAmt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sub">Ingen produkter</div>
        )}
      </div>

      <RequirementPanel def={def} defs={defs} state={state} requirementCaches={requirementCaches} />
    </div>
  );

  return (
    <DockHoverCard content={hoverContent} style={{ display: 'block', width: '100%' }}>
      <div className="item" data-recipe-row={fullId}>
        <div className="icon">{t("ui.emoji.research.h1")}</div>
        <div className="grow">
          <div className="title">
            {def.name || fullId}
            {!stageOk && (
              <span className="badge stage-locked price-bad" title={`${t("ui.text.demandingstage.h1")} ${stageReq}`} style={{ marginLeft: 8 }}>
                {t("ui.text.stagelocked.h1")}
              </span>
            )}
          </div>
          {def.desc ? <div className="sub">{t("ui.emoji.info.h1")} {def.desc}</div> : null}
          <div className="sub">
            {t("ui.emoji.recipe.h1")} {t("ui.text.recipe.h1")}:&nbsp;
            {renderTokensAsNodes(inputTokens) || <em>-</em>}
            &nbsp;·&nbsp;
            {renderTokensAsNodes(outputTokens) || <em>-</em>}
          </div>
          <RequirementSummary
            price={def.cost || {}}
            //yieldPrice={def.yield || {}} hvis jeg vil have yield med på res listen, er det den her linje
            reqString={requirement.reqString}
            duration={durationValue}
            durationBase={durationBase}
            footprint={0}
            footprintOk
          />
        </div>
        <div className="right">
          {!baseOwned ? (
            <button className="btn" disabled>{t("ui.btn.demandbuilding.h1")}</button>
          ) : !spaceOk ? (
            <>
              <button className="btn" disabled title={spaceTitle}>Mangler plads</button>
              <BuildProgress bldId={fullId} />
            </>
          ) : (
            <>
              <ActionButton item={actionItem} allOk={allOk} />
              <BuildProgress bldId={fullId} />
            </>
          )}
        </div>
      </div>
    </DockHoverCard>
  );
}

export default RecipeRow;