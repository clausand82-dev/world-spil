import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import GameImage from '../components/GameImage.jsx';
import './MapPage.css';

const COLS = 50;
const ROWS = 50;

function fmtMultAsPercent(mult) {
  if (mult == null || isNaN(mult)) return '—';
  const delta = (mult - 1) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${Math.round(delta)}%`;
}

// Robust midlertidig XML-indlæsning (samme som tidligere eksempel)
async function fetchWorldXmlText() {
  const candidates = [
    '/assets/data/world.map001.land001.xml',
    '/backend/data/xml/world.map001.land001.xml',
    'https://raw.githubusercontent.com/clausand82-dev/world-spil/main/backend/data/xml/world.map001.land001.xml',
  ];
  for (const url of candidates) {
    try {
      const rsp = await fetch(url, { cache: 'no-store' });
      if (!rsp.ok) continue;
      const ct = rsp.headers.get('content-type') || '';
      const text = await rsp.text();
      const looksLikeXml = /xml/i.test(ct) || text.trim().startsWith('<?xml') || text.includes('<world');
      if (!looksLikeXml) continue;
      return text;
    } catch {}
  }
  throw new Error('Kunne ikke hente gyldig XML for kortet.');
}

function parseWorldXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Ugyldigt XML-format i world.map001.land001.xml');

  const worldEl = doc.querySelector('world');
  if (!worldEl) throw new Error('XML mangler <world>-elementet.');

  const worldId = worldEl.getAttribute('id') != null ? Number(worldEl.getAttribute('id')) : null;

  const tiles = Array.from(doc.querySelectorAll('tile'));
  if (tiles.length === 0) throw new Error('XML indeholder ingen <tile>-elementer.');

  const tilesByIndex = Object.create(null);
  let mapId = null;
  let landId = null;

  for (const el of tiles) {
    const fieldIdx = Number(el.getAttribute('field'));
    const x = Number(el.getAttribute('x'));
    const y = Number(el.getAttribute('y'));
    const mapAttr = el.getAttribute('map');
    const landAttr = el.getAttribute('land');
    const multStr = String(el.getAttribute('mult') || '');

    const map = mapAttr != null ? Number(mapAttr) : null;
    const land = landAttr != null ? Number(landAttr) : null;
    if (mapId == null && map != null) mapId = map;
    if (landId == null && land != null) landId = land;

    const multRaw = Object.create(null);
    for (const pair of multStr.split(';')) {
      const [kRaw, vRaw] = pair.split(':');
      const k = (kRaw || '').trim();
      if (!k) continue;
      const v = Number((vRaw || '').trim());
      multRaw[k] = isNaN(v) ? null : v;
    }

    const multipliers = {
      forest: multRaw.forest ?? null,
      field: multRaw.field ?? null,
      mining: multRaw.mining ?? null,
      water: multRaw.water ?? null,
    };

    tilesByIndex[fieldIdx] = { n: fieldIdx, x, y, map, land, multipliers, multRaw };
  }

  return { worldId, mapId, landId, tilesByIndex };
}

// API helpers (tilpasses backend ved behov)
const API_BASE = '/world-spil/backend/api';

async function apiGetOccupied() {
  const r = await fetch(`${API_BASE}/map/occupied.php`, { credentials: 'include', cache: 'no-store' });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok || j?.ok === false) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  // Forventet dataform:
  // { ok: true, data: { occupied: [ { field: number, x: number, y: number, world_id?: number, map_id?: number, land?: number, user_id?: number, username?: string } ] } }
  return Array.isArray(j?.data?.occupied) ? j.data.occupied : [];
}

// Opdater API helper (kun sendt payload, resten ens)
async function apiChooseTile(payload) {
  const r = await fetch(`/world-spil/backend/api/map/choose_tile.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok || j?.ok === false) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  return j?.data || {};
}

