import { useEffect, useRef, useState } from 'react';
import { addSummaryRefreshListener, removeSummaryRefreshListener } from '../events/summaryEvents.js';

const ENDPOINT = '/world-spil/backend/api/header/summary.php';
const STORAGE_KEY = 'ws:summary-cache-v1';

// Modul-global cache deles af alle mounts
const shared = {
  data: null,
  err: null,
  promise: null,
  at: 0,              // timestamp ms
  unauthenticated: false,
  isFetching: false,
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
  if (cached && cached.unauthenticated) {
    shared.unauthenticated = true;
  }
})();

async function doFetch() {
  const res = await fetch(ENDPOINT, { credentials: 'include' });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-json response */ }

  // 401: ikke autentificeret
  if (res.status === 401) {
    return { unauthenticated: true };
  }

  // HTTP error men ikke 401
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  // Forvent shape: { ok:true, data: {...} }
  if (!json || json.ok === false) {
    const msg = (json && (json.error?.message || json.message)) || 'Ukendt serverfejl';
    throw new Error(msg);
  }

  return { data: json.data ?? null };
}

function fetchSummary() {
  if (shared.promise) return shared.promise;
  // markér at vi er i gang med en fetch — men behold shared.data intakt
  shared.isFetching = true;
  shared.promise = doFetch()
    .then((res) => {
      shared.isFetching = false;
      if (res?.unauthenticated) {
        shared.data = null;
        shared.err = null;
        shared.unauthenticated = true;
        shared.at = Date.now();
        saveToSession({ data: null, at: shared.at, unauthenticated: true });
        return { unauthenticated: true };
      }
      shared.data = res.data ?? null;
      shared.err = null;
      shared.unauthenticated = false;
      shared.at = Date.now();
      saveToSession({ data: shared.data, at: shared.at, unauthenticated: false });
      return { data: shared.data };
    })
    .catch((err) => {
      shared.err = String(err?.message || err);
      shared.isFetching = false;
      // Do not clobber unauthenticated flag on other errors
      throw err;
    })
    .finally(() => {
      shared.promise = null;
    });
  return shared.promise;
}

/**
 * useHeaderSummary
 * - Returnerer { data, err, loading, refresh, lastUpdated, unauthenticated }
 * - Viser øjeblikkeligt sidste kendte summary (fra memory/sessionStorage), mens den revaliderer i baggrunden.
 */
export default function useHeaderSummary({ revalidateMs = 30000 } = {}) {
  const [data, setData] = useState(shared.data);
  const [err, setErr] = useState(shared.err);
  const [loading, setLoading] = useState(!shared.data && !shared.promise);
  const [isFetching, setIsFetching] = useState(Boolean(shared.isFetching));
  const [lastUpdated, setLastUpdated] = useState(shared.at);
  const [unauthenticated, setUnauthenticated] = useState(shared.unauthenticated);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;

    // Start/tilslut fetch – revalidate altid i baggrunden
    setIsFetching(true);
    fetchSummary()
      .then((res) => {
        if (!mountedRef.current) return;
        if (res?.unauthenticated) {
          setUnauthenticated(true);
          setData(null);
          setErr(null);
        } else {
          setData(res?.data ?? shared.data);
          setErr(null);
          setUnauthenticated(false);
        }
        setLoading(false);
        setIsFetching(false);
        setLastUpdated(shared.at);
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setErr(String(e?.message || e));
        setLoading(false);
        setIsFetching(false);
      });

    // Periodisk revalidate (stale-while-revalidate)
    let timer = null;
    if (revalidateMs > 0) {
      timer = setInterval(() => {
        setIsFetching(true);
        fetchSummary()
          .then((res) => {
            if (!mountedRef.current) return;
            if (res?.unauthenticated) {
              setUnauthenticated(true);
              setData(null);
              setErr(null);
            } else {
              setData(res?.data ?? shared.data);
              setErr(null);
              setUnauthenticated(false);
            }
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
    setIsFetching(true);
    try {
      const res = await fetchSummary();
      if (!mountedRef.current) return;
      if (res?.unauthenticated) {
        setUnauthenticated(true);
        setData(null);
        setErr(null);
      } else {
        setData(res?.data ?? shared.data);
        setErr(null);
        setUnauthenticated(false);
      }
      setLastUpdated(shared.at);
    } catch (e) {
      if (!mountedRef.current) return;
      setErr(String(e?.message || e));
    } finally {
      if (mountedRef.current) setLoading(false);
      if (mountedRef.current) setIsFetching(false);
    }
  };

  // Hold en ref til refresh så globale events kan kalde den uden at re-registrere lytteren hver render
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  // Lyt kun én gang; onRefresh kalder altid den seneste refresh via ref
  useEffect(() => {
    const onRefresh = () => {
      try { refreshRef.current?.(); } catch (e) { /* ignore */ }
    };
    addSummaryRefreshListener(onRefresh);
    return () => removeSummaryRefreshListener(onRefresh);
  }, []);

  const isStale = Boolean(shared.data && (Date.now() - (shared.at || 0) > Math.max(0, revalidateMs || 30000)));
  return { data, err, loading, isFetching, isStale, refresh, lastUpdated, unauthenticated };
}