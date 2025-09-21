World Spil handler om at bygge et samfund op; bygge de rigtige ting, prioterer og forske for at nå til næste stage. Hver stage tilføjet nye muligheder, og planen er at udvikle nye funktioner hele tiden. Hvert valg har betydning for funktionalitet i spillet, og er afgørende for hvad man kan eller ikke kan, samtidig med at man skal samle og prioriterer resource for næste store gennembrud.

På to do liste ligger ting som (bliver inddelt i stages senere):
STAGE 1: 
Grundlæggende spil mekanismer som byg, upgrade, byg addons, research og recipe samt passiv yield introduceres. Der kan købes dyr, som kan bruges til passiv og aktiv produktion og bygninger skal holdes ved lige via repairs.

STAGE 2:
Begynder at udbygge indbyggr funktion - før talte man ikke indbygger, nu tælles indbygger og de har betydning.
Via bolig har man plads til X antal indbyggere kaldes housing, derudover har man maks plads til X antal provision_cap som dækker over mad. Ens food overføre man manuelt til provisions_cap og den definerer hvormange mennesker man kan forsørge.
Så man kan aldrig have flere indbyggere end man har housing eller provision_cap til. Provision_cap kan godt overstige housing, og housing kan godt være højere end provision_cap. Indbyggere aldrig højere end begge.

Dette styres under en ny bygning man først skal købe, som åbner for et nyt menu punkt (bystyre). Under bystyre kan man overføre mad til provision_cap. 1 x food + 1 x mælk = 10 i provisions_cap. Hver borger spiser 1 provision_cap pr rigtige døgn (så 100 borgere fortærer 100 provision_cap om dagen). Hvis man mangler provision_cap, falder ens indbyggertal med 25% af den manglende provision_cap om dagen. Dvs at 100 borgere med 90 provision_cap ender med 10 der mangler, hvilket betyder at 3 indbyggere forsvinder. Gøres der ikke noget, har man 97 indbygger til ingen provision_cap (der er ikke fyldt op) og dermed forsvinder 25% af 97 (omkring 24 indbygger der forsvinder). Derefter går der et døgn mere og 73 indbygger får nu ingen mad. Dvs at 25% af 73 forsvinder. 55 tilbage. Bliver så til 55 --> 42 -->.

Hvordan stiger indbyggertal:
Man får aldrig nye indbyggere, hvis nogle indenfor et døgn er døde.
Man får ikke nye indbyggere, hvis provision_cap ikke kan brødføde dem mindst et døgn frem (inklusiv dem man har) - dvs at har man 100 indbyggere og 25 er på vej, men man kun har 112 provision_cap, så får man kun 12 nye indbyggere - ergo de har alle mad til et døgn.
Man får ikke nye indbyggere, hvis housing er fuld (indbygger = housing)
Lever man op til det kan man få nye indbyggere, der maksimalt svarer til den mængde (nye og gamle) som kan overleve i et døgn.

Mulige nye udregnes ud fra følgende:
for hver mulig plads udregnes et sand / falsk sandsynligheds scenarie (har man plads til 25, udregnes det 25 gange)

Der vælges et random tal imellem 1-100 - kun 1-10 giver sand, resten giver falsk. Dvs vores newCitizensChance er 10 (skal skrives ind i config).

Diverse addons, research osv kan øge newCitizens chance - samtidig kan health og popularity (kommer senere)
En addons kan måske give newCitizensChance=2, øger config tallet med 2, dvs der er 12/100 (newCitizensChance totalen / randomCitizensMax) chancer for nye indbyggere. Det samme med research.

Hvordan kommer health og popularity ind?
Health er en procent faktor som senere skal påvirke dødsfald (f.eks. fra sygdom).
Popularitet er en procent faktor som senere skal påvirke mange ting.
90% health øger 12/100 scenariet med de manglede 10, så det bliver 12/112. popularity gør det samme.

