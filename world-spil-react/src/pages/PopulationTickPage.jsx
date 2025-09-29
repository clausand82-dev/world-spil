import React, { useState, useEffect } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import useCitizensReproductionTick from '../hooks/useCitizensReproductionTick.js';
import ReproSummaryModal from '../components/repro/ReproSummaryModal.jsx';

export default function PopulationTickPage() {
  const { data, loading: loadingGame } = useGameData();
  const { loading, result, error, tick } = useCitizensReproductionTick();
  const [modalOpen, setModalOpen] = useState(false);

  // Check stage
  const stage = Number(data?.state?.user?.currentstage ?? 0);
  useEffect(() => {
    // Hvis ikke stage er nok, redirect til dashboard
    if (!loadingGame && stage < 2) {
      window.location.href = '/'; // eller '/dashboard'
    }
  }, [loadingGame, stage]);

  // Vis loading mens useGameData loader
  if (loadingGame) return <div className="panel">Indlæser data...</div>;
  if (stage < 2) return null; // Eller vis "Adgang kræver stage 2"

  return (
    <div className="pop-tick-page" style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
      <h1>Befolkningssystem – tick</h1>
      <div style={{ marginBottom: 16, fontSize: 16 }}>
        Her kan du køre befolkningsticket manuelt og se detaljer for sidste run. Siden er kun tilgængelig på stage 2+.
      </div>
      <button
        onClick={tick}
        disabled={loading}
        style={{
          padding: '8px 24px',
          background: loading ? '#eee' : '#cdf1d8',
          border: '1px solid #b1e4c1',
          borderRadius: 7,
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer'
        }}
      >
        {loading ? 'Kører tick...' : 'Kør befolkningstjek'}
      </button>
      {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      {result && (
        <div className="pop-tick-result" style={{ marginTop: 24, padding: 20, background: '#f6f9ff', borderRadius: 10 }}>
          <div>
            <strong>Cycles:</strong> {result.cycles}
          </div>
          <div>
            Fødsler: <b>{result?.byCycle?.reduce((a,c)=>a+Number(c.births?.total||0),0)}</b> | Tilflyttere: <b>{result?.byCycle?.reduce((a,c)=>a+Number(c.immigration?.total||0),0)}</b> | Fraflyttere: <b>{result?.byCycle?.reduce((a,c)=>a+Number(c.emigration?.total||0),0)}</b> | Dødsfald: <b>{result?.byCycle?.reduce((a,c)=>a+Number(c.deaths?.total||0),0)}</b>
          </div>
          <button style={{ marginTop: 8 }} onClick={() => setModalOpen(true)}>
            Vis detaljeret tick-summary
          </button>
        </div>
      )}
      <ReproSummaryModal open={modalOpen} onClose={() => setModalOpen(false)} data={result} />
    </div>
  );
}