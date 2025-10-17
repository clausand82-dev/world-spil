import { useEffect, useState, useCallback } from 'react';

function parseQuery(search) {
  const qp = new URLSearchParams(search || '');
  const out = {};
  for (const [k, v] of qp.entries()) out[k] = v;
  return out;
}

function parseLocation() {
  const search = window.location.search || '';
  const queryFromSearch = parseQuery(search);

  const h = window.location.hash || '';
  if (h.startsWith('#/')) {
    // fx "#/research?focus=rsd.x.l1"
    const idx = h.indexOf('?');
    if (idx !== -1) {
      const path = h.slice(2, idx);
      const qs = h.slice(idx + 1);
      const queryFromHash = parseQuery(qs);
      const parts = path.split('/').filter(Boolean);
      return { page: parts[0] || 'map', param: parts[1] || null, query: { ...queryFromSearch, ...queryFromHash } };
    }
    const parts = h.slice(2).split('/').filter(Boolean);
    return { page: parts[0] || 'map', param: parts[1] || null, query: queryFromSearch };
  }

  // fallback: pathname (/research) + search (?focus=...) 
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return { page: 'map', param: null, query: queryFromSearch };
  const pparts = path.split('/');
  return { page: pparts[0] || 'map', param: pparts[1] || null, query: queryFromSearch };
}

export function useRouter() {
  const [loc, setLoc] = useState(parseLocation);

  useEffect(() => {
    const update = () => setLoc(parseLocation());
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  // push: kan bevare eksisterende search eller sætte/rydde query via opts.query
  const push = useCallback((page, param, opts = {}) => {
    const hash = '#/' + (page || 'map') + (param ? '/' + param : '');
    if (Object.prototype.hasOwnProperty.call(opts, 'query')) {
      const qp = opts.query && typeof opts.query === 'object' ? new URLSearchParams(opts.query).toString() : '';
      const search = qp ? `?${qp}` : '';
      history.pushState({}, '', window.location.pathname + search + hash);
      setLoc(parseLocation());
    } else {
      // kun skift hash (bevarer existing search)
      window.location.hash = hash;
    }
  }, []);

  // replace: som push men bruger replaceState
  const replace = useCallback((page, param, opts = {}) => {
    const hash = '#/' + (page || 'map') + (param ? '/' + param : '');
    let search = window.location.search || '';
    if (Object.prototype.hasOwnProperty.call(opts, 'query')) {
      if (opts.query && typeof opts.query === 'object') {
        search = '?' + new URLSearchParams(opts.query).toString();
      } else {
        search = '';
      }
    }
    history.replaceState({}, '', window.location.pathname + (search || '') + hash);
    setLoc(parseLocation());
  }, []);

  return { page: loc.page, param: loc.param, query: loc.query || {}, push, replace };
}

export default useRouter;