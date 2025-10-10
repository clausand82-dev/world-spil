import React, { useEffect, useRef, useState } from 'react';

const API_BASE = '/world-spil/backend/api';

/**
 * Robust fetch helper der:
 * - sender cookies (credentials: 'include')
 * - håndterer non-JSON respons
 * - returnerer { ok, status, data, error }
 */
async function apiGet(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const status = res.status;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-json */ }
    if (status === 401) {
      return { ok: false, status: 401, data: json, error: { code: 'unauthorized', message: (json?.error?.message || json?.message || 'Unauthorized') } };
    }
    if (status >= 200 && status < 300) return { ok: true, status, data: json };
    return { ok: false, status, data: json, error: json?.error || { message: text || `HTTP ${status}` } };
  } catch (err) {
    return { ok: false, status: 0, error: { message: String(err) } };
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const status = res.status;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-json */ }
    if (status === 401) {
      return { ok: false, status: 401, data: json, error: { code: 'unauthorized', message: (json?.error?.message || json?.message || 'Unauthorized') } };
    }
    if (status >= 200 && status < 300) return { ok: true, status, data: json };
    return { ok: false, status, data: json, error: json?.error || { message: text || `HTTP ${status}` } };
  } catch (err) {
    return { ok: false, status: 0, error: { message: String(err) } };
  }
}

