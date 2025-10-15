import { useEffect, useState, useCallback } from 'react';

function parseQuery(search) {
  const qp = new URLSearchParams(search || '');
  const out = {};
  for (const [k, v] of qp.entries()) out[k] = v;
  return out;
}

function parseLocation() {
  const search = window.location.search || '';
  const query = parseQuery(search);

  const h = window.location.hash || '';
  if (h.startsWith('#/')) {
    const parts = h.slice(2).split('/');
    const out = { page: parts[0] || 'map', param: parts[1] || null, query };
    console.debug('useRouter.parseLocation (hash)', { hash: h, out });
    return out;
  }

  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) {
    console.debug('useRouter.parseLocation (path empty)', { path, out: { page: 'map', param: null, query } });
    return { page: 'map', param: null, query };
  }
  const pparts = path.split('/');
  const out = { page: pparts[0] || 'map', param: pparts[1] || null, query };
  console.debug('useRouter.parseLocation (pathname)', { path, out });
  return out;
}

export function useRouter() {
  const [loc, setLoc] = useState(parseLocation);

  useEffect(() => {
    const onHash = () => setLoc(parseLocation());
    const onPop = () => setLoc(parseLocation());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // push: ændrer kun hash (bevarer query automatisk) men kan også sætte/rydde query via opts.query
  const push = useCallback(
    (page, param, opts = {}) => {
      const target = '#/' + (page || 'map') + (param ? '/' + param : '');
      if (Object.prototype.hasOwnProperty.call(opts, 'query')) {
        // caller vil eksplicit sætte eller rydde query -> brug history.pushState så vi kan ændre search + hash
        const qp = opts.query && typeof opts.query === 'object' ? new URLSearchParams(opts.query).toString() : '';
        const search = qp ? '?' + qp : '';
        const base = window.location.pathname + search;
        history.pushState({}, '', base + target);
        setLoc(parseLocation());
      } else {
        // standard: kun skift hash, behold eksisterende search
        window.location.hash = target;
      }
    },
    []
  );

  // replace: skriv ny hash men bevare eksisterende pathname+search; kan også sætte/rydde query via opts.query
  const replace = useCallback(
    (page, param, opts = {}) => {
      const targetHash = '#/' + (page || 'map') + (param ? '/' + param : '');
      let search = window.location.search || '';
      if (Object.prototype.hasOwnProperty.call(opts, 'query')) {
        if (opts.query && typeof opts.query === 'object') {
          search = '?' + new URLSearchParams(opts.query).toString();
        } else {
          search = '';
        }
      }
      const base = window.location.pathname + (search || '');
      history.replaceState({}, '', base + targetHash);
      setLoc(parseLocation());
    },
    []
  );

  return { page: loc.page, param: loc.param, query: loc.query || {}, push, replace };
}

export default useRouter;