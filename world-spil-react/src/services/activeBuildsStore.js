import { useSyncExternalStore } from "react";

// Global init fra localStorage (engangs)
(function initActiveBuilds() {
  if (!window.ActiveBuilds) {
    try {
      const raw = localStorage.getItem("ActiveBuilds_v1");
      window.ActiveBuilds = raw ? JSON.parse(raw) || {} : {};
    } catch {
      window.ActiveBuilds = {};
    }
  }
})();

// Lyt til storage-events (andre tabs)
window.addEventListener("storage", (e) => {
  if (e.key === "ActiveBuilds_v1") {
    try {
      window.ActiveBuilds = e.newValue ? JSON.parse(e.newValue) || {} : {};
    } catch {
      window.ActiveBuilds = {};
    }
    notifyActiveBuildsChanged();
  }
});

const listeners = new Set();

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyActiveBuildsChanged() {
  // Trig React til at re-køre getSnapshot i subscribers
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

// Hjælpere til at ændre ActiveBuilds uden in-place mutation
export function replaceActiveBuilds(next) {
  window.ActiveBuilds = next || {};
  try { localStorage.setItem("ActiveBuilds_v1", JSON.stringify(window.ActiveBuilds)); } catch {}
  notifyActiveBuildsChanged();
}

export function updateActiveBuilds(mutator) {
  const base = window.ActiveBuilds || {};
  const next = { ...base };
  mutator(next);
  replaceActiveBuilds(next);
}

// React-hook: true hvis der er et aktivt build for id
export function useActiveBuildFlag(id) {
  const get = () => Boolean(window.ActiveBuilds?.[id]);
  return useSyncExternalStore(subscribe, get, get);
}