export default function TopbarAuth({ onAuthChange = () => window.location.reload() }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState({ loggedIn: false, userId: null, username: null });
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [err, setErr] = useState('');
  const popRef = useRef(null);

  // Luk popups ved klik udenfor
  useEffect(() => {
    const onDocClick = (e) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target)) {
        setShowLogin(false);
        setShowRegister(false);
        setErr('');
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Hent session/profile på mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        // Forsøg direkte profil (simplere og matcher backend location)
        const p = await apiGet('/user/profile.php');
        if (!mounted) return;
        if (p.ok && p.data?.data?.userId) {
          setSession({
            loggedIn: true,
            userId: p.data.data.userId,
            username: p.data.data.username ?? null,
          });
        } else {
          // Ikke logget ind eller 401 => vis login UI (men ikke automatisk open)
          setSession({ loggedIn: false, userId: null, username: null });
        }
      } catch (e) {
        // Fallback: sæt loggedOut og vis fejl i console
        console.error('TopbarAuth: error fetching profile', e);
        setSession({ loggedIn: false, userId: null, username: null });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleLogin(e) {
    e?.preventDefault();
    setErr('');
    if (!loginUser || !loginPass) {
      setErr('Udfyld brugernavn og kodeord.');
      return;
    }
    // POST til login.php (bemærk sti)
    const r = await apiPost('/auth/login.php', { username: loginUser, password: loginPass });
    if (r.ok && r.data?.ok) {
      // Forvent backend har sat session cookie; men vi opdaterer state lokalt
      setSession({
        loggedIn: true,
        userId: r.data.data?.userId ?? null,
        username: r.data.data?.username ?? loginUser,
      });
      setShowLogin(false);
      setLoginPass('');
      // Sørg for at caller opdaterer resten af app (eks. genindlæs summary)
      onAuthChange();
      return;
    }

    // Hvis 401 med klar besked, vis den
    setErr(r.data?.error?.message || r.error?.message || 'Login fejlede');
  }

  async function handleLogout() {
    setErr('');
    const r = await apiPost('/auth/logout.php', {});
    if (r.ok && r.data?.ok) {
      setSession({ loggedIn: false, userId: null, username: null });
      onAuthChange();
    } else {
      setErr(r.data?.error?.message || r.error?.message || 'Log ud fejlede');
    }
  }

  async function handleRegister(e) {
    e?.preventDefault();
    setErr('');
    if (!regUser || !regEmail || !regPass) {
      setErr('Udfyld brugernavn, email og kodeord.');
      return;
    }
    const r = await apiPost('/auth/register.php', { username: regUser, email: regEmail, password: regPass });
    if (r.ok && r.data?.ok) {
      // Auto-login: backend sætter session i register.php; men vi også forsøger login for robusthed
      const p = await apiGet('/user/profile.php');
      if (p.ok && p.data?.data?.userId) {
        setSession({
          loggedIn: true,
          userId: p.data.data.userId,
          username: p.data.data.username ?? regUser,
        });
      } else {
        // Fallback: forsøg login-post
        const l = await apiPost('/auth/login.php', { username: regUser, password: regPass });
        if (l.ok && l.data?.ok) {
          setSession({
            loggedIn: true,
            userId: l.data.data?.userId ?? null,
            username: l.data.data?.username ?? regUser,
          });
        } else {
          // keep logged out but close register popup
          setSession({ loggedIn: false, userId: null, username: null });
        }
      }
      setShowRegister(false);
      setRegPass('');
      onAuthChange();
    } else {
      setErr(r.data?.error?.message || r.error?.message || 'Registrering fejlede');
    }
  }

  return (
    <div className="topbar-auth" ref={popRef}>
      {loading ? (
        <span className="auth-muted">Tjekker login…</span>
      ) : session.loggedIn ? (
        <div className="auth-inline">
          <span className="auth-user" title="Logget ind">
            👤 {session.username || 'Bruger'}
          </span>
          <button className="btn small" onClick={handleLogout}>Log ud</button>
        </div>
      ) : (
        <div className="auth-inline">
          <button
            className="btn small"
            onClick={(e) => { e.stopPropagation(); setShowLogin(v => !v); setShowRegister(false); setErr(''); }}
          >
            Log ind
          </button>
          <button
            className="btn small secondary"
            onClick={(e) => { e.stopPropagation(); setShowRegister(v => !v); setShowLogin(false); setErr(''); }}
          >
            Opret
          </button>

          {showLogin && (
            <form className="auth-pop" onSubmit={handleLogin} onClick={(e) => e.stopPropagation()}>
              <div className="auth-title">Log ind</div>
              <input
                className="auth-input"
                type="text"
                placeholder="Brugernavn"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoFocus
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Kodeord"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
              />
              {err && <div className="auth-error">{err}</div>}
              <div className="auth-actions">
                <button type="submit" className="btn small primary">Log ind</button>
                <button type="button" className="btn small" onClick={() => setShowLogin(false)}>Luk</button>
              </div>
            </form>
          )}

          {showRegister && (
            <form className="auth-pop" onSubmit={handleRegister} onClick={(e) => e.stopPropagation()}>
              <div className="auth-title">Opret bruger</div>
              <input
                className="auth-input"
                type="text"
                placeholder="Brugernavn"
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                autoFocus
              />
              <input
                className="auth-input"
                type="email"
                placeholder="Email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Kodeord"
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
              />
              {err && <div className="auth-error">{err}</div>}
              <div className="auth-actions">
                <button type="submit" className="btn small primary">Opret</button>
                <button type="button" className="btn small" onClick={() => setShowRegister(false)}>Luk</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* old login

import React, { useEffect, useRef, useState } from 'react';

const API_BASE = '/world-spil/backend/api';

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  let j = null;
  try { j = await r.json(); } catch {}
  return { ok: r.ok && j?.ok !== false, status: r.status, data: j };
}

async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { ok: r.ok && j?.ok !== false, status: r.status, data: j };
}

export default function TopbarAuth({ onAuthChange = () => window.location.reload() }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState({ loggedIn: false, userId: null, username: null });
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [err, setErr] = useState('');
  const popRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target)) {
        setShowLogin(false);
        setShowRegister(false);
        setErr('');
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr('');
      // 1) Prøv session endpoint
      let s = await apiGet('/auth/session.php');
      if (s.ok && s.data?.data?.loggedIn) {
        setSession({
          loggedIn: true,
          userId: s.data.data.userId ?? null,
          username: s.data.data.username ?? null,
        });
        setLoading(false);
        return;
      }
      // 2) fallback: profil (401 => ikke logget ind)
      let p = await apiGet('/user/profile.php');
      if (p.ok && p.data?.data?.userId) {
        setSession({
          loggedIn: true,
          userId: p.data.data.userId,
          username: p.data.data.username || null,
        });
      } else {
        setSession({ loggedIn: false, userId: null, username: null });
      }
      setLoading(false);
    })();
  }, []);

  async function handleLogin(e) {
    e?.preventDefault();
    setErr('');
    if (!loginUser || !loginPass) {
      setErr('Udfyld brugernavn og kodeord.');
      return;
    }
    const r = await apiPost('/auth/login.php', { username: loginUser, password: loginPass });
    if (r.ok && r.data?.ok) {
      setSession({
        loggedIn: true,
        userId: r.data.data?.userId ?? null,
        username: r.data.data?.username ?? loginUser,
      });
      setShowLogin(false);
      setLoginPass('');
      onAuthChange();
    } else {
      setErr(r.data?.error?.message || 'Login fejlede');
    }
  }

  async function handleLogout() {
    setErr('');
    const r = await apiPost('/auth/logout.php', {});
    if (r.ok && r.data?.ok) {
      setSession({ loggedIn: false, userId: null, username: null });
      onAuthChange();
    } else {
      setErr(r.data?.error?.message || 'Log ud fejlede');
    }
  }

  async function handleRegister(e) {
    e?.preventDefault();
    setErr('');
    if (!regUser || !regEmail || !regPass) {
      setErr('Udfyld brugernavn, email og kodeord.');
      return;
    }
    const r = await apiPost('/auth/register.php', { username: regUser, email: regEmail, password: regPass });
    if (r.ok && r.data?.ok) {
      // auto-login efter succesfuld registrering (valgfrit) – vi forsøger:
      const l = await apiPost('/auth/login.php', { username: regUser, password: regPass });
      if (l.ok && l.data?.ok) {
        setSession({
          loggedIn: true,
          userId: l.data.data?.userId ?? null,
          username: l.data.data?.username ?? regUser,
        });
        setShowRegister(false);
        setRegPass('');
        onAuthChange();
        return;
      }
      setShowRegister(false);
      onAuthChange();
    } else {
      setErr(r.data?.error?.message || 'Registrering fejlede');
    }
  }

  return (
    <div className="topbar-auth" ref={popRef}>
      {loading ? (
        <span className="auth-muted">Tjekker login…</span>
      ) : session.loggedIn ? (
        <div className="auth-inline">
          <span className="auth-user" title="Logget ind">
            👤 {session.username || 'Bruger'}
          </span>
          <button className="btn small" onClick={handleLogout}>Log ud</button>
        </div>
      ) : (
        <div className="auth-inline">
          <button className="btn small" onClick={(e) => { e.stopPropagation(); setShowLogin(v => !v); setShowRegister(false); setErr(''); }}>
            Log ind
          </button>
          <button className="btn small secondary" onClick={(e) => { e.stopPropagation(); setShowRegister(v => !v); setShowLogin(false); setErr(''); }}>
            Opret
          </button>

          {showLogin && (
            <form className="auth-pop" onSubmit={handleLogin} onClick={(e) => e.stopPropagation()}>
              <div className="auth-title">Log ind</div>
              <input
                className="auth-input"
                type="text"
                placeholder="Brugernavn"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoFocus
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Kodeord"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
              />
              {err && <div className="auth-error">{err}</div>}
              <div className="auth-actions">
                <button type="submit" className="btn small primary">Log ind</button>
                <button type="button" className="btn small" onClick={() => setShowLogin(false)}>Luk</button>
              </div>
            </form>
          )}

          {showRegister && (
            <form className="auth-pop" onSubmit={handleRegister} onClick={(e) => e.stopPropagation()}>
              <div className="auth-title">Opret bruger</div>
              <input
                className="auth-input"
                type="text"
                placeholder="Brugernavn"
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                autoFocus
              />
              <input
                className="auth-input"
                type="email"
                placeholder="Email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Kodeord"
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
              />
              {err && <div className="auth-error">{err}</div>}
              <div className="auth-actions">
                <button type="submit" className="btn small primary">Opret</button>
                <button type="button" className="btn small" onClick={() => setShowRegister(false)}>Luk</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}*/