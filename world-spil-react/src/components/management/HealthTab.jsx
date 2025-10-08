import React from 'react';
import ConfigRenderer from './ConfigRenderer.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';

/**
 * Health CONFIG
 * - Skift keys i control.key til dine nuværende storage keys, hvis de afviger.
 * - Brug stageMin/stageMax + showWhenLocked til at styre synlighed/låsning.
 */
const CONFIG = {
  fields: {
    // Ordninger
    health_free_dentist_kids: {
      label: 'Gratis tandlæge — børn',
      help: 'Ordning for børn.',
      stageMin: 4,
      control: { type: 'toggle', key: 'health_free_dentist_kids', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'stats',
        title: 'Gratis tandlæge — børn',
        stats: { healthCapacity: 10, popularity: 0.01 },
      },
    },
    health_free_dentist_youth: {
      label: 'Gratis tandlæge — unge',
      help: 'Ordning for unge.',
      stageMin: 1,
      control: { type: 'toggle', key: 'health_free_dentist_youth', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'stats',
        title: 'Gratis tandlæge — unge',
        stats: { healthCapacity: 6, popularity: 0.006 },
      },
    },

    // Økonomi/politik
    health_subsidy_pct: {
      label: 'Tilskud til sundhed (procent)',
      help: 'Reducerer ventetid/øger adgang — koster budgettet.',
      stageMin: 2,
      control: { type: 'percent', key: 'health_subsidy_pct', default: 0 },
      tooltip: {
        type: 'stats',
        title: 'Tilskud til sundhed',
        stats: (choices, ctx) => {
          const pct = Number(choices?.health_subsidy_pct ?? 0);
          const persons = Number(ctx?.summary?.citizens?.totals?.totalPersons ?? 0);
          return {
            access: `x${(1 + pct/100*0.5).toFixed(3)}`,
            est_cost: (persons * pct * 0.01).toFixed(2),
          };
        },
      },
    },

    // Mål
    health_wait_target_days: {
      label: 'Ventetidsmål (dage)',
      help: 'Lavere mål kræver flere ressourcer.',
      stageMin: 2,
      control: { type: 'slider', key: 'health_wait_target_days', min: 0, max: 180, step: 5, default: 60 },
      tooltip: {
        type: 'stats',
        title: 'Ventetidsmål',
        stats: (choices) => ({
          target_days: Number(choices?.health_wait_target_days ?? 60),
          resource_need: '↑',
        }),
      },
    },

    // Strategi
    health_mode: {
      label: 'Sundheds‑strategi',
      help: 'Overordnet strategi.',
      stageMin: 2,
      showWhenLocked: true, // vis som disabled før stageMin
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
        type: 'stats',
        title: 'Strategi',
        stats: { access: '±', cost: '±', outcomes: '±' },
      },
    },

    // Kampagner
    health_campaign_prevention: {
      label: 'Kampagne: Forebyggelse',
      help: 'Midlertidigt tiltag, reducerer belastning.',
      stageMin: 3,
      control: { type: 'toggle', key: 'health_campaign_prevention', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
      tooltip: {
        type: 'stats',
        title: 'Kampagne: Forebyggelse',
        stats: { demand: '↓', est_cost: 12.0 },
      },
    },
  },

  // Layout: stacks for “under hinanden i samme kolonne”
  sections: [
    {
      title: 'Ordninger',
      cols: 2,
      stageMin: 1,
      items: [
        { stack: ['health_free_dentist_kids', 'health_free_dentist_youth'], span: 1 },
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