/* ===========================================
   ui/recipes.js
   - Stub (så router ikke fejler)
=========================================== */

window.renderRecipesPage = () => {
  const main = document.querySelector("#main");
  if (!main) return;

  main.innerHTML = `
    <section class="panel">
      <div class="section-head">Opskrifter</div>
      <div class="section-body">
        <div class="sub">Kommer senere…</div>
      </div>
    </section>
  `;
};
