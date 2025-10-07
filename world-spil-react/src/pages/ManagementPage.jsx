import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import { Section, Row, Toggle, NumberInput, Slider, PercentSlider, CheckboxGroup, RadioGroup, Select  } from '../components/ManagementParts.jsx';

// Lokal lagring (kan senere skiftes til backend)
const LS_KEY = 'ws.policies.choices.v1';

// Simpel helper til localStorage
function loadChoices() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveChoices(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
}



// Fanenavigation (simpel)
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
      {tabs.map(t => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              border: 'none',
              background: isActive ? '#e6f0ff' : 'rgba(255,255,255,.03)',
              padding: '8px 12px',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontWeight: isActive ? 700 : 500
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// Defaultvalg (hardcoded – kan kopieres/udvides)
const DEFAULTS = {
  // Trafik
  traffic_lights_control: false,        // on/off
  traffic_speed_limit_pct: 50,          // procent-slider (0..100)
  traffic_free_parking_zones: [],       // multi-checkbox liste
  traffic_signal_density: 5,            // min/max slider (0..10)
  traffic_mode: 'balanced',             // radio (balanced / eco / speed)

  // Politi
  police_salary: 30000,                 // number input
  police_campaign_traffic: false,       // toggle
  police_patrol_strategy: 'mixed',      // radio
  police_priority_areas: [],            // multi-checkbox

  // Offentlig
  free_dentist_children: false,         // toggle
  free_dentist_young: false,            // toggle
  public_health_subsidy_pct: 0,         // procent-slider
  public_benefit_mode: 'none',          // select
};

const ZONES = [
  { value: 'center', label: 'Bycenter' },
  { value: 'north', label: 'Nord' },
  { value: 'south', label: 'Syd' },
  { value: 'east',  label: 'Øst' },
  { value: 'west',  label: 'Vest' },
];

const PATROL_AREAS = [
  { value: 'schools', label: 'Skoler' },
  { value: 'stadium', label: 'Stadion' },
  { value: 'harbor',  label: 'Havn' },
  { value: 'mall',    label: 'Indkøbscenter' },
];

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState('traffic');
  const [choices, setChoices] = useState(() => ({ ...DEFAULTS, ...(loadChoices() || {}) }));
  const [dirty, setDirty] = useState(false);
  const [savedToast, setSavedToast] = useState('');

  // Markér dirty når choices ændres ift. localStorage snapshot
  useEffect(() => {
    const saved = loadChoices() || {};
    setDirty(JSON.stringify(saved) !== JSON.stringify(choices));
  }, [choices]);

  const setChoice = (key, val) => {
    setChoices(prev => ({ ...prev, [key]: val }));
  };

  const saveAll = () => {
    saveChoices(choices);
    setDirty(false);
    setSavedToast('Valg gemt');
    setTimeout(() => setSavedToast(''), 1600);
  };

  const resetToDefaults = () => {
    setChoices({ ...DEFAULTS });
  };

  const revertToSaved = () => {
    setChoices({ ...DEFAULTS, ...(loadChoices() || {}) });
  };

  // “Preview” område – kun for at vise hvad der gemmes (kan fjernes)
  const preview = useMemo(() => JSON.stringify(choices, null, 2), [choices]);

  return (
    <section className="panel section">
        <div className="section-head">
            <div style={{ padding: 16 }}>
            Politikker & Indstillinger
        <div className="section-body">
      <Tabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'traffic', label: 'Trafik' },
          { key: 'police',  label: 'Politi' },
          { key: 'fire',    label: 'Brandvæsen' },
          { key: 'health', label: 'Sundhedsvæsen' },
          { key: 'public',  label: 'Offentlig' },
          { key: 'misc',    label: 'Flere eksempler' },
        ]}
      />

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={saveAll} disabled={!dirty} style={{ padding: '6px 10px' }}>
          Gem alle
        </button>
        <button onClick={revertToSaved} style={{ padding: '6px 10px' }}>
          Fortryd ikke-gemte ændringer
        </button>
        <button onClick={resetToDefaults} style={{ padding: '6px 10px' }}>
          Nulstil til standard
        </button>
        {savedToast && <span style={{ marginLeft: 8, color: '#2d7' }}>{savedToast}</span>}
      </div>

      {/* Indhold per fane */}
      {activeTab === 'traffic' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Section title="Kontrol">
            <Row label="Lysregulering (on/off)" help="Aktiverer signalstyring i kryds. Koster evt. noget per tick (backend senere).">
              <Toggle
                checked={choices.traffic_lights_control}
                onChange={(v)=>setChoice('traffic_lights_control', v)}
                label={choices.traffic_lights_control ? 'Aktiveret' : 'Deaktiveret'}
              />
            </Row>
            <Row label="Hastighedsgrænse (procent)" help="Procent af norm – 0% = meget lav hastighed, 100% = normal.">
              <PercentSlider
                value={choices.traffic_speed_limit_pct}
                onChange={(v)=>setChoice('traffic_speed_limit_pct', v)}
              />
            </Row>
            <Row label="Signal‑tæthed" help="Hvor mange signaler pr. område (0–10).">
              <Slider
                value={choices.traffic_signal_density}
                onChange={(v)=>setChoice('traffic_signal_density', v)}
                min={0}
                max={10}
                step={1}
              />
            </Row>
          </Section>

          <Section title="Zoner">
            <Row label="Gratis parkering (flere valg)" help="Vælg zoner med gratis parkering.">
              <CheckboxGroup
                value={choices.traffic_free_parking_zones}
                onChange={(v)=>setChoice('traffic_free_parking_zones', v)}
                options={ZONES}
                columns={3}
              />
            </Row>
            <Row label="Trafik‑tilstand" help="Overordnet strategi.">
              <RadioGroup
                value={choices.traffic_mode}
                onChange={(v)=>setChoice('traffic_mode', v)}
                options={[
                  { value: 'balanced', label: 'Balanceret' },
                  { value: 'eco',      label: 'Miljø' },
                  { value: 'speed',    label: 'Hurtighed' },
                ]}
                columns={3}
              />
            </Row>
          </Section>
        </div>
      )}

      {activeTab === 'police' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Section title="Økonomi">
            <Row label="Løn (DKK per officer)" help="Guideline baseline ~ 30.000 DKK. Justér efter behov.">
              <NumberInput
                value={choices.police_salary}
                onChange={(v)=>setChoice('police_salary', v)}
                min={10000}
                max={100000}
                step={500}
                suffix="DKK"
              />
            </Row>
          </Section>

          <Section title="Indsatser">
            <Row label="Kampagne: Trafiksikkerhed" help="Aktiv kampagne der forbedrer trafikforhold, koster per tick (backend senere).">
              <Toggle
                checked={choices.police_campaign_traffic}
                onChange={(v)=>setChoice('police_campaign_traffic', v)}
                label={choices.police_campaign_traffic ? 'Aktiv' : 'Inaktiv'}
              />
            </Row>
            <Row label="Patruljestrategi" help="Vælg overordnet patruljeprioritet.">
              <RadioGroup
                value={choices.police_patrol_strategy}
                onChange={(v)=>setChoice('police_patrol_strategy', v)}
                options={[
                  { value: 'visible', label: 'Synlig patrulje' },
                  { value: 'rapid',   label: 'Hurtig respons' },
                  { value: 'mixed',   label: 'Blandet' },
                ]}
                columns={3}
              />
            </Row>
            <Row label="Prioriterede områder" help="Vælg flere fokusområder.">
              <CheckboxGroup
                value={choices.police_priority_areas}
                onChange={(v)=>setChoice('police_priority_areas', v)}
                options={PATROL_AREAS}
                columns={2}
              />
            </Row>
          </Section>
        </div>
      )}

      {activeTab === 'public' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Section title="Tandlæge‑ordninger">
            <Row label="Gratis tandlæge — børn" help="Koster pr. barn; kan øge health/popularity (styres i effects_rules).">
              <Toggle
                checked={choices.free_dentist_children}
                onChange={(v)=>setChoice('free_dentist_children', v)}
                label={choices.free_dentist_children ? 'Aktiv' : 'Inaktiv'}
              />
            </Row>
            <Row label="Gratis tandlæge — unge" help="Koster pr. ung; kan øge health/popularity.">
              <Toggle
                checked={choices.free_dentist_young}
                onChange={(v)=>setChoice('free_dentist_young', v)}
                label={choices.free_dentist_young ? 'Aktiv' : 'Inaktiv'}
              />
            </Row>
            <Row label="Tilskud til sundhed (procent)" help="Globalt tilskud – bruges som procent i backend.">
              <PercentSlider
                value={choices.public_health_subsidy_pct}
                onChange={(v)=>setChoice('public_health_subsidy_pct', v)}
              />
            </Row>
          </Section>

          <Section title="Øvrigt">
            <Row label="Ydelses‑model" help="Vælg fordelingsmodel (eksempel).">
              <Select
                value={choices.public_benefit_mode}
                onChange={(v)=>setChoice('public_benefit_mode', v)}
                options={[
                  { value: 'none',    label: 'Ingen' },
                  { value: 'poverty', label: 'Fattigdoms‑fokus' },
                  { value: 'kids',    label: 'Børn‑fokus' },
                  { value: 'elderly', label: 'Ældre‑fokus' },
                ]}
              />
            </Row>
          </Section>
        </div>
      )}

      {activeTab === 'misc' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Section
            title="Eksempler og idéer"
            right={<span style={{ fontSize: 12, opacity: 0.7 }}>Kun UI‑eksempler</span>}
          >
            <Row label="Min/max slider" help="0–10 (heltal)">
              <Slider
                value={choices.traffic_signal_density}
                onChange={(v)=>setChoice('traffic_signal_density', v)}
                min={0}
                max={10}
                step={1}
              />
            </Row>
            <Row label="Procent‑slider" help="0–100%">
              <PercentSlider
                value={choices.traffic_speed_limit_pct}
                onChange={(v)=>setChoice('traffic_speed_limit_pct', v)}
              />
            </Row>
            <Row label="Checkbox (enkelt)">
              <Toggle
                checked={choices.traffic_lights_control}
                onChange={(v)=>setChoice('traffic_lights_control', v)}
                label="Et simpelt on/off eksempel"
              />
            </Row>
            <Row label="Checkbox (flere valg)">
              <CheckboxGroup
                value={choices.police_priority_areas}
                onChange={(v)=>setChoice('police_priority_areas', v)}
                options={PATROL_AREAS}
                columns={2}
              />
            </Row>
            <Row label="Dropdown (single)">
              <Select
                value={choices.public_benefit_mode}
                onChange={(v)=>setChoice('public_benefit_mode', v)}
                options={[
                  { value: 'none',    label: 'Ingen' },
                  { value: 'poverty', label: 'Fattigdoms‑fokus' },
                  { value: 'kids',    label: 'Børn‑fokus' },
                  { value: 'elderly', label: 'Ældre‑fokus' },
                ]}
              />
            </Row>
            <Row label="Talfelt (med baseline)">
              <NumberInput
                value={choices.police_salary}
                onChange={(v)=>setChoice('police_salary', v)}
                min={10000}
                max={100000}
                step={500}
                suffix="DKK"
              />
            </Row>
          </Section>

          <Section title="Forhåndsvisning (hvad der gemmes)">
            <pre style={{
              margin: 0,
              padding: 12,
              background: '#0b1020',
              color: '#c9e1ff',
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 300
            }}>
{preview}
            </pre>
          </Section>
        </div>
      )}
    </div></div></div>
    </section>
  );
}