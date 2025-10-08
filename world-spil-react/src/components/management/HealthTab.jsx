import React from 'react';
import ConfigRenderer from './ConfigRenderer.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';

const nf2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TEXT ="Tal er cirka og kan varierer i endelig udregning.";

const CONFIG = {
  fields: {
    health_free_dentist_kids: {
      label: 'Gratis tandlæge — børn',
      help: 'Ordning for børn.',
      stageMin: 1,
      control: { type: 'toggle', key: 'health_free_dentist_kids', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'statsEx',
        headerMode: 'wrapper',
        title: 'Gratis tandlæge — børn',
        subtitle: 'Øger kapacitet og tilfredshed for børnefamilier.',
        stats: (choices, ctx) => {
          const kids = Number(ctx?.summary?.citizens?.groupCounts?.kids ?? 0);
          const add_cap = 100;
          const cost = 75;
          // vis som multiplikator på kapacitet (rå nøgle for emoji/desc)
          return {
            healthDentistCapacity: add_cap, taxHealthUsage: nf2.format(cost * kids),
          };
        },
        extras: (choices, ctx) => {
          const add_cap = 100;
          const dentistUsage = Number(ctx?.summary?.usage?.useDentist ?? 0);
          return [
            { label: 'Kapacitet uden:', value: nf2.format(dentistUsage), desc: `Kapacitet før du aktiver "gratis tandlæge for børn"` },
            { label: 'Estimeret kapacitet', value: nf2.format(dentistUsage + add_cap), desc: 'Anslået kapacitet efter aktivering' },
            TEXT,
          ];
        },
      },
    },
    health_free_dentist_youth: {
      label: 'Gratis tandlæge — unge',
      help: 'Ordning for unge.',
      stageMin: 1,
      control: { type: 'toggle', key: 'health_free_dentist_youth', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'statsEx',
        headerMode: 'wrapper',
        title: 'Gratis tandlæge — unge',
        subtitle: 'Øger adgang og forebyggelse for unge.',
        stats: (choices, ctx) => {
          const young = Number(ctx?.summary?.citizens?.groupCounts?.young ?? 0);
          const add_cap = 80;
          const cost = 125;
          // vis som multiplikator på kapacitet (rå nøgle for emoji/desc)
          return {
            healthDentistCapacity: add_cap, taxHealthUsage: nf2.format(cost * young),
          };
        },
        extras: (choices, ctx) => {
          const add_cap = 80;
          const dentistUsage = Number(ctx?.summary?.usage?.useDentist ?? 0);
         return [
            { label: 'Kapacitet uden:', value: nf2.format(dentistUsage), desc: `Kapacitet før du aktiver "gratis tandlæge for unge"` },
            { label: 'Estimeret kapacitet', value: nf2.format(dentistUsage + add_cap), desc: 'Anslået kapacitet efter aktivering' },
            TEXT,
          ];
        },
      },
    },
    health_free_dentist_adults: {
      label: 'Gratis tandlæge — voksne',
      help: 'Ordning for voksne.',
      stageMin: 1,
      control: { type: 'toggle', key: 'health_free_dentist_adults', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'statsEx',
        headerMode: 'wrapper',
        title: 'Gratis tandlæge — voksne',
        subtitle: 'Øger adgang og forebyggelse for voksne.',
        stats: (choices, ctx) => {
          const adults = Number(ctx?.summary?.citizens?.groupCounts?.adults ?? 0);
          const add_cap = 50;
          const cost = 175;
          // vis som multiplikator på kapacitet (rå nøgle for emoji/desc)
          return {
            healthDentistCapacity: add_cap, taxHealthUsage: nf2.format(cost * adults),
          };
        },
        extras: (choices, ctx) => {
          const add_cap = 50;
          const dentistUsage = Number(ctx?.summary?.usage?.useDentist ?? 0);
         return [
            { label: 'Kapacitet uden:', value: nf2.format(dentistUsage), desc: `Kapacitet før du aktiver "gratis tandlæge for voksne"` },
            { label: 'Estimeret kapacitet', value: nf2.format(dentistUsage + add_cap), desc: 'Anslået kapacitet efter aktivering' },
            TEXT,
          ];
        },
      },
    },
    health_subsidy_pct: {
      label: 'Tilskud til sundhed (procent)',
      help: 'Reducerer ventetid/øger adgang — koster budgettet.',
      stageMin: 2,
      control: { type: 'percent', key: 'health_subsidy_pct', default: 0 },
      tooltip: {
        type: 'statsEx',
        headerMode: 'stats',
        title: 'Tilskud til sundhed',
        subtitle: 'Højere tilskud forventes at give mere kapacitet/adgang.',
        stats: (choices, ctx) => {
          const pct = Number(choices?.health_subsidy_pct ?? 0);
          // vis som multiplikator på kapacitet (rå nøgle for emoji/desc)
          return {
            healthCapacity: `x${(1 + pct / 100 * 0.5).toFixed(3)}`,
          };
        },
        extras: (choices, ctx) => {
          const pct = Number(choices?.health_subsidy_pct ?? 0);
          const persons = Number(ctx?.summary?.citizens?.totals?.totalPersons ?? 0);
          const estCost = persons * pct * 0.01;
          const deltaCapacityPct = pct * 0.5;
          return [
            { label: 'Beregning (kapacitet)', value: `+${deltaCapacityPct.toFixed(1)}%`, desc: `Antaget 0.5% kapacitetsløft pr. tilskudsprocent.` },
            { label: 'Estimeret omkostning', value: estCost.toFixed(2), desc: 'Proportional med befolkning og tilskud.' },
            'Bemærk: Faktisk effekt afhænger af stage og eksisterende pres.',
          ];
        },
      },
    },
    health_wait_target_days: {
      label: 'Ventetidsmål (dage)',
      help: 'Lavere mål kræver flere ressourcer.',
      stageMin: 2,
      control: { type: 'slider', key: 'health_wait_target_days', min: 0, max: 180, step: 5, default: 60 },
      tooltip: {
        type: 'statsEx',
        headerMode: 'stats',
        title: 'Ventetidsmål',
        subtitle: 'Sæt tydeligt mål for maksimal ventetid.',
        stats: (choices) => ({
          target_days: Number(choices?.health_wait_target_days ?? 60),
        }),
        extras: [
          { label: 'Konsekvens', value: '', desc: 'Strammere mål kræver ekstra bemanding/kapacitet.' },
        ],
      },
    },
    health_mode: {
      label: 'Sundheds‑strategi',
      help: 'Overordnet strategi.',
      stageMin: 2,
      showWhenLocked: true,
      control: {
        type: 'radio',
        key: 'health_mode',
        columns: 3,
        options: [
          { value: 'balanced',   label: 'Balanceret' },
          { value: 'prevention', label: 'Forebyggelse' },
          { value: 'acute',      label: 'Akut' },
        ],
        default: 'balanced',
      },
      tooltip: {
        type: 'statsEx',
        headerMode: 'stats',
        title: 'Strategi',
        subtitle: 'Vælg fokus – forebyggelse, akut eller balanceret.',
        stats: { access: '±', cost: '±', outcomes: '±' },
      },
    },
    health_campaign_prevention: {
      label: 'Kampagne: Forebyggelse',
      help: 'Midlertidigt tiltag, reducerer belastning.',
      stageMin: 3,
      control: { type: 'toggle', key: 'health_campaign_prevention', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'statsEx',
        headerMode: 'stats',
        title: 'Kampagne: Forebyggelse',
        subtitle: 'Informationsindsats, der mindsker efterspørgsel på kort sigt.',
        stats: { demand: '↓' },
        extras: [{ label: 'Est. Cost', value: 12.0, desc: 'Flat pr. tick mens aktiv.' }],
      },
    },
  },

  sections: [
    {
      title: 'Ordninger',
      cols: 2,
      stageMin: 1,
      items: [
        { stack: ['health_free_dentist_kids', 'health_free_dentist_youth', 'health_free_dentist_adults'], span: 1 },
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
};

export default function HealthTab({ choices, setChoice }) {
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