import React from 'react';
import * as MP from './managementparts.jsx';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';

/* ===== Data og konstanter (ALT samlet ét sted) ===== */

const ZONES = [
  { value: 'center', label: 'Bycenter' },
  { value: 'north',  label: 'Nord' },
  { value: 'south',  label: 'Syd' },
  { value: 'east',   label: 'Øst' },
  { value: 'west',   label: 'Vest' },
];

const APROX_TEXT = "Tallene er vejledende" // Ens tekst der bruges under hver hover overskrift

/**
 * FIELDS – definér hvert felt én gang.
 * - label: vises i MP.Row
 * - help: lille hjælpetekst
 * - hover: JSX eller (choices) => JSX (til DockHoverCard)
 * - render: (choices, setChoice) => JSX (selve input-kontrollen)
 */
const FIELDS = {
  public_toilet_access: {
    label: 'Gratis offentlige toiletter (on/off)',
    help: 'Aktiverer om toiletter er gratis og tilgængelige for alle eller ej.',
    hover: (choices, ctx) => {
      const water_cap = Number(ctx?.summary?.capacities?.waterCapacity ?? 0);
      const water_usage = Number(ctx?.summary?.usages?.useWater?.total ?? 0);
      const water_new_usage = water_usage*0.01;
      const water_dif = water_usage - water_cap;
      return (
    <div style={{ maxWidth: 380 }}>
      <div style={{ fontWeight: 700, marginBottom: 0 }}>Gratis Offentlige toiletter</div>
      <div style={{ fontWeight: 0, marginBottom: 8, fontSize: 11, color: '#666' }}>{APROX_TEXT}</div>
      
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Hygiejne</div>
              <div style={{ fontSize: 11, color: '#666' }}>Øger hygiejne med 1%</div>
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 60 }}>XXX</div>
          </div>        
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Renlighed</div>
              <div style={{ fontSize: 11, color: '#666' }}>Øger renlighed med 2%</div>
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 60 }}>XXX</div>
          </div>        
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Vandforbrug</div>
              <div style={{ fontSize: 11, color: '#666' }}>Øger vandforbrug med 1% (fra {water_usage} til {water_usage + water_new_usage})</div>
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 60 }}>+{water_new_usage}</div>
          </div>
        </div>

    </div>

    
    );
    },
    render: (choices, setChoice) => (
      <MP.Toggle
        checked={!!choices.public_toilet_access}
        onChange={(v)=>setChoice('public_toilet_access', v)}
        label={choices.public_toilet_access ? 'Aktiveret' : 'Deaktiveret'}
      />
    ),
  },

  traffic_adaptive_level: {
    label: 'Adaptiv signalering',
    help: '0 = fra, 1..3 = stigende aggressivitet.',
    hover: (choices) => (
      <div style={{ maxWidth: 360 }}>
        <strong>Adaptiv signalering</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Højere niveau kan forbedre flow i komplekse kryds mod højere drift.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Aktuelt niveau: {choices?.traffic_adaptive_level ?? 0}
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.NumberInput
        value={choices.traffic_adaptive_level ?? 0}
        onChange={(v)=>setChoice('traffic_adaptive_level', v === '' ? 0 : Number(v))}
        min={0}
        max={3}
        step={1}
      />
    ),
  },

  traffic_signal_density: {
    label: 'Signal‑tæthed',
    help: 'Antal signaler pr. område (0–10).',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Signal‑tæthed</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Flere signaler kan stabilisere flow men sænker gennemsnitshastighed.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.Slider
        value={choices.traffic_signal_density}
        onChange={(v)=>setChoice('traffic_signal_density', v)}
        min={0}
        max={10}
        step={1}
      />
    ),
  },

  traffic_speed_limit_pct: {
    label: 'Hastighedsgrænse (procent)',
    help: '0% = meget lav, 100% = normal.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Hastighedsgrænse</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Lavere værdi mindsker ulykker/emission men kan sænke flow.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.PercentSlider
        value={choices.traffic_speed_limit_pct}
        onChange={(v)=>setChoice('traffic_speed_limit_pct', v)}
      />
    ),
  },

  traffic_enforcement_pct: {
    label: 'Enforcement intensitet',
    help: 'Højere værdi = mere kontrol.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Enforcement intensitet</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Øget kontrol kan forbedre sikkerhed og efterlevelse (kan påvirke popularitet).
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.Slider
        value={choices.traffic_enforcement_pct}
        onChange={(v)=>setChoice('traffic_enforcement_pct', v)}
        min={0}
        max={100}
        step={5}
      />
    ),
  },

  traffic_public_transport_subsidy_pct: {
    label: 'Offentlig transport – tilskud',
    help: 'Øger kollektiv brug (koster budgettet).',
    hover: (choices, ctx) => {
      const persons = Number(ctx?.summary?.citizens?.totals?.totalPersons ?? 0);
      const pct = Number(choices?.traffic_public_transport_subsidy_pct ?? 0);
      const est = persons * (pct / 100) * 0.01; // eksempel
      return (
        <div style={{ maxWidth: 360 }}>
          <strong>Offentlig transport – tilskud</strong>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
            Reducerer trængsel/emission; påvirker økonomi.
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Estimeret omkostning pr. tick: ~{est.toFixed(2)} DKK
          </div>
        </div>
      );
    },
    render: (choices, setChoice) => (
      <MP.PercentSlider
        value={choices.traffic_public_transport_subsidy_pct}
        onChange={(v)=>setChoice('traffic_public_transport_subsidy_pct', v)}
      />
    ),
  },

  traffic_parking_price: {
    label: 'Parkering – pris pr. time',
    help: 'Påvirker brug og indtjening.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Parkering – pris</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          For høj pris kan skubbe trafik væk fra centrum.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.NumberInput
        value={choices.traffic_parking_price ?? 0}
        onChange={(v)=>setChoice('traffic_parking_price', v === '' ? 0 : Number(v))}
        min={0}
        max={500}
        step={1}
        suffix="DKK"
      />
    ),
  },

  traffic_free_parking_zones: {
    label: 'Gratis parkering (zoner)',
    help: 'Vælg zoner med gratis parkering.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Gratis parkering (zoner)</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Øger besøgende; kan sænke parkeringsindtægt.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.CheckboxGroup
        value={choices.traffic_free_parking_zones}
        onChange={(v)=>setChoice('traffic_free_parking_zones', v)}
        options={ZONES}
        columns={3}
      />
    ),
  },

  traffic_oneway_zones: {
    label: 'One‑way streets (zoner)',
    help: 'Aktiver envejs-regler i zoner.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Envejs‑gader</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Kan forbedre lokalt flow i udvalgte kvarterer.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.CheckboxGroup
        value={choices.traffic_oneway_zones}
        onChange={(v)=>setChoice('traffic_oneway_zones', v)}
        options={ZONES}
        columns={3}
      />
    ),
  },

  traffic_cyclelane_zones: {
    label: 'Cycle lanes (zoner)',
    help: 'Cykelbaner i udvalgte zoner.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Cykelbaner</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Forbedrer sikkerhed/bæredygtighed; kan påvirke bilkapacitet.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.CheckboxGroup
        value={choices.traffic_cyclelane_zones}
        onChange={(v)=>setChoice('traffic_cyclelane_zones', v)}
        options={ZONES}
        columns={3}
      />
    ),
  },

  traffic_mode: {
    label: 'Trafik‑tilstand (strategi)',
    help: 'Overordnet strategi.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Trafik‑tilstand</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Balanceret, miljø eller hastigheds‑fokus.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
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
    ),
  },

  traffic_campaign_safety: {
    label: 'Kampagne: Trafiksikkerhed',
    help: 'Midlertidigt tiltag der øger safety.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Kampagne: Trafiksikkerhed</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Koster løbende mens aktiv; forbedrer sikkerhed.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.Toggle
        checked={!!choices.traffic_campaign_safety}
        onChange={(v)=>setChoice('traffic_campaign_safety', v)}
        label={choices.traffic_campaign_safety ? 'Aktiv' : 'Inaktiv'}
      />
    ),
  },

  traffic_temp_speed_pct: {
    label: 'Midlertidig hastighedsbegrænsning',
    help: 'Brug ved events/vejarbejde.',
    hover: (
      <div style={{ maxWidth: 360 }}>
        <strong>Midlertidig hastighed</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
          Global midlertidig reduktion i hastighed.
        </div>
      </div>
    ),
    render: (choices, setChoice) => (
      <MP.PercentSlider
        value={choices.traffic_temp_speed_pct}
        onChange={(v)=>setChoice('traffic_temp_speed_pct', v)}
      />
    ),
  },
};

