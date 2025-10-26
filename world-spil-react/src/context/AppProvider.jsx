import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = useCallback((userData) => {
    setUser(userData);
    if (userData?.token) localStorage.setItem('auth_token', userData.token);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('auth_token');
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}