// Valgfrit manuelt indhold per stage (hero-billede + tekst).
// Image-URL kan bygges fra backend config.paths.art_url_base i announcer-komponenten.
// Brug tomt objekt hvis du kun vil auto-generere listen fra metricsMeta.
export const STAGE_CONTENT = {
    1: {
    // relative eller fuld URL – announcer kan prefixe med artBase hvis den starter med './' eller uden leading slash
    image: 'stage/stage-1.jpg',
    title: 'Nyt trin låst op – Stage 1',
    desc: 'Tillykke! Velkommen til spillet WORLD. I dette her spil skal du forsøge at få et samfund op at køre ved at bygge, forske og indsamle ressourcer. Efterhånden som du får bygget og forsket vil du når videre til højere stages, som hver vil introducere nye mekanikker og muligheder. \n\nGod fornøjelse!',
  },
  2: {
    // relative eller fuld URL – announcer kan prefixe med artBase hvis den starter med './' eller uden leading slash
    image: 'stage/stage-2.png',
    title: 'Nyt trin låst op – Stage 2',
    desc: 'Tillykke! Du har låst op for nye funktioner såsom borger, borgergrupper og sundhed. Her er et overblik over det vigtigste.',
  },
  3: {
    image: 'stage/stage-3.png',
    title: 'Nyt trin låst op – Stage 3',
    desc: 'Endnu flere muligheder er åbne. Se hvad du kan udforske nu.',
  },
  // Tilføj flere efter behov...
};