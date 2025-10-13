export const HEALTH_FAMILY = 'health';

export function defineHealthFields(ctx) {
  const { summary, choices } = ctx;
  const nf2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kids   = Number(summary?.citizens?.groupCounts?.kids || 0) + Number(summary?.citizens?.groupCounts?.baby || 0);
  const young  = Number(summary?.citizens?.groupCounts?.young || 0);
  const adults = Number(summary?.citizens?.groupCounts?.adultsTotal || 0) + Number(summary?.citizens?.groupCounts?.old || 0);

 const free_dentist_kids_total = nf2.format(100 * kids);

  const free_dentist_young_total = nf2.format(125 * young);

  const free_dentist_adults_total = nf2.format(175 * adults);

  const HP = Number(summary?.capacities?.healthCapacity || 0);

  const health_wait_target_rate = HP / 60; // Kapacitet pr. dag ved default mål
  const health_wait_target_costtotal = 750 * Number(summary?.usages?.useHealth?.total || 0);

  return {
    family: HEALTH_FAMILY,
    fields: {
      health_free_dentist_kids: {
        label: 'Gratis tandlæge — børn',
        help: `Ordningen gælder pt for ${kids} børn.`,
        stageMin: 1,
        requires: { buildings: [], addons: [], research: [] },
        control: { type: 'toggle', key: 'health_free_dentist_kids', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: {
          type: 'wrapper',
          title: 'Gratis tandlæge — børn',
          subtitle: 'Øger kapacitet og tilfredshed for børnefamilier.',
          stats: { healthDentistCapacity: 100, taxHealthUsage: free_dentist_kids_total },
        },
      },
      health_free_dentist_young: {
        label: 'Gratis tandlæge — unge',
        help: `Ordningen gælder pt for ${young} unge.`,
        stageMin: 1,
        control: { type: 'toggle', key: 'health_free_dentist_young', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: {
          type: 'wrapper',
          title: 'Gratis tandlæge — unge',
          subtitle: 'Øger kapacitet og tilfredshed for unge.',
          stats: { healthDentistCapacity: 80, taxHealthUsage: free_dentist_young_total },
        },
      },
      health_free_dentist_adults: {
        label: 'Gratis tandlæge — voksne',
        help: `Ordningen gælder pt for ${adults} voksne.`,
        stageMin: 2,
        control: { type: 'toggle', key: 'health_free_dentist_adults', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: {
          type: 'wrapper',
          title: 'Gratis tandlæge — voksne',
          subtitle: 'Øger kapacitet og tilfredshed for voksne.',
          stats: { healthDentistCapacity: 50, taxHealthUsage: free_dentist_adults_total },
        },
      },
      health_subsidy_pct: {
        label: 'Tilskud til sundhed (procent)',
        help: 'Reducerer ventetid/øger adgang — koster budgettet.',
        stageMin: 2,
        control: { type: 'percent', key: 'health_subsidy_pct', default: 0 },
        tooltip: () => {
          const pct = Number(choices?.health_subsidy_pct ?? 0);
          const persons = Number(summary?.citizens?.totals?.totalPersons ?? 0);
          const estCost = persons * pct * 0.01;
          const deltaCapacityPct = pct * 0.5;
          return {
            type: 'stats',
            title: 'Tilskud til sundhed',
            subtitle: 'Højere tilskud forventes at give mere kapacitet/adgang.',
            stats: { healthCapacity: `x${(1 + pct/100*0.5).toFixed(3)}` },
            extras: [
              { label: 'Beregning (kapacitet)', value: `+${deltaCapacityPct.toFixed(1)}%`, desc: 'Antaget 0.5% kapacitetsløft pr. tilskudsprocent.' },
              { label: 'Estimeret omkostning', value: nf2.format(estCost), desc: 'Proportional med befolkning og tilskud.' },
            ],
          };
        },
      },
      health_wait_target_days: {
        label: 'Ventetidsmål (dage)',
        help: 'Lavere mål kræver flere ressourcer.',
        stageMin: 2,
        control: { type: 'slider', key: 'health_wait_target_days', min: 10, max: 80, step: 5, default: 60 },
        tooltip: {
          type: 'stats',
          title: 'Ventetidsmål',
          subtitle: 'Sæt tydeligt mål for maksimal ventetid.',
          stats: {
            healthCapacity: health_wait_target_rate * Number(choices?.health_wait_target_days ?? 60),
            taxHealthUsage: nf2.format(health_wait_target_costtotal / Number(choices?.health_wait_target_days || 60) * 100),
          },
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
        tooltip: { type: 'stats', title: 'Strategi', subtitle: 'Vælg fokus – forebyggelse, akut eller balanceret.', stats: { access: '±', cost: '±', outcomes: '±' } },
      },
      health_campaign_prevention: {
        label: 'Kampagne: Forebyggelse',
        help: 'Midlertidigt tiltag, reducerer belastning.',
        stageMin: 3,
        control: { type: 'toggle', key: 'health_campaign_prevention', default: false, labelOn: 'Aktiv', labelOff: 'Inaktiv' },
        tooltip: { type: 'stats', title: 'Kampagne: Forebyggelse', subtitle: 'Informationsindsats, der mindsker efterspørgsel på kort sigt.', stats: { demand: '↓' }, extras: [{ label: 'Est. Cost', value: nf2.format(12.0), desc: 'Flat pr. tick mens aktiv.' }] },
      },
    },
    sections: [
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
  };
}