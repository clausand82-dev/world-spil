import React from 'react';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import ManagementStatsTooltip from './ManagementStatsTooltip.jsx';
import * as MP from './managementparts.jsx';

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
    if (!isStageOk(cfg)) return !!cfg?.showWhenLocked;
    if (typeof cfg?.visible === 'function') return !!cfg.visible(choices, ctx);
    return cfg?.visible !== false;
  };
  const isFieldLocked = (cfg) => !isStageOk(cfg);

  const renderTooltip = (fieldId, fieldCfg) => {
    // Stats-baseret tooltip + ekstra tekst
    if (fieldCfg?.tooltip?.type === 'stats' || fieldCfg?.tooltip?.type === 'statsEx') {
      const { title, subtitle, stats, extras, headerMode } = fieldCfg.tooltip;
      return (
        <ManagementStatsTooltip
          title={title || fieldCfg.label || fieldId}
          subtitle={subtitle || ''}
          stats={stats}
          extras={extras}
          translations={translations}
          headerMode={headerMode || 'wrapper'}
          choices={choices}
          ctx={ctx}
        />
      );
    }
    // Fri hover (jsx/funktion)
    if (fieldCfg?.hover) {
      return typeof fieldCfg.hover === 'function' ? fieldCfg.hover(choices, ctx) : fieldCfg.hover;
    }
    return null;
  };

  const effectiveGet = (fieldId, cfg, controlKey, fallback) => {
    if (isFieldLocked(cfg)) return (cfg.control?.default ?? fallback);
    const v = choices?.[controlKey];
    return v === undefined ? (cfg.control?.default ?? fallback) : v;
  };

  const set = (key) => (val) => setChoice(key, val);

  const renderControl = (fieldId, fieldCfg) => {
    const c = fieldCfg.control || {};
    const key = c.key || fieldId;
    const disabled = isFieldLocked(fieldCfg) || c.disabled;

    const labelOn = resolveControlValue(c.labelOn, choices, ctx) ?? 'Aktiv';
    const labelOff = resolveControlValue(c.labelOff, choices, ctx) ?? 'Inaktiv';
    const defaultValue = resolveControlValue(c.default, choices, ctx);
    const min = resolveControlValue(c.min, choices, ctx);
    const max = resolveControlValue(c.max, choices, ctx);
    const step = resolveControlValue(c.step, choices, ctx) ?? c.step ?? 1;
    const options = resolveControlValue(c.options, choices, ctx) ?? c.options;
    const width = resolveControlValue(c.width, choices, ctx) ?? c.width;
    const help = resolveControlValue(c.help, choices, ctx) ?? c.help;


switch (c.type) {
      case 'toggle':
        return (
          <MP.Toggle
            checked={!!effectiveGet(fieldId, fieldCfg, key, defaultValue ?? false)}
            onChange={set(key)}
            label={effectiveGet(fieldId, fieldCfg, key, defaultValue ?? false) ? labelOn : labelOff}
            disabled={disabled}
          />
        );
      case 'percent':
        return (
          <MP.PercentSlider
            value={Number(effectiveGet(fieldId, fieldCfg, key, defaultValue ?? 0))}
            onChange={set(key)}
            disabled={disabled}
          />
        );
      case 'slider':
        return (
          <MP.Slider
            value={Number(effectiveGet(fieldId, fieldCfg, key, defaultValue ?? min ?? 0))}
            onChange={set(key)}
            min={min ?? 0}
            max={max ?? 100}
            step={step}
            disabled={disabled}
          />
        );
      case 'number':
        return (
          <MP.NumberInput
            value={effectiveGet(fieldId, fieldCfg, key, defaultValue ?? 0)}
            onChange={set(key)}
            min={min}
            max={max}
            step={step}
            suffix={c.suffix}
            placeholder={c.placeholder}
            disabled={disabled}
          />
        );
      case 'select':
        return (
          <MP.Select
            value={effectiveGet(fieldId, fieldCfg, key, defaultValue ?? (options?.[0]?.value ?? ''))}
            onChange={set(key)}
            options={options || []}
            width={width ?? 220}
            disabled={disabled}
          />
        );
      case 'checkboxes':
        return (
          <MP.CheckboxGroup
            value={effectiveGet(fieldId, fieldCfg, key, defaultValue ?? [])}
            onChange={set(key)}
            options={options || []}
            columns={c.columns ?? 1}
            disabled={disabled}
          />
        );
      case 'radio':
        return (
          <MP.RadioGroup
            value={effectiveGet(fieldId, fieldCfg, key, defaultValue ?? (options?.[0]?.value ?? ''))}
            onChange={set(key)}
            options={options || []}
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

  const sectionVisible = (sec) => {
    if (!isStageOk(sec)) return !!sec.showWhenLocked;
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

function resolveControlValue(val, choices, ctx) {
  return (typeof val === 'function') ? val(choices, ctx) : val;
}

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