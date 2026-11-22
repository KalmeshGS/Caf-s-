'use strict';
/* =========================================================
   Recipes: what one serving of a menu item uses from stock.
   When a kitchen ticket is marked Served (or its bill is paid),
   stock goes down by recipe × quantity.
   ========================================================= */

/* Typical amounts per serving, in base units (L, kg, pcs). Matched to your stock by name. */
const TYPICAL_RECIPES = [
  { match: /chai|tea(?! ?cake)/i, use: [['milk', 0.1, 'L'], ['sugar', 0.01, 'kg'], ['tea', 0.005, 'kg']] },
  { match: /coffee|latte|cappuccino|espresso|mocha|americano/i, use: [['milk', 0.15, 'L'], ['coffee', 0.018, 'kg'], ['sugar', 0.01, 'kg']] },
  { match: /hot chocolate|cocoa/i, use: [['milk', 0.2, 'L'], ['cocoa', 0.02, 'kg'], ['sugar', 0.015, 'kg']] },
  { match: /lassi|buttermilk|chaas/i, use: [['curd', 0.2, 'kg'], ['milk', 0.05, 'L'], ['sugar', 0.02, 'kg']] },
  { match: /lemon|lime|nimbu/i, use: [['lemon', 1, 'pcs'], ['sugar', 0.02, 'kg']] },
  { match: /iced tea/i, use: [['tea', 0.005, 'kg'], ['sugar', 0.02, 'kg']] },
  { match: /sandwich|toast/i, use: [['bread', 2, 'pcs'], ['cheese', 1, 'pcs'], ['butter', 0.01, 'kg']] },
  { match: /paneer/i, use: [['paneer', 0.1, 'kg'], ['oil', 0.02, 'L']] },
  { match: /fries|chips/i, use: [['potato', 0.15, 'kg'], ['oil', 0.03, 'L']] },
  { match: /maggi|noodle/i, use: [['maggi', 1, 'packs'], ['noodle', 1, 'packs']] },
  { match: /dosa|idli|uttapam/i, use: [['batter', 0.15, 'kg'], ['rice', 0.06, 'kg'], ['oil', 0.01, 'L']] },
  { match: /biryani|pulao|rice|thali/i, use: [['rice', 0.15, 'kg'], ['oil', 0.02, 'L']] },
  { match: /roti|chapati|naan|paratha|kulcha/i, use: [['atta', 0.06, 'kg'], ['flour', 0.06, 'kg']] },
  { match: /dal/i, use: [['dal', 0.06, 'kg']] },
  { match: /samosa|vada|pakora|bhaji/i, use: [['potato', 0.05, 'kg'], ['flour', 0.03, 'kg'], ['oil', 0.02, 'L']] },
  { match: /cake|brownie|pastry|muffin|cookie/i, use: [['flour', 0.04, 'kg'], ['sugar', 0.03, 'kg'], ['butter', 0.02, 'kg'], ['egg', 1, 'pcs']] },
  { match: /croissant|danish|cinnamon|bread|bun/i, use: [['flour', 0.06, 'kg'], ['butter', 0.02, 'kg']] },
];
const toUnit = (qty, base, unit) => {
  if (base === unit) return qty;
  if (base === 'L' && unit === 'ml') return qty * 1000;
  if (base === 'kg' && unit === 'g') return qty * 1000;
  if (base === 'pcs' && unit === 'dozen') return qty / 12;
  if (base === 'packs' && unit === 'pcs') return qty;
  return null; // units don't match (e.g. kg vs pcs) — don't guess
};
const r3 = (n) => Math.round(n * 1000) / 1000;
const r6 = (n) => Math.round(n * 1e6) / 1e6; // stored amounts keep small quantities exact (3.75 g = 0.00375 kg)

