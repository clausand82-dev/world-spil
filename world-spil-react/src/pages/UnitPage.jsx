import React, { useMemo, useState, useCallback } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import * as H from '../services/helpers.js';
import ResourceCost from '../components/requirements/ResourceCost.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import useHeaderSummary from '../hooks/useHeaderSummary.js';
import DockHoverCard from '../components/ui/DockHoverCard.jsx';
import StatsEffectsTooltip from '../components/ui/StatsEffectsTooltip.jsx';
import { UNIT_GROUPS } from '../config/unitGroups.js';
import { applyCostBuffsToAmount } from '../services/calcEngine-lite.js';
import { collectActiveBuffs } from '../services/requirements.js';
import Icon from '../components/ui/Icon.jsx';
import RequirementPanel from '../components/requirements/RequirementPanel.jsx';

/*
  UnitPage.jsx — struktur og formål (overblik)
  - Importerede helpers / komponenter (øverst)
  - Hjælpefunktioner: små, isolerede utility-funktioner som genbruges i UI
  - Mindre præsentations-komponenter: PurchaseRow, InlineIcon
  - Blokke til rendering: YieldBlock, PriceBlock
  - Hoved-komponenten UnitPage:
      * Hook-setup: hent game data, header, lokal state
      * Derived state (useMemo): beregninger som totals, kurv, synlige grupper
      * Handlere: køb/salg funktioner der kalder backend
      * Render: tabs, ejede units, købsliste, actions-bar, ConfirmModal
*/

/* ---------------------------
   Hjælpefunktioner
   - små, deterministiske funktioner der holder forretningslogik væk fra JSX
   --------------------------- */

/**
 * getPerForDef(def, group, isAnimal)
 * - Returnerer hvor meget en enkelt enhed (ani-def) bidrager til gruppens cap/usage.
 * - Sørger for fornuftige default-værdier (1 for dyr i animal-grupper, ellers 0).
 */
function getPerForDef(def, group, isAnimal) {
  if (!def || !group) return 0;
  const statKey = group.perItemStat;
  const raw = Number(def?.stats?.[statKey] ?? NaN);
  if (!Number.isFinite(raw) || raw === 0) {
    return isAnimal ? 1 : 0;
  }
  return Math.abs(raw);
}

/**
 * computeUnitTotalsFallback(defs, state, group)
 * - Beregner capacity / used for grupper der ikke bruger animal_cap header.
 * - Bruger bygnings-defs til at summere kapacitet og eksisterende units til usage.
 */
function computeUnitTotalsFallback(defs, state, group) {
  let total = 0;
  for (const id of Object.keys(state?.bld || {})) {
    const p = H.parseBldKey(id);
    if (!p) continue;
    const bdef =
      defs?.bld?.[`${p.family}.l${p.level}`] ||
      defs?.bld?.[p.key];
    const cap = Number(bdef?.stats?.[group.buildingCapacityStat] ?? 0);
    if (Number.isFinite(cap)) total += cap;
  }

  let used = 0;
  for (const [aniId, row] of Object.entries(state?.ani || {})) {
    const qty = Number(row?.quantity || 0);
    if (!qty) continue;
    const key = String(aniId).replace(/^ani\./, '');
    const adef = defs.ani?.[key];
    if (!adef) continue;
    const fams = String(adef?.family || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!fams.includes(group.family)) continue;
    const per = getPerForDef(adef, group, /* isAnimal */ false);
    if (per <= 0) continue;
    used += per * qty;
  }

  return { total, used };
}

/* ---------------------------
   Presentations-komponenter
   - små komponenter som holder ikon/row rendering isoleret
   --------------------------- */

/**
 * PurchaseRow
 * - Rækker i "Køb"-listen — viser ikon, titel, resource cost og en slider til antal.
 * - Forwarder ...rest til root DOM-element for at lade DockHoverCard håndtere events.
 */


