import { useMemo } from 'react';
import { useT } from '../services/i18n.js';

export function useStatsLabels() {
  const t = useT();
  return useMemo(() => ({
  housing: t("ui.emoji.housing.h1") + ' ' + t("ui.stats.housing.h1") || 'Housing',
  food: t("ui.emoji.provision.h1") + ' ' + t("ui.stats.provision.h1") || 'Provision',
  water: t("ui.emoji.water.h1") + ' ' + t("ui.stats.water.h1") || 'Vand',
  health: t("ui.emoji.health.h1") + ' ' + t("ui.stats.health.h1") || 'Sundhed',
  healthDentist: t("ui.emoji.health.h1") + ' ' + t("ui.stats.health_dentist.h1") || 'Tandlæge',
  // Aggregerede
  heat: t("ui.emoji.heat.h1") + ' ' + t("ui.stats.heat.h1") || 'Varme',
  power: t("ui.emoji.power.h1") + ' ' + t("ui.stats.power.h1") || 'Strøm',
  // Subkategorier
  heatFossil: t("ui.emoji.heat_fossil.h1") + ' ' + t("ui.stats.heat_fossil.h1") || 'Varme (Fossil)',
  heatGreen: t("ui.emoji.heat_green.h1") + ' ' + t("ui.stats.heat_green.h1") || 'Varme (Green)',
  heatNuclear: t("ui.emoji.heat_nuclear.h1") + ' ' + t("ui.stats.heat_nuclear.h1") || 'Varme (Nuclear)',
  powerFossil: t("ui.emoji.power_fossil.h1") + ' ' + t("ui.stats.power_fossil.h1") || 'Strøm (Fossil)',
  powerGreen: t("ui.emoji.power_green.h1") + ' ' + t("ui.stats.power_green.h1") || 'Strøm (Green)',
  powerNuclear: t("ui.emoji.power_nuclear.h1") + ' ' + t("ui.stats.power_nuclear.h1") || 'Strøm (Nuclear)',
  cloth: t("ui.emoji.product_cloth.h1") + ' ' + t("ui.stats.product_cloth.h1") || 'Tøj',
  medicin: t("ui.emoji.product_medicin.h1") + ' ' + t("ui.stats.product_medicin.h1") || 'Medicin',  
  }), [t]);
}

export function happinessEmojiFromScore(score01) {
  if (score01 >= 0.90) return '😊';
  if (score01 >= 0.80) return '😐';
  if (score01 >= 0.70) return '😞';
  if (score01 >= 0.60) return '😢';
  if (score01 >= 0.50) return '😠';
  return '😡';
}

export function popularityEmojiFromScore(x) {
  const s = Number(x || 0);
  if (s >= 0.85) return '🏆';
  if (s >= 0.70) return '😊';
  if (s >= 0.55) return '🙂';
  if (s >= 0.40) return '😐';
  if (s >= 0.25) return '😕';
  return '😟';
}
