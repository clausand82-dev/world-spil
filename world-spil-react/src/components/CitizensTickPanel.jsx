import React, { useState } from 'react';
import useCitizensReproductionTick from './hooks/useCitizensReproductionTick';

export default function CitizensTickPanel() {
  const { loading, result, error, tick } = useCitizensReproductionTick();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="panel section citizens-tick-panel">
      <div className="section-head">Befolkningssystem</div>
      <div className="section-body">
        <button onClick={tick} disabled={loading}>
          {loading ? 'Kører...' : 'Kør tick nu'}
        </button>
        {error && <div style={{ color: 'red' }}>Fejl: {error}</div>}
        {result && (
          <div>
            <div>
              <strong>Antal cycles:</strong> {result.cycles}
            </div>
            <button onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? 'Skjul detaljer' : 'Vis detaljer'}
            </button>
            {showDetails && (
              <ul>
                {result.byCycle.map((cycle, idx) => (
                  <li key={idx}>
                    Tick #{idx + 1}:
                    {' '}👶 +{cycle.births}
                    {' '}🧳 +{cycle.immigration}
                    {' '}🚪 -{cycle.emigration}
                    {' '}⚰️ -{cycle.deaths}
                    {' '}🏠 rehoused: {cycle.rehoused}
                    <br />
                    Ratios: housing {cycle.ratios.housing.toFixed(2)}, provision {cycle.ratios.provision.toFixed(2)}, water {cycle.ratios.water.toFixed(2)}, health {cycle.ratios.health.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}