/* MAYBE DELETE LATER?

function PurchaseRow({ def, defs, aniId, toBuy, setQty, availableCap, perItemStat, isAnimal, ...rest }) {
  const per = isAnimal
    ? Math.abs(Number(def?.stats?.[perItemStat] ?? 1)) || 1
    : Math.abs(Number(def?.stats?.[perItemStat] ?? 0)) || 0;

  const capUsedByOthers = useMemo(() => {
    return Object.entries(toBuy).reduce((sum, [id, qty]) => {
      if (id === aniId) return sum;
      const otherKey = id.replace(/^ani\./, '');
      const otherDef = defs.ani?.[otherKey];
      const otherPer = isAnimal
        ? Math.abs(Number(otherDef?.stats?.[perItemStat] ?? 1)) || 1
        : Math.abs(Number(otherDef?.stats?.[perItemStat] ?? 0)) || 0;
      return sum + otherPer * (Number(qty) || 0);
    }, 0);
  }, [toBuy, aniId, defs, perItemStat, isAnimal]);

  const remainingCap = Math.max(0, availableCap - capUsedByOthers);
  const maxVal = per > 0 ? Math.floor(remainingCap / per) : 999999;
  const currentVal = Math.min(Number(toBuy[aniId] || 0), maxVal);

  return (
    <div className="item" {...rest}>
      <div className="icon"><InlineIcon def={def} size={32} fallback={isAnimal ? '🐄' : '🏷️'} /></div>
      <div className="grow">
        <div className="title">{def.name}</div>
        <div className="sub">
          <ResourceCost cost={def.cost} />
        </div>
        <div className="sub">{isAnimal ? `Kræver ${Math.max(1, per)} staldplads` : (per > 0 ? `Forbruger ${per} units` : 'Ingen unit-forbrug')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <input
            type="range"
            className="slider"
            min="0"
            step="1"
            max={maxVal}
            value={currentVal}
            style={{ flexGrow: 1 }}
            onChange={(e) => setQty(aniId, parseInt(e.target.value, 10))}
            disabled={maxVal === 0}
          />
          <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'right' }}>{currentVal}</span>
        </div>
      </div>
    </div>
  );
}*/

/* ---------------------------
   Mindre utilities til icons / inline HTML
   - emojiForId / renderCostInline bruges i tekstuelle cost-felter
   --------------------------- */

/**
 * emojiForId(id, defs)
 * - Returnerer emoji-streng for res/ani id (fallback hvis intet ikon).
 */

/*MAYBE DELETE THIS FUNCTION LATER?

function emojiForId(id, defs) {
  if (id.startsWith('res.')) {
    const key = id.replace(/^res\./, '');
    const def = defs.res?.[key];
    return def?.emoji || '📦';
  }
  if (id.startsWith('ani.')) {
    const key = id.replace(/^ani\./, '');
    const def = defs.ani?.[key];
    return def?.emoji || '🐾';
  }
  return '•';
}*/

/**
 * renderCostInline(costLike, defs)
 * - Returnerer HTML-tekst for korte cost-udtryk (bruges i confirm-body).
 * - Inkluderer ikon <img> hvis def har iconUrl, ellers emoji.
 */
