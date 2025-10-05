import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import DOMPurify from 'dompurify';
import { useGameData } from '../context/GameDataContext.jsx';
import { useT } from '../services/i18n.js';
import './help.css';

// LocalStorage keys
const READ_KEY = 'ws.help.read.v1';
const EXPANDED_KEY = 'ws.help.expanded.v1';
const COLLAPSE_KEY = 'ws.help.collapse.v1';

function getHash() {
  return window.location.hash || '';
}
function isHelpHash(h) {
  return (h || '').startsWith('#/help');
}
function getTopicFromHash() {
  const h = getHash();
  if (!isHelpHash(h)) return '';
  const qIndex = h.indexOf('?');
  if (qIndex === -1) return '';
  try {
    const params = new URLSearchParams(h.slice(qIndex + 1));
    const t = params.get('topic');
    return t ? decodeURIComponent(t) : '';
  } catch {
    return '';
  }
}
function setHelpHashTopic(id) {
  const newHash = `#/help?topic=${encodeURIComponent(id)}`;
  if (window.location.hash !== newHash) window.location.hash = newHash;
}

function loadReadMap() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveReadMap(map) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(map)); } catch {}
}

function stripHtmlToText(html) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}

/* flattenTopics: same behaviour as before - returns an array preserving order.
   Each item has depth and isGroup flag. */
function flattenTopics(topics, ctx, stageFilter = true) {
  const out = [];

  function isNodeVisible(node) {
    if (!stageFilter) return true;
    const minOk = node.minStage == null || ctx.stage >= Number(node.minStage);
    const maxOk = node.maxStage == null || ctx.stage <= Number(node.maxStage);
    const funcOk = typeof node.visible === 'function' ? !!node.visible(ctx) : true;
    return minOk && maxOk && funcOk;
  }

  function collect(node, depth = 0, parentId = null) {
    if (!node) return [];

    const depthNode = { ...node, depth, parentId };

    if (Array.isArray(node.children) && node.children.length > 0) {
      const childItems = [];
      for (const ch of node.children) {
        const collected = collect(ch, depth + 1, node.id || node.key || null);
        if (collected && collected.length) childItems.push(...collected);
      }

      if (childItems.length > 0 || isNodeVisible(node)) {
        const header = { ...depthNode, isGroup: true };
        return [header, ...childItems];
      }

      return [];
    }

    if (isNodeVisible(node)) {
      return [{ ...depthNode, isGroup: false }];
    }
    return [];
  }

  for (const t of topics || []) {
    const pieces = collect(t, 0, null);
    if (pieces && pieces.length) out.push(...pieces);
  }

  return out;
}

