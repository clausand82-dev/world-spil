import React from 'react';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import { renderControl } from './mgmtControlRender.js';

/**
 * MgmtGrid – præsentationskomponent til management tabs
 * - Ens layout på tværs af tabs
 * - Ingen hooks – kun props
 *
 * Props:
 * - config: { fields: { [id]: cfg }, sections: [{ title, cols, items, stageMin?, stageMax?, showWhenLocked? }] }
 * - choices: object
 * - setChoice: (key, value) => void
 * - currentStage: number
 */
export default function MgmtGrid({ config, choices, setChoice, currentStage }) {
  const fields = config?.fields || {};
  const sections = config?.sections || [];

  const isStageOk = (cfg) => {
    const min = cfg?.stageMin;
    const max = cfg?.stageMax;
    if (min != null && Number(currentStage) < Number(min)) return false;
    if (max != null && Number(currentStage) > Number(max)) return false;
    return true;
  };

  const isFieldVisible = (cfg) => {
    if (!isStageOk(cfg)) return !!cfg?.showWhenLocked;
    if (typeof cfg?.visible === 'function') return !!cfg.visible(choices);
    return cfg?.visible !== false;
  };

  const FieldRow = ({ id }) => {
    const cfg = fields[id];
    if (!cfg) return null;
    if (!isFieldVisible(cfg)) return null;

    const locked = !isStageOk(cfg);
    const tipContent = typeof cfg.tooltip === 'function' ? cfg.tooltip() : cfg.tooltip;

    const body = (
      <div className="mp-row">
        <div className="mp-row__label">
          <div className="mp-row__title">{cfg.label || id}</div>
          {cfg.help ? <div className="mp-row__help">{cfg.help}</div> : null}
        </div>
        <div className="mp-row__control">
          {renderControl(id, cfg, { choices, setChoice, locked })}
        </div>
      </div>
    );

    return tipContent ? (
      <DockHoverCard content={tipContent}>
        <div>{body}</div>
      </DockHoverCard>
    ) : body;
  };

  const Cell = ({ item }) => {
    const span = Math.max(1, Math.min(3, Number(item.span || 1)));
    if (typeof item === 'string' || item.id) {
      const id = typeof item === 'string' ? item : item.id;
      return (
        <div className={`mp-item span-${span}`}>
          <FieldRow id={id} />
        </div>
      );
    }
    if (item.stack) {
      return (
        <div className={`mp-item span-${span}`}>
          <div style={{ display: 'grid', gap: item.gap ?? 10 }}>
            {item.stack.map((id, idx) => <FieldRow key={`${id}-${idx}`} id={id} />)}
          </div>
        </div>
      );
    }
    return null;
  };

  const Section = ({ sec }) => {
    if (!isStageOk(sec) && !sec.showWhenLocked) return null;
    const cols = Math.max(1, Math.min(3, sec.cols || 1));
    return (
      <fieldset className="groupbox">
        <legend>{sec.title}</legend>
        <div className="groupbox__content">
          <div className={`mp-grid cols-${cols}`}>
            {(sec.items || []).map((it, i) => <Cell key={i} item={it} />)}
          </div>
        </div>
      </fieldset>
    );
  };

  return (
    <>
      {(sections || []).map((sec, i) => <Section key={sec.title || i} sec={sec} />)}
    </>
  );
}