function renderCostInline(costLike, defs) {
  const entries = Object.values(H.normalizePrice(costLike || {}));
  if (!entries.length) return '';

  const escape = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const iconHtmlForId = (id) => {
    if (!id) return '';
    const isRes = String(id).startsWith('res.');
    const isAni = String(id).startsWith('ani.');
    const key = String(id).replace(/^(res\.|ani\.)/, '');
    let def = null;
    if (isRes) def = defs?.res?.[key];
    else if (isAni) def = defs?.ani?.[key];
    else def = defs?.res?.[key] || defs?.ani?.[key] || defs?.[key];

    if (!def) return '';
    let url = def.iconUrl || def.icon || (def.emoji && typeof def.emoji === 'object' && (def.emoji.iconUrl || def.emoji.url)) || '';
    const emojiStr = (typeof def.emoji === 'string' && def.emoji.trim()) ? def.emoji.trim() : (def.emojiChar || '');
    if (url && !/^\/|https?:\/\//i.test(url)) url = `/assets/icons/${url}`;
    if (url) {
      return `<img src="${escape(url)}" alt="${escape(def.name || key)}" style="width:2em;height:1em;vertical-align:-0.15em;object-fit:contain;display:inline-block;margin:0 6px" />`;
    }
    if (emojiStr) return escape(emojiStr);
    return '';
  };

  return entries
    .map((e) => {
      const icon = iconHtmlForId(e.id);
      return `${icon ? icon + ' ' : ''}${escape(H.fmt(e.amount))}`;
    })
    .join(' · ');
}

/* ---------------------------
   Yield / Price rendering blocks
   - Små komponenter der viser produce / pris information i hover-card
   --------------------------- */

/**
 * extractYields(def)
 * - Forsøger at hente yields/produce fra forskellige def-formater.
 * - Normaliserer til [{id: 'res.foo', amount: N}, ...]
 */
function extractYields(def) {
  if (!def) return [];
  const maybeObj = def.yields || def.produces || def.produce || def.output || def.outputs || def.yield;
  if (maybeObj && typeof maybeObj === 'object' && !Array.isArray(maybeObj)) {
    return Object.entries(maybeObj).map(([k, v]) => {
      const id = String(k).startsWith('res.') ? String(k) : String(k).replace(/^res\./, '').trim();
      const amt = Number(v || 0);
      return { id: id.startsWith('res.') ? id : `res.${id}`, amount: amt };
    }).filter(e => e.amount > 0);
  }
  if (Array.isArray(maybeObj)) {
    return maybeObj.map((it) => {
      if (!it) return null;
      if (typeof it === 'string') {
        const key = it.startsWith('res.') ? it : `res.${it.replace(/^res\./, '').trim()}`;
        return { id: key, amount: 1 };
      }
      if (typeof it === 'object') {
        const key = String(it.id || it.resource || it.res || '').trim();
        const id = key ? (key.startsWith('res.') ? key : `res.${key.replace(/^res\./, '')}`) : null;
        const amount = Number(it.amount || it.qty || it.count || 0);
        if (!id) return null;
        return { id, amount};
      }
      return null;
    }).filter(Boolean);
  }

  if (def.stats && (def.stats.yield || def.stats.yield_res)) {
    const amt = Number(def.stats.yield || 0);
    const res = def.stats.yield_res || def.stats.yield_resource || def.stats.produces;
    if (amt > 0 && res) {
      const id = String(res).startsWith('res.') ? String(res) : `res.${String(res).replace(/^res\./, '')}`;
      return [{ id, amount: amt }];
    }
  }

  return [];
}

/**
 * YieldBlock({ def, defs, H })
 * - Render en lille "produktion" blok med ikon, navn og amount/period.
 * - Bruges i hover-cards for units/animals.
 */
/*function YieldBlock({ def, defs, H }) {
  const yields = extractYields(def);
  if (!yields.length) return null;

  function formatPeriod(sec) {
    sec = Number(sec || 0);
    if (!sec || sec <= 0) return '';
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return m ? `${h} h ${m} m` : `${h} h`;
    }
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return s ? `${m} m ${s} s` : `${m} m`;
    }
    return `${sec}s`;
  }

  return (
    <div style={{ marginBottom: 8, marginTop: 8 }}><div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 0, display: 'grid', gap: 4, fontSize: 12 }}></div>
      <div className="sub"><strong>Yield / Produktion</strong></div>
      <div style={{ fontSize: 24, marginBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {yields.map((y) => {
            const resKey = String(y.id).replace(/^res\./, '');
            const resDef = defs?.res?.[resKey];
            const resName = (resDef && (resDef.name || resDef.label || resDef.title)) || resKey;
            const amt = Number(y.amount || 0);
            const sign = amt > 0 ? '+' : (amt < 0 ? '−' : '');
            const periodSec = Number(def?.yield_period_s || 0);
            const periodLabel = formatPeriod(periodSec);

            return (
              <div key={y.id} style={{ padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: '2.4em', minWidth: '2.4em', height: '2.4em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="icon" style={{ lineHeight: 1 }}>
                      <InlineIcon def={defs?.res?.[String(y.id).replace(/^res\./,'')] || { emoji: '📦' } } size={40} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{resName}</div>
                    <div style={{ fontSize: 13, color: '#333', marginTop: 4 }}>
                      <span style={{ fontWeight: 700 }}>{sign}{H.fmt(Math.abs(amt))}</span>
                      {periodLabel ? <span style={{fontWeight: 700, color: '#333', marginLeft: 8 }}>{`/ ${periodLabel}`}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
       
    </div>
  );
}*/

/**
 * PriceBlock({ def, defs, H, activeBuffs, qty })
 * - Vis prisstruktur i hover-card: stor ikon + navn + beløb (buffed)
 */
/*function PriceBlock({ def, defs, H, activeBuffs, qty = 1 }) {
  const entries = Object.values(H.normalizePrice(def?.cost || {}));
  if (!entries.length) return null;

  const items = entries.map((e) => {
    const base = Math.max(0, Number(e.amount || 0) * Number(qty || 1));
    const effRid = e.id.startsWith('res.') ? e.id : (defs?.res?.[e.id] ? `res.${e.id}` : e.id);
    const buffed = effRid.startsWith('res.')
      ? Math.ceil(applyCostBuffsToAmount(base, effRid, { appliesToCtx: 'all', activeBuffs }) || 0)
      : base;
    return { ...e, base, buffed };
  });

  return (
    <div style={{ marginBottom: 8, marginTop: 8 }}><div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 0, display: 'grid', gap: 4, fontSize: 12 }}></div>
      <div className="sub"><strong>Pris</strong></div>
      <div style={{ fontSize: 24, marginBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {items.map((it) => {
            const resKey = String(it.id).replace(/^res\./, '');
            const resDef = defs?.res?.[resKey];
            const name = (resDef && (resDef.name || resDef.label || resDef.title)) || resKey;
            const amountLabel = (it.base !== it.buffed) ? `${H.fmt(it.base)} → ${H.fmt(it.buffed)}` : H.fmt(it.buffed);
            return (
              <div key={it.id} style={{ padding: '6px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: '2.4em', minWidth: '2.4em', height: '2.4em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="icon" style={{ lineHeight: 1 }}><InlineIcon def={resDef || { emoji: '📦' }} size={40} /></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 13, color: '#333', marginTop: 4 }}>{amountLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}*/

/* ---------------------------
   Icon wrapper (genbrug central Icon komponent)
   - Holder UnitPage kort ved at genbruge ui/Icon.jsx
   - Viser emoji string hvis der ikke findes bildefelt
   --------------------------- */

/**
 * InlineIcon({ def, size, fallback })
 * - Hjælper til at vise enten billed-ikon via Icon-komponenten eller fallback emoji.
 */
function InlineIcon({ def, size = 32, fallback = '📦' }) {
  const hasImg = Boolean(def && (def.iconUrl || def.iconFilename || (def.emoji && typeof def.emoji === 'object') || def.icon));
  if (hasImg) {
    return <Icon def={def} size={typeof size === 'number' ? size : parseInt(size, 10) || 32} fallback="/assets/icons/default.png" />;
  }
  const emojiStr = (def && typeof def.emoji === 'string') ? def.emoji : (def && def.emojiChar) || null;
  if (emojiStr) return <span style={{ fontSize: typeof size === 'number' ? size : undefined }}>{emojiStr}</span>;
  return <span>{fallback}</span>;
}

/* ---------------------------
   Hoved-komponenten: UnitPage
   - Involverer data-hentning, derivater og UI-rendering
   --------------------------- */

export default function UnitPage({ embedFamily = null, embed = false }) {
  /* --- Hooks / ekstern data --- */
  const { data, isLoading, error, refreshData } = useGameData();
  const { data: header } = useHeaderSummary();

  /* --- Lokal UI state --- */
  const [selectedKey, setSelectedKey] = useState(null);
  const [confirm, setConfirm] = useState({ isOpen: false, title: '', body: '', onConfirm: null });
  const [toBuyByGroup, setToBuyByGroup] = useState({}); // per-group purchase selections

  if (isLoading) return <div className="sub">Indlæser...</div>;
  if (error || !data) return <div className="sub">Fejl.</div>;

  const { state, defs } = data;

  /* --- Derived: familiesOwned, visible groups, selected group osv. --- */

  // Hvilke families har spilleren bygninger i — bruges til at bestemme tabs
  const familiesOwned = useMemo(() => {
    const set = new Set();
    Object.keys(state?.bld || {}).forEach((id) => {
      const p = H.parseBldKey(id);
      if (p?.family) set.add(p.family);
    });
    return set;
  }, [state?.bld]);

  // Hvilke unit-grupper skal vises (kan begrænses via embedFamily)
  const visibleGroups = useMemo(() => {
    if (embedFamily) {
      const g = UNIT_GROUPS.find((x) => x.family === embedFamily);
      return g ? [g] : [];
    }
    return UNIT_GROUPS.filter((g) => familiesOwned.has(g.family));
  }, [familiesOwned, embedFamily]);

  // Vælg aktiv tab (fallback til første hvis current er ugyldig)
  const effectiveSelectedKey = useMemo(() => {
    if (embedFamily) {
      return visibleGroups[0]?.key || null;
    }
    if (selectedKey && visibleGroups.some((g) => g.key === selectedKey)) return selectedKey;
    return visibleGroups[0]?.key || null;
  }, [selectedKey, visibleGroups, embedFamily]);

  const group = useMemo(() => {
    return visibleGroups.find((g) => g.key === effectiveSelectedKey) || null;
  }, [effectiveSelectedKey, visibleGroups]);

  const isAnimal = group?.capacityMode === 'animalCap';

  /* --- Lists / derived data for rendering --- */

  const availableDefs = useMemo(() => {
    if (!group) return [];
    return Object.entries(defs.ani || {}).filter(([_, def]) => {
      const fams = String(def?.family || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const inFamily = fams.includes(group.family);
      if (!inFamily) return false;
      const stageOk = Number(def?.stage || 0) <= Number(state?.user?.currentstage || 0);
      return stageOk;
    });
  }, [defs?.ani, state?.user?.currentstage, group]);

  const ownedUnits = useMemo(() => {
    if (!group) return [];
    return Object.entries(state?.ani || {}).filter(([id, a]) => {
      if ((a?.quantity || 0) <= 0) return false;
      const key = id.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) return false;
      const fams = String(def?.family || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return fams.includes(group.family);
    });
  }, [state?.ani, defs?.ani, group]);

  /* --- Capacity / totals --- */
  const totals = useMemo(() => {
    if (!group) return { total: 0, used: 0 };

    if (isAnimal) {
      const cap = state?.cap?.animal_cap || { total: 0, used: 0 };
      return { total: Number(cap.total || 0), used: Number(cap.used || 0) };
    }

    const hc = group.headerCapacityKey;
    const hu = group.headerUsageKey;
    const headerTotal = Number(header?.capacities?.[hc] ?? NaN);
    const headerUsed = Number(header?.usages?.[hu]?.total ?? NaN);

    const fb = computeUnitTotalsFallback(defs, state, group);

    const headerLooksValid =
      Number.isFinite(headerTotal) &&
      Number.isFinite(headerUsed) &&
      (headerTotal > 0 || headerUsed > 0 || (headerTotal === 0 && headerUsed === 0 && fb.total === 0));

    return headerLooksValid ? { total: headerTotal, used: headerUsed } : { total: fb.total, used: fb.used };
  }, [group, isAnimal, state, defs, header]);

  /* --- Purchase cart state and helpers --- */
  const toBuy = toBuyByGroup[effectiveSelectedKey] || {};

  const setQty = useCallback(
    (aniId, value) => {
      if (!group) return;
      setToBuyByGroup((prev) => {
        const bucket = { ...(prev[effectiveSelectedKey] || {}) };
        if (value > 0) bucket[aniId] = value;
        else delete bucket[aniId];
        return { ...prev, [effectiveSelectedKey]: bucket };
      });
    },
    [effectiveSelectedKey, group]
  );

  const activeBuffs = useMemo(() => collectActiveBuffs(defs), [defs]);

  const basket = useMemo(() => {
    if (!group) return null;

    const total = Number(totals.total || 0);
    const used = Number(totals.used || 0);

    let capToUse = 0;
    const totalCostBase = {};
    const totalCostBuffed = {};

    for (const [aniId, qty] of Object.entries(toBuy)) {
      if (!qty) continue;
      const key = aniId.replace(/^ani\./, '');
      const def = defs.ani?.[key];
      if (!def) continue;

      const per = isAnimal
        ? Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1
        : Math.abs(Number(def?.stats?.[group.perItemStat] ?? 0)) || 0;
      capToUse += per * qty;

      const costs = H.normalizePrice(def?.cost || {});
      Object.values(costs).forEach((entry) => {
        const rid = entry.id;
        const baseAmt = (entry.amount || 0) * qty;

        totalCostBase[rid] = (totalCostBase[rid] || 0) + baseAmt;

        const effRid = rid.startsWith('res.') ? rid : (defs?.res?.[rid] ? `res.${rid}` : rid);
        const buffedAmt = effRid.startsWith('res.')
          ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
          : baseAmt;
        totalCostBuffed[rid] = (totalCostBuffed[rid] || 0) + buffedAmt;
      });
    }

    const availableCap = Math.max(0, total - used);
    const getHave = (resId) => {
      const key = String(resId).replace(/^res\./, '');
      const liquid = Number(state?.inv?.liquid?.[key] || 0);
      const solid = Number(state?.inv?.solid?.[key] || 0);
      return liquid + solid;
    };
    const canAffordBuffed = Object.entries(totalCostBuffed).every(([rid, amt]) => getHave(rid) >= (amt || 0));
    const totalQty = Object.values(toBuy).reduce((s, q) => s + (Number(q) || 0), 0);

    return {
      total,
      used,
      availableCap,
      capToUse,
      totalCostBase,
      totalCostBuffed,
      canAffordBuffed,
      hasCapacity: capToUse <= availableCap,
      totalQty
    };
  }, [group, totals, toBuy, defs, state, isAnimal, activeBuffs]);

  const combinedAnimals = useMemo(() => {
    if (embed || !group || group.capacityMode !== 'animalCap') return null;

    const total = Number(totals.total || 0);
    const used = Number(totals.used || 0);

    let capToUseAll = 0;
    const costAllBuffed = {};

    const animalGroups = UNIT_GROUPS.filter(g => g.capacityMode === 'animalCap');
    for (const ag of animalGroups) {
      const bucket = toBuyByGroup[ag.key] || {};
      for (const [aniId, qty] of Object.entries(bucket)) {
        if (!qty) continue;
        const key = String(aniId).replace(/^ani\./, '');
        const def = defs.ani?.[key];
        if (!def) continue;

        const per = Math.abs(Number(def?.stats?.[ag.perItemStat] ?? 1)) || 1;
        capToUseAll += per * (Number(qty) || 0);

        const costs = H.normalizePrice(def?.cost || {});
        Object.values(costs).forEach((entry) => {
          const rid = entry.id;
          const baseAmt = (entry.amount || 0) * (Number(qty) || 0);
          const effRid = rid.startsWith('res.') ? rid : (defs?.res?.[rid] ? `res.${rid}` : rid);
          const buffedAmt = effRid.startsWith('res.')
            ? applyCostBuffsToAmount(baseAmt, effRid, { appliesToCtx: 'all', activeBuffs })
            : baseAmt;
          costAllBuffed[rid] = (costAllBuffed[rid] || 0) + buffedAmt;
        });
      }
    }

    const availableCap = Math.max(0, total - used);
    const getHave = (resId) => {
      const key = String(resId).replace(/^res\./, '');
      const liquid = Number(state?.inv?.liquid?.[key] || 0);
      const solid = Number(state?.inv?.solid?.[key] || 0);
      return liquid + solid;
    };
    const canAfford = Object.entries(costAllBuffed).every(([rid, amt]) => getHave(rid) >= (amt || 0));

    return { hasCapacity: capToUseAll <= availableCap, canAfford };
  }, [embed, group, totals, toBuyByGroup, defs, state, activeBuffs]);

  const buyDisabled = useMemo(() => {
    if (!basket || basket.totalQty === 0) return true;
    if (!embed && group?.capacityMode === 'animalCap' && combinedAnimals) {
      return !(combinedAnimals.canAfford && combinedAnimals.hasCapacity);
    }
    return !(basket.canAffordBuffed && basket.hasCapacity);
  }, [basket, embed, group, combinedAnimals]);

  /* ---------------------------
     Handlere: buy / sell
     - Kalder backend og genindlæser data ved succes
     --------------------------- */

  const handleBuy = useCallback(async () => {
    if (!basket) return;
    const animals = Object.fromEntries(Object.entries(toBuy).filter(([, q]) => Number(q) > 0));
    if (!Object.keys(animals).length || basket.totalQty <= 0) throw new Error('No items selected.');

    if (!basket.hasCapacity) throw new Error('Insufficient capacity.');
    const affordOk = (!embed && group?.capacityMode === 'animalCap' && combinedAnimals)
      ? combinedAnimals.canAfford
      : basket.canAffordBuffed;
    if (!affordOk) throw new Error('Insufficient resources.');

    const res = await fetch('/world-spil/backend/api/actions/animal.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'buy', animals }),
    });
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.message || 'Server refused purchase.');
    setToBuyByGroup((prev) => ({ ...prev, [effectiveSelectedKey]: {} }));
    await refreshData();
    return json;
  }, [basket, toBuy, effectiveSelectedKey, refreshData, embed, group, combinedAnimals]);

  const handleSell = useCallback(
    async (aniId, quantity) => {
      if (!aniId || !quantity) return;
      const res = await fetch('/world-spil/backend/api/actions/animal.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sell', animal_id: aniId, quantity }),
      });
      const json = await res.json();
      if (json && json.ok === false) throw new Error(json.message || 'Server refused sale.');
      await refreshData();
      return json;
    },
    [refreshData]
  );

  const openBuyConfirm = () => {
    if (!basket?.totalQty) return;
    const costText = renderCostInline(basket.totalCostBuffed, defs);

    setConfirm({
      isOpen: true,
      title: `Bekræft køb (${group?.label || 'Units'})`,
      body: `Du køber ${basket.totalQty} enhed(er).<br/><div style="margin-top:8px;">Pris: ${costText || '(ukendt)'}</div>`,
      onConfirm: async () => {
        try {
          await handleBuy();
        } catch (e) {
          alert(e.message || 'Køb fejlede.');
        } finally {
          setConfirm((c) => ({ ...c, isOpen: false }));
        }
      },
    });
  };

  const openSellConfirm = (aniId, quantity) => {
    const key = aniId.replace(/^ani\./, '');
    const def = defs.ani?.[key];
    if (!def) return;

    const costs = H.normalizePrice(def.cost || {});
    const refundMap = {};
    Object.values(costs).forEach((entry) => {
      refundMap[entry.id] = { id: entry.id, amount: (entry.amount || 0) * quantity * 0.5 };
    });
    const refundText = renderCostInline(refundMap, defs);

    setConfirm({
      isOpen: true,
      title: quantity === 1 ? 'Sælg 1 enhed' : `Sælg ${quantity} enheder`,
      body: `Du får følgende tilbage:<br/><div style="margin-top: 8px">${refundText || '(ukendt værdi)'}</div>`,
      onConfirm: async () => {
        try {
          await handleSell(aniId, quantity);
        } catch (e) {
          alert(e.message || 'Salg fejlede.');
        } finally {
          setConfirm((c) => ({ ...c, isOpen: false }));
        }
      },
    });
  };

  /* ---------------------------
     Render: struktur og sektioner
     - Tabs (øverst)
     - Owned units liste
     - Buy list + actions bar
     - ConfirmModal
     --------------------------- */

  if (!group) {
    return (
      <section className="panel section">
        <div className="section-head">Units</div>
        <div className="section-body">
          <div className="sub">Ingen unit-grupper tilgængelige. Byg først relevante faciliteter.</div>
        </div>
      </section>
    );
  }

  const capLabel = group.capacityLabel || (isAnimal ? 'Staldplads' : 'Units');
  
  return (
    <>
      {/* Tabs (kun i fuld side) */}
      {!embed && (
        <section className="panel section">
          <div className="section-head" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Units</span>
            <div className="tabs" style={{ marginLeft: 'auto' }}>
              {visibleGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`tab ${g.key === effectiveSelectedKey ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedKey(g.key);
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* EJEDE UNITS sektion */}
      <section className="panel section">
        <div className="section-head">
          {group.label} – Dine enheder
          <span style={{ marginLeft: 'auto' }}>
            <strong>{capLabel}:</strong> {H.fmt((Number(totals.used || 0)) + 0)} / {H.fmt(Number(totals.total || 0))}
          </span>
        </div>
        <div className="section-body">
          {ownedUnits.map(([aniId, row]) => {
            const key = aniId.replace(/^ani\./, '');
            const def = defs.ani[key];
            const qty = Number(row?.quantity || 0);
            const per = isAnimal
              ? Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1
              : Math.abs(Number(def?.stats?.[group.perItemStat] ?? 0)) || 0;
            const perLabel = isAnimal ? `Optager ${per} staldplads` : `Forbruger ${per} units`;
            const hoverContent = (
              <div style={{ minWidth: 220 }}>
                <StatsEffectsTooltip def={def} translations={data?.i18n?.current ?? {}} />
                <RequirementPanel def={def} defs={defs} state={state} show={{ resources: true, requirements: true, footprint: false, duration: false }} />
              </div>
            );

            return (
              <DockHoverCard key={aniId} content={hoverContent}>
                <div className="item">
                  <div className="icon" style={{ fontSize: '2em' }}><InlineIcon def={def} size={32} fallback={isAnimal ? '🐄' : '🏷️'} /></div>
                  <div>
                    <div className="title">
                      {def.name} (x{H.fmt(qty)})
                    </div>
                    <div className="sub">{perLabel}</div>
                  </div>
                  <div className="right">
                    <button className="btn" onClick={() => openSellConfirm(aniId, 1)}>
                      Sælg 1
                    </button>
                    <button className="btn" onClick={() => openSellConfirm(aniId, qty)}>
                      Sælg alle
                    </button>
                  </div>
                </div>
              </DockHoverCard>
            );
          })}
        </div>
      </section>

      {/* KØB sektion */}
      <section className="panel section">
        <div className="section-head">Køb {group.label}</div>
        <div className="section-body">
          {availableDefs.map(([key, def]) => {
            const hoverContent = (
              <div style={{ minWidth: 220 }}>
                <StatsEffectsTooltip def={def} translations={data?.i18n?.current ?? {}} />
                <RequirementPanel def={def} defs={defs} state={state} show={{ resources: true, requirements: true, footprint: false, duration: false }} />
              </div>
            );
            const aniId = `ani.${key}`;
            const per = isAnimal
              ? Math.abs(Number(def?.stats?.[group.perItemStat] ?? 1)) || 1
              : Math.abs(Number(def?.stats?.[group.perItemStat] ?? 0)) || 0;
            const availableCap = Math.max(0, Number(totals.total || 0) - Number(totals.used || 0));
            const maxVal = per > 0 ? Math.floor(availableCap / per) : 999999;
            const currentVal = Math.min(Number(toBuy[aniId] || 0), maxVal);

            return (
              <DockHoverCard key={key} content={hoverContent}>
                <div className="item">
                  <div className="icon" style={{ fontSize: '2em' }}><InlineIcon def={def} size={32} fallback={isAnimal ? '🐄' : '🏷️'} /></div>
                  <div className="grow">
                    <div className="title">{def.name}</div>
                    <div className="sub">
                      <ResourceCost cost={def.cost || {}} />
                    </div>
                    <div className="sub">{isAnimal ? `Kræver ${per} staldplads` : (per > 0 ? `Forbruger ${per} units` : 'Ingen unit-forbrug')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                      <input
                        type="range"
                        className="slider"
                        min="0"
                        step="1"
                        max={maxVal}
                        value={currentVal}
                        style={{ flexGrow: 1 }}
                        onChange={(e) => setQty(aniId, parseInt(e.target.value, 10))}
                        disabled={maxVal === 0}
                      />
                      <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'right' }}>{currentVal}</span>
                    </div>
                  </div>
                </div>
              </DockHoverCard>
            );
          })}
<div className="actions-bar" style={{ marginTop: '16px' }}>
  <div>
    <strong>Total:</strong> <ResourceCost cost={basket?.totalCostBase || {}} /> &nbsp;
    <strong style={{ marginLeft: '1em' }}>{capLabel}:</strong>
    <span className={!basket?.hasCapacity ? 'price-bad' : ''}>
      {H.fmt((basket?.used || 0) + (basket?.capToUse || 0))}
    </span>
    {' / '}
    {H.fmt(basket?.total || 0)}
  </div>
  <button
    className="btn primary"
    disabled={buyDisabled}
    onClick={openBuyConfirm}
  >
    Køb valgte {group.label.toLowerCase()}
  </button>
</div>

  {basket?.shortfalls && Object.keys(basket.shortfalls).length > 0 && (
  <div style={{ marginTop: 8, color: '#f66', fontSize: 13 }}>
    <strong>Manglende ressourcer:</strong>
    <div>
      {Object.entries(basket.shortfalls).map(([id, s]) => (
        <div key={id}>
          {id.replace(/^res\./, '')}: mangler {H.fmt(s.need - s.have)} ({H.fmt(s.have)} / {H.fmt(s.need)})
        </div>
      ))}
    </div>
  </div>
)}
        </div>
      </section>

      {/* Bekræft modal — genbruges for både køb og salg */}
      <ConfirmModal
        isOpen={confirm.isOpen}
        title={confirm.title}
        body={confirm.body}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, isOpen: false }))}
        confirmText="OK"
        cancelText="Annuller"
      />
    </>
  );
}