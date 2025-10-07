import React from 'react';
import * as MP from './managementparts.jsx';

// --- Hover indhold definere øverst (source-of-truth for tooltips) ---
const HOVER_CONTENTS = {
  traffic_lights_control: (
    <div style={{ maxWidth: 320 }}>
      <strong>Lysregulering</strong>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
        Aktiver signalstyring i kryds for bedre koordination. Øger fremkommelighed i kryds, men medfører driftomkostninger pr. kryds.
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Cost: ~0.5 DKK / kryds / tick (estimat). Effekt: +10% traffic_flow i regulerede kryds.
      </div>
    </div>
  ),

  traffic_adaptive_level: (choices) => (
    <div style={{ maxWidth: 320 }}>
      <strong>Adaptiv signalering</strong>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
        Niveau 0 = fra, 1..3 = stigende aggressivitet. Højere niveau giver bedre flow i komplekse kryds men øger drift.
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Aktuelt niveau: {choices?.traffic_adaptive_level ?? 0}
      </div>
    </div>
  ),

  traffic_speed_limit_pct: (
    <div style={{ maxWidth: 320 }}>
      <strong>Hastighedsgrænse</strong>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
        Indstil global hastighedsgrænse i procent af normalt. Lavere værdier reducerer ulykker men kan sænke gennemfart.
      </div>
    </div>
  ),

  traffic_public_transport_subsidy_pct: (
    <div style={{ maxWidth: 320 }}>
      <strong>Subsidie til offentlig transport</strong>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
        Procentvis subsidie der øger kollektiv brug. Kostbart men reducerer congestion og emission.
      </div>
    </div>
  ),

  // ... flere entries efter behov ...
};

const ZONES = [
  { value: 'center', label: 'Bycenter' },
  { value: 'north', label: 'Nord' },
  { value: 'south', label: 'Syd' },
  { value: 'east',  label: 'Øst' },
  { value: 'west',  label: 'Vest' },
];

