import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameData } from '../context/GameDataContext.jsx';

const API_BASE = '/world-spil/backend/api';

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

/* Centered modal used for login/register */
function CenterModal({ title, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-backdrop"
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          maxWidth: '92%',
          background: 'var(--panel-bg, #0b1220)',
          color: 'var(--text, #fff)',
          borderRadius: 10,
          padding: 16,
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Luk" style={{ color: 'inherit' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/*
  TopbarAuth
  - Uses react-query for profile + mutations to avoid manual hook races.
  - On login/register/logout we update the 'profile' query and trigger refreshData from GameDataContext.
  - On logout we also clear language-scoped alldata cache keys in localStorage (as previously added).
  - This reduces hook errors and race conditions on startup because react-query centralises fetch lifecycle.
*/
export default function TopbarAuth({ onAuthChange = () => window.location.reload() }) {
  const queryClient = useQueryClient();
  const { refreshData, updateState } = useGameData() || {}; // used to refresh app-level data after auth change

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [err, setErr] = useState('');

  // PROFILE QUERY - single source of truth for current session
  const { data: profileData, isLoading: profileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const p = await apiGet('/user/profile.php');
      if (p.ok && p.data?.data?.userId) return p.data.data;
      // return null for not logged in
      return null;
    },
    refetchOnWindowFocus: false,
    staleTime: 3000,
    retry: false
  });

  // derive session
  const session = profileData ? { loggedIn: true, userId: profileData.userId, username: profileData.username } : { loggedIn: false, userId: null, username: null };

  // MUTATIONS
  const loginMutation = useMutation({
    mutationFn: async ({ username, password }) => apiPost('/auth/login.php', { username, password }),
    onSuccess: async (res) => {
      // If login returned OK, try to update profile query from server
      if (res?.ok && res.data?.ok) {
        // refetch profile to get canonical data (session)
        await refetchProfile();
        // refresh app data & invalidate caches
        try { await refreshData?.(); } catch {}
        // notify external
        try { onAuthChange && onAuthChange(); } catch {}
      }
    }
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, email, password }) => apiPost('/auth/register.php', { username, email, password }),
    onSuccess: async (res) => {
      if (res?.ok && res.data?.ok) {
        // after register, servers may or may not auto-set session. attempt to refetch profile
        await refetchProfile();
        if (!queryClient.getQueryData(['profile'])) {
          // attempt a login as recovery
          try {
            const l = await apiPost('/auth/login.php', { username: regUser, password: regPass });
            if (l.ok && l.data?.ok) {
              await refetchProfile();
            }
          } catch (e) { /* ignore */ }
        }
        try { await refreshData?.(); } catch {}
        try { onAuthChange && onAuthChange(); } catch {}
      }
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => apiPost('/auth/logout.php', {}),
    onSuccess: async () => {
      // Immediately clear profile query to avoid UI thinking user is still present
      queryClient.setQueryData(['profile'], null);
      // clear sensitive in-memory user state via GameDataContext updateState
      try { if (typeof updateState === 'function') updateState({ state: { user: {} } }); } catch (e) {}
      // remove local language-scoped alldata caches so alldata fetches fresh
      try {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith('ws:alldata') || k === '__ws_data_update') toRemove.push(k);
        }
        toRemove.forEach(k => {
          try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }

      // trigger refresh of app-level data; fallback to reload
      try {
        if (typeof refreshData === 'function') {
          await refreshData();
        } else {
          window.location.reload();
        }
      } catch (e) {
        try { window.location.reload(); } catch (_) {}
      }

      // notify external
      try { onAuthChange && onAuthChange(); } catch {}
    }
  });

  // UI helpers
  async function handleLogin(e) {
    e?.preventDefault();
    setErr('');
    if (!loginUser || !loginPass) {
      setErr('Udfyld brugernavn og kodeord.');
      return;
    }
    try {
      await loginMutation.mutateAsync({ username: loginUser, password: loginPass });
      // If mutation didn't set profile, check server response for errors
      const prof = queryClient.getQueryData(['profile']);
      if (prof) {
        setShowLoginModal(false);
        setLoginPass('');
        setErr('');
        return;
      }
      // if still no profile, try to surface mutation error
      setErr(loginMutation.error?.data?.error?.message || loginMutation.error?.error?.message || 'Login fejlede');
    } catch (e) {
      setErr(e?.message || 'Netværksfejl ved login.');
    }
  }

  async function handleRegister(e) {
    e?.preventDefault();
    setErr('');
    if (!regUser || !regEmail || !regPass) {
      setErr('Udfyld brugernavn, email og kodeord.');
      return;
    }
    try {
      await registerMutation.mutateAsync({ username: regUser, email: regEmail, password: regPass });
      const prof = queryClient.getQueryData(['profile']);
      if (prof) {
        setShowRegisterModal(false);
        setRegPass('');
        setErr('');
        return;
      }
      // If register succeeded but no profile, provide guidance
      setErr('Bruger oprettet, men automatisk login kunne ikke bekræftes. Prøv at logge ind manuelt.');
    } catch (e) {
      setErr(e?.message || 'Netværksfejl ved registrering.');
    }
  }

  async function handleLogout() {
    setErr('');
    try {
      await logoutMutation.mutateAsync();
    } catch (e) {
      setErr(e?.message || 'Netværksfejl ved log ud.');
    }
  }

  // Derived UI state
  const busy = loginMutation.isLoading || registerMutation.isLoading || logoutMutation.isLoading;
  const loading = profileLoading;

  // Render UI
  const authButtons = loading ? (
    <span className="auth-muted">Tjekker login…</span>
  ) : session.loggedIn ? (
    <div className="auth-inline" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span className="auth-user" title="Logget ind">👤 {session.username || 'Bruger'}</span>
      <button className="btn small" onClick={handleLogout} disabled={busy}>Log ud</button>
    </div>
  ) : (
    <div className="auth-inline" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button
        className="btn small"
        onClick={() => { setShowLoginModal(true); setShowRegisterModal(false); setErr(''); }}
        disabled={busy}
      >
        Log ind
      </button>
      <button
        className="btn small secondary"
        onClick={() => { setShowRegisterModal(true); setShowLoginModal(false); setErr(''); }}
        disabled={busy}
      >
        Opret
      </button>
    </div>
  );

  return (
    <div className="topbar-auth" style={{ display: 'inline-block' }}>
      {authButtons}

      {showLoginModal && (
        <CenterModal title="Log ind" onClose={() => { if (!busy) { setShowLoginModal(false); setErr(''); } }}>
          <form onSubmit={handleLogin}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="auth-input"
                type="text"
                placeholder="Brugernavn"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoFocus
                disabled={busy}
                style={{ padding: '8px 10px', borderRadius: 6 }}
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Kodeord"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                disabled={busy}
                style={{ padding: '8px 10px', borderRadius: 6 }}
              />
              {err && <div className="auth-error" style={{ color: '#f88' }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="submit" className="btn small primary" disabled={busy}>Log ind</button>
                <button type="button" className="btn small" onClick={() => { if (!busy) { setShowLoginModal(false); setErr(''); } }} disabled={busy}>Luk</button>
              </div>
            </div>
          </form>
        </CenterModal>
      )}

      {showRegisterModal && (
        <CenterModal title="Opret bruger" onClose={() => { if (!busy) { setShowRegisterModal(false); setErr(''); } }}>
          <form onSubmit={handleRegister}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="auth-input"
                type="text"
                placeholder="Brugernavn"
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                autoFocus
                disabled={busy}
                style={{ padding: '8px 10px', borderRadius: 6 }}
              />
              <input
                className="auth-input"
                type="email"
                placeholder="Email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                disabled={busy}
                style={{ padding: '8px 10px', borderRadius: 6 }}
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Kodeord"
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                disabled={busy}
                style={{ padding: '8px 10px', borderRadius: 6 }}
              />
              {err && <div className="auth-error" style={{ color: '#f88' }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="submit" className="btn small primary" disabled={busy}>Opret</button>
                <button type="button" className="btn small" onClick={() => { if (!busy) { setShowRegisterModal(false); setErr(''); } }} disabled={busy}>Luk</button>
              </div>
            </div>
          </form>
        </CenterModal>
      )}
    </div>
  );
}