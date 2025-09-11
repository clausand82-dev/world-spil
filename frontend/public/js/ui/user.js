/* =========================================================
   ui/user.js
   - Brugerside (viser state.player)
========================================================= */
window.renderUserPage = () => {
  const m = document.querySelector("#main"); if (!m) return;
  const u = window.state?.user;
  if (!u) {
    m.innerHTML = `<section class="panel"><div class="section-head">Bruger</div><div class="section-body"><div class="sub">Indlæser…</div></div></section>`;
    return;
  }
  m.innerHTML = `
    <section class="panel">
      <div class="section-head">Bruger</div>
      <div class="section-body">
        <div class="list">
          <div class="list-item"><div class="item-left"><div class="title">Brugernavn: <span class="pill">${u.username}</span></div></div>
          <div class="list-item"><div class="item-left"><div class="title">Email: <span class="pill">${u.email||""}</span></div></div>
          <div class="list-item"><div class="item-left"><div class="title">Verden / Map / Felt: <span class="pill">${u.world_id||"-"} / ${u.map_id||"-"} / ${u.field_id||"-"}</span></div></div>
          <div class="list-item"><div class="item-left"><div class="title">Koordinater: <span class="pill">${u.x??"-"}, ${u.y??"-"}</span></div></div>
          <div class="list-item"><div class="item-left"><div class="title">Oprettet: <span class="pill">${u.created_at||""}</span></div></div>
          <div class="list-item"><div class="item-left"><div class="title">Sidst logget ind: <span class="pill">${u.last_login||""}</span></div></div>
        </div>
      </div>
    </section>
  `;
};
