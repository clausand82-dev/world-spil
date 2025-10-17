import React, { useEffect, useMemo, useState } from 'react';
import Tabs from '../components/ui/Tabs.jsx';
import MgmtGrid from '../components/management/MgmtGrid.jsx';
import { useGameData } from '../context/GameDataContext.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';
import { fetchOverrides, saveOverrides } from '../services/managementChoicesApi.js';
import { fetchSchema } from '../services/managementSchemaApi.js';
import { interpolate, computeFieldEffectsPreview } from '../components/utils/policyExpr.js';
import { projectSummaryWithChoices } from '../components/utils/policyProjector.js';
import ManagementStatsTooltip from '../components/management/ManagementStatsTooltip.jsx';
import { addSummaryRefreshListener, removeSummaryRefreshListener } from '../events/summaryEvents.js';

/**
 * Tabs/families der kan vælges i toppen.
 * Tilføj flere families ved at tilføje entries her (og oprette tilsvarende schema JSON i backend/data/policies/<family>.json).
 */
const TABS = [
  { key: 'health', label: 'Sundhed', emoji: '🧺' },
 { key: 'police',  label: 'Politi',   emoji: '👮' },
  // { key: 'traffic', label: 'Trafik',   emoji: '🚦' },
  // { key: 'public',  label: 'Offentligt', emoji: '🏛️' },
];

/**
 * Sektioner pr. family (faneblad). Items refererer til field keys i det pågældende family‑schema.
 * Tilføj en nøgle for hver ny family (fx "police") med egne sektioner/items.
 */
export const sectionsByFamily = {
  health: [
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
  ],

  //Eksempel: (kræver backend/data/policies/police.json med de nævnte keys)
  police: [
    {
      title: 'Politi-indsats',
      cols: 2,
      stageMin: 1,
      items: [
        { id: 'police_patrol_density', span: 1 },
        { id: 'police_camera_toggle',  span: 1 },
      ],
    },
    {
      title: 'Strategi',
      cols: 2,
      stageMin: 2,
      items: [
        { id: 'police_strategy', span: 2 },
      ],
    },
  ],
};

function defaultsFromSchema(schema) {
  const out = {};
  const fields = schema?.fields || {};
  for (const [id, def] of Object.entries(fields)) {
    const c = def.control || {};
    out[id] = (c.default ?? null);
  }
  return out;
}

export function adaptSchemaToConfig(schema, ctx, choices, projected) {
  const fieldsIn = schema?.fields || {};
  const fields = {};
  for (const [id, def] of Object.entries(fieldsIn)) {
    const baseHelp = def.help;
    fields[id] = {
      label: def.label || id,
      help: (chs) => {
        const c = { summary: projected, choices: chs || {} };
        return typeof baseHelp === 'string' ? interpolate(baseHelp, c) : baseHelp;
      },
      stageMin: def.stageMin,
      stageMax: def.stageMax,
      showWhenLocked: def.showWhenLocked,
      requires: def.requires || null,
      control: { ...(def.control || {}), key: id },
      tooltip: (chs) => {
        const stats = computeFieldEffectsPreview(def, chs, projected);
        if (!stats || Object.keys(stats).length === 0) return null;
        return (
          <ManagementStatsTooltip
            headerMode="stats"
            title={def.label || id}
            subtitle=""
            stats={stats}
            translations={ctx?.translations}
          />
        );
      },
    };
  }
  return { fields };
}

export default function ManagementPageDynamic() {
  const { data: gameData } = useGameData();
  const { data: summary } = useHeaderSummary();

  // DEBUG: bekræft at komponenten mountes og hvilke keys den ser
  console.debug('ManagementPageDynamic mounted', { activeKey: TABS[0]?.key, summaryLoaded: !!summary, gameDataLoaded: !!gameData });

  const [activeKey, setActiveKey] = useState(TABS[0]?.key || 'health');

  // Om klienten leverer sections-konfiguration (bruges som dependency i effect)
  const clientHasSections = Object.keys(sectionsByFamily || {}).length > 0;

  const [schema, setSchema] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [choices, setChoices] = useState({});
  const [snapshot, setSnapshot] = useState({});
  const dirty = useMemo(() => JSON.stringify(choices) !== JSON.stringify(snapshot), [choices, snapshot]);

  // Projected summary til hover/help
  const projectedSummary = useMemo(() => {
    if (!schema) return summary || {};
    return projectSummaryWithChoices(schema, choices, summary || {});
  }, [schema, choices, summary]);

  // Ejer-state til krav: brug summary.state hvis den findes, ellers gameData.state
  const ownedState = useMemo(() => {
    if (summary?.state && typeof summary.state === 'object') return summary.state;
    if (gameData?.state && typeof gameData.state === 'object') return gameData.state;
    return {};
  }, [summary, gameData]);

  const ctx = useMemo(() => ({
    summary: projectedSummary,
    state: ownedState,     // GIV eksplicit state til MgmtGrid/requirements
    gameData,
    translations: gameData?.i18n?.current ?? {}
  }), [projectedSummary, ownedState, gameData]);

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
  }, [activeKey, clientHasSections]);
 
  // Genindlæs kun overrides når vi modtager summary-refresh eller overridesSaved events
  useEffect(() => {
    let mounted = true;

    const refreshOverrides = async () => {
      try {
        // Hent overrides fra server for aktiv family
        const server = await fetchOverrides(activeKey);
        if (!mounted) return;
        const famOverrides = server[activeKey] || {};

        // Udled defaults fra allerede hentet schema (fallback hvis schema mangler)
        const dfl = {};
        if (schema && schema.fields) {
          for (const [k, def] of Object.entries(schema.fields || {})) {
            const c = def?.control || {};
            if ('default' in c) dfl[k] = c.default;
          }
        }

        const merged = { ...dfl, ...famOverrides };
        setDefaults(dfl);
        setChoices(merged);
        setSnapshot(merged);

      } catch (e) {
        if (mounted) console.warn('ManagementPageDynamic: failed to refresh overrides', e);
      }
    };

    // Lyt på summary refresh events — payload kan indeholde { family }
    const onSummary = ({ family } = {}) => {
      // hvis payload angiver familie, kun refresh hvis den matcher aktiv family
      if (family && family !== activeKey) return;
      // ellers kør refresh
      refreshOverrides();
    };

    addSummaryRefreshListener(onSummary);
    // cleanup
    return () => {
      mounted = false;
      removeSummaryRefreshListener(onSummary);
    };
  }, [activeKey, schema]);

  const onSave = async () => {
    const overrides = {};
    for (const [k, v] of Object.entries(choices)) {
      if (JSON.stringify(v) !== JSON.stringify(defaults[k])) overrides[k] = v;
    }
    await saveOverrides(activeKey, overrides, { replaceFamily: true });
    setSnapshot(choices);
  };
  const onRevert = () => setChoices(snapshot);

  const uiSections = useMemo(() => sectionsByFamily[activeKey] ?? [], [activeKey]);

  const config = useMemo(() => {
    if (!schema) return null;
    const base = adaptSchemaToConfig(schema, ctx, choices, projectedSummary);
    return { ...base, sections: uiSections };
  }, [schema, ctx, choices, projectedSummary, uiSections]);

  return (
    <section className="panel section">
      <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Management</div>
        <Tabs
          tabs={TABS}
          value={activeKey}
          onChange={setActiveKey}
          showActions
          dirty={dirty}
          onSave={onSave}
          onRevert={onRevert}
        />
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