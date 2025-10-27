// Hjælper: fetchWithETag(url, opts, storageKey)
// - Sender tidligere gemt ETag via If-None-Match
// - Hvis server returnerer 304 => returnerer cached body (parsed JSON)
// - Hvis 200 => gemmer ny ETag + body i localStorage (storageKey etag + body)
// - Brug credentials: 'include' når nødvendigt via opts
//
// Brug:
// const json = await fetchWithETag('/world-spil/backend/alldata.php', { credentials: 'include' }, 'alldata');

export default async function fetchWithETag(url, opts = {}, storageKey = null) {
  // Bestem storage keys hvis ønsket
  const etagKey = storageKey ? `${storageKey}:etag` : null;
  const bodyKey = storageKey ? `${storageKey}:body` : null;

  const headers = Object.assign({}, (opts.headers || {}));
  // Hvis vi har en gemt etag, send If-None-Match
  try {
    if (etagKey && typeof window !== 'undefined') {
      const storedETag = localStorage.getItem(etagKey);
      if (storedETag) headers['If-None-Match'] = storedETag;
    }
  } catch (e) {
    // localStorage kan fejle i nogle context; silently ignore
  }

  const finalOpts = Object.assign({}, opts, { headers });

  const res = await fetch(url, finalOpts);

  // 304: brug cached body (hvis tilgængelig)
  if (res.status === 304) {
    if (bodyKey) {
      try {
        const raw = localStorage.getItem(bodyKey);
        if (raw) {
          return JSON.parse(raw);
        } else {
          // ingen cache - fallback: return null eller throw
          return null;
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Hvis 200/201 => parse og gem etag + body
  if (res.ok) {
    // få ETag header hvis returneret
    const respETag = res.headers.get('ETag') || res.headers.get('etag') || null;
    // parse body (kan være JSON)
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = text; }

    if (etagKey && bodyKey) {
      try {
        if (respETag) localStorage.setItem(etagKey, respETag);
        localStorage.setItem(bodyKey, JSON.stringify(parsed));
      } catch (e) {
        // ignore storage errors
      }
    }

    return parsed;
  }

  // andre statuskoder -> kast fejl eller returnér objekt med status
  const errText = await res.text().catch(() => null);
  const err = new Error(`Fetch failed: ${res.status}`);
  err.status = res.status;
  err.body = errText;
  throw err;
}