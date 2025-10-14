import React from 'react';
import ConfigRenderer from './ConfigRenderer.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';

// Data til select/checkboxes
const ZONES = [
  { value: 'center', label: 'Bycenter' },
  { value: 'north',  label: 'Nord' },
  { value: 'south',  label: 'Syd' },
  { value: 'east',   label: 'Øst' },
  { value: 'west',   label: 'Vest' },
];

// ALT i én CONFIG: felter + layout
const CONFIG = {
  fields: {
    traffic_lights_control: {
      label: 'Lysregulering (on/off)',
      help: 'Aktiver signalstyring i kryds.',
      control: { type: 'toggle', key: 'traffic_lights_control', labelOn: 'Aktiveret', labelOff: 'Deaktiveret' },
      tooltip: {
        type: 'stats',
        title: 'Lysregulering',
        stats: (choices, ctx) => {
          const persons = Number(ctx?.summary?.citizens?.totals?.totalPersons ?? 0);
          return { traffic_flow: 'x1.05', safety: 0.01, est_cost: (persons * 0.005).toFixed(2) };
        },
      },
    },
    traffic_adaptive_level: {
      label: 'Adaptiv signalering',
      help: '0..3',
      control: { type: 'number', key: 'traffic_adaptive_level', min: 0, max: 3, step: 1, default: 0 },
      tooltip: {
        type: 'stats',
        title: 'Adaptiv signalering',
        stats: (choices) => ({ level: Number(choices?.traffic_adaptive_level ?? 0) }),
      },
    },
    traffic_signal_density: {
      label: 'Signal‑tæthed',
      help: '0–10',
      control: { type: 'slider', key: 'traffic_signal_density', min: 0, max: 10, step: 1, default: 5 },
      tooltip: {
        type: 'stats',
        title: 'Signal‑tæthed',
        stats: { traffic_flow: '≈', speed: '↓' },
      },
    },
    traffic_speed_limit_pct: {
      label: 'Hastighedsgrænse (procent)',
      help: '0% = lav, 100% = normal',
      control: { type: 'percent', key: 'traffic_speed_limit_pct', default: 50 },
      tooltip: {
        type: 'stats',
        title: 'Hastighedsgrænse',
        stats: (choices) => {
          const pct = Number(choices?.traffic_speed_limit_pct ?? 100);
          const flow = 1 - (100 - pct) * 0.001;
          const safety = (100 - pct) * 0.0005;
          return { traffic_flow: `x${flow.toFixed(3)}`, safety: `+${(safety*100).toFixed(1)}%` };
        },
      },
    },
    traffic_enforcement_pct: {
      label: 'Enforcement intensitet',
      help: '0–100',
      control: { type: 'slider', key: 'traffic_enforcement_pct', min: 0, max: 100, step: 5, default: 0 },
      tooltip: { type: 'stats', title: 'Enforcement', stats: { safety: '+', popularity: '±', op_cost: '↑' } },
    },
    traffic_public_transport_subsidy_pct: {
      label: 'Offentlig transport – tilskud',
      help: 'Reducer trængsel, koster budget',
      control: { type: 'percent', key: 'traffic_public_transport_subsidy_pct', default: 0 },
      tooltip: {
        type: 'stats',
        title: 'Tilskud til kollektiv',
        stats: (choices, ctx) => {
          const persons = Number(ctx?.summary?.citizens?.totals?.totalPersons ?? 0);
          const pct = Number(choices?.traffic_public_transport_subsidy_pct ?? 0);
          return { traffic_flow: '+', emissions: '↓', est_cost: (persons * pct * 0.01).toFixed(2) };
        },
      },
    },
    traffic_parking_price: {
      label: 'Parkering – pris pr. time',
      help: 'Påvirker brug/indtægt',
      control: { type: 'number', key: 'traffic_parking_price', min: 0, max: 500, step: 1, default: 0, suffix: 'DKK' },
      tooltip: { type: 'stats', title: 'Parkering', stats: { revenue: '↑/↓', visitors: '±' } },
    },
    traffic_free_parking_zones: {
      label: 'Gratis parkering (zoner)',
      help: 'Vælg zoner',
      control: { type: 'checkboxes', key: 'traffic_free_parking_zones', options: ZONES, columns: 3, default: [] },
      tooltip: { type: 'stats', title: 'Gratis parkering', stats: { visitors: '↑', revenue: '↓' } },
    },
    traffic_oneway_zones: {
      label: 'One‑way streets (zoner)',
      help: 'Udvalgte zoner',
      control: { type: 'checkboxes', key: 'traffic_oneway_zones', options: ZONES, columns: 3, default: [] },
      tooltip: { type: 'stats', title: 'Envejs', stats: { local_flow: '↑', complexity: '↑' } },
    },
    traffic_cyclelane_zones: {
      label: 'Cycle lanes (zoner)',
      help: 'Udvalgte zoner',
      control: { type: 'checkboxes', key: 'traffic_cyclelane_zones', options: ZONES, columns: 3, default: [] },
      tooltip: { type: 'stats', title: 'Cykelbaner', stats: { safety: '↑', car_flow: '↓?' } },
    },
    traffic_mode: {
      label: 'Trafik‑tilstand (strategi)',
      help: 'Overordnet strategi',
      control: {
        type: 'radio',
        key: 'traffic_mode',
        columns: 3,
        options: [
          { value: 'balanced', label: 'Balanceret' },
          { value: 'eco',      label: 'Miljø' },
          { value: 'speed',    label: 'Hurtighed' },
        ],
        default: 'balanced',
      },
      tooltip: { type: 'stats', title: 'Strategi', stats: { flow: '±', emissions: '±', safety: '±' } },
    },
    traffic_campaign_safety: {
      label: 'Kampagne: Trafiksikkerhed',
      help: 'Midlertidigt tiltag',
      control: { type: 'toggle', key: 'traffic_campaign_safety', labelOn: 'Aktiv', labelOff: 'Inaktiv', default: false },
      tooltip: { type: 'stats', title: 'Kampagne', stats: { safety: '+', cost: '↑' } },
    },
    traffic_temp_speed_pct: {
      label: 'Midlertidig hastighedsbegrænsning',
      help: 'Ved events/vejarbejde',
      control: { type: 'percent', key: 'traffic_temp_speed_pct', default: 0 },
      tooltip: { type: 'stats', title: 'Midlertidig hastighed', stats: { safety: '+', flow: '↓' } },
    },
  },

  // Layout – kan referere til id’er eller stacks
  sections: [
    {
      title: 'Trafik regulering',
      cols: 3,
      items: [
        { id: 'traffic_lights_control',  span: 1 },
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
        { stack: ['traffic_free_parking_zones', 'traffic_cyclelane_zones'], span: 1 },
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
  ],
};

export default function TrafficTab({ choices, setChoice }) {
  const { data: summary } = useHeaderSummary();
  const { data: gameData } = useGameData();
  const translations = gameData?.i18n?.current ?? {};
  const ctx = { summary, gameData };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ConfigRenderer
        config={CONFIG}
        choices={choices}
        setChoice={setChoice}
        ctx={ctx}
        translations={translations}
      />
    </div>
  );
}