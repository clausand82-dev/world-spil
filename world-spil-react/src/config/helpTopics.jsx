import React from 'react';
import { group, topic, leaf } from './helpTopicsBuilder.js';
import helpStats from '../assets/pic/help_statsview.png';

// Eksempel: meget kortfattet, let at læse og udbygge
export const HELP_TOPICS = [
  group({
    id: 'getting-started',
    title: 'Kom godt i gang',
    children: [
      leaf('intro', 'Introduktion', `
        <h2>Velkommen</h2>
        <p>Læs også om <a data-topic-link="resources">Ressourcer</a> og <a data-topic-link="gameplay">Spilmekanik</a>.</p>
      `, { tags: ['velkommen','basics'] }
    ),
      leaf('faq', 'FAQ', `
        <h2>Ofte stillede spørgsmål</h2>
        <ul>
          <li>Hvordan bygger jeg? Se <a data-topic-link="buildings">Bygninger</a></li>
          <li>Hvad er vand? Se <a data-topic-link="res-water">Vand</a></li>
        </ul>
      `, { tags: ['faq','basics'] }),
    ],
  }),

  group({
    id: 'resources',
    title: 'Ressourcer',
    children: [
      // dynamisk render som string (kan få defs/t via HelpOverlay)
      topic({
        id: 'resources-overview',
        title: 'Ressourcer Generelt',
        render: ({ defs, t }) => {
          const emoji = defs?.res?.water?.emoji || (t?.('ui.emoji.water') ?? '💧');
          const res = defs?.res || {};
          const ids = Object.keys(res).sort();
          const rows = ids.map((id) => {
            const r = res[id] || {};
            const name = r.name || id;
            const emoji = r.emoji || '';
            return `<li>${emoji ? emoji + ' ' : ''}${name} <small class="muted">(${id})</small></li>`;
          });
          return `<h2>Ressourcer</h2>
          <p>Ressourcer bruges i spillet til at købe bygninger, addons og research med. Derudover bruges de i recipes (produktion), hvor en eller flere ressourcer bliver til en eller flere andre ressourcer (f.eks. 1xtræ --> 10 brænde).</p>
          <p>Der findes to hovedtyper af ressourcer: faste (solid) og flydende (liquid). Faste ressourcer er ting som træ, sten, jern og brænde. Flydende ressourcer er ting som <a data-topic-link="res-water">vand</a>, mælk og olie.</p>
          <p>Grundlæggende ressourcer er ting som kr (money), <a data-topic-link="res-water">vand</a>, kød, træ, sten, fjer, skind og bearbejdet skind mf. Se de forskellige ressourcer herunder.</p>
          <p>For at få ressourcer skal du bygge bygninger som producerer dem, eller købe dem via markedet (kommer senere). Ressourcer kan midlertidig give bonus i forskellige <a data-topic-link="stats-overview">stats</a>. F.eks. kan vand man har på lager giver vand i stats vand (den vand ens borgere kræver - se borger for mere info). Når ressourcer bruges og forsvinder fra ens inventory, så forsvinder dens bonus også.</p>

            <p>Liste over spillets nuværende ressourcer:</p>
            <ul>${rows.join('')}</ul>`;
        },
        searchText: 'ressourcer vand træ sten',
      }),

      
      // JSX component for mere kontrol (filen er .jsx så dette er OK)
      topic({
        id: 'res-water',
        title: 'Vand (ressource)',
        component: ({ defs }) => {
          const emoji = defs?.res?.water?.emoji || '💧';
          return (
            <div className="help-article">
              <h2>Vand {emoji}</h2>
              <p>Vand bruges i produktion og forbrug, men vand giver også en bonus ind i stats vand (vand som borgerne i ens by kræver for at være glade osv - se borger for yderligere info).</p>
              
              <p>Se også <a data-topic-link="resources-overview">Ressourcer Generelt</a>.</p>
            </div>
          );
        },searchText: 'ressource vand water forbrug',
      }),
    ],
  }),

  group({
    id: 'stats',
    title: 'Stats',
    children: [
      // dynamisk render som string (kan få defs/t via HelpOverlay)
      topic({
        id: 'stats-overview',
        title: 'Stats Generelt',
        render: ({ defs, t }) => {
          const emoji = defs?.res?.water?.emoji || (t?.('ui.emoji.water') ?? '💧');
          return `<h2>Stats</h2>
          <img src="${helpStats}" alt="Stats panel" class="help-image help-right" />
          <p>Stats er en vigtig del af spillet og skaber dynamik og dybde. Stats påvirker hvordan ens borgere trives, og hvordan ens by udvikler sig. Stats kan komme fra bygninger, addons, research, ressourcer, dyr og units.</p>
          <p>Stats er en lang række ting, som ens borger kræver, skaber eller på anden måde bruger/er afhængige af. I punkterne ude til højre, kan de læse mere om de specifikke stats.</p>
          <p>Nogle stats er synlige, andre fungerer bagved og skaber dynamikken. De fleste er dog synlige. Et stats kan komme fra bygninger, ressourcer eller andre elementer i spillet, sågar kan de midlertidig komme fra ressourcer, dyr eller unit som man har. Slagter eller sælger man et dyr, der giver nogle midlertidig stats, så forsvinder de når dyret er væk; ligeledes med ressourcer. Bruges en ressource der giver stats, forsvinder bonusen.</p>
          <p>Eksempelvis giver vand (💧) i ens inventory bonus i <a data-topic-link="stats-water">stats vand</a>, som er den mængde vand ens borgere kræver for at være glade osv - se borger for yderligere info.</p>
          <p>De forskellige borger grupper (se borger info) har forskellige krav til forskellgie stats for at være tilfredse (hvilket blandt andet påvirker happiness og popularity). Ved bygninger, addons og research kan man se hvilke stats de forbruger af eller giver til. Oplysninger kan ses i hover i nederst højre hjørne, når man har musen over bygninger, addon eller research. Det samme gælder dyr og øvrige units. Ressourcer kan man ikke se hvad de giver af bonus, men man kan ofte gætte sig til det (hint: water spiller ind på water stats.</p>
          <p>Stats består ofte af hvad borger grupper forbruger pr. den borger, samt hvad man maks har.</p>
          <p>Jo højere stage, jo flere stats skal man forholde sig til. Eneste stats i stage 1 er dyrplads og byggepoint. Disse forsætter med at være vigtige.</p>
          <p>De forskellige oplåste og relevante stats kan se i panelet "Stats" ude til højre.</p>
          `;
        },
        searchText: 'stats ',
      }),

// Happiness
      leaf(
        'stats-happiness',
        'Happiness',
        `
          <h2>Happiness</h2>
          <p>Happiness repræsenterer den generelle tilfredshed blandt borgerne. Det påvirkes af mange faktorer, herunder bolig, mad, vand og sundhed.</p>
          <p>For at øge happiness, skal du sikre, at borgerne har adgang til de ressourcer, de har brug for, og at deres behov bliver opfyldt.</p>
          <p>Find kilden ved at se stats i hover på bygninger/addons, eller i stats-panelet.</p>
          <p>Happiness påvirker også andre aspekter af spillet, såsom produktivitet og befolkningstilvækst.</p>
          <p>Faktorer der påvirker happiness kan ændre sig igennem spillet.</p>
          <p>Se også <a data-topic-link="stats-popularity">Popularity</a> for hvordan borgernes behov påvirker deres popularity.</p>
        `,
        { minStage: 1, tags: ['stats', 'housing', 'kapacitet'], searchText: 'housing plads borgere kapacitet' }
      ),

      // Popularity
      leaf(
        'stats-popularity',
        'Popularity',
        `
          <h2>Popularity</h2>
          <p>Popularity repræsenterer, hvor meget borgerne kan lide deres by og dens faciliteter. Det påvirkes af faktorer som boligkvalitet, tilgængelighed af ressourcer og sociale interaktioner.</p>
          <p>For at øge populariteten, skal du fokusere på at forbedre borgernes livskvalitet og sikre, at deres behov bliver opfyldt.</p>
          <p>Find kilden ved at se stats i hover på bygninger/addons, eller i stats-panelet.</p>
          <p>Happiness påvirker også andre aspekter af spillet, såsom produktivitet og befolkningstilvækst.</p>
          <p>Faktorer der påvirker happiness kan ændre sig igennem spillet.</p>
          <p>Se også <a data-topic-link="stats-happiness">Happiness</a> for hvordan borgernes behov påvirker deres happiness.</p>
        `,
        { minStage: 1, tags: ['stats', 'housing', 'kapacitet'], searchText: 'housing plads borgere kapacitet' }
      ),

      // JSX component for mere kontrol (filen er .jsx så dette er OK)
      topic({
        id: 'stats-water',
        title: 'Vand (stats)',
        component: ({ defs }) => {
          const emoji = defs?.res?.water?.emoji || '💧';
          return (
            <div className="help-article">
              <h2>Vand {emoji}</h2>
              <p>Stats vand repræsenterer den mængde vand, de forskellige borger forbruger. Hver borger forbruger forskellige mængder vand, og visse ting, såsom addon brønd til en hovedlejr, generer en vis mængde vand. Det er bedst at have lidt mere vand end man forbruger.</p>
              
              <p>Se også <a data-topic-link="resources-overview">Ressourcer -- overblik</a>.</p>
            </div>
          );
        }, searchText: 'stats vand water',
      }),
// Housing
      leaf(
        'stats-housing',
        'Housing',
        `
          <h2>Housing</h2>
          <p>Housing er antal pladser til borgere. Øges typisk af baser og beboelsesbygninger (telt/lejre mv.).</p>
          <p>Hvis housing er lavere end antallet af borgere, vil nye borgere ikke have plads og kan skabe utilfredshed.</p>
          <p>Find kilden ved at se stats i hover på bygninger/addons, eller i stats-panelet.</p>
        `,
        { minStage: 1, tags: ['stats', 'housing', 'kapacitet'], searchText: 'housing plads borgere kapacitet' }
      ),

      // Provision
      leaf(
        'stats-provision',
        'Provision (mad)',
        `
          <h2>Provision</h2>
          <p>Provision dækker basismad. Visse ressourcer (fx <b>mad</b>, mælk, æg) giver <em>provisionCapacity</em> mens de er på lager.</p>
          <p>Borgerne forbruger provision løbende; sørg for at kapacitet/yield overstiger forbrug.</p>
          <p>Relateret: se <a data-topic-link="resources-all">Alle ressourcer</a> for hvilke der bidrager.</p>
        `,
        { minStage: 1, tags: ['stats', 'provision', 'mad'], searchText: 'provision mad food kapacitet forbrug' }
      ),

      // Health
      leaf(
        'stats-health',
        'Health',
        `
          <h2>Health</h2>
          <p>Health handler om sundhedskapacitet samt efterspørgsel hos borgerne. Visse bygninger giver <em>healthCapacity</em>, og nogle aktiviteter/forhold kan øge efterspørgslen.</p>
          <p>Hold et passende forhold mellem kapacitet og brug for at undgå negative effekter.</p>
        `,
        { minStage: 1, tags: ['stats', 'health', 'sundhed'], searchText: 'health sundhed kapacitet efterspørgsel' }
      ),

      // Cloth
      leaf(
        'stats-cloth',
        'Cloth',
        `
          <h2>Cloth</h2>
          <p>Cloth dækker beklædning/udstyr, som kan påvirke trivsel/komfort. Produceres typisk af tailors (læder/uld m.m.).</p>
          <p>Afhænger af spilstatus kan cloth indgå i borgeres behov og/eller buffs.</p>
        `,
        { minStage: 1, tags: ['stats', 'cloth', 'beklædning'], searchText: 'cloth tøj læder uld komfort' }
      ),

      // Medicin
      leaf(
        'stats-medicine',
        'Medicin',
        `
          <h2>Medicin</h2>
          <p>Medicin supplerer sundhedsbehov og kan afhjælpe negative effekter. Kan produceres eller anskaffes via spillogik senere (afhænger af progression).</p>
          <p>Hold lager for at kunne dække spidsbelastninger.</p>
        `,
        { minStage: 1, tags: ['stats', 'medicin', 'sundhed'], searchText: 'medicin health sundhed behov lager' }
      ),

      // Heat (overview + 3 typer)
      leaf(
        'stats-heat',
        'Heat (overblik)',
        `
          <h2>Heat</h2>
          <p>Heat findes i tre typer energikilder: Green (som repræsenterer bæredygtige kilder), Nuclear (som repræsenterer kerneenergi) og Fossil (som repræsenterer fossile brændstoffer). Borgerne kan have forskellige max værdier de tillader, før den generelle happiness påvirkes.</p>
          <p>Nogle borgere/bygninger kræver varme; kilder og caps kan komme fra bygninger/addons og evt. ressourcer.</p>
          
          <h3>Heat — Fossil</h3>
          <p>Fossil varme (kul/olie/gas). Typisk billig at starte med, men kan have negative sideeffekter såsom høj forurening, hvilket en del borger IKKE bryder sig om.</p>
          <h3>Heat — Green</h3>
          <p>Grøn varme (fx solopvarmet vand). Bruges til at opfylde varmebehov med grøn profil. Grøn varme er særlig populær, men kan være dyrere at implementere. Har færrest bivirkninger.</p>
          <h3>Heat — Nuclear</h3>
          <p>Kernebaseret varme. Normalt høj stabil kapacitet, men kan have særlige krav/omkostninger. Ikke alle borgerne er vilde med kerneenergi, og nogle kan have bekymringer om sikkerhed og affaldshåndtering.</p>

        `,
        { minStage: 1, tags: ['stats', 'heat'], searchText: 'heat varme grøn kerne fossil' }
      ),
      
      // Power (overview + 3 typer)
      leaf(
        'stats-power',
        'Power (overblik)',
        `
          <h2>Power</h2>
          <p>Power (energi/strøm) findes i tre typer: Green (Grøn energi), Nuclear (Kerneenergi) og Fossil (Fossile brændstoffer).</p>
          <p>Bruges af bygninger/produktion; balancér produktion og forbrug.</p>
          <h3>Power — Fossil</h3>
          <p>Fossil strøm (kul/olie/gas). Ofte effektiv i starten, men med ulemper.</p>
          <h3>Power — Green</h3>
          <p>Grøn strøm (fx vind/sol/vand). Giver grøn profil — kan variere over tid.</p>
          <h3>Power — Nuclear</h3>
          <p>Kernebaseret strøm. Stabil produktion, særlige krav.</p>

        `,
        { minStage: 1, tags: ['stats', 'power'], searchText: 'power strøm energi grøn kerne fossil' }
      ),
      
      // Waste (3 typer)
      leaf(
        'stats-waste',
        'Waste (overblik)',
        `
          <h2>Waste</h2>
          <p>Affald håndteres i tre spor i den nuværende model: <a data-topic-link="stats-waste-organic">Organisk</a>, <a data-topic-link="stats-waste-water">Spildevand</a> og <a data-topic-link="stats-waste-other">Anden</a>.</p>
          <p>Dyr og produktion kan generere affald (fx gødning, spildevand); korrekt håndtering kan afhjælpe negative effekter.</p>
        `,
        { minStage: 1, tags: ['stats', 'waste', 'affald'], searchText: 'waste affald organisk spildevand other' }
      ),
      leaf(
        'stats-waste-organic',
        'Waste — Organisk',
        `
          <h2>Waste — Organisk</h2>
          <p>Organisk affald (fx gødning/biomasse). Kan genanvendes/nyttiggøres i visse kæder.</p>
        `,
        { minStage: 1, tags: ['stats', 'waste', 'organisk'], searchText: 'affald organisk gødning biomasse' }
      ),
      leaf(
        'stats-waste-water',
        'Waste — Spildevand',
        `
          <h2>Waste — Spildevand</h2>
          <p>Spildevand og vandbårent affald. Håndteres via relevante faciliteter for at undgå negative effekter.</p>
        `,
        { minStage: 1, tags: ['stats', 'waste', 'vand'], searchText: 'affald spildevand waste water' }
      ),
      leaf(
        'stats-waste-other',
        'Waste — Anden',
        `
          <h2>Waste — Anden</h2>
          <p>Øvrigt affald (blandet/fraktioner der ikke er organisk eller spildevand). Kræver passende håndtering.</p>
        `,
        { minStage: 1, tags: ['stats', 'waste', 'other'], searchText: 'affald andet plast glas metal other' }
      ),
    ],
  }),

  group({
    id: 'gameplay',
    title: 'Spilmekanik',
    children: [
      leaf('buildings', '🏠Bygninger', `
        <h2>Bygninger</h2>
        <p>Bygninger har forskellige levels og kræver en opgradering, for at blive højere level. Se du ikke muligheden er bygningen måske allerede i højeste level. Du kan også risikerer at en bygning (eller addon/research) kræver en anden bygning eller research først. Du kan også risikerer at den er "stage-locked" hvilket betyder du skal låse op for næste stage, for at kan opgraderer den bygning yderligere. </p>
        <p>Bygninger kan have forskellige effekter, såsom at producere ressourcer, give stats, give borgere, give plads til dyr eller units, eller noget helt andet. Nogle bygninger har også addons, som er udvidelser, og nogle af disse udvidelser kan have yderligere addons. En udvidelse til en udvidelse kaldes også en subaddon.</p>
        <p>Bygninger kan også have krav, såsom at kræve en bestemt mængde af en eller flere ressourcer for at kunne bygges eller opgraderes.</p>
        <p>Bygninger kan have forskellige stats, såsom hvor mange borgere de kan huse, hvor mange dyr de kan have, eller hvor mange units de kan have. Disse stats kan ofte ses i hover i nederst højre hjørne. Nogle bygninger indeholder også research-krav, som kan være nødvendige for at kunne opgradere bygningen yderligere. Klik på research-krav for at hoppe til research.</p>
        <p>Bygninger skal indimellem repareres, hvilket koster ressourcer. En bygning der er under et vis niveau kan ikke længere bygge, researche eller producerer.</p>        
      `),
      topic({
        id: 'population',
        title: 'Befolkning',
        minStage: 2, // skjules hvis spiller < 2
        render: ({ state }) => {
          const st = Number(state?.user?.currentstage || 0);
          return `<h2>Befolkning (stage ${st})</h2><p>Tildel roller mm.</p>`;
        },
      }),
    ],
  }),

    group({
    id: 'units',
    title: 'Enheder',
    children: [
      leaf('animals', 'Dyr', `
        <h2>Dyr</h2>
        <p>Dyr genererer nogle forskellige ressourcer pr time, og kan også give nogle bonuser i forskellige stats imens man har dem. Dyr bruges også i forskellige recipes, for at producerer andre ressourcer. Dyr kan slagtes og giver dermed et engangs udbytte (og evt. stats bonuser forsvinder). Nye dyr kan købes på unit siden. Dyr købes for ressourcer.</p>

      `, { minStage: 1, tags: ['dyr', 'animal', 'recipe'], searchText: 'dyr slagtes engangs udbytte' }),
      leaf('units_health', 'Sundheds enheder', `
        <h2>Sundheds enheder</h2>
        <p>Sunheds enheder kan være alt fra sengeplads til udstyr til ambulancer afhængig af, hvor langt man er nået i spillet. Disse units bruges til at forbedre sundheds mæssige stats, men nogle units koster også i stats. Se i hover hvad der forskellige ting gør. Unit købes for ressourcer.</p>
      `),
      
    ],
  }),


group({
    id: 'list',
    title: 'Lister',
    children: [
      topic({
        id: 'buildings-list',
        title: 'Alle bygninger',
        render: ({ defs }) => {
          const bld = defs?.bld || {};
          const rows = Object.keys(bld).sort().map(id => {
          const name = bld[id]?.name || id;
          // link -> interne help links eller direkte til building-siden
          return `<li><a href="#/building/${encodeURIComponent(id)}">${name}</a> <small class="muted">(${id})</small></li>`;
          });
    return `<h2>Bygninger</h2><p>Her er en liste over alle definerede bygninger:</p><ul>${rows.join('')}</ul>`;
       },
    searchText: 'bygninger liste alle byggesteder',
    }),

    topic({
        id: 'researchs-list',
        title: 'Alle research',
        render: ({ defs }) => {
          const rsd = defs?.rsd || {};
          const rows = Object.keys(rsd).sort().map(id => {
          const name = rsd[id]?.name || id;
          // link -> interne help links eller direkte til building-siden
          return `<li>${name} <small class="muted">(${id})</small></li>`;
          });
    return `<h2>Research</h2><p>Her er en liste over alle definerede research, der pt er mulige:</p><ul>${rows.join('')}</ul>`;
       },
    searchText: 'research liste alle forskning forskningstyper',
    }),

    topic({
        id: 'addons-list',
        title: 'Alle addons',
        render: ({ defs }) => {
          const add = defs?.add || {};
          const rows = Object.keys(add).sort().map(id => {
          const name = add[id]?.name || id;
          // link -> interne help links eller direkte til building-siden
          return `<li>${name} <small class="muted">(${id})</small></li>`;
          });
    return `<h2>Addons</h2><p>Her er en liste over alle definerede addons, der pt er mulige:</p><ul>${rows.join('')}</ul>`;
       },
    searchText: 'addons liste alle udvidelser udvidelsestyper',
    }),

    topic({
        id: 'animals-list',
        title: 'Alle dyr',
        render: ({ defs }) => {
          const ani = defs?.ani || {};
          const rows = Object.keys(ani).sort().map(id => {
          const name = ani[id]?.name || id;
          const emoji = ani[id]?.emoji || '';
          // link -> interne help links eller direkte til building-siden
          return `<li>${emoji || ''} ${name} <small class="muted">(${id})</small></li>`;
          });
    return `<h2>Dyr</h2><p>Her er en liste over alle definerede dyr, der pt er mulige:</p><ul>${rows.join('')}</ul>`;
       },
    searchText: 'dyr liste alle animals dyretyper',
    }),


    ],
  }),
];