Så hvis newCitizensChance=34 pga base tal og diverse addons/research. Health er på 92 & og popularity er på 87%, ergo newCitizensChance = så er chancen 34/121.

variabler i config:
newCitizensChance=10
randomCitizensMax=100
startHealth=100
StartPopularity=100

(på nuværende tidspunkt bruges health og popularity ikke i spillet, men de kommer senere - derfor skriver vi dem ind i regnestykket via variabler - så kan den variable udregnes senere, når de har indflydelse - så er matematikken klar)

Udregning for om der kommer nye indbyggere udregnes 2 gange i døgnet, hvorimod mangel på "mad" udregnes en gang i døgnet. Det øger chancerne for indbyggere.

STAGE 3:
Health indføres - som nævnt i stage 2 har det indflydelse på indbyggere der kommer til byen.

STAGE 4:
Popularitet indføres - har indflydelse på antal nye indbyggere. Visse bygninger/addons/research kan forbedre ens popularity.

STAGE 5:
Politi og kriminalitet indføres. Samtidig indføres UDSTYR og UNITS.

Politi består af følgende faktorer:
policeForce:  Antal betjente - kan opgraderes, hvilket forbedre strength og armor. Alle betjente er samme lvl, og pris for opgradering udregnes udfra antal betjente man har købt. Højere lvl kræver mere i PoliceCap.
policeStrength: Politifolkenes styrke - bestemmes af flere faktorer som research, addons, udstyr
policeArmor: Politifolkenes armor - bestemmes af flere faktorer som research, addons, udstyr
policeCap: Det antal point ens politi styrke kan fylde.
policeLevel: Den level ens politifolk har.
policeVisibility: ???

Kriminalitet:
crimeRate: Overordnet kriminalitetsrate (jo lavere jo bedre). crimeRate er crimeForce/citizens*100
crimeForce: Antal kriminelle i byen (ud af de indbyggere man har ialt)
crimeChance: Jo lavere jo bedre. Hver gang man gør noget med en indbygger (uddannelse, dør, mm), så tjkkes der først om vedkommende er kriminel. Det foregår ved et roll imod crimeChance/100+policeLevel. Er vedkommende kriminal og dør, trækkes vedkommende fra indbyggertal OG crimeForce mindskes lidt.
Hvad øger antal kriminelle? Specielle events, samt dårlig health og popularitet holdt op imod politiens styrke.
crimeLevel: De kriminelles level - udregnes hvergang der er RAZZIE, ved særlige events OG måske engang i døgnet.
crimeArmor: standard (5) + crimeLevel
crimeStrength

crimeForce øges ved roll imod (maxHealth-currentHealth + maxpopularity - currentpopularity) = crimeChance

Indbygger = 200, hver indbygger roller imod random tal imellem (policeLevel procent ud af policeForce) og crimeForce Tal på eller under police

2/25*100 = 8, crimeForce = 10 - random (0,10) - 1-8 = not crime, 9-10 = +1 crimeForce.

RAZZIE:
Et valg man som spiller kan tage - det koster en pris, og så rolles der pr enhed. En enhed består af 12 mand, hvis muligt. Der oprettes passende antal enheder - rest går i enhed for sig. Der samme gøres ved crimeForce.

Health i en enhed = antal unit * 100+Force

1: Police enhed roller 1d6+policeArmor imod 1d6+crimeArmor - er police roll højere (ikke ligmed) udføres næste træk.
2: Police enhed roller 1d20*policeStrength imod enhedens samlede health (units health = 100+force/units) - Hvis slag er højere end en units liv, dør unit - fortsætter op til alt skade er gjort.
3: resterende crime enhed roller 1d6+crimeArmor imod 1d6+policeArmor - er crime roller (højere eller ligmed) udføres næste træk.
4: Crime enhed roller 1d20*crimeStrength imod police enheds samlede healt - hvis skade er højere end individets, dør indived og således fortsætter det.
5: Proces gentages indtil den ene eller anden enhed er død (der tælles døde pr side som trækkes fra repræsentive forces OG samlet indbygger tal)
Proces gentages for næste enhed, indtil alle enheder har kæmpet.