export default function HelpOverlay({
  isOpen,
  onClose,
  topics = [],
  rememberHash = true,
  trackRead = true,
  enableResetButton = true,
}) {
  const { data } = useGameData();
  const t = useT();
  const defs = data?.defs || {};
  const state = data?.state || {};
  const stage = Number(state?.user?.currentstage || 0);
  const ctx = useMemo(() => ({ defs, state, t, stage }), [defs, state, t, stage]);

  // collapse toggle (long list vs collapsible groups) - persisted
  const [collapseMenu, setCollapseMenu] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? 'false');
    } catch {
      return false;
    }
  });
  const toggleCollapse = useCallback(() => {
    setCollapseMenu((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // expanded groups (persist) - only used when collapseMenu is true (collapsible mode)
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY) || '{}';
      const obj = JSON.parse(raw);
      return new Set(Object.keys(obj).filter(k => obj[k]));
    } catch {
      return new Set();
    }
  });

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      try {
        const obj = {};
        next.forEach(k => { obj[k] = true; });
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(obj));
      } catch {}
      return next;
    });
  }, []);

  // read map
  const [readMap, setReadMap] = useState(() => loadReadMap());

  // selection, search
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(() => (rememberHash ? getTopicFromHash() : ''));

  // sync selection from hash
  useEffect(() => {
    if (!isOpen || !rememberHash) return;
    const onHash = () => {
      const id = getTopicFromHash();
      if (id) setActiveId(id);
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, [isOpen, rememberHash]);

  // Lock scroll on open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // ESC close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Compute flattened visible topics (with groups)
  const flat = useMemo(() => flattenTopics(topics, ctx, true), [topics, ctx]);

  // Derived lists for sidebar (flat search)
  const sidebarItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((it) => {
      const title = (it.title || '').toLowerCase();
      const tags = (it.tags || []).join(' ').toLowerCase();
      const text = typeof it.searchText === 'string' ? it.searchText.toLowerCase() : '';
      return title.includes(q) || tags.includes(q) || text.includes(q);
    });
  }, [flat, search]);

  // Find current active topic node
  const activeTopic = useMemo(() => {
    if (!activeId) return null;
    return flat.find((x) => !x.isGroup && (x.id || x.key) === activeId) || null;
  }, [flat, activeId]);

  // Mark as read when active changes
  useEffect(() => {
    if (!isOpen || !activeTopic || !trackRead) return;
    const id = activeTopic.id || activeTopic.key;
    if (!id) return;
    setReadMap((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: Date.now() };
      saveReadMap(next);
      return next;
    });
  }, [isOpen, activeTopic, trackRead]);

  const panelRef = useRef(null);

  const onBackdropClick = useCallback((e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) {
      onClose?.();
    }
  }, [onClose]);

  // Open a topic programmatically (for internal links or API)
  const openTopic = useCallback((id) => {
    if (!id) return;
    setActiveId(id);
    if (rememberHash) {
      try { setHelpHashTopic(id); } catch {}
    }
  }, [rememberHash]);

  // Intercept internal links in content
  const contentRef = useRef(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onDelegatedClick = (e) => {
      const a = e.target.closest('a');
      if (!a || !el.contains(a)) return;
      const topicAttr = a.getAttribute('data-topic-link');
      if (topicAttr) {
        e.preventDefault();
        openTopic(topicAttr);
        return;
      }
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#/help')) {
        e.preventDefault();
        const idx = href.indexOf('?');
        if (idx !== -1) {
          const qs = href.slice(idx + 1);
          const params = new URLSearchParams(qs);
          const id = params.get('topic');
          if (id) openTopic(id);
        }
      }
    };

    el.addEventListener('click', onDelegatedClick);

    const anchors = Array.from(el.querySelectorAll('a'));
    const attached = [];
    anchors.forEach((a) => {
      a.style.pointerEvents = 'auto';
      if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      if (!a.hasAttribute('role')) a.setAttribute('role', 'link');
      a.style.cursor = 'pointer';
      const topic = a.getAttribute('data-topic-link');
      if (topic) {
        const h = (ev) => {
          ev.preventDefault();
          openTopic(topic);
        };
        a.addEventListener('click', h);
        attached.push({ a, h });
      }
    });

    return () => {
      el.removeEventListener('click', onDelegatedClick);
      attached.forEach(({ a, h }) => a.removeEventListener('click', h));
    };
  }, [openTopic, activeId]);

  // Render helpers for different topic kinds
  const renderStringHtml = (html) => {
    const sanitized = DOMPurify.sanitize(html || '', {
      ADD_ATTR: ['target', 'rel', 'style', 'data-topic-link'],
      ADD_TAGS: ['iframe'],
    });
    return <article className="help-article" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  };

  const renderTopic = (topic) => {
    if (!topic) return <div className="muted">Vælg et emne i venstre side.</div>;
    if (topic.component && typeof topic.component === 'function') {
      const Comp = topic.component;
      return <Comp defs={defs} state={state} t={t} stage={stage} openTopic={openTopic} />;
    }
    if (typeof topic.render === 'function') {
      const out = topic.render({ defs, state, t, stage, openTopic });
      if (typeof out === 'string') return renderStringHtml(out);
      return <article className="help-article">{out}</article>;
    }
    if (typeof topic.html === 'string') {
      return renderStringHtml(topic.html);
    }
    return <div className="muted">Ingen indhold.</div>;
  };

  // Unread indicators and group badge counts
  const isUnread = (id) => trackRead && id && !readMap[id];
  const groupUnreadCount = (groupId) => {
    if (!groupId) return 0;
    const children = flat.filter((x) => !x.isGroup && x.parentId === groupId);
    let c = 0;
    for (const ch of children) {
      const id = ch.id || ch.key;
      if (isUnread(id)) c++;
    }
    return c;
  };

  // Reset unread
  const resetUnread = () => {
    setReadMap({});
    saveReadMap({});
  };

  // Sidebar recursive renderer (used for collapsible mode)
  const renderSidebarTopics = (list, depth = 0) => {
    return (list || []).map((node) => {
      if (node.children && node.children.length) {
        const gid = node.id || node.key || node.title;
        const expanded = expandedGroups.has(gid);
        const unread = groupUnreadCount(gid);
        return (
          <div key={gid} className="help-topic-group">
            <div className="help-topic-group-title" style={{ paddingLeft: depth * 12 }}>
              <button
                className="icon-btn"
                onClick={() => toggleGroup(gid)}
                aria-expanded={expanded}
                title={expanded ? 'Skjul' : 'Vis'}
                type="button"
              >
                {expanded ? '▾' : '▸'}
              </button>
              <span style={{ marginLeft: 8 }}>{node.title}</span>
              {unread > 0 && <span className="unread-badge">(! {unread})</span>}
            </div>
            {expanded && <div>{renderSidebarTopics(node.children, depth + 1)}</div>}
          </div>
        );
      }

      // leaf node
      const id = node.id || node.key;
      const isActive = id === activeId;
      const unreadDot = isUnread(id) ? <span className="dot-unread">•</span> : null;
      return (
        <button
          key={id}
          className={`help-topic-item depth-${depth} ${isActive ? 'active' : ''}`}
          onClick={() => {
            setActiveId(id);
            if (rememberHash) setHelpHashTopic(id);
          }}
          title={node.title}
          style={{ paddingLeft: 12 + depth * 12 }}
        >
          {node.title}
          {unreadDot}
        </button>
      );
    });
  };

  // Flat list renderer (used when collapseMenu is false OR when searching)
  // This preserves group headers and shows their children under them, but without chevrons.
  const renderFlatTopics = (list, depth = 0) => {
    return (list || []).map((node) => {
      if (node.children && node.children.length) {
        // render group header (no chevron) and then children expanded in order
        const gid = node.id || node.key || node.title;
        const unread = groupUnreadCount(gid);
        return (
          <div key={gid} className="help-topic-group">
            <div className="help-topic-group-title" style={{ paddingLeft: depth * 12 }}>
              <span style={{ marginLeft: 8 }}>{node.title}</span>
              {unread > 0 && <span className="unread-badge">(! {unread})</span>}
            </div>
            <div>
              {renderFlatTopics(node.children, depth + 1)}
            </div>
          </div>
        );
      }

      // leaf
      const id = node.id || node.key;
      const isActive = id === activeId;
      const unreadDot = isUnread(id) ? <span className="dot-unread">•</span> : null;
      return (
        <button
          key={id}
          className={`help-topic-item depth-${depth} ${isActive ? 'active' : ''}`}
          onClick={() => {
            setActiveId(id);
            if (rememberHash) setHelpHashTopic(id);
          }}
          title={node.title}
          style={{ paddingLeft: 12 + depth * 12 }}
        >
          {node.title}
          {unreadDot}
        </button>
      );
    });
  };

  // Decide whether to show flat list or collapsible groups
  const flatLeaves = sidebarItems.filter(it => !it.isGroup);
  const showFlat = !!search.trim() || !collapseMenu;

  if (!isOpen) return null;

  const node = (
    <div className="help-overlay" onMouseDown={onBackdropClick} role="dialog" aria-modal="true" aria-label="Hjælp">
      <div className="help-overlay-panel panel" ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-overlay-head">
          <div className="title">Hjælp</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {enableResetButton && (
              <button className="icon-btn" onClick={resetUnread} title="Nulstil ulæste">↺</button>
            )}

            <button
              className="icon-btn"
              onClick={toggleCollapse}
              aria-pressed={collapseMenu}
              title={collapseMenu ? 'Vis grupper (kollaps)' : 'Vis lang liste'}
              type="button"
            >
              {collapseMenu ? '▾' : '≡'}
            </button>

            <button className="icon-btn" onClick={onClose} aria-label="Luk" title="Luk">✕</button>
          </div>
        </div>

        <div className="help-overlay-body">
          <aside className="help-overlay-sidebar">
            <input
              className="help-overlay-search"
              type="search"
              placeholder="Søg…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="help-topic-list" role="listbox" aria-label="Emneliste">
              { showFlat
                ? (
                  // when showing flat list (search active OR user chose long list),
                  // render groups and children expanded in a single column (preserves nesting)
                  renderFlatTopics(topics)
                )
                : (
                  // collapsible mode (user chose collapsible) - top-level groups can be collapsed
                  renderSidebarTopics(topics)
                )
              }
              {!sidebarItems.length && <div className="muted small" style={{ padding: '8px 10px' }}>Ingen match.</div>}
            </div>
          </aside>

          <section className="help-overlay-content" ref={contentRef}>
            {renderTopic(activeTopic)}
          </section>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(node, document.body);
}