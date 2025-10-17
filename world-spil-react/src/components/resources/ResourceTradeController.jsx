import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import ResourceActionModal from './modals/ResourceActionModal.jsx';
import LocalSellModal from './modals/LocalSellModal.jsx';
import GlobalListingModal from './modals/GlobalListingModal.jsx';
import { triggerMarketRefresh } from '../../events/marketEvents.js';

const GLOBAL_MIN_STAGE = 2; // same as before

export default function ResourceTradeController({ onChanged }) {
  const { data: gameData, refreshData } = useGameData();
  const stage = Number(gameData?.state?.user?.currentstage ?? 0);
  const inv = gameData?.state?.inv || { solid: {}, liquid: {} };

  const [resId, setResId] = useState(null);
  const [resName, setResName] = useState(null);
  const [resEmoji, setResEmoji] = useState(null);
  const [flow, setFlow] = useState(null); // null | 'pick' | 'local' | 'global'
  const [anchorRect, setAnchorRect] = useState(null);
  const [unitBackend, setUnitBackend] = useState(null);
  const [loadingUnit, setLoadingUnit] = useState(false);

  useEffect(() => {
    const h = (e) => {
      const id = e?.detail?.resId;
      if (!id || id.startsWith('ani.')) return;
      setResId(id);
      setAnchorRect(e?.detail?.rect || null);
      setResName(e?.detail?.resName || null);
      setResEmoji(e?.detail?.resEmoji || null);
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
  const closeAll = () => {
    setFlow(null);
    setResId(null);
    setAnchorRect(null);
    setUnitBackend(null);
    setLoadingUnit(false);
    setResName(null);
    setResEmoji(null);
  };

  // Når brugeren vælger lokal salg -> hent backend pris og vis modal
  const openLocalSell = async (rId, maxAmt) => {
    setResId(rId);
    setAnchorRect(null);
    setFlow('local');          // åbn modal (viser loading indtil pris hentet)
    setUnitBackend(null);
    setLoadingUnit(true);
    try {
      const resp = await fetch(`/world-spil/backend/api/resource_price.php?res_id=${encodeURIComponent(rId)}&context=local`, { credentials: 'include' });
      const json = await resp.json();
      if (json && json.ok && json.data?.price !== undefined) {
        setUnitBackend(Number(json.data.price));
      } else {
        setUnitBackend(null); // fallback til klientestimat i modal
      }
    } catch (e) {
      setUnitBackend(null);
    } finally {
      setLoadingUnit(false);
    }
  };

  // Local accepted handler (sends res_id + amount only)
  const onLocalAccepted = async ({ qty }) => {
  try {
    const r = await fetch('/world-spil/backend/api/actions/market_local_sell.php', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ res_id: resId, amount: qty })
    }).then(r => r.json());
    if (!r?.ok) throw new Error(r?.error?.message || 'Fejl');

    triggerMarketRefresh();       // tell MarketTab to reload lists
    await refreshData?.();        // refresh resources/money
    onChanged?.();
    closeAll();
  } catch (e) {
    alert(e.message || 'Salg fejlede');
    closeAll();
  }
};

  // Global listing submit (posts res_id, amount, price)
  const onGlobalSubmit = async ({ qty, price }) => {
  try {
    const r = await fetch('/world-spil/backend/api/actions/marketplace_create.php', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ res_id: resId, amount: qty, price })
    }).then(r => r.json());
    if (!r?.ok) throw new Error(r?.error?.message || 'Fejl');

    triggerMarketRefresh();
    await refreshData?.();
    onChanged?.();
    closeAll();
  } catch (e) {
    alert(e.message || 'Sæt til salg fejlede');
    closeAll();
  }
};

  return (
    <>
      <ResourceActionModal
        isOpen={flow === 'pick'}
        onClose={closeAll}
        // Hvis brugeren vælger "local", hent backendprisen først
        onPick={(k) => {
          if (k === 'local') {
            openLocalSell(resId, maxAmount);
          } else {
            setFlow(k);
          }
        }}
        canGlobal={canGlobal}
        resId={resId}
        resName={resName}
        resEmoji={resEmoji}
        anchorRect={anchorRect}
      />
      <LocalSellModal
        isOpen={flow === 'local'}
        resId={resId}
        resName={resName}
        resEmoji={resEmoji}
        maxAmount={maxAmount}
        onCancel={closeAll}
        onAccepted={onLocalAccepted}
        unitFromBackend={unitBackend}
        loadingUnit={loadingUnit}
      />
      <GlobalListingModal
        isOpen={flow === 'global'}
        resId={resId}
        resName={resName}
        resEmoji={resEmoji}
        maxAmount={maxAmount}
        onCancel={closeAll}
        onSubmit={onGlobalSubmit}
      />
    </>
  );
}