/** Suggest a recipe for a menu item name, using only stock items you actually have */
function suggestRecipe(name, stock = S.stock) {
  const lib = typeof libraryRecipe === 'function' ? libraryRecipe(name, stock) : [];
  if (lib.length) return lib;
  const rule = TYPICAL_RECIPES.find((t) => t.match.test(String(name || '')));
  if (!rule) return [];
  const out = [];
  rule.use.forEach(([key, qty, base]) => {
    const s = stock.find((x) => x.name.toLowerCase().includes(key) && !out.some((o) => o.stockId === x.id));
    if (!s) return;
    const q = toUnit(qty, base, s.unit);
    if (q != null) out.push({ stockId: s.id, qty: r3(q) });
  });
  return out;
}
const stockName = (id) => byId(S.stock, id)?.name || 'Removed item';

/* ---------------- units: pick ml or L, g or kg — saved in the stock item's own unit ---------------- */
const UNIT_BASE = { ml: ['L', 0.001], L: ['L', 1], g: ['kg', 0.001], kg: ['kg', 1], pcs: ['pcs', 1], dozen: ['pcs', 12] };
function convertUnit(q, from, to) {
  if (from === to) return q;
  const a = UNIT_BASE[from], b = UNIT_BASE[to];
  if (!a || !b || a[0] !== b[0]) return null;
  return (q * a[1]) / b[1];
}
const unitChoices = (u) => { const g = UNIT_BASE[u]?.[0]; return g ? Object.keys(UNIT_BASE).filter((k) => UNIT_BASE[k][0] === g) : [u]; };
const handyUnit = (u) => ({ L: 'ml', kg: 'g' })[u] || u; // small amounts read better in ml / g
const fmtAmount = (q) => String(+Number(q).toFixed(3));
/** "Milk 100 ml · Sugar 10 g · Tea powder 5 g" */
function recipeText(recipe) {
  return (recipe || []).map((r) => {
    const s = byId(S.stock, r.stockId); if (!s) return 'Removed item';
    const u = handyUnit(s.unit); const q = convertUnit(r.qty, s.unit, u);
    return `${s.name} ${fmtAmount(q ?? r.qty)} ${q == null ? s.unit : u}`;
  }).join(' · ');
}

