import React, { useState, useEffect } from 'react';
import ReproSummaryModal from './ReproSummaryModal.jsx';
import useCitizensReproductionTick from './hooks/useCitizensReproductionTick';

export default function ReproductionNotifier({ autoShow = true }) {
  const { loading, result, error, tick } = useCitizensReproductionTick();
  const [modalOpen, setModalOpen] = useState(false);

  // Pop modal automatisk når nyt result kommer, hvis autoShow er sand
  useEffect(() => {
    if (autoShow && result) setModalOpen(true);
  }, [result, autoShow]);

  return (
    <>
      <button
        onClick={tick}
        disabled={loading}
        style={{
          padding: '6px 16px',
          margin: '8px 0',
          background: loading ? '#eee' : '#cdf1d8',
          border: '1px solid #b1e4c1',
          borderRadius: 5,
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer'
        }}
      >
        {loading ? 'Kører tick...' : 'Kør befolkningstjek'}
      </button>
      {error && (
        <div style={{ color: 'red', margin: '6px 0' }}>
          Fejl: {error}
        </div>
      )}
      <button
        onClick={() => setModalOpen(true)}
        disabled={!result}
        style={{
          marginLeft: 12,
          padding: '4px 10px',
          background: '#f2f2f2',
          border: '1px solid #ccc',
          borderRadius: 5
        }}
      >
        Vis sidste tick
      </button>
      <ReproSummaryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        data={result}
      />
    </>
  );
}