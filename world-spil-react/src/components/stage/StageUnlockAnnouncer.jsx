import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import StageUnlockModal from './StageUnlockModal.jsx';
import { STAGE_CONTENT } from '../../config/stageUnlockContent.js';

const LS_KEY = (uid) => `ws:lastStageSeen:${uid}`;

function buildImageUrl(confPaths, raw) {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  const clean = String(raw).replace(/^\.?\/+/, '');
  const baseFromConf = (confPaths?.art_url_base || confPaths?.artBase || '').replace(/\/+$/, '');
  const defaultPublicBase = '/world-spil/public/assets/art';
  const artBase = (baseFromConf || defaultPublicBase).replace(/\/+$/, '');
  return `${artBase}/${clean}`;
}

export default function StageUnlockAnnouncer() {
  const { data: summary, loading, err } = useHeaderSummary();
  const { data: gameData } = useGameData();

  // DEV: true => åbn normal stage-popup ved hver refresh; false => kun ved stage-stigning
  const DEV_FORCE_SHOW = false; // sæt til false i prod

  // Vent på rigtigt userId – ingen 'anon' fallback
  const userId = gameData?.state?.user?.userId ?? gameData?.state?.user?.user_id ?? null;
  const stageNow = Number(summary?.stage?.current ?? gameData?.state?.user?.currentstage ?? 0);
  const metricsMeta = summary?.metricsMeta || {};
  const confPaths = gameData?.config?.paths || gameData?.config?.Paths || {};

  // Sidst sete stage (pr. user)
  const [lastSeen, setLastSeen] = useState(null);
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(LS_KEY(userId));
      setLastSeen(raw !== null ? Number(raw) : 0);
    } catch {
      setLastSeen(0);
    }
  }, [userId]);

  // Normaltilstand: find stages vi lige er steget forbi
  const newlyReachedStages = useMemo(() => {
    if (lastSeen === null) return []; // afvent init
    if (!Number.isFinite(stageNow)) return [];
    const prev = Number.isFinite(lastSeen) ? lastSeen : 0;
    if (stageNow <= prev) return [];
    const arr = [];
    for (let s = prev + 1; s <= stageNow; s++) arr.push(s);
    return arr;
  }, [stageNow, lastSeen]);

  // Byg pages:
  // - DEV: åbn normal popup hver refresh; vis ALLE sider fra 1..stageNow (paging)
  // - Normal: sider for alle nye stages siden lastSeen
  const pages = useMemo(() => {
    if (!userId || !Number.isFinite(stageNow) || stageNow <= 0) return [];

    const mapStage = (s) => {
      const manual = STAGE_CONTENT[s] || {};
      const imageUrl = manual.image ? buildImageUrl(confPaths, manual.image) : '';
      const unlocked = Object.entries(metricsMeta)
        .filter(([, meta]) => Number(meta?.stage?.unlock_at ?? 0) === s)
        .map(([id, meta]) => ({ id, label: meta?.label || id }));
      const title = manual.title || `Stage ${s} låst op`;
      const desc = manual.desc || (unlocked.length ? 'Nye muligheder er tilgængelige:' : 'Der er låst op for nye muligheder.');
      return { stage: s, title, desc, imageUrl, unlocked };
    };

    if (DEV_FORCE_SHOW) {
      // Ignorér lastSeen i DEV – vis alle sider fra 1..stageNow
      const stages = Array.from({ length: stageNow }, (_, i) => i + 1);
      return stages.map(mapStage);
    }

    // Normal drift
    if (lastSeen === null) return [];
    if (!newlyReachedStages.length) return [];
    return newlyReachedStages.map(mapStage);
  }, [DEV_FORCE_SHOW, userId, stageNow, lastSeen, newlyReachedStages, metricsMeta, confPaths]);

  // Åbn modal når der er indhold (pages)
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (loading || err) return;
    if (!userId) return;
    setOpen(pages.length > 0);
  }, [pages.length, loading, err, userId]);

  const handleClose = () => {
    setOpen(false);
    // I DEV gemmer vi ikke lastSeen (skal åbne hver refresh)
    if (!DEV_FORCE_SHOW && userId && Number.isFinite(stageNow) && stageNow > 0) {
      try { localStorage.setItem(LS_KEY(userId), String(stageNow)); } catch {}
      setLastSeen(stageNow);
    }
  };

  if (!open || !pages.length) return null;

  // Start altid på NYESTE stage – dvs. sidste side
  const initialIndex = Math.max(0, pages.length - 1);

  return (
    <StageUnlockModal
      open={open}
      onClose={handleClose}
      pages={pages}
      initialIndex={initialIndex}
    />
  );
}