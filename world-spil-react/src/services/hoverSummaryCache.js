// Simple cache for hover summaries (id -> {data, etag, ts})
const cache = new Map();
const inflight = new Map(); // id -> Promise

export async function fetchSummaryCached(id) {
  if (!id) throw new Error('missing id');
  // return cached copy immediately if present
  const cached = cache.get(id);
  if (cached && cached.data) return cached.data;

  // if already fetching, return same promise
  if (inflight.has(id)) return inflight.get(id);

  const p = (async () => {
    try {
      const headers = { Accept: 'application/json' };
      if (cached && cached.etag) headers['If-None-Match'] = cached.etag;

      const res = await fetch(`/summary.php?id=${encodeURIComponent(id)}`, { headers, credentials: 'same-origin' });

      if (res.status === 304 && cached) {
        // not modified
        return cached.data;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const etag = res.headers.get('ETag') || null;
      const data = await res.json();

      cache.set(id, { data, etag, ts: Date.now() });
      return data;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, p);
  return p;
}

// Optional helper: prefill entire cache (if you server-render or inline JSON)
export function prefillSummaries(obj) {
  // obj = { id: data }
  for (const [id, data] of Object.entries(obj || {})) {
    cache.set(id, { data, etag: null, ts: Date.now() });
  }
}