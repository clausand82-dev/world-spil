// En simpel shared ticker: alle subscribers får samme "now" opdatering.
// Fordel: mange komponenter kan abonnere uden at starte egne intervals.
import { useEffect, useState } from 'react';

const SUBSCRIBERS = new Set();
let timerId = null;
let currentNow = Date.now();
const DEFAULT_MS = 500;

function startTimer(intervalMs = DEFAULT_MS) {
  if (timerId) return;
  timerId = setInterval(() => {
    currentNow = Date.now();
    for (const cb of SUBSCRIBERS) {
      try { cb(currentNow); } catch (e) { /* ignore subscriber errors */ }
    }
  }, intervalMs);
}

function stopTimerIfIdle() {
  if (timerId && SUBSCRIBERS.size === 0) {
    clearInterval(timerId);
    timerId = null;
  }
}

export default function useSharedTicker(intervalMs = DEFAULT_MS) {
  const [now, setNow] = useState(() => currentNow);

  useEffect(() => {
    const cb = (ts) => setNow(ts);
    SUBSCRIBERS.add(cb);
    // ensure timer is running
    startTimer(intervalMs);
    // immediately set current value
    setNow(currentNow);

    return () => {
      SUBSCRIBERS.delete(cb);
      stopTimerIfIdle();
    };
  }, [intervalMs]);

  return now;
}