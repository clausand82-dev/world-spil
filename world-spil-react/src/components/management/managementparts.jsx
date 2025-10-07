import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import DockHoverCard from '../../components/ui/DockHoverCard.jsx'; // used by building/addons/research (tilpas sti hvis nødvendig)

// Sektion + række layout (matcher dine andre sider)
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

export function NumberInput({ value, onChange, min, max, step = 1, suffix, placeholder, width = 180 }) {
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
        style={{ width, padding: '6px 8px' }}
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

export function Select({ value, onChange, options, width = 220 }) {
  return (
    <select value={value} onChange={(e)=>onChange(e.target.value)} style={{ padding: '6px 8px', width }}>
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

// Fleksibelt grid: 1-3 kolonner
export function Grid({ cols = 3, gap = 12, className = '', style = {}, children }) {
  const cls = `mp-grid cols-${Math.max(1, Math.min(3, cols))} ${className}`.trim();
  return (
    <div className={cls} style={{ gap, ...style }}>
      {children}
    </div>
  );
}

// Grid-item med col-span 1-3
export function Item({ span = 1, className = '', style = {}, children }) {
  const s = Math.max(1, Math.min(3, Number(span) || 1));
  const cls = `mp-item span-${s} ${className}`.trim();
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

/* Group: fieldset/legend med valgfri automatisk MP.Grid indeni via cols */
export function Group({ title, cols = 0, children, className = '', right = null, style = {} }) {
  const content =
    cols && Number(cols) > 0
      ? <div className="groupbox__content"><div className={`mp-grid cols-${Math.max(1, Math.min(3, cols))}`}>{children}</div></div>
      : <div className="groupbox__content">{children}</div>;

  return (
    <fieldset className={`groupbox ${className}`} style={style}>
      <legend>
        {/* Hvis du vil have emoji eller icon, kan du sende det som del af title */}
        {title}
        {right ? <span style={{ marginLeft: 8, opacity: 0.8 }}>{right}</span> : null}
      </legend>
      {content}
    </fieldset>
  );
}

/* Alternativ lille helper hvis du altid vil have grid: */
export function GroupGrid({ title, cols = 3, children, className = '', style = {} }) {
  return (
    <fieldset className={`groupbox ${className}`} style={style}>
      <legend>{title}</legend>
      <div className="groupbox__content">
        <div className={`mp-grid cols-${Math.max(1, Math.min(3, cols))}`}>{children}</div>
      </div>
    </fieldset>
  );
}

/**
 * DockHoverItem
 * - hover: JSX eller () => JSX (funktion kaldt ved rendering, kan bruge choices hvis du sender det ind)
 * - hoverDelay: ms før dock vises
 * - cardProps: objekt sendes videre til DockHoverCard (fx style, className, open prop hvis nødvendigt)
 *
 * Brug på samme måde som MP.HoverItem: wrap omkring det synlige element (MP.Row eller selve control).
 */
export function DockHoverItem({ hover, children, hoverDelay = 200, cardProps = {}, className = '', style = {}, choices = null }) {
  if (!hover) return <div className={className} style={style}>{children}</div>;

  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const onEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), hoverDelay);
  };
  const onLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // lille delay for bedre UX (undgå blink)
    timerRef.current = setTimeout(() => setVisible(false), 120);
  };

  // resolve hover content (kan være funktion der tager choices)
  const resolveHover = () => {
    if (typeof hover === 'function') {
      try { return hover(choices); } catch (e) { return null; }
    }
    return hover;
  };

  // Render trigger element (the visible control). Dock card rendered into body when visible.
  return (
    <>
      <div
        className={className}
        style={{ display: 'inline-block', ...style }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
      >
        {children}
      </div>

      {visible && typeof document !== 'undefined' ? ReactDOM.createPortal(
        // Use DockHoverCard for consistent dock appearance; pass resolved content as children
        <DockHoverCard {...cardProps} open>
          {resolveHover()}
        </DockHoverCard>,
        document.body
      ) : null}
    </>
  );
}