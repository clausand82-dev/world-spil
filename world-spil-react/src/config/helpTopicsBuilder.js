// Simple helpers to build help topic objects.
// Keep file as .js if you only return plain objects, but use .jsx if you include component JSX in topics.
export function topic(opts) {
  // opts: { id, title, html, render, component, tags, searchText, minStage, maxStage, visible }
  return { ...opts };
}

export function group(opts) {
  // opts: { id, title, tags, children: [topic(...), ...], minStage, maxStage, visible }
  return { ...(opts || {}), children: opts.children || [] };
}

// convenience wrappers so authoring reads nicely
export const html = (str) => ({ html: str });
export const render = (fn) => ({ render: fn });
export const comp = (C) => ({ component: C });

// small util to make a child-less topic quickly
export function leaf(id, title, content, meta = {}) {
  // content can be string (html) or fn (render) or component (React fn)
  const node = { id, title, ...meta };
  if (typeof content === 'string') node.html = content;
  else if (typeof content === 'function') {
    // undifferentiate render vs component: if returns string -> render; if returns node -> component
    node.render = content;
  } else {
    node.html = String(content || '');
  }
  return node;
}