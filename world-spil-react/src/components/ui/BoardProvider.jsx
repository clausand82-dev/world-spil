import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const LS_KEY = 'ws:boards:v2';

const BoardCtx = createContext(null);

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { openMap: {}, zOrder: [], layout: {} };
  } catch {
    return { openMap: {}, zOrder: [], layout: {} };
  }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN': {
      const openMap = { ...state.openMap, [action.id]: true };
      const zOrder = state.zOrder.filter(x => x !== action.id).concat(action.id);
      return { ...state, openMap, zOrder };
    }
    case 'CLOSE': {
      const openMap = { ...state.openMap, [action.id]: false };
      const zOrder = state.zOrder.filter(x => x !== action.id);
      return { ...state, openMap, zOrder };
    }
    case 'TOGGLE': {
      const isOpen = !!state.openMap[action.id];
      const openMap = { ...state.openMap, [action.id]: !isOpen };
      const zOrder = !isOpen
        ? state.zOrder.filter(x => x !== action.id).concat(action.id)
        : state.zOrder.filter(x => x !== action.id);
      return { ...state, openMap, zOrder };
    }
    case 'BRING_TO_FRONT': {
      const zOrder = state.zOrder.filter(x => x !== action.id).concat(action.id);
      return { ...state, zOrder };
    }
    case 'SET_LAYOUT': {
      const cur = state.layout[action.id] || {};
      const layout = {
        ...state.layout,
        [action.id]: { ...cur, ...action.patch },
      };
      return { ...state, layout };
    }
    case 'RESET_LAYOUT': {
      const layout = { ...state.layout };
      delete layout[action.id];
      return { ...state, layout };
    }
    default:
      return state;
  }
}

export function BoardProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => { saveState(state); }, [state]);

  const value = useMemo(() => ({
    // open/close
    isOpen: (id) => !!state.openMap[id],
    open: (id) => dispatch({ type: 'OPEN', id }),
    close: (id) => dispatch({ type: 'CLOSE', id }),
    toggle: (id) => dispatch({ type: 'TOGGLE', id }),
    // z-index
    bringToFront: (id) => dispatch({ type: 'BRING_TO_FRONT', id }),
    topId: state.zOrder[state.zOrder.length - 1] || null,
    zIndexFor: (id, base = 1000) => {
      const idx = state.zOrder.findIndex(x => x === id);
      return idx < 0 ? base : base + idx;
    },
    // layout
    getLayout: (id) => state.layout[id] || null,
    setLayout: (id, patch) => dispatch({ type: 'SET_LAYOUT', id, patch }),
    resetLayout: (id) => dispatch({ type: 'RESET_LAYOUT', id }),
  }), [state]);

  return <BoardCtx.Provider value={value}>{children}</BoardCtx.Provider>;
}

export function useBoards() {
  return useContext(BoardCtx) || {
    isOpen: () => false,
    open: () => {},
    close: () => {},
    toggle: () => {},
    bringToFront: () => {},
    topId: null,
    zIndexFor: () => 1000,
    getLayout: () => null,
    setLayout: () => {},
    resetLayout: () => {},
  };
}