/**
 * SECTIONS – layoutet, nemt at ændre uden at røre felterne.
 * items kan være:
 * - { id, span } for enkelt felt
 * - { type: 'stack', span, items: [{ id }, { id }, ...] } for usynlig gruppe (vertikal stak)
 */
const SECTIONS = [
  {
    title: 'Trafik regulering',
    cols: 3,
    items: [
      { id: 'public_toilet_access',  span: 1 },
      { id: 'traffic_adaptive_level',  span: 1 },
      { id: 'traffic_signal_density',  span: 1 },
      { id: 'traffic_speed_limit_pct', span: 2 },
      { id: 'traffic_enforcement_pct', span: 1 },
    ],
  },
  {
    title: 'Infrastruktur & politik',
    cols: 3,
    items: [
      // Eksempel: stak – flere “bokse” under hinanden i samme kolonne
      {
        type: 'stack',
        span: 1,
        items: [
          { id: 'traffic_free_parking_zones' },
          { id: 'traffic_cyclelane_zones' },
        ],
      },
      { id: 'traffic_public_transport_subsidy_pct', span: 1 },
      { id: 'traffic_parking_price',                span: 1 },
      { id: 'traffic_oneway_zones',                 span: 2 },
      { id: 'traffic_mode',                         span: 3 },
    ],
  },
  {
    title: 'Kampagner & tiltag',
    cols: 2,
    items: [
      { id: 'traffic_campaign_safety', span: 1 },
      { id: 'traffic_temp_speed_pct',  span: 1 },
    ],
  },
];

