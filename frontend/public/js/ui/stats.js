/* =========================================================
   ui/stats.js
   - Aggregeret forbrug pr. ressource (fra log_event_cost)
   - Kræver: window.API_BASE, apiGet, qs
   - Router kalder: renderStatsPage()
========================================================= */
(() => {
  function renderShell(){
    const isAdmin = (window?.data?.state?.user?.role === 'admin');
    const adminFilter = isAdmin
      ? `<input id="stats-user-id" type="number" class="input" placeholder="Bruger-ID (admin)" />`
      : ``;

    return `
      <section class="panel section">
        <div class="section-head">📊 Statistik</div>
        <div class="section-body">
          <div class="actions-bar" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">
            <input id="stats-res" type="text" class="input" value="res.wood" placeholder="res_id (fx res.wood)">
            <select id="stats-group" class="input">
              <option value="month" selected>Måned</option>
              <option value="week">Uge</option>
              <option value="day">Dag</option>
              <option value="total">Total</option>
            </select>
            <input id="stats-from" type="date" class="input" />
            <input id="stats-to" type="date" class="input" />
            ${adminFilter}
            <button class="btn primary" id="stats-apply">Anvend</button>
          </div>

          <div id="stats-content">
            <div class="item"><div class="mid"><div class="title">Henter statistik…</div></div></div>
          </div>
        </div>
      </section>
    `;
  }

  function tableHtml(buckets){
    const rows = (buckets || []).map(b => `
      <tr>
        <td>${b.period}</td>
        <td>${b.amount_final}</td>
        <td>${b.amount_base}</td>
      </tr>
    `).join('');
    return `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Periode</th><th>Final</th><th>Base</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3">Ingen data</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  async function fetchAndRender(){
    const cont = qs('#stats-content');
    cont.innerHTML = `<div class="item"><div class="mid"><div class="title">Henter statistik…</div></div></div>`;

    try {
      const url = (window.API_BASE || '') + '/log/stats.php';
      // NB: res_id er påkrævet — sæt en default hvis input er tomt
      const resId = qs('#stats-res')?.value?.trim() || 'res.wood';

      const params = {
        res_id   : resId,
        group_by : qs('#stats-group')?.value || 'month',
        date_from: qs('#stats-from')?.value || '',
        date_to  : qs('#stats-to')?.value || '',
        user_id  : qs('#stats-user-id')?.value || '' // serveren ignorerer for player
      };

      const data = await apiGet(url, params);

      const totFinal = data.totals?.amount_final ?? 0;
      const totBase  = data.totals?.amount_base  ?? 0;
      const saved    = (totBase - totFinal);

      cont.innerHTML = `
        <div class="section">
          <div class="section-head">Overblik</div>
          <div class="section-body">
            <div class="actions-bar" style="display:flex;gap:.5rem;flex-wrap:wrap">
              <span class="badge">Total (final): <b>${totFinal}</b></span>
              <span class="badge">Total (base): <b>${totBase}</b></span>
              <span class="badge">Sparet: <b>${saved}</b></span>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="section-head">Periode</div>
          <div class="section-body">
            ${tableHtml(data.buckets)}
          </div>
        </div>
      `;
    } catch (e) {
      cont.innerHTML = `<div class="item"><div class="mid"><div class="title" style="color:var(--bad)">Fejl: ${e.message}</div></div></div>`;
      console.error('Stats fetch error:', e);
    }
  }

  // Offentlig funktion som router kalder
  window.renderStatsPage = () => {
    const mount = qs('#main');
    if (!mount) return;

    mount.innerHTML = renderShell();
    // Bind Anvend
    qs('#stats-apply')?.addEventListener('click', () => fetchAndRender());
    // Første load
    fetchAndRender();
  };
})();
