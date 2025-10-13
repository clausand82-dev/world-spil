import React, { useEffect, useMemo, useState } from 'react';
import Tabs from '../components/ui/Tabs.jsx';
import MgmtGrid from '../components/management/MgmtGrid.jsx';
import { useGameData } from '../context/GameDataContext.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';
import { fetchOverrides, saveOverrides } from '../services/managementChoicesApi.js';
import { fetchSchema } from '../services/managementSchemaApi.js';
import { interpolate, computeFieldEffectsPreview } from '../components/utils/policyExpr.js';
import ManagementStatsTooltip from '../components/management/ManagementStatsTooltip.jsx';
import { projectSummaryWithChoices } from '../components/utils/policyProjector.js';

function defaultsFromSchema(schema) {
  const out = {};
  const fields = schema?.fields || {};
  for (const [id, def] of Object.entries(fields)) {
    const c = def.control || {};
    out[id] = (c.default ?? null);
  }
  return out;
}

function adaptSchemaToConfig(schema, ctx, choices, projected) {
  const fieldsIn = schema?.fields || {};
  const fields = {};
  for (const [id, def] of Object.entries(fieldsIn)) {
    const baseHelp = def.help;
    fields[id] = {
      label: def.label || id,
      help: (chs, tCtx) => {
        const c = { summary: projected, choices: chs || {} }; // brug projected
        return typeof baseHelp === 'string' ? interpolate(baseHelp, c) : baseHelp;
      },
      control: { ...(def.control || {}), key: id },
      tooltip: (chs) => {
        // Brug projected summary i preview
        const stats = computeFieldEffectsPreview(def, chs, projected);
        if (!stats || Object.keys(stats).length === 0) return null;
        return (
          <ManagementStatsTooltip headerMode="stats" title={def.label || id} stats={stats} translations={ctx?.translations} />
        );
      },
    };
  }
  return { fields };
}

export default function ManagementPageDynamic() {
  const { data: gameData } = useGameData();
  const { data: summary } = useHeaderSummary();

  const [activeKey, setActiveKey] = useState('health');
  const tabs = [{ key: 'health', label: 'Sundhed', emoji: '🧺' }];

  // --- STATE: sørg for at schema state er deklareret FØR noget bruger "schema" ---
  const [schema, setSchema] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [choices, setChoices] = useState({});
  const [snapshot, setSnapshot] = useState({});
  const dirty = useMemo(() => JSON.stringify(choices) !== JSON.stringify(snapshot), [choices, snapshot]);

  // Projected summary skal oprettes EFTER schema state er lavet (så 'schema' findes)
  const projectedSummary = useMemo(() => {
    if (!schema) return summary || {};
    return projectSummaryWithChoices(schema, choices, summary || {});
  }, [schema, choices, summary]);

  const ctx = useMemo(() => ({ summary: projectedSummary, gameData, translations: gameData?.i18n?.current ?? {} }), [projectedSummary, gameData]);

  const setChoice = (k, v) => setChoices(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sc = await fetchSchema(activeKey);
        if (!mounted) return;
        setSchema(sc);
        const dfl = defaultsFromSchema(sc);
        setDefaults(dfl);

        const server = await fetchOverrides(activeKey);
        const famOverrides = server[activeKey] || {};
        const merged = { ...dfl, ...famOverrides };
        setChoices(merged);
        setSnapshot(merged);
      } catch (e) {
        console.error('Schema/overrides load failed', e);
        setSchema(null);
        setDefaults({});
        setChoices({});
        setSnapshot({});
      }
    })();
    return () => { mounted = false; };
  }, [activeKey]);

  const onSave = async () => {
    const overrides = {};
    for (const [k, v] of Object.entries(choices)) {
      if (JSON.stringify(v) !== JSON.stringify(defaults[k])) overrides[k] = v;
    }
    await saveOverrides(activeKey, overrides, { replaceFamily: true });
    setSnapshot(choices);
  };
  const onRevert = () => setChoices(snapshot);

  const uiSections = useMemo(() => [
    {
      title: 'Ordninger',
      cols: 2,
      stageMin: 1,
      items: [
        { stack: ['health_free_dentist_kids', 'health_free_dentist_young', 'health_free_dentist_adults'], span: 1 },
        { id: 'health_subsidy_pct', span: 1 },
      ],
    },
    {
      title: 'Mål & strategi',
      cols: 2,
      stageMin: 2,
      items: [
        { id: 'health_wait_target_days', span: 1 },
        { id: 'health_mode',             span: 1 },
        { id: 'health_campaign_prevention', span: 2 },
      ],
    },
  ], []);

  const config = useMemo(() => {
    if (!schema) return null;
    const base = adaptSchemaToConfig(schema, ctx, choices, projectedSummary);
    return { ...base, sections: uiSections };
  }, [schema, ctx, choices, projectedSummary, uiSections]);

  return (
    <section className="panel section">
      <div className="section-head" style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:700 }}>Management</div>
        <Tabs tabs={tabs} value={activeKey} onChange={setActiveKey} showActions dirty={dirty} onSave={onSave} onRevert={onRevert} />
      </div>
      <div className="section-body">
        {config ? (
          <MgmtGrid
            config={config}
            choices={choices}
            setChoice={setChoice}
            currentStage={Number(summary?.stage?.current ?? gameData?.state?.user?.currentstage ?? 0)}
            tooltipCtx={ctx}
          />
        ) : (
          <div className="sub">Indlæser…</div>
        )}
      </div>
    </section>
  );
}