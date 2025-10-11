import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceActionModal from './modals/ResourceActionModal.jsx';
import LocalSellModal from './modals/LocalSellModal.jsx';
import GlobalListingModal from './modals/GlobalListingModal.jsx';

const GLOBAL_MIN_STAGE = 2; // same as before

export default function ResourceTradeController({ onChanged }) {
  const { data: gameData, refetch } = useGameData();
  const stage = Number(gameData?.state?.user?.currentstage ?? 0);
  const inv = gameData?.state?.inv || { solid: {}, liquid: {} };

  const [resId, setResId] = useState(null);
  const [flow, setFlow] = useState(null); // null | 'pick' | 'local' | 'global'
  const [anchorRect, setAnchorRect] = useState(null);

  useEffect(() => {
    const h = (e) => {
      const id = e?.detail?.resId;
      if (!id || id.startsWith('ani.')) return;
      setResId(id);
      setAnchorRect(e?.detail?.rect || null);
      setFlow('pick');
    };
    window.addEventListener('resources:trade', h);
    return () => window.removeEventListener('resources:trade', h);
  }, []);

  const maxAmount = useMemo(() => {
    if (!resId) return 0;
    const key = resId.replace(/^res\./, '');
    const solidAmt = Number(inv.solid?.[key] ?? 0);
    const liquidAmt = Number(inv.liquid?.[key] ?? 0);
    return solidAmt + liquidAmt;
  }, [inv, resId]);

  const canGlobal = stage >= GLOBAL_MIN_STAGE;
  const closeAll = () => { setFlow(null); setResId(null); setAnchorRect(null); };

  const onLocalAccepted = async ({ qty }) => {
    try {
      const r = await fetch('/world-spil/backend/api/actions/market_local_sell.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ res_id: resId, amount: qty })
      }).then(r => r.json());
      if (!r?.ok) throw new Error(r?.error?.message || 'Fejl');
      onChanged?.();
      await refetch?.();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      closeAll();
    }
  };

  const onGlobalSubmit = async ({ qty, price }) => {
    try {
      const r = await fetch('/world-spil/backend/api/actions/marketplace_create.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ res_id: resId, amount: qty, price })
      }).then(r => r.json());
      if (!r?.ok) throw new Error(r?.error?.message || 'Fejl');
      onChanged?.();
      await refetch?.();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      closeAll();
    }
  };

  return (
    <>
      <ResourceActionModal
        isOpen={flow === 'pick'}
        onClose={closeAll}
        onPick={(k) => setFlow(k)}
        canGlobal={canGlobal}
        resId={resId}
        anchorRect={anchorRect}
      />
      <LocalSellModal
        isOpen={flow === 'local'}
        resId={resId}
        maxAmount={maxAmount}
        onCancel={closeAll}
        onAccepted={onLocalAccepted}
      />
      <GlobalListingModal
        isOpen={flow === 'global'}
        resId={resId}
        maxAmount={maxAmount}
        onCancel={closeAll}
        onSubmit={onGlobalSubmit}
      />
    </>
  );
}