import { useEffect, useState } from 'react';

function parseHash(hash) {
  // forventet form: "#/page/param?k=v&k2=v2" eller "#/page?focus=rsd.x" eller "#/page#anchor"
  if (!hash) return { page: '', param: null, query: {} };
  // fjern start #
  let h = hash[0] === '#' ? hash.slice(1) : hash;
  // split path og rest
  const qIndex = h.indexOf('?');
  const hashIndex = h.indexOf('#', 1); // anchor after path
  let pathPart = h;
  let qs = '';
  if (qIndex !== -1) {
    pathPart = h.slice(0, qIndex);
    qs = h.slice(qIndex + 1);
  } else if (hashIndex !== -1) {
    pathPart = h.slice(0, hashIndex);
    // anchor after path will be parsed as query.focus below if needed
    qs = 'focus=' + encodeURIComponent(h.slice(hashIndex + 1));
  }

  const parts = pathPart.split('/').filter(Boolean); // ["research","rsd.foo"]
  const page = parts[0] || '';
  const param = parts[1] || null;

  const query = {};
  if (qs) {
    const usp = new URLSearchParams(qs);
    for (const [k, v] of usp.entries()) query[k] = v;
  }

  return { page, param, query };
}

export function useRouter() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route; // { page, param, query }
}

export default useRouter;