/* ---------------- menu form: ingredients editor ---------------- */
function recipeRow(r = {}) {
  const s = byId(S.stock, r.stockId);
  const unit = s ? handyUnit(s.unit) : '';
  const shown = s && r.qty != null ? fmtAmount(convertUnit(r.qty, s.unit, unit) ?? r.qty) : '';
  return `<div class="rec-row">
    <select name="r_stock" aria-label="Ingredient"><option value="">Choose ingredient…</option>${S.stock.map((x) => `<option value="${x.id}" ${x.id === r.stockId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <input name="r_qty" type="number" min="0" step="any" inputmode="decimal" value="${esc(shown)}" placeholder="How much" aria-label="Amount per serving">
    <select name="r_unit" aria-label="Unit">${s ? unitChoices(s.unit).map((u) => `<option ${u === unit ? 'selected' : ''}>${u}</option>`).join('') : '<option value="">unit</option>'}</select>
    <button type="button" class="icon-btn sm" data-act="recDel" aria-label="Remove ingredient">${icon('x')}</button></div>`;
}
function recipeEditor(m = {}) {
  const rows = m.recipe && m.recipe.length ? m.recipe : [];
  return `<div class="field recipe"><span>Ingredients for ONE serving <em>(set once — stock goes down by this each time it's served)</em></span>
    ${!S.stock.length ? `<p class="muted sm">No stock items yet. Use "Paste ingredients" or "From a photo" below — new ingredients can be added to stock right there${canAddStock() ? '' : ' (by the owner or a manager)'}.</p>` : ''}
    <div class="rec-head"><span>Ingredient</span><span>Amount</span><span>Unit</span><span></span></div>
    <div id="rec-rows">${rows.map(recipeRow).join('') || recipeRow()}</div>
    <div class="btn-row tight">${btn('Add ingredient', 'recAdd', { cls: 'ghost sm', ic: 'plus' })}</div>
    ${importTools()}
    <p class="fine">Rough amounts are fine, e.g. tea: Milk 100 ml, Tea powder 5 g, Sugar 10 g.</p>
    <template id="rec-tpl">${recipeRow()}</template>
  </div>`;
}
function readRecipe(fd) {
  const ids = fd.getAll('r_stock').map(String), q = fd.getAll('r_qty').map(Number), units = fd.getAll('r_unit').map(String);
  const out = [];
  ids.forEach((id, i) => {
    const s = byId(S.stock, id); if (!s || !(q[i] > 0)) return;
    const inStockUnit = convertUnit(q[i], units[i] || s.unit, s.unit) ?? q[i];
    const e = out.find((x) => x.stockId === id);
    if (e) e.qty = r6(e.qty + inStockUnit); else out.push({ stockId: id, qty: r6(inStockUnit) });
  });
  return out;
}

/* ---------------- using up stock ---------------- */
/** What a kitchen ticket uses from stock: { stockId: qty } */
function stockUse(k) {
  const use = {};
  (k.items || []).forEach((i) => {
    const m = byId(S.menu, i.menuId) || S.menu.find((x) => x.name === i.name);
    (m?.recipe || []).forEach((r) => { use[r.stockId] = r6((use[r.stockId] || 0) + r.qty * i.qty); });
  });
  return use;
}
/** Offline: change S directly. (Online mode replaces this with safe server-side decrements.) */
let applyStockUse = (use) => {
  Object.entries(use).forEach(([id, q]) => { const s = byId(S.stock, id); if (s) s.qty = r6(Number(s.qty) - q); });
};
/** Call when a ticket becomes Served — once per ticket */
function useStockFor(k) {
  if (!k || k.stockDone) return;
  k.stockDone = true;
  const use = stockUse(k);
  if (Object.keys(use).length) applyStockUse(use);
}
/** Which dishes use a stock item (shown on the Stock screen) */
const usedBy = (stockId) => S.menu.filter((m) => (m.recipe || []).some((r) => r.stockId === stockId)).map((m) => m.name);

/* ---------------- actions & forms ---------------- */
Object.assign(Actions, {
  recAdd() { const t = $('#rec-tpl'), box = $('#rec-rows'); if (t && box) box.insertAdjacentHTML('beforeend', t.innerHTML); },
  recDel(el) { const row = el.closest('.rec-row'); const box = $('#rec-rows'); if (row && box.children.length > 1) row.remove(); else if (row) { row.querySelector('select').value = ''; row.querySelector('input').value = ''; } },
  fillRecipes() {
    let n = 0;
    S.menu.forEach((m) => { if (!(m.recipe && m.recipe.length)) { const r = suggestRecipe(m.name); if (r.length) { m.recipe = r; n++; } } });
    if (!n) return toast('Nothing filled — dishes already have ingredients, or their ingredients are not in your stock yet. Open a dish and use "Recipe library" to add them.');
    save(); toast(`Ingredients from the recipe library added to ${pl(n, 'menu item')} — tap a dish to check the amounts`);
  },
});
Changes.recStock = () => {};
// Choosing an ingredient offers the right units (ml / L, g / kg …)
document.addEventListener('change', (e) => {
  if (e.target.name !== 'r_stock') return;
  const row = e.target.closest('.rec-row'); const s = byId(S.stock, e.target.value);
  const sel = row?.querySelector('select[name=r_unit]'); if (!sel) return;
  sel.innerHTML = s ? unitChoices(s.unit).map((u) => `<option ${u === handyUnit(s.unit) ? 'selected' : ''}>${u}</option>`).join('') : '<option value="">unit</option>';
  row.querySelector('input[name=r_qty]').focus();
});

Object.assign(Forms, {
  menuItem(fd) {
    const d = { name: String(fd.get('name') || '').trim(), price: num(fd.get('price')), cat: String(fd.get('cat') || '').trim() || 'General', recipe: readRecipe(fd) };
    if (!d.name) return formError('Please enter the item name.');
    const m = byId(S.menu, fd.get('id'));
    if (m) Object.assign(m, d); else S.menu.push({ id: uid('m'), available: true, ...d });
    closeSheet(); save();
    if (!d.recipe.length && S.stock.length) toast(`Saved. Tip: add ingredients so stock reduces automatically when ${d.name} is served.`);
  },
});
