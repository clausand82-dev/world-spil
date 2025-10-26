// world-spil-react/src/hooks/useHeaderSummary.js
// Minimalt invasive forbedringer:
// - Globalt mount-counter (shared.mounts) for at forhindre at hver hover-mount starter en revalidation.
// - Kun første mount udløser initial fetch hvis nødvendigt.
// - Kun én global periodisk revalidate-timer (shared.timerId) mens der er mounts.
// - Bevarer existing single-flight og sessionStorage persistence.

import { useEffect, useRef, useState } from 'react';
import { addSummaryRefreshListener, removeSummaryRefreshListener } from '../events/summaryEvents.js';

const ENDPOINT = '/world-spil/backend/api/header/summary.php';
const STORAGE_KEY = 'ws:header-summary-v1';

// Modul-global cache og tilstand deles af alle mounts
const shared = {
  data: null,
  err: null,
  promise: null,
  at: 0,              // timestamp ms for sidste update
  unauthenticated: false,
  isFetching: false,
  etag: null,
  mounts: 0,          // antal aktive mount'er af hook'en
  timerId: null,      // id for global setInterval
};

// sessionStorage helpers (persist data + etag for instant UI after reload)
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
    shared.etag = cached.etag || null;
  }
  if (cached && cached.unauthenticated) {
    shared.unauthenticated = true;
  }
})();

async function doFetch() {
  const headers = {};
  if (shared.etag) headers['If-None-Match'] = shared.etag;

  const res = await fetch(ENDPOINT, { credentials: 'include', headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-json response */ }

  // 401: ikke autentificeret
  if (res.status === 401) {
    return { unauthenticated: true };
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (!json || json.ok === false) {
    const msg = (json && (json.error?.message || json.message)) || 'Ukendt serverfejl';
    throw new Error(msg);
  }

  // 304 håndteres af fetch's status hvis server sender 304. Vi returnerer data hvis 304.
  if (res.status === 304) {
    return { data: shared.data ?? null };
  }

  const etag = res.headers.get('ETag') || null;
  return { data: json.data ?? null, etag };
}

function fetchSummary() {
  // single-flight: hvis allerede i gang, returnér eksisterende promise
  if (shared.promise) return shared.promise;

  shared.isFetching = true;
  shared.promise = doFetch()
    .then((res) => {
      shared.isFetching = false;
      shared.promise = null;

      if (res?.unauthenticated) {
        shared.data = null;
        shared.err = null;
        shared.unauthenticated = true;
        shared.at = Date.now();
        saveToSession({ data: null, at: shared.at, unauthenticated: true, etag: null });
        return { unauthenticated: true };
      }

      if (res?.data !== undefined) {
        shared.data = res.data;
        shared.err = null;
        shared.unauthenticated = false;
        shared.at = Date.now();
        if (res.etag) shared.etag = res.etag;
        saveToSession({ data: shared.data, at: shared.at, unauthenticated: false, etag: shared.etag });
        return { data: shared.data };
      }

      // fallback: return eksisterende cached data
      return { data: shared.data };
    })
    .catch((err) => {
      shared.err = String(err?.message || err);
      shared.isFetching = false;
      shared.promise = null;
      return Promise.reject(err);
    });

  return shared.promise;
}

/**
 * useHeaderSummary
 * - revalidateMs: periodisk baggrundsrevalidate (default 30s)
 * - initialFetchIfOlderThanMs: kun første mount udfører initial fetch hvis cached data ældre end denne (default 5000ms)
 *
 * For at undgå per-hover fetches:
 * - Kun første mount starter initial fetch hvis nødvendig.
 * - Kun ét globalt interval kører mens der er mounts (shared.timerId).
 */
export default function useHeaderSummary({ revalidateMs = 30000, initialFetchIfOlderThanMs = 5000 } = {}) {
  const [data, setData] = useState(shared.data);
  const [err, setErr] = useState(shared.err);
  const [loading, setLoading] = useState(!shared.data && !shared.promise);
  const [isFetching, setIsFetching] = useState(Boolean(shared.isFetching));
  const [lastUpdated, setLastUpdated] = useState(shared.at);
  const [unauthenticated, setUnauthenticated] = useState(shared.unauthenticated);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Increment global mounts counter
    shared.mounts = (shared.mounts || 0) + 1;

    // Decide if we should do an immediate fetch:
    // Only perform immediate fetch on the *first* mount OR if we have no data.
    const now = Date.now();
    const age = now - (shared.at || 0);
    const isFirstMount = shared.mounts === 1;
    const hasNoData = !shared.data;
    const isStaleBeyondThreshold = age > Math.max(0, initialFetchIfOlderThanMs || 0);

    if (hasNoData || (isFirstMount && isStaleBeyondThreshold)) {
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
        })
        .finally(() => {
          if (!mountedRef.current) return;
          setLoading(false);
          setIsFetching(Boolean(shared.isFetching));
        });
    } else {
      // Bruger cached data og undgår at starte fetch.
      setLoading(false);
      setIsFetching(Boolean(shared.isFetching));
      setData(shared.data);
      setLastUpdated(shared.at);
      setUnauthenticated(shared.unauthenticated);
    }

    // Start global periodic revalidate kun hvis vi ikke allerede har en timer
    if (!shared.timerId && revalidateMs > 0) {
      shared.timerId = setInterval(() => {
        // single-flight fetchSummary håndterer parallell calls
        fetchSummary()
          .then((res) => {
            // vi opdaterer lokale states for *alle* mounts via shared variabler,
            // men hver hook instans bør re-read shared når den får en trigger (her opdateres shared.data i fetchSummary())
            // For enkelhed: denne interval opdaterer shared data; individuelle hook-instansers effekt vil ikke nødvendigvis re-run,
            // men de kan lytte til summaryEvents trigger hvis det ønskes. For nu: hooks læser shared.data ved mount og refresh
          })
          .catch(() => { /* ignore errors here */ });
      }, revalidateMs);
    }

    return () => {
      // Unmount: decrement global mounts
      mountedRef.current = false;
      shared.mounts = Math.max(0, (shared.mounts || 1) - 1);
      // hvis ingen mounts tilbage: ryd global timer (for at undgå unødvendige fetches)
      if (shared.mounts === 0 && shared.timerId) {
        clearInterval(shared.timerId);
        shared.timerId = null;
      }
    };
  }, [revalidateMs, initialFetchIfOlderThanMs]);

  // refresh-funktion som kan kaldes manuelt eller via summaryEvents
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
      if (!mountedRef.current) return;
      setLoading(false);
      setIsFetching(Boolean(shared.isFetching));
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