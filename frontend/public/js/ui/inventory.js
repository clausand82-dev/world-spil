/* =========================================================
   ui/inventory.js
   - Inventory grupperet i Liquid / Solid / Animals (placeholder)
   - Viser unitspace + mængde + enhed
========================================================= */

window.renderInventoryPage = () => {
  const main = $("#main");
  if (!main) return;

  const defs = window?.data?.defs?.res;
  const inv  = window?.data?.state?.inv;
  const lang  = window.data.lang;

  if (!defs || !inv) {
    main.innerHTML = `
      <section class="panel section">
        <div class="section-head">Inventory</div>
        <div class="section-body"><div class="sub">Indlæser…</div></div>
      </section>`;
    return;
  }

  const invSolid  = inv.solid  || {};
  const invLiquid = inv.liquid || {};

  // Filtrér kun IDs som også findes i defs.res
  const solidIds  = Object.keys(invSolid).filter(id  => defs[id]);
  const liquidIds = Object.keys(invLiquid).filter(id => defs[id]);

  /*Brug hvis 0 værdier skal sorteres fra
  const solidIds  = Object.keys(invSolid).filter(id  => defs[id] && Number(invSolid[id])  > 0);
const liquidIds = Object.keys(invLiquid).filter(id => defs[id] && Number(invLiquid[id]) > 0);
*/

  const block = (title, ids, bag) => `
    <section class="panel section">
      <div class="section-head">${title}</div>
      <div class="section-body">
        ${
          ids.map(id => {
            const d   = defs[id];
            const amt = Number(bag[id]) || 0;            // håndter "0"/null/undefined
            const unitLabel = d.unit ? ` ${d.unit}` : "";
            const unitSpace = Number(d.unitSpace) || 0;
            const space = unitSpace * amt;
            return `<div class="item">
              <div class="icon">${d.emoji ?? ""}</div>
              <div>
                <div class="title">${d.name ?? id}</div>
                <div class="sub">Fylder pr. unit: ${unitSpace}</div>
              </div>
              <div class="right">
                <strong>${fmt(amt)}${unitLabel} / Fylder: ${fmt(space)}</strong>
              </div>
            </div>`;
          }).join("") || `<div class="sub">Ingen</div>`
        }
      </div>
    </section>
  `;

  main.innerHTML =
    block("💧 " + lang["ui.liquid.h1"], liquidIds, invLiquid) +
    block("🧱 " + lang["ui.solid.h1"],  solidIds,  invSolid) +
    block("🐄 Animals", [], {}); // placeholder indtil du definerer dyr

};


