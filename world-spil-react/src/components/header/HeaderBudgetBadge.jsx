import React, { useState, useEffect, useRef } from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import HoverCard from '../ui/HoverCard.jsx';
import Modal from '../ui/Modal.jsx'; // <-- tilpas sti/navn hvis din modal ligger et andet sted
import { useT } from "../../services/i18n.js";
import Icon from '../ui/Icon.jsx';

function fmtNum(v) {
  return Number(v || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 });
}

// --- NYT: helper til pæn label + value/percent render ---
const POLICY_LABELS = {
  health_free_dentist_kids: 'Gratis tandpleje — børn',
  health_free_dentist_young: 'Gratis tandpleje — unge',
  health_free_dentist_adults: 'Gratis tandpleje — voksne',
  health_wait_target_days: 'Maks. ventetid (dage)',
  // tilføj flere faste mappings efter behov
};

function prettifyKey(k) {
  if (!k) return '';
  if (POLICY_LABELS[k]) return POLICY_LABELS[k];
  // Fjern evt. kendte præfikser og gør snake_case til Title Case
  const withoutPrefix = k.replace(/^(health_|use_|choiceByPolicy_)/i, '');
  return withoutPrefix.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

function extractValue(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(v.total ?? v.choice_total ?? v.amount ?? 0);
}

function renderPolicyEntry(key, v, totalForGroup) {
  const value = extractValue(v);
  const pct = totalForGroup > 0 ? Math.round((value / totalForGroup) * 100) : null;
  return (
    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--muted, #999)' }}>{prettifyKey(key)}</span>
      <span style={{ fontWeight: 600 }}>
        {fmtNum(value)}{pct != null ? ` (${pct}%)` : ''}
      </span>
    </div>
  );
}

export default function HeaderBudgetBadge() {
  // inkluder isFetching fra hook (bruges til visuel indikation)
  const { data, loading, err, isFetching } = useHeaderSummary();
  const t = useT();

  // Gem sidste valide data for at undgå unmount/re-mount flicker
  const lastDataRef = useRef(data);
  useEffect(() => { if (data) lastDataRef.current = data; }, [data]);
  const effective = data || lastDataRef.current;

  // --- flytede hooks: altid kald hooks her, før tidlige return ---
  const [open, setOpen] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [citizensExpanded, setCitizensExpanded] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Vis kun når vi har effektive data (brug last cached data under revalidate)
  if (!effective) return null;

  const usages = effective?.usages ?? {};
  const capacities = effective?.capacities ?? {};
  const metaMap = effective?.metricsMeta ?? {};

  // Total tax-usage: sum af alle usage entries hvor key starter med "tax"
  const taxUsed = usages.useTax?.total;

  // Kapacitet: prøv taxCapacity, ellers budgetCapacity som fallback
  const taxCap = Number(
    capacities.taxCapacity ??
    capacities.budgetCapacity ??
    0
  );
  const taxHealth = usages.useTaxHealth?.total || {};
  const taxHealthByPolicy = usages.useTaxHealth?.choiceByPolicy || {};
  const taxHealthMeta = metaMap?.taxHealth || {};
  const taxCitizens = usages.useTaxCitizens?.total || {};
  // const taxCitizensIncome = capacities.taxCitizensCapacity || {};
  const taxCitizensIncome = Number(extractValue(capacities.taxCitizensCapacity) || 0);
  const taxCitizensByPolicy = usages.useTaxCitizens?.citizens || {};

  const diff = (Number(taxCap) || 0) - (Number(taxUsed) || 0);
  const diffIncome = diff > 0 ? diff : 0;
  const diffExpense = diff < 0 ? -diff : 0;

  // --- NY: render en række med to kolonner (Indkomst / Udgift) ---
  const colStyle = { width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  function renderTwoColsRow(label, income = 0, expense = 0, key = null) {
    return (
      <div key={key || label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
        <div style={{ color: 'var(--muted, #999)', flex: '1 1 auto' }}>{label}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ ...colStyle, color: income ? 'var(--income, #198754)' : 'var(--muted, #999)' }}>{income ? fmtNum(income) : ''}</div>
          <div style={{ ...colStyle, color: expense ? 'var(--expense, #dc3545)' : 'var(--muted, #999)' }}>{expense ? fmtNum(expense) : ''}</div>
        </div>
      </div>
    );
  }

  // renderrække for policy-items (policy-data kommer fra usages => skal ses som udgift)
  const renderPolicyRow = (key, raw, totalForGroup) => {
    const val = extractValue(raw);
    // per dit ønske: comes-from-usage => expense
    return renderTwoColsRow(prettifyKey(key), 0, val, key);
  }

  const modalContent = (
    <div style={{ minWidth: 360 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Budget detaljer</div>

      <div style={{ display: 'grid', gap: 8 }}>
        {/* Header-række: label + to kolonner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ color: 'var(--muted, #999)', flex: '1 1 auto' }}>Metrik</div>
          <div style={{ display: 'flex', gap: 12, width: 260, justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right', width: 120, color: 'var(--income, #198754)', fontWeight: 600 }}>Indkomst</div>
            <div style={{ textAlign: 'right', width: 120, color: 'var(--expense, #dc3545)', fontWeight: 600 }}>Udgift</div>
          </div>
        </div>

        {/* Samlede rækker — brug regel: usages => udgift, capacities => indkomst */}
        {renderTwoColsRow('Forbrug ialt (tax)', 0, taxUsed, 'taxUsed')}

        {/* Sundhed-klikbar række: klik folder detaljer ud.
            Vis tal i samme to-kolonne-format (ingen pil). Farver styres i renderTwoColsRow */}
        <div
          role="button"
          aria-expanded={healthExpanded}
          onClick={() => setHealthExpanded(s => !s)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          {renderTwoColsRow('Sundhed (tax) ⏷', 0, extractValue(taxHealth) || 0, 'sundhed')}
          
          {healthExpanded && (
            <div style={{ padding: '8px 12px 12px 12px', background: 'var(--panel-alt, rgba(255,255,255,0.02))', borderRadius: 6 }}>
              {(Object.entries(taxHealthByPolicy || {}).length === 0) ? (
                <div style={{ fontSize: 13, color: 'var(--muted, #999)' }}>Ingen detaljer tilgængelige</div>
              ) : (
                (() => {
                  const entries = Object.entries(taxHealthByPolicy || {});
                  const totalForGroup = entries.reduce((acc, [, val]) => acc + extractValue(val), 0) || (extractValue(taxHealth) || 0);
                  return entries.map(([k, v]) => renderPolicyRow(k, v, totalForGroup));
                })()
              )}
            </div>
          )}
        </div>

        {/* Andre rækker */}
        {/* Borgere-klikbar række: klik folder detaljer ud (ingen pil) */}
        <div
          role="button"
          aria-expanded={citizensExpanded}
          onClick={() => setCitizensExpanded(s => !s)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          {renderTwoColsRow('Udbetalinger (løn/offentlig ydelse) ⏷', 0, extractValue(taxCitizens) || 0, 'taxCitizens')}

          {citizensExpanded && (
            <div style={{ padding: '8px 12px 12px 12px', background: 'var(--panel-alt, rgba(255,255,255,0.02))', borderRadius: 6 }}>
              {(!taxCitizensByPolicy || Object.keys(taxCitizensByPolicy).length === 0) ? (
                <div style={{ fontSize: 13, color: 'var(--muted, #999)' }}>Ingen detaljer tilgængelige</div>
              ) : (
                (() => {
                  const entries = Object.entries(taxCitizensByPolicy);
                  console.debug('HeaderBudgetBadge: taxCitizensByPolicy entries', entries);
                  const totalForGroup = entries.reduce((acc, [, val]) => {
                    const amt = Number(val?.amount ?? val?.total ?? extractValue(val) ?? 0);
                    return acc + (Number.isFinite(amt) ? amt : 0);
                  }, 0) || (extractValue(taxCitizens) || 0);
                  return entries.map(([k, v]) => {
                    const name = v?.name || (metaMap?.taxCitizens && (metaMap.taxCitizens.labels?.[k] || metaMap.taxCitizens.names?.[k])) || POLICY_LABELS[k] || prettifyKey(k) || k;
                    const amount = Number(v?.amount ?? v?.total ?? extractValue(v) ?? 0);
                    const pct = totalForGroup > 0 ? Math.round((amount / totalForGroup) * 100) : null;
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                        <div style={{ color: 'var(--muted, #999)' }}>{name}</div>
                        <div style={{ fontWeight: 600, color: 'var(--expense, #dc3545)' }}>
                          {fmtNum(amount)}{pct != null ? ` (${pct}%)` : ''}
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed var(--border, #e5e7eb)', paddingTop: 8 }}>
          <div style={{ fontWeight: 700 }}>Indtægter:</div>
          <div style={{ fontSize: 13, color: 'var(--muted, #999)' }}>
            {/* Andre rækker */}
        {renderTwoColsRow('Borger (skatte indtægter)', taxCitizensIncome, 0, 0)}
        
            {/* detaljer */}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed var(--border, #e5e7eb)', paddingTop: 8 }}>
          <div style={{ fontWeight: 700 }}>Ialt:</div>
          <div style={{ fontSize: 13, color: 'var(--muted, #999)' }}>
            {/* Andre rækker */}
        {renderTwoColsRow('Opgørelse', taxCap, extractValue(taxUsed) || 0, 'taxHealth')}
        {renderTwoColsRow('Forskel', diffIncome, diffExpense, 'taxDiff')}  
            {/* detaljer */}
          </div>
        </div>
      </div>
    </div>
  );

  const ratio = taxCap > 0 ? Math.max(0, Math.min(1, taxUsed / taxCap)) : 0;
  const pct = Math.round(ratio * 100);

  // Blink-effekt når taxUsed ændrer sig (visuel feedback)
  const lastTaxRef = useRef(taxUsed);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (lastTaxRef.current !== undefined && lastTaxRef.current !== taxUsed) {
      setBlink(true);
      const tBlink = setTimeout(() => setBlink(false), 180);
      return () => clearTimeout(tBlink);
    }
    lastTaxRef.current = taxUsed;
  }, [taxUsed]);

  const hoverContent = (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Budget</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Forbrug (tax)</span><span>{fmtNum(taxUsed)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Indkomst (tax)</span><span>{fmtNum(taxCap)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Forskel</span><span>{fmtNum(diff)}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted, #888)' }}>
        Klik for flere detaljer
      </div>
    </div>
  );

  return (
    <>
      <HoverCard content={hoverContent} cardStyle={{ maxWidth: 360, minWidth: 220 }}>
        <span
          className="res-chip"
          title={isFetching ? 'Opdaterer...' : 'Budget (tax)'}
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'opacity 160ms ease, transform 160ms ease',
            opacity: blink ? 0.5 : (isFetching ? 0.65 : 1),
            transform: blink ? 'translateY(-4px)' : 'translateY(0)',
          }}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          
        <Icon src="/assets/icons/symbol_tax.png" size={18} alt="happiness" /> {fmtNum(taxUsed)} / {fmtNum(taxCap)}
        </span>
      </HoverCard>

      {/* Klik-åbnet modal (brug projektets modal-komponent så stilen matcher resten af appen) */}
      <Modal open={open} onClose={() => setOpen(false)} title="Budget" size="medium">
        <div style={{ padding: 12, maxWidth: 640 }}>
          {modalContent}
        </div>
      </Modal>
    </>
  );
}