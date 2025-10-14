import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import MgmtGrid from './MgmtGrid.jsx';
import { fetchOverrides, saveOverrides } from '../../services/managementChoicesApi.js';
import { fetchSchema } from '../../services/managementSchemaApi.js';
import { projectSummaryWithChoices } from '../utils/policyProjector.js';
import { adaptSchemaToConfig, sectionsByFamily } from '../../pages/ManagementPageDynamic.jsx';

export default function ManagementFamilyPanel({ family }) {
  const { data: gameData } = useGameData();
  const { data: summary } = useHeaderSummary();

  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [defaults, setDefaults] = useState({});
  const [choices, setChoices] = useState({});
  const [snapshot, setSnapshot] = useState({});
  const dirty = useMemo(() => JSON.stringify(choices) !== JSON.stringify(snapshot), [choices, snapshot]);

  // Client-konfiguration: har vi sektioner for denne family?
  const clientHasSections = useMemo(() => {
    const sec = sectionsByFamily?.[family];
    return Array.isArray(sec) && sec.length > 0;
  }, [family]);

  // Projected summary
  const projectedSummary = useMemo(() => {
    if (!schema) return summary || {};
    return projectSummaryWithChoices(schema, choices, summary || {});
  }, [schema, choices, summary]);

  // Owned state til krav
  const ownedState = useMemo(() => {
    if (summary?.state && typeof summary.state === 'object') return summary.state;
    if (gameData?.state && typeof gameData.state === 'object') return gameData.state;
    return {};
  }, [summary, gameData]);

  const ctx = useMemo(() => ({
    summary: projectedSummary,
    state: ownedState,
    gameData,
    translations: gameData?.i18n?.current ?? {}
  }), [projectedSummary, ownedState, gameData]);

  useEffect(() => {
    let mounted = true;

    // Reset state
    setLoading(true);
    setSchema(null);
    setSchemaMissing(false);
    setLoadError(null);
    setDefaults({});
    setChoices({});
    setSnapshot({});

    // Hvis vi IKKE har sektioner i klienten for denne family, så lad være at hente schema
    // → Undgå 404-kald og vis en pæn fallback.
    if (!clientHasSections) {
      setSchemaMissing(true);
      setLoading(false);
      return () => { mounted = false; };
    }

    (async () => {
      try {
        const sc = await fetchSchema(family);
        if (!mounted) return;

        // Ingen/blank schema -> behandl som "missing"
        if (!sc || !sc.fields || Object.keys(sc.fields).length === 0) {
          setSchemaMissing(true);
          setSchema(null);
          setLoading(false);
          return;
        }

        setSchema(sc);

        // Udled defaults fra schema
        const dfl = {};
        for (const [k, def] of Object.entries(sc?.fields || {})) {
          const c = def?.control || {};
          if ('default' in c) dfl[k] = c.default;
        }
        setDefaults(dfl);

        // Hent overrides for family
        const server = await fetchOverrides(family);
        const famOverrides = server[family] || {};
        const merged = { ...dfl, ...famOverrides };
        setChoices(merged);
        setSnapshot(merged);
        setLoading(false);
      } catch (e) {
        const msg = String(e?.message || e || '');
        // 404/E_NOTFOUND: vis pæn fallback uden at larme
        if (msg.includes('404') || msg.includes('E_NOTFOUND')) {
          if (mounted) {
            setSchemaMissing(true);
            setSchema(null);
            setLoading(false);
          }
          return;
        }
        if (mounted) {
          setLoadError(e);
          setLoading(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, [family, clientHasSections]);

  const onSave = async () => {
    const overrides = {};
    for (const [k, v] of Object.entries(choices)) {
      if (JSON.stringify(v) !== JSON.stringify(defaults[k])) overrides[k] = v;
    }
    await saveOverrides(family, overrides, { replaceFamily: true });
    setSnapshot(choices);
  };
  const onRevert = () => setChoices(snapshot);

  const uiSections = useMemo(() => sectionsByFamily[family] ?? [], [family]);

  const config = useMemo(() => {
    if (!schema || schemaMissing) return null;
    if (!uiSections || uiSections.length === 0) return null;
    const base = adaptSchemaToConfig(schema, ctx, choices, projectedSummary);
    return { ...base, sections: uiSections };
  }, [schema, schemaMissing, uiSections, ctx, choices, projectedSummary]);

  const currentStage = Number(summary?.stage?.current ?? gameData?.state?.user?.currentstage ?? 0);

  // Render guards
  if (!family) {
    return (
      <section className="panel section">
        <div className="section-head">Special</div>
        <div className="section-body"><div className="sub">Ukendt building family.</div></div>
      </section>
    );
  }

  if (!clientHasSections) {
    return (
      <section className="panel section">
        <div className="section-head">Special – {family}</div>
        <div className="section-body">
          <div className="sub">Der findes ingen management‑valg for denne bygning.</div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="panel section">
        <div className="section-head">Special – {family}</div>
        <div className="section-body"><div className="sub">Indlæser…</div></div>
      </section>
    );
  }

  if (schemaMissing || !uiSections || uiSections.length === 0) {
    return (
      <section className="panel section">
        <div className="section-head">Special – {family}</div>
        <div className="section-body">
          <div className="sub">Der findes ingen management‑valg for denne bygning.</div>
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="panel section">
        <div className="section-head">Special – {family}</div>
        <div className="section-body">
          <div className="sub">Kunne ikke indlæse data for {family}.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel section">
      <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Management – {family}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onRevert} disabled={!dirty}>Fortryd</button>
          <button className="btn primary" onClick={onSave} disabled={!dirty}>Gem</button>
        </div>
      </div>
      <div className="section-body">
        {config ? (
          <MgmtGrid
            config={config}
            choices={choices}
            setChoice={(k, v) => setChoices(prev => ({ ...prev, [k]: v }))}
            currentStage={currentStage}
            tooltipCtx={ctx}
          />
        ) : (
          <div className="sub">Ingen felter at vise.</div>
        )}
      </div>
    </section>
  );
}