import React from 'react';
import DockHoverCard from '../ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../ui/StatsEffectsTooltip.jsx';
import { renderControl } from './mgmtControlRender.js';
import MgmtGrid from './MgmtGrid.jsx';
import ManagementStatsTooltip from './ManagementStatsTooltip.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from '../../context/GameDataContext.jsx';

/**
 * HealthTab – alt i én komponent, men genbrug af eksterne helpers:
 * - renderControl (fælles for alle tabs)
 * - ManagementStatsTooltip (wrapper med headerMode + extras)
 *
 * CONFIG defineres inde i funktionen for fri adgang til hooks-data.
 */


export default function HealthTab({ choices, setChoice }) {
  // Hooks/data – kan bruges direkte i CONFIG nedenfor
  const { data: summary } = useHeaderSummary();
  const { data: gameData } = useGameData();
  const translations = gameData?.i18n?.current ?? {};

  const currentStage =
    Number(summary?.stage?.current ??
      gameData?.state?.user?.currentstage ??
      gameData?.state?.user?.stage ?? 0);

  // Små hjælpere
  const nf0 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isStageOk = (cfg) => {
    const min = cfg?.stageMin, max = cfg?.stageMax;
    if (min != null && currentStage < Number(min)) return false;
    if (max != null && currentStage > Number(max)) return false;
    return true;
  };

    // Lille convenience til tooltips
  const Tip = (props) => <ManagementStatsTooltip translations={translations} {...props} />;

  const kids = Number(summary?.citizens?.groupCounts?.kids ?? 0);
  const free_dentist_kids_cap = 100;    // eksempel kapacitetsløft
  const free_dentist_kids_cost = 100; // eksempel takst pr. barn
  const free_dentist_kids_total = nf2.format(free_dentist_kids_cost * kids);

  const young = Number(summary?.citizens?.groupCounts?.young ?? 0);
  const free_dentist_young_cap = 80;    // eksempel kapacitetsløft
  const free_dentist_young_cost = 125; // eksempel takst pr. ung
  const free_dentist_young_total = nf2.format(free_dentist_young_cost * young);

  const adults = Number(summary?.citizens?.groupCounts?.adults ?? 0);
  const free_dentist_adults_cap = 50;   // eksempel kapacitetsløft
  const free_dentist_adults_cost = 175; // eksempel takst pr. voksen
  const free_dentist_adults_total = nf2.format(free_dentist_adults_cost * adults);

  const dentistUsage = Number(
    summary?.usages?.useDentist?.total ??
    summary?.usage?.useDentist ?? 0
  );

  // CONFIG – defineret herinde, så du frit kan bruge summary/gameData/choices/NF’er
  // Du kan altid flytte statiske konstanter ud i din config.ini senere.
  const CONFIG = {
    fields: {
      // Ordninger – børn
      health_free_dentist_kids: {
        label: 'Gratis tandlæge — børn',
        help: 'Ordning for børn. For ' + kids + ' børn, vil det koste: ' + free_dentist_kids_total + 'kr. Du øger tandlæge kapacitet med ' + free_dentist_kids_cap + '.',
        stageMin: 1,
        control: { type: 'toggle', key: 'health_free_dentist_kids', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: (
          <ManagementStatsTooltip
            headerMode="wrapper"
            title="Gratis tandlæge — børn"
            subtitle="Øger kapacitet og tilfredshed for børnefamilier."
            stats={{ healthDentistCapacity: free_dentist_kids_cap,
              taxHealthUsage: free_dentist_kids_total }}
          />
        ),
      },


      // Ordninger – unge
      health_free_dentist_young: {
        label: 'Gratis tandlæge — unge',
        help: 'Ordning for unge. For ' + young + ' unge, vil det koste: ' + free_dentist_young_total + 'kr. Du øger tandlæge kapacitet med ' + free_dentist_young_cap + '.',
        stageMin: 1,
        control: { type: 'toggle', key: 'health_free_dentist_young', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: (() => {
          const adults = Number(summary?.citizens?.groupCounts?.adults ?? 0);
          const free_dentist_adults_cap = 50;   // eksempel
          const free_dentist_adults_cost = 175; // eksempel
          const dentistUsage = Number(
            summary?.usages?.useDentist?.total ??
            summary?.usage?.useDentist ?? 0
          );
          return (
            <ManagementStatsTooltip
              headerMode="stats"
              title="Gratis tandlæge — voksne"
              subtitle="Øger adgang og forebyggelse for voksne."
              stats={{
                healthDentistCapacity: free_dentist_young_cap,
              taxHealthUsage: free_dentist_young_total,
              }}
              extras={[
                { label: 'Kapacitet uden', value: nf2.format(dentistUsage), desc: 'Før aktivering' },
                { label: 'Estimeret kapacitet', value: nf2.format(dentistUsage + free_dentist_adults_cap), desc: 'Efter aktivering' },
                'Bemærk: tal er estimater til UI – backend afgør endelig effekt.',
              ]}
            />
          );
        })(),
      },

      // Ordninger – voksne (eksempel-tal; tilpas efter dit spil)
      health_free_dentist_adults: {
        label: 'Gratis tandlæge — voksne',
        help: 'Ordning for voksne. For ' + adults + ' voksne, vil det koste: ' + free_dentist_adults_total + 'kr. Du øger tandlæge kapacitet med ' + free_dentist_adults_cap + '.',
        stageMin: 2,
        control: { type: 'toggle', key: 'health_free_dentist_adults', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: () => {
;
          return ManagementStatsTooltip({
            title: 'Gratis tandlæge — voksne',
            subtitle: 'Øger adgang og forebyggelse for voksne.',
            stats: {
              healthDentistCapacity: free_dentist_adults_cap,
              taxHealthUsage: free_dentist_adults_total,
            },
            extras: [
              { label: 'Kapacitet uden', value: nf2.format(dentistUsage), desc: 'Før aktivering' },
              { label: 'Estimeret kapacitet', value: nf2.format(dentistUsage + free_dentist_adults_cap), desc: 'Efter aktivering' },
              'Bemærk: tal er estimater til UI – backend afgør endelig effekt.',
            ],
          });
        },
      },

      // Økonomi/politik – tilskud i %
      health_subsidy_pct: {
        label: 'Tilskud til sundhed (procent)',
        help: 'Reducerer ventetid/øger adgang — koster budgettet.',
        stageMin: 2,
        control: { type: 'percent', key: 'health_subsidy_pct', default: 0 },
        tooltip: (() => {
          const pct = Number(choices?.health_subsidy_pct ?? 0);
          const persons = Number(summary?.citizens?.totals?.totalPersons ?? 0);
          const estCost = persons * pct * 0.01;
          const deltaCapacityPct = pct * 0.5;
          return (
            <ManagementStatsTooltip
              headerMode="stats"
              title="Tilskud til sundhed"
              subtitle="Højere tilskud forventes at give mere kapacitet/adgang."
              stats={{ healthCapacity: `x${(1 + pct/100*0.5).toFixed(3)}` }}
              extras={[
                { label: 'Beregning (kapacitet)', value: `+${deltaCapacityPct.toFixed(1)}%`, desc: 'Antaget 0.5% kapacitetsløft pr. tilskudsprocent.' },
                { label: 'Estimeret omkostning', value: nf2.format(estCost), desc: 'Proportional med befolkning og tilskud.' },
              ]}
            />
          );
        })(),
      },

      // Mål – ventetid
      health_wait_target_days: {
        label: 'Ventetidsmål (dage)',
        help: 'Lavere mål kræver flere ressourcer.',
        stageMin: 2,
        control: { type: 'slider', key: 'health_wait_target_days', min: 0, max: 180, step: 5, default: 60 },
        tooltip: (
          <ManagementStatsTooltip
            headerMode="stats"
            title="Ventetidsmål"
            subtitle="Sæt tydeligt mål for maksimal ventetid."
            stats={{
              target_days: Number(choices?.health_wait_target_days ?? 60),
              resource_need: '↑',
            }}
          />
        ),
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
        tooltip: (
          <ManagementStatsTooltip
            headerMode="stats"
            title="Strategi"
            subtitle="Vælg fokus – forebyggelse, akut eller balanceret."
            stats={{ access: '±', cost: '±', outcomes: '±' }}
          />
        ),
      },
      health_campaign_prevention: {
        label: 'Kampagne: Forebyggelse',
        help: 'Midlertidigt tiltag, reducerer belastning.',
        stageMin: 3,
        control: { type: 'toggle', key: 'health_campaign_prevention', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: (
          <ManagementStatsTooltip
            headerMode="stats"
            title="Kampagne: Forebyggelse"
            subtitle="Informationsindsats, der mindsker efterspørgsel på kort sigt."
            stats={{ demand: '↓' }}
            extras={[{ label: 'Est. Cost', value: nf2.format(12.0), desc: 'Flat pr. tick mens aktiv.' }]}
          />
        ),
      },
    },

// ----- SECTIONS – grupperer felter i fieldsets med grid-layout
    sections: [
      {
        title: 'Ordninger',
        cols: 2,
        stageMin: 1,
        items: [
          // Stack: flere under hinanden i venstre kolonne
          { stack: ['health_free_dentist_kids', 'health_free_dentist_young', 'health_free_dentist_adults'], span: 2 },
          // Tilskud i højre kolonne
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



  // Render
 return (
    <div style={{ display: 'grid', gap: 12 }}>
      <MgmtGrid
        config={CONFIG}
        choices={choices}
        setChoice={setChoice}
        currentStage={currentStage}
      />
    </div>
  );
}