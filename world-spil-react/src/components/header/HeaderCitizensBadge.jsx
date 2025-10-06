import React, { useMemo } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import { useT } from "../../services/i18n.js";
import { fmt } from '../../services/helpers.js';
import HoverCard from '../ui/HoverCard.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';


export default function HeaderCitizensBadge() {
  const t = useT();
  const { data: gameData } = useGameData();
  const { data, loading, err } = useHeaderSummary();  

  const stageCurrent = Number(gameData?.state?.user?.currentstage ?? 0);
  const isLite = stageCurrent <= 1

  // Tag samme kilder som Happiness/Popularity: usages + capacities
  const usages = data?.usages ?? {};
  const caps   = data?.capacities ?? {};

  // Borger-tal fra summary hvis tilgængeligt; fallback til state hvis backend ikke sender det her
  const popSum = data?.citizens?.groupCounts ?? data?.population ?? {};
  const popState = gameData?.state?.city?.population ?? gameData?.state?.population ?? {};
  const popGroups = data?.citizens?.raw || {};

//console.log(popGroups);

  const total  = toNum(data?.citizens?.totals?.totalPersons ?? popSum.total ?? popState.total);
  const adults = toNum(popSum.adultsTotal ?? popState.adults);
  const young  = toNum(popSum.young ?? popState.young);
  const kids   = toNum(popSum.kids ?? popState.kids);
  const baby   = toNum(popSum.baby ?? popState.baby);

  const adultsPolice      = toNum(popGroups?.adultsPolice);
  const adultsFire        = toNum(popGroups?.adultsFire);
  const adultsHealth      = toNum(popGroups?.adultsHealth);
  const adultsPolitician  = toNum(popGroups?.adultsPolitician);
  const adultsGovernment = toNum(popGroups?.adultsGovernment);
  const adultsWorker      = toNum(popGroups?.adultsWorker);
  const adultsSoldier     = toNum(popGroups?.adultsSoldier);
  const youngStudent      = toNum(popGroups?.youngStudent);
  const youngWorker       = toNum(popGroups?.youngWorker);
  const kidsStudent       = toNum(popGroups?.kidsStudent);
  const kidsStreet         = toNum(popGroups?.kidsStreet);
  const old                = toNum(popGroups?.old);
  const crime              = toNum(popSum?.crime);
  
  
//

  //console.log(adultsPolice, adultsFire, adultsHealth, adultsPolitician);

  // Kapaciteter/forbrug – samme navne som bruges i HappinessBadge (usages/caps)
  const housingUsed = toNum(getTotal(usages.useHousing));
  const housingCap  = toNum(caps.housing ?? caps.housingCapacity);
  const homeless    = toNum(popGroups?.adultsHomeless);

  const healthUsed  = toNum(getTotal(usages.useHealth));
  const healthCap   = toNum(caps.healthCapacity ?? caps.health);

  const provisionUse = toNum(getTotal(usages.useProvision));
  const waterUse     = toNum(getTotal(usages.useWater));

  const content = useMemo(() => {
    return (
      <div style={{ minWidth: 260, maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong>Borgere</strong>
          <span style={{ opacity: 0.75 }}>Stage {stageCurrent}</span>
        </div>

        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          <Row label="Total" value={fmt(total)} strong/><hr></hr>

          {isLite ? (
            <>
              <Row label="Voksne" value={fmt(adults)} strong/>
              <Row label="Unge"   value={fmt(young)} strong/>
              <Row label={t("ui.citizens.baby.h1")}  value={fmt(kids)} strong/>
              <Row label="Babyer"   value={fmt(baby)} strong/>
              <hr></hr>
              <Row label="Housing"  value={`${fmt(housingUsed)} / ${fmt(housingCap)}`} mono />
              <Row label="Hjemløse" value={fmt(homeless)} />
              <Row label="Health"   value={`${fmt(healthUsed)} / ${fmt(healthCap)}`} mono />
              <hr></hr>
              <Row label="Provision forbrug" value={fmt(provisionUse)} mono />
              <Row label="Vand forbrug" value={fmt(waterUse)} mono />
            </>
          ) : (
            <>
              
              <Row label="Voksne:" strong/>
              <Row label={`${t("ui.emoji.adults_police.h1")} ${t("ui.citizens.adults_police.h1")}`}  value={fmt(adultsPolice)} />
              <Row label={`${t("ui.emoji.adults_fire.h1")} ${t("ui.citizens.adults_fire.h1")}`}  value={fmt(adultsFire)} />
              <Row label={`${t("ui.emoji.adults_health.h1")} ${t("ui.citizens.adults_health.h1")}`}  value={fmt(adultsHealth)} />
              <Row label={`${t("ui.emoji.adults_politician.h1")} ${t("ui.citizens.adults_politician.h1")}`}  value={fmt(adultsPolitician)} />
              <Row label={`${t("ui.emoji.adults_government.h1")} ${t("ui.citizens.adults_government.h1")}`}  value={fmt(adultsGovernment)} />
              <Row label={`${t("ui.emoji.adults_worker.h1")} ${t("ui.citizens.adults_worker.h1")}`}  value={fmt(adultsWorker)} />
              <Row label={`${t("ui.emoji.adults_soldier.h1")} ${t("ui.citizens.adults_soldier.h1")}`}  value={fmt(adultsSoldier)} />
              <Row label={`${t("ui.emoji.old.h1")} ${t("ui.citizens.old.h1")}`}  value={fmt(old)} />
              <Row label={`${t("ui.emoji.adults_unemployed.h1")} ${t("ui.citizens.adults_unemployed.h1")}`}  value={fmt(adults)} />
              <Row label={`${t("ui.emoji.adults_homeless.h1")} ${t("ui.citizens.adults_homeless.h1")}`}  value={fmt(homeless)} />
              <Row label={`${t("ui.emoji.crime.h1")} ${t("ui.citizens.crime.h1")}`}  value={fmt(crime)} />
              <hr></hr>
              <Row label="Unge:" strong/>
              <Row label={`${t("ui.emoji.young_student.h1")} ${t("ui.citizens.young_student.h1")}`}  value={fmt(youngStudent)} />
              <Row label={`${t("ui.emoji.young_worker.h1")} ${t("ui.citizens.young_worker.h1")}`}  value={fmt(youngWorker)} />
              <hr></hr>
              <Row label="Børn og babyer:" strong/>
              <Row label={`${t("ui.emoji.kids_student.h1")} ${t("ui.citizens.kids_student.h1")}`}  value={fmt(kidsStudent)} />
              <Row label={`${t("ui.emoji.kids_street.h1")} ${t("ui.citizens.kids_street.h1")}`}  value={fmt(kidsStreet)} />
              <Row label={`${t("ui.emoji.baby.h1")} ${t("ui.citizens.baby.h1")}`}   value={fmt(baby)} />
              <hr></hr>
              <Row label="Stats:" strong/>
              <Row label="Housing"  value={`${fmt(housingUsed)} / ${fmt(housingCap)}`} mono />
               <Row label="Health"   value={`${fmt(healthUsed)} / ${fmt(healthCap)}`} mono />
              <Row label="Provision forbrug" value={fmt(provisionUse)} mono />
              <Row label="Vand forbrug"      value={fmt(waterUse)} mono />
              <hr></hr>
              Se detaljer i <a href="#/help?topic=population">Hjælp: Befolkning</a> og <a href="#/help?topic=stats-overview">Hjælp: Stats</a>
              </>
          )}
        </ul>
      </div>
    );
  }, [
    isLite, stageCurrent,
    total, adults, young, kids,
    housingUsed, housingCap, homeless,
    healthUsed, healthCap,
    provisionUse, waterUse
  ]);

  // Følg mønsteret fra de andre badges: ved load/fejl returneres intet (badge skjules)
  if (loading || err) return null;

  return (
    <HoverCard content={content} cardStyle={{ maxWidth: 480, minWidth: 320 }}>
      <span className="res-chip" title="Borgere" style={{ cursor: 'pointer', userSelect: 'none' }}>
        👥 {fmt(total)}
      </span>
    </HoverCard>
  );
}

// Hjælpere i samme stil som de andre badges
function Row({ label, value, mono, strong }) {
  return (
    <li style={{ padding: '4px 6px', borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {label ? (strong ? <strong>{label}</strong> : <span style={{ opacity: 0.9 }}>{label}</span>) : null}
        </div>
        <div style={{ textAlign: 'right', fontVariantNumeric: mono ? 'tabular-nums' : 'normal' }}>
          {value}
        </div>
      </div>
    </li>
  );
}
function Sep() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 6px' }} />;
}
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
// Nogle summary-felter kan være { total, bySource: {...} } – tag total hvis tilgængeligt
function getTotal(x) {
  if (x == null) return 0;
  if (typeof x === 'object') {
    if (typeof x.total === 'number') return x.total;
    // fallback: sum værdier hvis det er et map
    const vals = Object.values(x).filter(v => typeof v === 'number');
    if (vals.length) return vals.reduce((a, b) => a + b, 0);
  }
  return x;
}