/* =========================================================
   ui/logs.js
   - Min log (player) / admin-filtrering
   - Kræver: window.API_BASE, apiGet, qs, qsa
   - Router kalder: renderLogsPage()
========================================================= */
(() => {
  // Lokal pagination-state
  let limit = 50;
  let offset = 0;

  // Build UI
  function renderShell() {
    const isAdmin = (window?.data?.state?.user?.role === 'admin');
    const adminFilter = isAdmin
      ? `<input id="log-user-id" type="number" class="input" placeholder="Bruger-ID (admin)" />`
      : ``;

    return `
      <section class="panel section">
        <div class="section-head">🧾 Min log</div>
        <div class="section-body">
          <div class="actions-bar" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">
            <select id="log-type" class="input">
              <option value="">Alle typer</option>
              <option value="BUILD_PURCHASE">Køb (bygning)</option>
              <option value="ADDON_PURCHASE">Køb (addon)</option>
              <option value="RESEARCH_COMPLETE">Research færdig</option>
            </select>
            <input id="log-from" type="datetime-local" class="input" />
            <input id="log-to" type="datetime-local" class="input" />
            ${adminFilter}
            <button class="btn primary" id="log-apply">Anvend</button>
          </div>

          <div id="log-list">
            <div class="item"><div class="mid"><div class="title">Henter log…</div></div></div>
          </div>

          <div style="margin-top:.75rem">
            <button class="btn" id="log-more">Hent flere</button>
          </div>
        </div>
      </section>
    `;
  }

  function readParams() {
    return {
      limit,
      offset,
      // Serveren ignorerer user_id for players og accepterer for admin:
      user_id     : qs('#log-user-id')?.value || '',
      event_type  : qs('#log-type')?.value || '',
      subject_type: '', // kan udvides senere
      subject_id  : '',
      date_from   : qs('#log-from')?.value || '',
      date_to     : qs('#log-to')?.value || ''
    };
  }

  function rowHtml(ev){
    const dt = new Date(ev.created_at_utc + 'Z'); // backend er UTC
    const time = dt.toLocaleString();
    const subj = ev.subject_name || ev.subject_id;
    const costs = (ev.costs_json || [])
      .map(c => `${c.res_id}: ${c.amount}`)
      .join(' · ') || '(ingen costs)';

    return `
      <div class="item log-row">
        <div class="icon">🧾</div>
        <div class="mid">
          <div class="title">${subj}</div>
          <div class="sub">${ev.event_type} • ${ev.subject_type} • ${time}</div>
          <div class="price-pill">${costs}</div>
        </div>
        <div class="right">
          ${ev.has_cost_rows ? `<span class="badge">detaljer</span>` : ``}
        </div>
      </div>
    `;
  }

  async function fetchAndRender() {
    const cont = qs('#log-list');
    const params = readParams();

    try {
      const url = (window.API_BASE || '') + '/log/list.php';
      const data = await apiGet(url, params);

      if (!data.items?.length && offset === 0) {
        cont.innerHTML = `<div class="item"><div class="mid"><div class="title">Ingen log fundet</div></div></div>`;
        const mb = qs('#log-more'); if (mb) mb.disabled = true;
        return;
      }

      const html = data.items.map(rowHtml).join('');

      if (offset === 0) cont.innerHTML = html;
      else cont.insertAdjacentHTML('beforeend', html);

      const moreBtn = qs('#log-more');
      if (moreBtn) {
        moreBtn.disabled = !data.page?.has_more;
        moreBtn.onclick = () => {
          offset += limit;
          fetchAndRender();
        };
      }
    } catch (e) {
      cont.innerHTML = `<div class="item"><div class="mid"><div class="title" style="color:var(--bad)">Fejl: ${e.message}</div></div></div>`;
      const mb = qs('#log-more'); if (mb) mb.disabled = true;
      console.error('Log fetch error:', e);
    }
  }

  // Offentlig funktion som router kalder
  window.renderLogsPage = () => {
    const mount = qs('#main');
    if (!mount) return;

    mount.innerHTML = renderShell();

    // Bind “Anvend”
    qs('#log-apply')?.addEventListener('click', () => {
      offset = 0;
      qs('#log-list').innerHTML = `<div class="item"><div class="mid"><div class="title">Henter log…</div></div></div>`;
      fetchAndRender();
    });

    // Første load
    offset = 0;
    fetchAndRender();
  };
})();
