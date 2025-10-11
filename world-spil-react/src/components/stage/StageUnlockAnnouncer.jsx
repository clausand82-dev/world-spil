import React, { useEffect, useMemo, useState } from 'react';
import { useGameData } from '../../context/GameDataContext.jsx';
import useHeaderSummary from '../../hooks/useHeaderSummary.js';
import StageUnlockModal from './StageUnlockModal.jsx';
import { STAGE_CONTENT } from '../../config/stageUnlockContent.js';

const LS_KEY = (uid) => `ws:lastStageSeen:${uid || 'anon'}`;
const STAGE_ASSETS = import.meta.glob('../../assets/stage/*.{png,jpg,jpeg}', { eager: true, as: 'url' });

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

  // DEV hardcoded override: sæt til true for at ALTID vise modal (til test).
  // Når true vises det normale indhold (hvis tilgængeligt) eller første entry fra STAGE_CONTENT.
  const DEV_FORCE_SHOW = false;

  const userId = gameData?.state?.user?.userId || gameData?.state?.user?.user_id || 'anon';
  const stageNow = Number(summary?.stage?.current ?? gameData?.state?.user?.currentstage ?? 0);
  const metricsMeta = summary?.metricsMeta || {};
  const confPaths = gameData?.config?.paths || gameData?.config?.Paths || {};

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

  const newlyReachedStages = useMemo(() => {
    if (lastSeen === null) return [];
    if (!Number.isFinite(stageNow)) return [];
    const prev = Number.isFinite(lastSeen) ? lastSeen : 0;
    if (stageNow <= prev) return [];
    const arr = [];
    for (let s = prev + 1; s <= stageNow; s++) arr.push(s);
    return arr;
  }, [stageNow, lastSeen]);

  const pages = useMemo(() => {
    if (!newlyReachedStages.length) return [];
    return newlyReachedStages.map((s) => {
      const manual = STAGE_CONTENT[s] || {};
      const imageUrl = manual.image ? buildImageUrl(confPaths, manual.image) : '';
      const unlocked = Object.entries(metricsMeta)
        .filter(([, meta]) => Number(meta?.stage?.unlock_at ?? 0) === s)
        .map(([id, meta]) => ({ id, label: meta?.label || id }));
      const title = manual.title || `Stage ${s} låst op`;
      const desc = manual.desc || (unlocked.length ? 'Nye muligheder er tilgængelige:' : 'Der er låst op for nye muligheder.');
      return { stage: s, title, desc, imageUrl, unlocked };
    });
  }, [newlyReachedStages, metricsMeta, confPaths]);

  // UI state
  const [open, setOpen] = useState(DEV_FORCE_SHOW);
  const [imgSrc, setImgSrc] = useState(null);

  // Lås sider for modal så vi undgår flicker ved at pages midlertidigt bliver tomme
  const [modalPages, setModalPages] = useState([]);

  useEffect(() => {
    // hvis vi allerede har låst sider, behold dem indtil brugeren lukker
    if (modalPages.length) return;

    if (pages.length) {
      setModalPages(pages);
      setOpen(true);
      return;
    }

    // DEV_FORCE_SHOW: hvis ingen pages fra backend, brug første STAGE_CONTENT entry
    if (DEV_FORCE_SHOW) {
      const keys = Object.keys(STAGE_CONTENT || {});
      if (keys.length) {
        const k = keys[0];
        const manual = STAGE_CONTENT[k] || {};
        const imageUrl = manual.image ? buildImageUrl(confPaths, manual.image) : '';
        const title = manual.title || `Stage ${k}`;
        const desc = manual.desc || '';
        setModalPages([{ stage: Number(k) || 0, title, desc, imageUrl, unlocked: [] }]);
      }
      setOpen(true);
    }
  }, [pages.length, DEV_FORCE_SHOW, modalPages.length, confPaths]);

  // Åbn kun når lastSeen læst (medmindre DEV_FORCE_SHOW er true)
  useEffect(() => {
    if (DEV_FORCE_SHOW) return;
    if (loading || err) return;
    if (lastSeen === null) return;
    if (newlyReachedStages.length > 0) setOpen(true);
  }, [newlyReachedStages.length, loading, err, lastSeen, DEV_FORCE_SHOW]);

  // Lås den fungerende billeder-src når modalPages først er sat
  useEffect(() => {
    if (!modalPages.length) return;
    const p0 = modalPages[0];
    const fallback = '/world-spil/public/assets/art/stage/stage-1.jpg';
    const candidate = (p0 && p0.imageUrl) ? p0.imageUrl : fallback;
    if (!candidate) return;
    setImgSrc((prev) => prev || candidate);
  }, [modalPages.length]);

  const handleClose = () => {
    setOpen(false);
    try { localStorage.setItem(LS_KEY(userId), String(stageNow)); } catch {}
    setLastSeen(stageNow);
    setModalPages([]);
    setImgSrc(null);
  };

  if (!modalPages.length || !open) return null;

  const pagesWithLockedImage = (imgSrc && Array.isArray(modalPages) && modalPages.length)
    ? modalPages.map((p, i) => (i === 0 ? { ...p, imageUrl: imgSrc } : p))
    : modalPages;

  return (
    <StageUnlockModal
      open={open}
      onClose={handleClose}
      pages={pagesWithLockedImage}
    />
  );
}