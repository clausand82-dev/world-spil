World Spil handler om at bygge et samfund op; bygge de rigtige ting, prioterer og forske for at nå til næste stage. Hver stage tilføjet nye muligheder, og planen er at udvikle nye funktioner hele tiden. Hvert valg har betydning for funktionalitet i spillet, og er afgørende for hvad man kan eller ikke kan, samtidig med at man skal samle og prioriterer resource for næste store gennembrud.

På to do liste ligger ting som (bliver inddelt i stages senere):
STAGE 1: 
Grundlæggende spil mekanismer som byg, upgrade, byg addons, research og recipe samt passiv yield introduceres. Der kan købes dyr, som kan bruges til passiv og aktiv produktion og bygninger skal holdes ved lige via repairs.

STAGE 2:
Health, Happiness og borgere system (light) indføres - dette udvides langsomt igennem de næste stages.

STAGE 3:


STAGE 4:


STAGE 5:



STAGE 6





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

4.1
- STAGE 2 INTRODUCTION
- citizens system is introduced
- citizens rebirth, death and growing is handled manual
- health system is introduced
- happiness system is introduced
- popularity system is introduced
- citymanagement system as housing, provision, medicin, water, heat, power, cloth, waste and health is unlocked
- fixed error with storage not working as intended
- education system coded - maybe for another stage
- Introduced a more informativ hover to buildings, addons and research (located right lower corner)
- Animal system has been rework and renamed to be a units system
- Flowchart (research and overview) is now on one page - not done yet

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
