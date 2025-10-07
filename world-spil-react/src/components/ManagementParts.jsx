import React, { useEffect, useMemo, useState } from 'react';

// Små, generiske UI‑byggesten (enkelt og hardcoded)
export function Section({ title, children, right }) {
  return (
    <section style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{title}</h3>
        {right}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {children}
      </div>
    </section>
  );
}
export function Row({ label, help, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, alignItems: 'center' }}>
      <div style={{ opacity: 0.9 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {help && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{help}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, suffix, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{ width: 180, padding: '6px 8px' }}
      />
      {suffix && <span style={{ opacity: 0.7 }}>{suffix}</span>}
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, formatValue }) {
  const display = formatValue ? formatValue(value) : String(value);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
      <input
        type="range"
        value={Number(value ?? min)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <div style={{ minWidth: 70, textAlign: 'right' }}>{display}</div>
    </div>
  );
}
export function PercentSlider({ value, onChange }) {
  return <Slider value={value} onChange={onChange} min={0} max={100} step={1} formatValue={(v)=>`${Math.round(v)}%`} />;
}

export function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e)=>onChange(e.target.value)} style={{ padding: '6px 8px' }}>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function CheckboxGroup({ value = [], onChange, options, columns = 1 }) {
  const setVal = (val, checked) => {
    const set = new Set(value);
    if (checked) set.add(val); else set.delete(val);
    onChange(Array.from(set));
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 8 }}>
      {options.map(opt => (
        <label key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={(e)=>setVal(opt.value, e.target.checked)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export function RadioGroup({ value, onChange, options, columns = 1 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 8 }}>
      {options.map(opt => (
        <label key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="radio"
            checked={value === opt.value}
            onChange={()=>onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}