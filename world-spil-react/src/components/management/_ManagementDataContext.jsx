import React, { createContext, useContext, useMemo } from 'react';

const MgrCtx = createContext(null);

export function ManagementDataProvider({ choices, setChoice, summary, gameData, translations, children }) {
  const value = useMemo(() => ({
    choices: choices || {},
    setChoice: setChoice || (() => {}),
    summary,
    gameData,
    translations: translations || {},
  }), [choices, setChoice, summary, gameData, translations]);

  return <MgrCtx.Provider value={value}>{children}</MgrCtx.Provider>;
}

export function useManagementData() {
  const v = useContext(MgrCtx);
  if (!v) throw new Error('useManagementData must be used within <ManagementDataProvider>');
  return v;
}