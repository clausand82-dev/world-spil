import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

const GameDataContext = createContext(null);

export function GameDataProvider({ children }) {
  const [gameState, setGameState] = useState({ 
    isLoading: true, 
    data: null, 
    artManifest: new Set(), // Initialiser som et tomt Set
    error: null 
  });

  const fetchData = useCallback(async () => {
    try {
      setGameState(prev => ({ ...prev, isLoading: true }));
      
      // 1. Hent primær spildata
      const gameDataResponse = await fetch('/world-spil/backend/api/alldata.php');
      if (!gameDataResponse.ok) throw new Error(`API error: ${gameDataResponse.status}`);
      const gameDataResult = await gameDataResponse.json();
      if (!gameDataResult.ok) throw new Error(gameDataResult.error?.message || 'API data error');

      // 2. Hent billed-manifest (fra /public/assets/art/manifest.json)
      let artManifestSet = new Set();
      try {
        const manifestResponse = await fetch('/assets/art/manifest.json');
        if (manifestResponse.ok) {
          const manifestArray = await manifestResponse.json();
          if (Array.isArray(manifestArray)) {
            artManifestSet = new Set(manifestArray);
          }
        }
      } catch (manifestError) {
        console.warn("Could not load art manifest. Placeholders may be used.", manifestError);
      }

      setGameState({ 
        isLoading: false, 
        data: gameDataResult.data, 
        artManifest: artManifestSet, 
        error: null 
      });

    } catch (error) {
      console.error("Failed to fetch game data:", error);
      setGameState({ isLoading: false, data: null, artManifest: new Set(), error });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const value = { ...gameState, refreshData: fetchData };

  return (
    <GameDataContext.Provider value={value}>
      {children}
    </GameDataContext.Provider>
  );
}

export const useGameData = () => useContext(GameDataContext);