import { useT } from '../services/i18n.js';


// simple duration formatting helpers
export function formatDurationFull(inputSeconds) {
    const t = useT();

  const total = Math.max(0, Math.round(Number(inputSeconds) || 0));
  let s = total;

  const days = Math.floor(s / 86400);
  s %= 86400;
  const hours = Math.floor(s / 3600);
  s %= 3600;
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;

  const parts = [];
  if (days) parts.push(`${days}${t('ui.timeshort.d.h1')}`);    // dage
  if (hours) parts.push(`${hours}${t('ui.timeshort.t.h1')}`);  // timer (dansk: t)
  if (minutes) parts.push(`${minutes}${t('ui.timeshort.m.h1')}`); // minutter
  // vis altid sekunder hvis der ikke er andre dele (så 0s vises)
  if (seconds || parts.length === 0) parts.push(`${seconds}${t('ui.timeshort.s.h1')}`);

  return parts.join(' ');
}

export function formatDurationSmart(inputSeconds) {
  const s = Math.max(0, Math.round(Number(inputSeconds) || 0));
  if (s >= 86400) return `${Math.round(s / 86400)}d`;
  if (s >= 3600) return `${Math.round(s / 3600)}t`;
  if (s >= 60) return `${Math.round(s / 60)}m`;
  return `${s}s`;
}