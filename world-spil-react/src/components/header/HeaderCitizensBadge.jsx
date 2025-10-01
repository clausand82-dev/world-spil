import React from 'react';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import { useGameData } from "../../context/GameDataContext.jsx";
import CitizensBadge from '../sidebar/CitizensBadge.jsx';


/**
 * Wrapper til brug i Header.
 * - Henter summary én gang.
 * - Prop userStage kan gives udefra (din spil-state).
 * - thresholdStage kan ændres her eller i CitizensBadge som default.
 */
export default function HeaderCitizensBadge({ style, thresholdStage = 2}) { //her ændres thresholdStage globalt
  const { data, err, loading } = useHeaderSummary();

  const { data: gameData } = useGameData(); // data fra GameDataContext ændres til gameData for at undgå konflikt med useHeaderSummary
  
  // Stille ved fejl/loading i header
  if (err) return null;
  if (loading || !data) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', ...style }}>
      <CitizensBadge
        citizens={data.citizens}
        stage={gameData?.state?.user?.currentstage || 0} // Din spil-state
        thresholdStage={thresholdStage} // ÆNDRE HER globalt, hvis du vil styre fra headeren
      />
    </div>
  );
}