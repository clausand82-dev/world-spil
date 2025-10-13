import React, { useEffect, useMemo, useState } from 'react';
import Tabs from '../components/ui/Tabs.jsx';
import MgmtGrid from '../components/management/MgmtGrid.jsx';
import { useGameData } from '../context/GameDataContext.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';
import { MANAGEMENT_FIELDS_REGISTRY } from '../components/management/fields/index.js';
import { fetchOverrides, saveOverrides } from '../services/managementChoicesApi.js';

function computeDefaults(config) {
  const out = {};
  for (const [id, cfg] of Object.entries(config.fields || {})) {
    const c = cfg.control || {};
    const key = c.key || id;
    if (out[key] === undefined) out[key] = (c.default ?? null);
  }
  return out;
}
function computeOverridesOnly(allChoices, defaults) {
  const o = {};
  for (const [k, v] of Object.entries(allChoices || {})) {
    if (JSON.stringify(v) !== JSON.stringify(defaults[k])) o[k] = v;
  }
  return o;
}

export default function ManagementPageDynamic() {
  const { data: gameData } = useGameData();
  const { data: summary } = useHeaderSummary();

  const [activeKey, setActiveKey] = useState('health');
  const tabs = [{ key: 'health', label: 'Sundhed', emoji: '🧺' }];

  const ctx = useMemo(() => ({ summary, gameData, translations: gameData?.i18n?.current ?? {} }), [summary, gameData]);

  const defineForActive = MANAGEMENT_FIELDS_REGISTRY[activeKey];
  const config = useMemo(() => (defineForActive ? defineForActive({ ...ctx, choices: {} }) : null), [defineForActive, ctx]);

  const defaults = useMemo(() => (config ? computeDefaults(config) : {}), [config]);
  const [choices, setChoices] = useState(defaults);
  const [snapshot, setSnapshot] = useState(defaults);
  const dirty = useMemo(() => JSON.stringify(choices) !== JSON.stringify(snapshot), [choices, snapshot]);
  const setChoice = (k, v) => setChoices(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const server = await fetchOverrides(activeKey);
        const famOverrides = server[activeKey] || {};
        const merged = { ...defaults, ...famOverrides };
        if (!mounted) return;
        setChoices(merged);
        setSnapshot(merged);
      } catch {
        setChoices(defaults);
        setSnapshot(defaults);
      }
    })();
    return () => { mounted = false; };
  }, [activeKey, JSON.stringify(defaults)]);

  const onSave = async () => {
    const overrides = computeOverridesOnly(choices, defaults);
    await saveOverrides(activeKey, overrides, { replaceFamily: true });
    setSnapshot(choices);
  };
  const onRevert = () => setChoices(snapshot);

  return (
    <section className="panel section">
      <div className="section-head" style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:700 }}>Management</div>
        <Tabs tabs={tabs} value={activeKey} onChange={setActiveKey} showActions dirty={dirty} onSave={onSave} onRevert={onRevert} />
      </div>
      <div className="section-body">
        {config ? (
          <MgmtGrid
            config={defineForActive({ ...ctx, choices })}
            choices={choices}
            setChoice={setChoice}
            currentStage={Number(summary?.stage?.current ?? gameData?.state?.user?.currentstage ?? 0)}
            tooltipCtx={ctx}
          />
        ) : (
          <div className="sub">Ingen konfiguration for fanen.</div>
        )}
      </div>
    </section>
  );
}