// Inde i confirmChoose():
async function confirmChoose() {
  try {
    const t = confirm.tile;
    if (!t) return;

    const payload = {
      world_id: worldMeta.worldId ?? 1,
      map_id: worldMeta.mapId ?? 1,
      field: t.n,
      x: t.x,
      y: t.y,
      // send multipliers fra XML
      mul_forest: t.multipliers.forest ?? null,
      mul_field:  t.multipliers.field  ?? null,
      mul_mining: t.multipliers.mining ?? null,
      mul_water:  t.multipliers.water  ?? null,
    };

    await apiChooseTile(payload);

    // Markér som optaget lokalt
    setOccupiedSet(prev => new Set(prev).add(t.n));
    setOccupiedByMap(prev => {
      const m = new Map(prev);
      m.set(t.n, { field: t.n, x: t.x, y: t.y });
      return m;
    });

    setConfirm({ open: false, tile: t, occupiedBy: null });
    refreshData && refreshData();
  } catch (e) {
    alert(e?.message || 'Kunne ikke gemme dit valg.');
  }
}

export default function MapPage() {
  const { refreshData } = useGameData() || {};

  const wrapperRef = useRef(null);
  const [hover, setHover] = useState({ visible: false, left: 0, top: 0, tile: null, occupiedBy: null });
  const [selectedN, setSelectedN] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, tile: null, occupiedBy: null });

  // XML state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [worldMeta, setWorldMeta] = useState({ worldId: null, mapId: null, landId: null });
  const [tilesByIndex, setTilesByIndex] = useState(() => Object.create(null));

  // Occupied state
  const [occupiedSet, setOccupiedSet] = useState(() => new Set());
  const [occupiedByMap, setOccupiedByMap] = useState(() => new Map()); // n -> meta

  // markér at siden er set (førstegang)
  useEffect(() => { try { localStorage.setItem('ws.map.seen', '1'); } catch {} }, []);

  // Cells (50x50)
  const cells = useMemo(() => {
    const arr = [];
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const idx = (r - 1) * COLS + c;
        arr.push({ n: idx, x: c, y: r });
      }
    }
    return arr;
  }, []);

  // Load XML
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const xmlText = await fetchWorldXmlText();
        if (!mounted) return;
        const parsed = parseWorldXml(xmlText);
        setTilesByIndex(parsed.tilesByIndex || {});
        setWorldMeta({ worldId: parsed.worldId, mapId: parsed.mapId, landId: parsed.landId });
        setLoadError('');
      } catch (e) {
        setLoadError(e?.message || 'Fejl ved indlæsning af kortdata.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load occupied fields fra backend
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const occupied = await apiGetOccupied();
        if (!mounted) return;
        const set = new Set();
        const map = new Map();
        for (const row of occupied) {
          const n = Number(row.field ?? 0) || ((Number(row.y)-1)*COLS + Number(row.x));
          set.add(n);
          map.set(n, row);
        }
        setOccupiedSet(set);
        setOccupiedByMap(map);
      } catch (e) {
        console.warn('Kunne ikke hente optagede felter:', e?.message || e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const moveHover = (e) => {
    const wr = wrapperRef.current;
    if (!wr) return;
    const rect = wr.getBoundingClientRect();
    const left = e.clientX - rect.left + 12;
    const top = e.clientY - rect.top + 12;
    setHover((h) => ({ ...h, left, top }));
  };

  const onCellEnter = (n) => {
    const tile = tilesByIndex[n] || null;
    const occupiedBy = occupiedByMap.get(n) || null;
    setHover((h) => ({ ...h, visible: true, tile, occupiedBy }));
  };
  const onCellLeave = () => setHover((h) => ({ ...h, visible: false }));

  const onCellClick = (n) => {
    // Bloker klik på optaget felt
    if (occupiedSet.has(n)) return;
    const tile = tilesByIndex[n] || null;
    const occupiedBy = occupiedByMap.get(n) || null;
    setSelectedN(n);
    setConfirm({ open: true, tile, occupiedBy });
  };

  async function confirmChoose() {
    try {
      const t = confirm.tile;
      if (!t) return;

      const payload = {
        world_id: worldMeta.worldId ?? null,
        map_id: worldMeta.mapId ?? null,
        land: t.land ?? worldMeta.landId ?? null,
        field: t.n,
        x: t.x,
        y: t.y,
      };

      await apiChooseTile(payload);

      // Markér som optaget lokalt
      setOccupiedSet(prev => new Set(prev).add(t.n));
      setOccupiedByMap(prev => {
        const m = new Map(prev);
        m.set(t.n, { ...payload }); // evt. suppler med user_id/username hvis API returnerer det
        return m;
      });

      // Behold frysning på valgt felt
      setConfirm({ open: false, tile: t, occupiedBy: null });

      // Hent friske data hvis tilgængeligt
      refreshData && refreshData();
    } catch (e) {
      alert(e?.message || 'Kunne ikke gemme dit valg.');
    }
  }
  function cancelChoose() {
    setSelectedN(null);
    setConfirm({ open: false, tile: null, occupiedBy: null });
  }

  return (
    <section className="panel section">
      <div className="section-head">
        {worldMeta.worldId != null || worldMeta.mapId != null
          ? <>World: {worldMeta.worldId ?? '—'} — Map: {worldMeta.mapId ?? '—'}</>
          : 'Map'}
      </div>

      <div className="section-body">
        {loading && <div className="sub">Indlæser kortdata…</div>}
        {loadError && <div className="sub" style={{ color: 'var(--price-bad)' }}>{loadError}</div>}

        <div className="map-wrapper" ref={wrapperRef}>
          <GameImage
            src="/assets/art/world.map001.land001.detail.png"
            fallback="/assets/art/placeholder.big.png"
            alt="World map"
            className="map-image"
          />

          <div
            className="grid-overlay"
            style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
          >
            {cells.map((cell) => {
              const n = cell.n;
              const isSelected = selectedN === n;
              const isOccupied = occupiedSet.has(n);
              return (
                <div
                  key={n}
                  className={`grid-cell${isSelected ? ' selected' : ''}${isOccupied ? ' occupied' : ''}`}
                  onMouseEnter={() => onCellEnter(n)}
                  onMouseLeave={onCellLeave}
                  onMouseMove={moveHover}
                  onClick={() => onCellClick(n)}
                />
              );
            })}
          </div>

          {hover.visible && hover.tile && (
            <div className="hover-info" style={{ left: hover.left, top: hover.top }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Felt: {hover.tile.n}, X: {hover.tile.x}, Y: {hover.tile.y}
              </div>
              <div>Forest: {(hover.tile.multipliers.forest)}</div>
              <div>Field: {(hover.tile.multipliers.field)}</div>
              <div>Mining: {(hover.tile.multipliers.mining)}</div>
              <div>Water: {(hover.tile.multipliers.water)}</div>
              {occupiedSet.has(hover.tile.n) && (
                <div style={{ marginTop: 6, color: '#ffb3b3' }}>
                  Optaget{hover.occupiedBy?.username ? ` af ${hover.occupiedBy.username}` : ''}
                </div>
              )}
            </div>
          )}

          {confirm.open && confirm.tile && (
            <div className="modal-backdrop" onClick={cancelChoose}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">Vælg dette felt som base?</div>
                <div className="modal-body">
                  <div style={{ marginBottom: 8 }}>
                    <strong>Felt:</strong> {confirm.tile.n}, <strong>X:</strong> {confirm.tile.x}, <strong>Y:</strong> {confirm.tile.y}
                  </div>
                  <div>Forest: {(confirm.tile.multipliers.forest)}</div>
                  <div>Field: {(confirm.tile.multipliers.field)}</div>
                  <div>Mining: {(confirm.tile.multipliers.mining)}</div>
                  <div>Water: {(confirm.tile.multipliers.water)}</div>
                </div>
                <div className="modal-actions">
                  <button className="btn" onClick={cancelChoose}>Annuller</button>
                  <button className="btn btn-primary" onClick={confirmChoose}>Vælg felt</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}