export default function TrafficTab({ choices, setChoice }) {
  const toggleFromList = (key, val, checked) => {
    const cur = new Set(choices[key] || []);
    if (checked) cur.add(val); else cur.delete(val);
    setChoice(key, Array.from(cur));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <fieldset className="groupbox">
        <legend>Trafik regulering</legend>
        <div className="groupbox__content">
          <div className="mp-grid cols-3">
            <div className="mp-item span-1">
              {/* Her bruger vi HoverItem: hover kan være JSX eller funktion (function får choices som param) */}
<MP.DockHoverItem hover={() => HOVER_CONTENTS.traffic_lights_control} choices={choices}>
  <MP.Row label="Lysregulering (on/off)" help="Aktiver signalstyring i kryds.">
    <MP.Toggle
      checked={choices.traffic_lights_control}
      onChange={(v)=>setChoice('traffic_lights_control', v)}
      label={choices.traffic_lights_control ? 'Aktiveret' : 'Deaktiveret'}
    />
  </MP.Row>
</MP.DockHoverItem>
            </div>

            <div className="mp-item span-1">

                <MP.Row label="Adaptiv signalering" help="0=fra, 1..3=niveau">
                  <MP.NumberInput
                    value={choices.traffic_adaptive_level ?? 0}
                    onChange={(v)=>setChoice('traffic_adaptive_level', v === '' ? 0 : Number(v))}
                    min={0}
                    max={3}
                    step={1}
                  />
                </MP.Row>

            </div>

            <div className="mp-item span-1">

                <MP.Row label="Signal‑tæthed" help="Antal signaler pr. område (0–10).">
                  <MP.Slider
                    value={choices.traffic_signal_density}
                    onChange={(v)=>setChoice('traffic_signal_density', v)}
                    min={0} max={10} step={1}
                  />
                </MP.Row>

            </div>

            <div className="mp-item span-2">

                <MP.Row label="Hastighedsgrænse (procent)" help="0% = meget lav, 100% = normal.">
                  <MP.PercentSlider
                    value={choices.traffic_speed_limit_pct}
                    onChange={(v)=>setChoice('traffic_speed_limit_pct', v)}
                  />
                </MP.Row>

            </div>

            <div className="mp-item span-1">
   
                <MP.Row label="Enforcement intensitet" help="Højere værdi = mere kontrol">
                  <MP.Slider
                    value={choices.traffic_enforcement_pct}
                    onChange={(v)=>setChoice('traffic_enforcement_pct', v)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </MP.Row>

            </div>
          </div>
        </div>
      </fieldset>

      {/* --- Infrastruktur & politik --- */}
      <fieldset className="groupbox">
        <legend>Infrastruktur & politik</legend>
        <div className="groupbox__content">
          <div className="mp-grid cols-3">
            <div className="mp-item span-1">
              <MP.Row label="Offentlig transport - tilskud" help="Procentvis tilskud der øger kollektiv brug (koster budgettet).">
                <MP.PercentSlider
                  value={choices.traffic_public_transport_subsidy_pct}
                  onChange={(v)=>setChoice('traffic_public_transport_subsidy_pct', v)}
                />
              </MP.Row>
            </div>

            <div className="mp-item span-1">
              <MP.Row label="Parkering - pris pr. time" help="Indstilling af parkeringspris (DKK) — påvirker revenue/brug.">
                <MP.NumberInput
                  value={choices.traffic_parking_price ?? 0}
                  onChange={(v)=>setChoice('traffic_parking_price', v === '' ? 0 : Number(v))}
                  min={0}
                  max={500}
                  step={1}
                  suffix="DKK"
                />
              </MP.Row>
            </div>

            <div className="mp-item span-1">
              <MP.Row label="Gratis parkering zoner" help="Vælg zoner med gratis parkering (flere valg).">
                <MP.CheckboxGroup
                  value={choices.traffic_free_parking_zones}
                  onChange={(v)=>setChoice('traffic_free_parking_zones', v)}
                  options={ZONES}
                  columns={3}
                />
              </MP.Row>
            </div>

            <div className="mp-item span-2">
              <MP.Row label="One‑way streets (zoner)" help="Aktiver envejs-regler i valgte zoner for bedre lokal flow.">
                <MP.CheckboxGroup
                  value={choices.traffic_oneway_zones}
                  onChange={(v)=>setChoice('traffic_oneway_zones', v)}
                  options={ZONES}
                  columns={3}
                />
              </MP.Row>
            </div>

            <div className="mp-item span-1">
              <MP.Row label="Cycle lanes (zoner)" help="Tilføj cykelbaner i zoner — forbedrer bæredygtighed/popularity).">
                <MP.CheckboxGroup
                  value={choices.traffic_cyclelane_zones}
                  onChange={(v)=>setChoice('traffic_cyclelane_zones', v)}
                  options={ZONES}
                  columns={3}
                />
              </MP.Row>
            </div>

            <div className="mp-item span-3">
              <MP.Row label="Trafik‑tilstand (strategi)" help="Overordnet strategi for trafikstyring.">
                <MP.RadioGroup
                  value={choices.traffic_mode}
                  onChange={(v)=>setChoice('traffic_mode', v)}
                  options={[
                    { value: 'balanced', label: 'Balanceret' },
                    { value: 'eco',      label: 'Miljø' },
                    { value: 'speed',    label: 'Hurtighed' },
                  ]}
                  columns={3}
                />
              </MP.Row>
            </div>
          </div>
        </div>
      </fieldset>

      {/* --- Kampagner / midlertidige tiltag --- */}
      <fieldset className="groupbox">
        <legend>Kampagner & tiltag</legend>
        <div className="groupbox__content">
          <div className="mp-grid cols-2">
            <div className="mp-item span-1">
              <MP.Row label="Kampagne: Trafiksikkerhed" help="Aktiv kampagne der øger safety, koster pr. tick.">
                <MP.Toggle
                  checked={choices.traffic_campaign_safety}
                  onChange={(v)=>setChoice('traffic_campaign_safety', v)}
                  label={choices.traffic_campaign_safety ? 'Aktiv' : 'Inaktiv'}
                />
              </MP.Row>
            </div>

            <div className="mp-item span-1">
              <MP.Row label="Midlertidig hastighedsbegrænsning" help="Sæt en midlertidig lavere hastighed ved behov.">
                <MP.PercentSlider
                  value={choices.traffic_temp_speed_pct}
                  onChange={(v)=>setChoice('traffic_temp_speed_pct', v)}
                />
              </MP.Row>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}