SKAL DET VÆRE PR UNIT ISTEDET FOR PR ENHED??? - kan også være at en enhed er pr unittype (hvis der er flere slags politfolk - måske de opgraderes i bundles fra laveste lvl til højeste) - strategi fase kan så være hvilke man vil angribe med først og hvormange man vil smide ind i kampen. Crimes kan have et par forudprogrammeret strategier de kører med tilfældigt eller ud fra visse faktorer.



STAGE 6 (Events)
Indføres events og brandvæsen, samt hospital.

Brandvæsen og hospital består kun af bygning/addons/research, som kan forbedre visse stats.




- Bystyre (nye systemer som økonomi styring, sundhed, befolkning mm)
- Mark system (via addons, snarligt)
- Militær (sent) (opgradering af soldater, forskellige køretøjer, fly osv)
- Rumudforskning (meget sent)
- Map funktion i opret bruger sektionen (kommer snart)
- Handels system - NPC (snarligt)
- Handels system - Online med andre bruger (sent)
- Katastrofer/Events (lav en xml)
- Vejrsystem

- Karriere valg - skal vælges ved oprettelse, eller for eksisterende bruger når det kommer - måske via valg i noget research - en gren blokerer for noget andet - kan være et nyt filter system, der bruges ved alle (bld, rsd, rcp, add mm)

Et sådant system kræver en info i xml - måske noget ala at lvl 1 blokeres - måske RSD 1 har "blocked by=RSD 2" og RSD 2 har "blocked by=RSD 1"

Change/update History

4.0
- moving all code to react code instead
- code optimizing (long code split to component)
- complete buff system (current only yield, cost and speed) and only support permanent buff - works frontend and backend
- dashboard works
- beginning simple research tech tree with React Flow
- behind the scenes: no more dublicate of name and desc
- animal on inventory list AND sidebar
- more lang put in (still missing alot)
- log system added
- login and out works again
- make new use works again
- active productions can now be seen on production site
- still missing active production on production sites
- experimentel fold up/down boards and moveable and resizeable boards (not use yet, just tested)
- 
- MISSING:
- yield have to have a cap (passive and active)
- durability and repair functions
- build more than one active production (or maybe let it's production scale up when time goes up???)
- maybe a new user system, where you do some selection there have influenze on you yield and so on
- is destroy an options (or shall there be a tag in xml to deside - aka a "canBeDemolished" false/true)
- new user system, old user tjek system (tjeck if old user have correct needed info or else make new user chose)

3.5:
- active recipes added
- animal can now be slaughtered to yield one time yield
- animal no longer yield slaughter resources like rawmeat, hide and so on
- animal you have any more of, won't show an own status
- animal is now part of inventory tap and added to side bar
- small fixes and tweaks
- can't buy addons and start jobs and research in buildings you don't own
- optimized some javascript code all around
- fold-out is back on dashboard for passiv yield reosurces
- splitting up files for easy code fixing
- added a extra addon system (sub addons to addons, but in same system)

3.4:
- added build time for buildings (preparations for addons, research and production/recipes)<br>
- visuel changes and additions for building list page and building detail pages <br>
- added passive yields from buildings and addons
- adding animal system
- fixed errors
- dashboard now have overview over build jobs and research 
- building jobs and research can now be canceled from dashboard
- dashboard have overview over all passive yields and where they come from
- Animal system know works and produce yields

3.3:
- Added DB support for buy buildings
- Added update system for resource use (aka auto update without refresh hole site)

3.2:
- Added demo addons system there render actual requested ressources and research

3.1:
- remove demo data and intergrate real data from DB 

3.0:
- New layout
- Behind the scenes movement of code and files to be more orginized
- third attempt and approved

2.0:
- second attempt - also abandoned

1.0:
- 1 attempt but abandoned
