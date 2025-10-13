import React from 'react';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import { renderControl } from './mgmtControlRender.jsx';
import * as MP from './managementparts.jsx';
import ManagementStatsTooltip from './ManagementStatsTooltip.jsx';

export default function MgmtGrid({ config, choices, setChoice, currentStage, tooltipCtx = {} }) {
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

  const buildTooltipElement = (tip) => {
    if (!tip) return null;
    if (React.isValidElement(tip)) return tip;
    if (typeof tip === 'function') {
      const res = tip(choices, tooltipCtx);
      return buildTooltipElement(res);
    }
    if (typeof tip === 'object') {
      const type = tip.type || 'stats';
      const headerMode = type === 'stats' ? 'stats' : 'wrapper';
      const title = tip.title || '';
      const subtitle = tip.subtitle || '';
      const extras = tip.extras;
      const statsVal = typeof tip.stats === 'function' ? tip.stats(choices, tooltipCtx) : tip.stats;
      return (
        <ManagementStatsTooltip
          headerMode={headerMode}
          title={title}
          subtitle={subtitle}
          stats={statsVal}
          extras={extras}
          translations={tooltipCtx?.translations}
        />
      );
    }
    if (typeof tip === 'string' || typeof tip === 'number') return String(tip);
    return null;
  };

  const FieldRow = ({ id }) => {
    const cfg = fields[id];
    if (!cfg) return null;
    if (!isFieldVisible(cfg)) return null;

    const locked = !isStageOk(cfg);
    const controlEl = renderControl(id, cfg, { choices, setChoice, locked });

    const helpText = typeof cfg.help === 'function' ? cfg.help(choices, tooltipCtx) : cfg.help;
    const body = (
      <MP.Row label={cfg.label || id} help={helpText}>
        {controlEl}
      </MP.Row>
    );

    const tipEl = buildTooltipElement(cfg.tooltip);
    return tipEl ? (
      <DockHoverCard content={tipEl}>
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
    <div style={{ display: 'grid', gap: 12 }}>
      {(sections || []).map((sec, i) => <Section key={i} sec={sec} />)}
    </div>
  );
}