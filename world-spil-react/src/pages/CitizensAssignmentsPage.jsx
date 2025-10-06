import React, { useEffect, useMemo, useState } from 'react';
import { useT } from "../services/i18n.js";

const ROLE_ORDER = [
  { key: 'adultsPolice', label: 'Police' },
  { key: 'adultsFire', label: 'Fire' },
  { key: 'adultsHealth', label: 'Health' },
  { key: 'adultsSoldier', label: 'Soldier' },
  { key: 'adultsGovernment', label: 'Government' },
  { key: 'adultsPolitician', label: 'Politician' },
  { key: 'adultsWorker', label: 'Worker' },
];

// Strikt mapping: rolle → korrekt kapacitetsfelt
const CAP_KEY_MAP = {
  adultsPolice:     'adultsPoliceCapacity',
  adultsFire:       'adultsFireCapacity',
  adultsHealth:     'adultsHealthCapacity',
  adultsSoldier:    'adultsSoldierCapacity',
  adultsGovernment: 'adultsGovernmentCapacity',
  adultsPolitician: 'adultsPoliticianCapacity',
  adultsWorker:     'adultsWorkerCapacity',
};

export default function CitizenAssignmentsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [state, setState] = useState(null);
  const [assign, setAssign] = useState({});
  const t = useT();

  const fetchState = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/world-spil/backend/api/actions/citizens_assignments.php', {
        credentials: 'include',
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Ukendt fejl');
      const s = json.data;
      setState(s);

      // Init sliders fra nuværende citizens-stand
      const next = {};
      ROLE_ORDER.forEach(({ key }) => {
        next[key] = Number(s?.citizens?.[key] ?? 0);
      });
      setAssign(next);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchState(); }, []);

  const totals = useMemo(() => {
    if (!state) return { totalAdults: 0, totalNonHomeless: 0, sumAssign: 0, unemployedWillBe: 0 };
    const {
      citizens: c = {},
    } = state;

    const totalAdults = Number(c.adultsUnemployed||0) + Number(c.adultsWorker||0) + Number(c.adultsPolice||0) +
                        Number(c.adultsFire||0) + Number(c.adultsHealth||0) + Number(c.adultsSoldier||0) +
                        Number(c.adultsGovernment||0) + Number(c.adultsPolitician||0) + Number(c.adultsHomeless||0);

    const totalNonHomeless = totalAdults - Number(c.adultsHomeless||0);

    const sumAssign = ROLE_ORDER.reduce((a, { key }) => a + Number(assign[key] || 0), 0);
    const unemployedWillBe = Math.max(0, totalNonHomeless - sumAssign);

    return { totalAdults, totalNonHomeless, sumAssign, unemployedWillBe };
  }, [state, assign]);

  // Brug eksplicit kapacitetsnøgle – ingen wildcard '*Capacity'
  const clampForView = (key) => {
    if (!state) return { cap: 0, max: 0 };
    const capKey = CAP_KEY_MAP[key];
    const capRaw = capKey ? Number(state?.caps?.[capKey] ?? 0) : 0;
    const current = Number(state?.citizens?.[key] ?? 0);

    // Politician: tag også hensyn til ratio-limit i UI
    if (key === 'adultsPolitician') {
      const polMax = Number(state?.limits?.politicianMax ?? 0);
      const effCap = Math.max(capRaw, current, polMax);
      return { cap: effCap, max: effCap };
    }

    const effCap = Math.max(capRaw, current);
    return { cap: effCap, max: effCap };
  };

  const onChange = (key, val) => {
    const v = Math.max(0, Math.floor(Number(val) || 0));
    setAssign(s => ({ ...s, [key]: v }));
  };

  const onSave = async () => {
    if (!state) return;
    setSaving(true);
    setErr('');
    try {
      const payload = { assignments: assign };
      const res = await fetch('/world-spil/backend/api/actions/citizens_assignments.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Ukendt fejl');
      // Refetch for at se serverens clamps/kriminalitets-fordeling m.m.
      await fetchState();
      alert('Gemt.');
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="panel" style={{ maxWidth: 760, margin: '0 auto' }}>Indlæser...</div>;
  if (err) return <div className="panel" style={{ maxWidth: 760, margin: '0 auto', color: 'red' }}>Fejl: {err}</div>;
  if (!state) return null;

  const polMax = Number(state?.limits?.politicianMax || 0);
  const polVal = Number(assign.adultsPolitician || 0);
 
  return (
    <div className="" style={{margin: '0 auto' }}>
      <div className="section-head">Borgere – Tildeling (Adults)</div>

      <div className="section-body">

              <div style={{ margin: '10px 0', padding: 10, background: '#1f2937', borderRadius: 8, textAlign: 'center' }}>

      <span title={t("ui.citizens.baby.h1")} aria-label={t('ui.emoji.baby.h1')}>{t("ui.emoji.baby.h1")} {state?.citizens?.baby} | </span>
      <span title={t("ui.citizens.kids_street.h1")} aria-label={t('ui.emoji.kids_street.h1')}>{t("ui.emoji.kids_street.h1")} {state?.citizens?.kidsStreet} | </span>
      <span title={t("ui.citizens.kids_student.h1")} aria-label={t('ui.emoji.kids_student.h1')}>{t("ui.emoji.kids_student.h1")} {state?.citizens?.kidsStudent} | </span>
      <span title={t("ui.citizens.young_worker.h1")} aria-label={t('ui.emoji.young_worker.h1')}>{t("ui.emoji.young_worker.h1")} {state?.citizens?.youngWorker} | </span>
      <span title={t("ui.citizens.young_student.h1")} aria-label={t('ui.emoji.young_student.h1')}>{t("ui.emoji.young_student.h1")} {state?.citizens?.youngStudent} | </span>
      <span title={t("ui.citizens.adults_police.h1")} aria-label={t('ui.emoji.adults_police.h1')}>{t("ui.emoji.adults_police.h1")} {state?.citizens?.adultsPolice} | </span>
      <span title={t("ui.citizens.adults_fire.h1")} aria-label={t('ui.emoji.adults_fire.h1')}>{t("ui.emoji.adults_fire.h1")} {state?.citizens?.adultsFire} | </span>
      <span title={t("ui.citizens.adults_health.h1")} aria-label={t('ui.emoji.adults_health.h1')}>{t("ui.emoji.adults_health.h1")} {state?.citizens?.adultsHealth} | </span>
      <span title={t("ui.citizens.adults_soldier.h1")} aria-label={t('ui.emoji.adults_soldier.h1')}>{t("ui.emoji.adults_soldier.h1")} {state?.citizens?.adultsSoldier} | </span>
      <span title={t("ui.citizens.adults_government.h1")} aria-label={t('ui.emoji.adults_government.h1')}>{t("ui.emoji.adults_government.h1")} {state?.citizens?.adultsGovernment} | </span>
      <span title={t("ui.citizens.adults_politician.h1")} aria-label={t('ui.emoji.adults_politician.h1')}>{t("ui.emoji.adults_politician.h1")} {state?.citizens?.adultsPolitician} | </span>
      <span title={t("ui.citizens.adults_worker.h1")} aria-label={t('ui.emoji.adults_worker.h1')}>{t("ui.emoji.adults_worker.h1")} {state?.citizens?.adultsWorker} | </span>
      <span title={t("ui.citizens.old.h1")} aria-label={t('ui.emoji.old.h1')}>{t("ui.emoji.old.h1")} {state?.citizens?.old} | </span>
      </div>
        <div style={{ marginBottom: 12, fontSize: 14 }}>
          - adultsHomeless styres automatisk og kan ikke tildeles.<br/>
          - adultsUnemployed sættes automatisk som rest, når du gemmer.<br/>
          - Politician har ratio-grænse pr. påbegyndt X borgere.<br/>
          - Pt har du 👫 <b>{totals.totalAdults}</b> voksne borgere i alt, hvoraf 👤 <b>{state?.citizens?.adultsHomeless||0}</b> er hjemløse.
        </div>

        <div style={{ margin: '10px 0', padding: 10, background: '#1f2937', borderRadius: 8 }}>
          <div>Ikke-hjemløse voksne (til rådighed): <b>{totals.totalNonHomeless}</b></div>
          <div>Sum af dine valg: <b>{totals.sumAssign}</b> {totals.sumAssign > totals.totalNonHomeless ? <span style={{ color: 'red' }}>(for højt)</span> : null}</div>
          <div>Unemployed (bliver): <b>{totals.unemployedWillBe}</b></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          {ROLE_ORDER.map(({ key, label }) => {
            const { cap } = clampForView(key);
            const v = Number(assign[key] || 0);
            const warnCap = v > cap;
            const extraUI = (key === 'adultsPolitician' && polMax > 0) ? (
              <span style={{ marginLeft: 8, fontSize: 12, color: polVal > polMax ? 'red' : '#666' }}>
                Max tilladt: {polMax}
              </span>
            ) : null;

            return (
              <div key={key}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                  {label}: {v} <span style={{ color: warnCap ? 'red' : '#666' }}>(cap: {cap})</span> {extraUI}
                </label>
                <input
                  type="range"
                  min={0}
                  max={cap}
                  value={v}
                  onChange={(e) => onChange(key, e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button onClick={onSave} disabled={saving} style={{ padding: '8px 16px' }}>
            {saving ? 'Gemmer...' : 'Gem tildeling'}
          </button>
          <button onClick={fetchState} disabled={saving} style={{ padding: '8px 16px' }}>
            Genindlæs
          </button>
        </div>

        <div style={{ marginTop: 20, fontSize: 13, color: '#666' }}>
          Bemærk: Serveren dobbelttjekker caps og totaler og kan nedskalere dine valg samt sætte et skjult antal crime pr. rolle.
        </div>
      </div>
    </div>
  );
}