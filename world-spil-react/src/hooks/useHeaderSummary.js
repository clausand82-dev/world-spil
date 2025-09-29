import { useEffect, useRef, useState } from 'react';

const ENDPOINT = '/world-spil/backend/api/header/summary.php';
const STORAGE_KEY = 'ws:summary-cache-v1';

// Modul-global cache deles af alle mounts
const shared = {
  data: null,
  err: null,
  promise: null,
  at: 0,              // timestamp ms
};

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}
function saveToSession(obj) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

// Init: prøv at læse en tidligere summary fra sessionStorage → giver instant UI
(() => {
  const cached = loadFromSession();
  if (cached && cached.data) {
    shared.data = cached.data;
    shared.at = cached.at || Date.now();
  }
})();

async function doFetch() {
  const res = await fetch(ENDPOINT, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Ukendt fejl');
  return json.data;
}
function fetchSummary() {
  if (shared.promise) return shared.promise;
  shared.promise = doFetch()
    .then((data) => {
      shared.data = data;
      shared.err = null;
      shared.at = Date.now();
      saveToSession({ data, at: shared.at });
      return data;
    })
    .catch((err) => {
      shared.err = String(err?.message || err);
      throw err;
    })
    .finally(() => {
      shared.promise = null;
    });
  return shared.promise;
}

/**
 * useHeaderSummary
 * - Returnerer { data, err, loading, refresh, lastUpdated }
 * - Viser øjeblikkeligt sidste kendte summary (fra memory/sessionStorage), mens den revaliderer i baggrunden.
 * - refresh() kan kaldes for at forny data manuelt.
 */
export default function useHeaderSummary({ revalidateMs = 30000 } = {}) {
  const [data, setData] = useState(shared.data);
  const [err, setErr] = useState(shared.err);
  const [loading, setLoading] = useState(!shared.data && !shared.promise);
  const [lastUpdated, setLastUpdated] = useState(shared.at);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    // Start/tilslut fetch – revalidate altid i baggrunden
    fetchSummary()
      .then((d) => {
        if (!mountedRef.current) return;
        setData(d);
        setErr(null);
        setLoading(false);
        setLastUpdated(shared.at);
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setErr(String(e?.message || e));
        setLoading(false);
      });

    // Periodisk revalidate (stale-while-revalidate)
    let timer = null;
    if (revalidateMs > 0) {
      timer = setInterval(() => {
        fetchSummary()
          .then((d) => {
            if (!mountedRef.current) return;
            setData(d);
            setErr(null);
            setLastUpdated(shared.at);
          })
          .catch((e) => {
            if (!mountedRef.current) return;
            setErr(String(e?.message || e));
          });
      }, revalidateMs);
    }

    return () => {
      mountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [revalidateMs]);

  const refresh = async () => {
    setLoading(true);
    try {
      const d = await fetchSummary();
      if (!mountedRef.current) return;
      setData(d);
      setErr(null);
      setLastUpdated(shared.at);
    } catch (e) {
      if (!mountedRef.current) return;
      setErr(String(e?.message || e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return { data, err, loading, refresh, lastUpdated };
}