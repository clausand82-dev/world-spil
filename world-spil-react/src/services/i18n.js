import { useGameData } from "../context/GameDataContext.jsx";

function dotGet(obj, path) {
  if (!obj) return undefined;
  return String(path).split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : undefined), obj);
}

export function useT() {
  const { data } = useGameData();
  // prøv flere sandsynlige placeringer
  const langRoots = [
    data?.lang,
    data?.defs?.lang,
    data?.state?.lang,
  ].filter(Boolean);

  return function t(key) {
    for (const root of langRoots) {
      // prøv både direkte key og dot-path
      const direct = root[key];
      if (direct != null) return direct;
      const dotted = dotGet(root, key);
      if (dotted != null) return dotted;
    }
    return key; // fallback: vis nøgle hvis intet fundet
  };
}