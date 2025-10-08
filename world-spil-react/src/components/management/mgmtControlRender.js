import React from 'react';
import * as MP from './managementparts.jsx';

/**
 * Ens rendering af MP.* kontroller baseret på cfg.control
 * Uafhængig af hooks – kan bruges i alle tabs
 */
export function renderControl(fieldId, fieldCfg, { choices, setChoice, locked = false }) {
  const c = fieldCfg.control || {};
  const key = c.key || fieldId;
  const get = (k, d) => (choices?.[k] === undefined ? d : choices[k]);
  const set = (k) => (v) => setChoice(k, v);

  switch (c.type) {
    case 'toggle':
      return (
        <MP.Toggle
          checked={!!get(key, c.default || false)}
          onChange={set(key)}
          label={get(key, c.default || false) ? (c.labelOn || 'Aktiv') : (c.labelOff || 'Inaktiv')}
          disabled={locked}
        />
      );
    case 'percent':
      return (
        <MP.PercentSlider
          value={Number(get(key, c.default ?? 0))}
          onChange={set(key)}
          disabled={locked}
        />
      );
    case 'slider':
      return (
        <MP.Slider
          value={Number(get(key, c.default ?? c.min ?? 0))}
          onChange={set(key)}
          min={c.min ?? 0}
          max={c.max ?? 100}
          step={c.step ?? 1}
          disabled={locked}
        />
      );
    case 'number':
      return (
        <MP.NumberInput
          value={get(key, c.default ?? 0)}
          onChange={set(key)}
          min={c.min}
          max={c.max}
          step={c.step ?? 1}
          suffix={c.suffix}
          placeholder={c.placeholder}
          disabled={locked}
        />
      );
    case 'select':
      return (
        <MP.Select
          value={get(key, c.default ?? (c.options?.[0]?.value ?? ''))}
          onChange={set(key)}
          options={c.options || []}
          width={c.width ?? 220}
          disabled={locked}
        />
      );
    case 'checkboxes':
      return (
        <MP.CheckboxGroup
          value={get(key, c.default ?? [])}
          onChange={set(key)}
          options={c.options || []}
          columns={c.columns ?? 1}
          disabled={locked}
        />
      );
    case 'radio':
      return (
        <MP.RadioGroup
          value={get(key, c.default ?? (c.options?.[0]?.value ?? ''))}
          onChange={set(key)}
          options={c.options || []}
          columns={c.columns ?? 1}
          disabled={locked}
        />
      );
    default:
      return null;
  }
}