/* ===== Hjælpere til rendering (modtager ctx) ===== */

function FieldCell({ id, span, choices, setChoice, ctx }) {
  const cfg = FIELDS[id];
  if (!cfg) return null;
  const hoverContent = typeof cfg.hover === 'function' ? cfg.hover(choices, ctx) : cfg.hover;

  return (
    <DockHoverCard content={hoverContent}>
      <div className={`mp-item span-${Math.max(1, Math.min(3, span || 1))}`}>
        <MP.Row label={cfg.label} help={cfg.help}>
          {cfg.render(choices, setChoice, ctx)}
        </MP.Row>
      </div>
    </DockHoverCard>
  );
}

function FieldStack({ span, items, choices, setChoice, ctx, gap = 10 }) {
  return (
    <div className={`mp-item span-${Math.max(1, Math.min(3, span || 1))}`}>
      <div style={{ display: 'grid', gap }}>
        {items.map((it, idx) => {
          const cfg = FIELDS[it.id];
          if (!cfg) return null;
          const hoverContent = typeof cfg.hover === 'function' ? cfg.hover(choices, ctx) : cfg.hover;
          return (
            <DockHoverCard key={`${it.id}-${idx}`} content={hoverContent}>
              <div>
                <MP.Row label={cfg.label} help={cfg.help}>
                  {cfg.render(choices, setChoice, ctx)}
                </MP.Row>
              </div>
            </DockHoverCard>
          );
        })}
      </div>
    </div>
  );
}

/* ===== Komponent ===== */

export default function TrafficTab({ choices, setChoice }) {
  // Hent data fra hooks (lovligt her)
  const { data: summary } = useHeaderSummary();
  const { data: gameData } = useGameData();

  // Byg en ctx som sendes videre til alle felter
  const ctx = { summary, gameData };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {SECTIONS.map((sec) => (
        <fieldset key={sec.title} className="groupbox">
          <legend>{sec.title}</legend>
          <div className="groupbox__content">
            <div className={`mp-grid cols-${Math.max(1, Math.min(3, sec.cols || 1))}`}>
              {sec.items.map((it, i) => {
                if (it.type === 'stack') {
                  return (
                    <FieldStack
                      key={`stack-${i}`}
                      span={it.span}
                      items={it.items || []}
                      choices={choices}
                      setChoice={setChoice}
                      ctx={ctx}
                    />
                  );
                }
                return (
                  <FieldCell
                    key={it.id || `cell-${i}`}
                    id={it.id}
                    span={it.span || 1}
                    choices={choices}
                    setChoice={setChoice}
                    ctx={ctx}
                  />
                );
              })}
            </div>
          </div>
        </fieldset>
      ))}
    </div>
  );
}