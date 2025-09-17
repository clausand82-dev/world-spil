import React, { createContext, useContext, useState, useEffect } from 'react';
import { useGameData } from './GameDataContext.jsx';
import { postJSON } from '../services/api.js';

const BuildJobsContext = createContext(null);

const loadActiveBuildsFromStorage = () => {
    try {
        const raw = localStorage.getItem('ws:active_builds');
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
};

export function BuildJobsProvider({ children }) {
    const { data, refreshData } = useGameData();
    const [activeJobs, setActiveJobs] = useState(() => loadActiveBuildsFromStorage());

    useEffect(() => {
        // Vent med at starte tick-timeren, indtil vi har data fra serveren.
        if (!data) return;

        const tick = async () => {
            const now = Date.now();
            let jobsChanged = false;
            const currentJobs = loadActiveBuildsFromStorage();
            const jobsToComplete = Object.keys(currentJobs).filter(id => now >= currentJobs[id].endTs);

            if (jobsToComplete.length > 0) {
                for (const jobId of jobsToComplete) {
                    try {
                        const job = currentJobs[jobId];
                        const scope = jobId.split('.')[0];
                        await postJSON('/world-spil/backend/api/actions/build_complete.php', { job_id: job.jobId, scope });
                        
                        // Fjern jobbet direkte fra den lokale kopi
                        delete currentJobs[jobId];
                        jobsChanged = true;
                    } catch (err) {
                        console.error(`Failed to complete job ${jobId}`, err);
                        // Hvis serveren siger "Not finished yet", lader vi den være
                        if (!err.message.includes("Not finished yet")) {
                             delete currentJobs[jobId];
                             jobsChanged = true;
                        }
                    }
                }
                
                if (jobsChanged) {
                    localStorage.setItem('ws:active_builds', JSON.stringify(currentJobs));
                    await refreshData(); // Opdater al spildata, hvilket vil udløse en re-render
                }
            }
            
            // Tving en re-render for at opdatere progress bars ved at opdatere state
            setActiveJobs(currentJobs);
        };

        const timerId = setInterval(tick, 2000); // Kør tick hvert 2. sekund
        return () => clearInterval(timerId);

    }, [data, refreshData]); // Kør kun denne effekt, når `data` er tilgængelig

    const startJob = async (id, durationS) => { /* ... kommer senere ... */ };
    const cancelJob = async (id) => { /* ... kommer senere ... */ };
    
    // =====================================================================
    // RETTELSE: Vi sikrer, at `value` altid er et objekt.
    // =====================================================================
    const value = { activeJobs, startJob, cancelJob };

    return (
        <BuildJobsContext.Provider value={value}>
            {children}
        </BuildJobsContext.Provider>
    );
}

// RETTELSE: Vores hook returnerer nu altid et tomt objekt, hvis contexten er null.
export const useBuildJobs = () => {
    return useContext(BuildJobsContext) || { activeJobs: {}, startJob: async () => {}, cancelJob: async () => {} };
};