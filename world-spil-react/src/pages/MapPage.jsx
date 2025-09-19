import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import './MapPage.css';

const COLS = 50;
const ROWS = 50;

export default function MapPage() {
  const { data } = useGameData();
  const wrapperRef = useRef(null);
  const [hover, setHover] = useState({ visible: false, n: null, x: null, y: null, left: 0, top: 0 });

  // Markér at siden er set mindst én gang (bruges til "kun synlig første gang")
  useEffect(() => {
    try { localStorage.setItem('ws.map.seen', '1'); } catch {}
  }, []);

  const cells = useMemo(() => {
    const arr = [];
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const idx = (r - 1) * COLS + c; // 1..2500
        arr.push({ n: idx, x: c, y: r });
      }
    }
    return arr;
  }, []);

  const moveHover = (e) => {
    const wr = wrapperRef.current;
    if (!wr) return;
    const rect = wr.getBoundingClientRect();
    const left = e.clientX - rect.left + 12; // lille offset fra cursor
    const top = e.clientY - rect.top + 12;
    setHover((h) => ({ ...h, left, top }));
  };

  return (
    <section className="panel section">
      <div className="section-head">🗺️ Map</div>
      <div className="section-body">
        <div className="map-wrapper" ref={wrapperRef}>
          <img
            className="map-image"
            src="/assets/art/world.map001.land001.detail.png"
            alt="World map"
          />
          <div
            className="grid-overlay"
            style={{
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            }}
          >
            {cells.map(cell => (
              <div
                key={cell.n}
                className="grid-cell"
                data-x={cell.x}
                data-y={cell.y}
                data-n={cell.n}
                title={`#${cell.n} (x=${cell.x}, y=${cell.y})`} // stadig som fallback/native tooltip
                onMouseEnter={() => setHover({ visible: true, n: cell.n, x: cell.x, y: cell.y, left: hover.left, top: hover.top })}
                onMouseLeave={() => setHover(h => ({ ...h, visible: false }))}
                onMouseMove={moveHover}
              />
            ))}
          </div>

          {/* Hover HUD der følger musen */}
          {hover.visible && (
            <div
              className="hover-info"
              style={{ left: hover.left, top: hover.top }}
            >
              <div>Felt #{hover.n}</div>
              <div>x: {hover.x}, y: {hover.y}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}