import React, { useRef, useEffect } from 'react';
import { useT } from "../../services/i18n.js";
import { defaultLabelMap } from '../../hooks/useStatsLabels.jsx';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';

/**
 * StatsEffectsTooltip (opdateret)
 * - Henter metrics metadata fra header summary (headerData.metricsMeta) med fallback til defs.metrics.
 * - Holder en lastHeaderRef så metadata bevares under revalidate (samme mønster som andre header-komponenter).
 * - Matcher metric keys case-insensitivt og via afledte kandidatnavne (camel, snake, dot, compact).
 * - Skjuler stat hvis metadata siger stage.locked === true eller unlock_at/visible_at > currentStage.
 */

function parseStatsField(stats) {
  if (!stats) return {};
  if (typeof stats === 'string') {
    const parts = stats.split(';').map(s => s.trim()).filter(Boolean);
    const out = {};
    for (const p of parts) {
      const [k, v = ''] = p.split('=', 2).map(s => s?.trim());
      if (!k) continue;
      const num = Number(v);
      out[k] = (!Number.isNaN(num) && v !== '') ? num : v;
    }
    return out;
  }
  if (typeof stats === 'object') return stats;
  return {};
}

function fmtNum(v) {
  if (typeof v === 'number') {
    const nf = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2, signDisplay: 'always' });
    return nf.format(v);
  }
  return String(v);
}

export default function StatsEffectsTooltip({ def, translations = {}, showHeader = true }) {
  const t = useT();
  const { data: gameData } = useGameData() || {};

  // Hent header summary men bevar sidste valide data ligesom andre components
  const { data: headerRaw } = useHeaderSummary() || {};
  const lastHeaderRef = useRef(headerRaw);
  useEffect(() => { if (headerRaw) lastHeaderRef.current = headerRaw; }, [headerRaw]);
  const headerData = headerRaw || lastHeaderRef.current || {};

  const defs = gameData?.defs || {};

  // metrics metadata: prioritér headerData.metricsMeta (fra backend), fallback til defs.metrics
  const metricsMetaRaw = headerData?.metricsMeta ?? defs?.metrics ?? {};

  // Build case-insensitive map: lowerKey -> meta
  const metricsMeta = React.useMemo(() => {
    const m = {};
    if (!metricsMetaRaw || typeof metricsMetaRaw !== 'object') return m;
    for (const [k, v] of Object.entries(metricsMetaRaw)) {
      try { m[String(k).toLowerCase()] = v; } catch (e) { /* ignore */ }
    }
    return m;
  }, [metricsMetaRaw]);

  // Bestem spillerens aktuelle stage (prøv flere kilder)
  const currentStage = Number(
    gameData?.state?.user?.currentstage ??
    gameData?.state?.current ??
    headerData?.state?.user?.currentstage ??
    headerData?.stage?.current ??
    0
  );

  const stats = parseStatsField(def?.stats ?? def?.stat ?? {});
  const map = defaultLabelMap();

  const getLabelDesc = (key) => {
    const tLabel = translations[`stat.${key}.label`] ?? translations[`${key}.label`] ?? null;
    const tDesc = translations[`stat.${key}.desc`] ?? translations[`${key}.desc`] ?? null;
    if (tLabel || tDesc) return { label: tLabel || key, desc: tDesc || '' };

    if (map[key]) return { label: map[key].label || key, desc: map[key].desc || '' };

    const pretty = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const label = pretty.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    return { label, desc: '' };
  };

  // Afled kandidatnavne fra statKey (fx wastePaperCapacity -> wastePaper, waste_paper, waste.paper, wastepaper)
  const deriveMetricCandidates = (statKey) => {
    const suffixRegex = /(Capacity|capacity|Usage|usage|Cap|cap|Unit|unit|Units|units|Footprint|footprint|Housing|housing)$/i;
    let base = String(statKey).replace(suffixRegex, '');
    if (!base) base = String(statKey);
    const lower = base.toLowerCase();
    const snake = base.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    const dot = snake.replace(/_+/g, '.');
    const compact = base.replace(/[_\.\s]/g, '').toLowerCase();
    // også include bare camel/pascal original uden suffix
    return [String(statKey), base, lower, snake, dot, compact].map(x => String(x).toLowerCase());
  };

  // Afgør synlighed: skjul kun hvis metadata udtrykkeligt siger locked eller unlock/visible > currentStage
  const isStatVisible = (statKey) => {
    if (!statKey || statKey === 'id') return false;
    // Hvis vi ingen metadata overhovedet har (tom map), så vis stat — vi skjuler kun hvis metadata siger låst
    if (!metricsMeta || Object.keys(metricsMeta).length === 0) return true;

    const candidates = deriveMetricCandidates(statKey);

    for (const cand of candidates) {
      const meta = metricsMeta[cand];
      if (!meta) continue;

      // Backend structure: metricsMeta[id].stage = { unlock_at: int, visible_at: int, locked: bool }
      const stageMeta = meta?.stage ?? meta;
      if (stageMeta && typeof stageMeta === 'object') {
        // locked boolean (backend sætter locked: userStage < unlock_at)
        if (typeof stageMeta.locked === 'boolean') {
          if (stageMeta.locked) return false;
          return true;
        }
        // unlock_at / visible_at numeric checks
        if (typeof stageMeta.unlock_at === 'number') {
          if (currentStage < Number(stageMeta.unlock_at)) return false;
          return true;
        }
        if (typeof stageMeta.visible_at === 'number') {
          if (currentStage < Number(stageMeta.visible_at)) return false;
          return true;
        }
      }

      // hvis meta eksisterer uden stage-info — antag synlig
      return true;
    }

    // Ingen match: antag synlig (så vi ikke skjuler stats uden eksplicit metadata)
    return true;
  };

  // Filtrer stats
  const visibleEntries = Object.entries(stats).filter(([k]) => isStatVisible(k));

  if (visibleEntries.length === 0) {
    return <div style={{ maxWidth: 320, color: '#666' }}>Ingen stats.</div>;
  }

  const rows = visibleEntries.map(([k, v]) => {
    const { label, desc } = getLabelDesc(k);

    const lk = String(k).toLowerCase();
    let prefix = '';
    if (lk.includes('cap') || lk.includes('capacity') || lk.includes('footprint') || lk.includes('housing')) prefix = '+';
    else if (lk.includes('usage') || lk.includes('use')) prefix = '-';

    const display = (typeof v === 'number') ? fmtNum(v) : `${prefix}${String(v)}`;

    let color = '#000000ff';
    if (typeof v === 'number' && v < 0) color = '#ff6b6b';
    else if (prefix === '+') color = '#16a34a';
    else if (prefix === '-') color = '#ef4444';

    return { key: k, label, desc, value: v, display, color };
  });

  return (
    <div style={{ maxWidth: 380 }}>
      {showHeader ? <div style={{ fontWeight: 700, marginBottom: 0 }}>{def?.display_name ?? def?.name ?? def?.id}</div> : null}
      {showHeader ? <div style={{ fontWeight: 0, marginBottom: 8, fontSize: 11, color: '#666' }}>{def?.display_desc ?? def?.desc ?? def?.id}</div> : null}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map(r => (
          <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
              {r.desc ? <div style={{ fontSize: 11, color: '#666' }}>{r.desc}</div> : null}
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 60, color: r.color }}>
              {r.display}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}