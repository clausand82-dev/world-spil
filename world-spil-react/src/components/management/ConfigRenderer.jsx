import React from 'react';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import ManagementStatsTooltip from './ManagementStatsTooltip.jsx';
import * as MP from './managementparts.jsx';

/**
 * props:
 * - config: { fields, sections }
 * - choices, setChoice
 * - ctx: fx { summary, gameData }
 * - translations
 */
export default function ConfigRenderer({ config, choices, setChoice, ctx, translations }) {
  const { fields = {}, sections = [] } = config || {};

  const currentStage =
    Number(ctx?.summary?.stage?.current ??
      ctx?.gameData?.state?.user?.currentstage ??
      ctx?.gameData?.state?.user?.stage ?? 0);

  const isStageOk = (cfg) => {
    const min = cfg?.stageMin;
    const max = cfg?.stageMax;
    if (min != null && currentStage < Number(min)) return false;
    if (max != null && currentStage > Number(max)) return false;
    return true;
  };

  const isFieldVisible = (cfg) => {
    if (!isStageOk(cfg)) return !!cfg?.showWhenLocked; // vis evt disabled
    if (typeof cfg?.visible === 'function') return !!cfg.visible(choices, ctx);
    return cfg?.visible !== false;
  };

  const isFieldLocked = (cfg) => !isStageOk(cfg);

  const renderTooltip = (fieldId, fieldCfg) => {
    // stats-baseret tooltip
    if (fieldCfg?.tooltip?.type === 'stats') {
      const title = fieldCfg.tooltip.title || fieldCfg.label || fieldId;
      const stats = typeof fieldCfg.tooltip.stats === 'function'
        ? fieldCfg.tooltip.stats(choices, ctx)
        : (fieldCfg.tooltip.stats || {});
      return (
        <ManagementStatsTooltip
          title={title}
          stats={stats}
          translations={translations}
        />
      );
    }
    // fri hover (jsx eller function)
    if (fieldCfg?.hover) {
      return typeof fieldCfg.hover === 'function' ? fieldCfg.hover(choices, ctx) : fieldCfg.hover;
    }
    return null;
  };

  const effectiveGet = (fieldId, cfg, controlKey, fallback) => {
    // Locked => anvend default, ellers choices
    if (isFieldLocked(cfg)) return (cfg.control?.default ?? fallback);
    const v = choices?.[controlKey];
    return v === undefined ? (cfg.control?.default ?? fallback) : v;
  };

  const set = (key) => (val) => setChoice(key, val);

  const renderControl = (fieldId, fieldCfg) => {
    const c = fieldCfg.control || {};
    const key = c.key || fieldId;
    const disabled = isFieldLocked(fieldCfg) || c.disabled;

    switch (c.type) {
      case 'toggle':
        return (
          <MP.Toggle
            checked={!!effectiveGet(fieldId, fieldCfg, key, c.default || false)}
            onChange={set(key)}
            label={effectiveGet(fieldId, fieldCfg, key, c.default || false) ? (c.labelOn || 'Aktiv') : (c.labelOff || 'Inaktiv')}
            disabled={disabled}
          />
        );
      case 'percent':
        return (
          <MP.PercentSlider
            value={Number(effectiveGet(fieldId, fieldCfg, key, c.default ?? 0))}
            onChange={set(key)}
            disabled={disabled}
          />
        );
      case 'slider':
        return (
          <MP.Slider
            value={Number(effectiveGet(fieldId, fieldCfg, key, c.default ?? c.min ?? 0))}
            onChange={set(key)}
            min={c.min ?? 0}
            max={c.max ?? 100}
            step={c.step ?? 1}
            disabled={disabled}
          />
        );
      case 'number':
        return (
          <MP.NumberInput
            value={effectiveGet(fieldId, fieldCfg, key, c.default ?? 0)}
            onChange={set(key)}
            min={c.min}
            max={c.max}
            step={c.step ?? 1}
            suffix={c.suffix}
            placeholder={c.placeholder}
            disabled={disabled}
          />
        );
      case 'select':
        return (
          <MP.Select
            value={effectiveGet(fieldId, fieldCfg, key, c.default ?? (c.options?.[0]?.value ?? ''))}
            onChange={set(key)}
            options={c.options || []}
            width={c.width ?? 220}
            disabled={disabled}
          />
        );
      case 'checkboxes':
        return (
          <MP.CheckboxGroup
            value={effectiveGet(fieldId, fieldCfg, key, c.default ?? [])}
            onChange={set(key)}
            options={c.options || []}
            columns={c.columns ?? 1}
            disabled={disabled}
          />
        );
      case 'radio':
        return (
          <MP.RadioGroup
            value={effectiveGet(fieldId, fieldCfg, key, c.default ?? (c.options?.[0]?.value ?? ''))}
            onChange={set(key)}
            options={c.options || []}
            columns={c.columns ?? 1}
            disabled={disabled}
          />
        );
      case 'custom':
        return c.render ? c.render(choices, set, ctx, { disabled }) : null;
      default:
        return null;
    }
  };

  const FieldRow = ({ fieldId }) => {
    const cfg = fields[fieldId];
    if (!cfg) return null;
    const visible = isFieldVisible(cfg);
    if (!visible) return null;

    const tooltip = renderTooltip(fieldId, cfg);
    const content = (
      <MP.Row label={cfg.label || fieldId} help={cfg.help}>
        {renderControl(fieldId, cfg)}
      </MP.Row>
    );
    return tooltip ? (
      <DockHoverCard content={tooltip}>
        <div>{content}</div>
      </DockHoverCard>
    ) : content;
  };

  const Cell = ({ item }) => {
    // item: string id | { id, span } | { stack:[ids], span, gap? }
    const span = Math.max(1, Math.min(3, Number(item.span || 1)));
    if (typeof item === 'string' || item.id) {
      const id = typeof item === 'string' ? item : item.id;
      return (
        <div className={`mp-item span-${span}`}>
          <FieldRow fieldId={id} />
        </div>
      );
    }
    if (item.stack) {
      return (
        <div className={`mp-item span-${span}`}>
          <div style={{ display: 'grid', gap: item.gap ?? 10 }}>
            {item.stack.map((id, idx) => <FieldRow key={`${id}-${idx}`} fieldId={id} />)}
          </div>
        </div>
      );
    }
    return null;
  };

  // Sektion-level stage‑gating
  const sectionVisible = (sec) => {
    if (!isStageOk(sec)) return !!sec.showWhenLocked; // evt. vis tom/disabled sektion
    if (typeof sec.visible === 'function') return !!sec.visible(choices, ctx);
    return sec.visible !== false;
  };

  return (
    <>
      {(sections || []).filter(sectionVisible).map((sec) => (
        <fieldset key={sec.title} className="groupbox">
          <legend>{sec.title}</legend>
          <div className="groupbox__content">
            <div className={`mp-grid cols-${Math.max(1, Math.min(3, sec.cols || 1))}`}>
              {(sec.items || []).map((it, i) => <Cell key={i} item={it} />)}
            </div>
          </div>
        </fieldset>
      ))}
    </>
  );
}

/**
 * Hjælper: vend tilbage med “effektive” valg (locked felter erstattet med deres default).
 * Brug fx når du kalder preview-endpoint.
 */
export function effectiveChoicesForConfig(config, choices, ctx) {
  const out = { ...(choices || {}) };
  const fields = config?.fields || {};
  const currentStage =
    Number(ctx?.summary?.stage?.current ??
      ctx?.gameData?.state?.user?.currentstage ??
      ctx?.gameData?.state?.user?.stage ?? 0);

  const isStageOk = (cfg) => {
    const min = cfg?.stageMin;
    const max = cfg?.stageMax;
    if (min != null && currentStage < Number(min)) return false;
    if (max != null && currentStage > Number(max)) return false;
    return true;
  };

  for (const [fieldId, cfg] of Object.entries(fields)) {
    const key = cfg.control?.key || fieldId;
    if (!isStageOk(cfg)) {
      out[key] = cfg.control?.default;
    }
  }
  return out;
}