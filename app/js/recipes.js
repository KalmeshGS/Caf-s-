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

/** Suggest a recipe for a menu item name, using only stock items you actually have */
function suggestRecipe(name, stock = S.stock) {
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

/* ---------------- menu form: ingredients editor ---------------- */
function recipeEditor(m = {}) {
  const rows = m.recipe && m.recipe.length ? m.recipe : (m.id ? [] : []);
  const opts = (sel) => `<option value="">Choose stock item…</option>${S.stock.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)} (${esc(s.unit)})</option>`).join('')}`;
  const row = (r = {}) => `<div class="rec-row"><select name="r_stock" aria-label="Stock item">${opts(r.stockId)}</select>
      <input name="r_qty" type="number" min="0" step="any" value="${esc(r.qty ?? '')}" placeholder="Qty" aria-label="Quantity per serving">
      <span class="rec-unit">${esc(byId(S.stock, r.stockId)?.unit || '')}</span>
      <button type="button" class="icon-btn sm" data-act="recDel" aria-label="Remove ingredient">${icon('x')}</button></div>`;
  return `<div class="field recipe"><span>Ingredients per serving <em>(stock reduces by this when served)</em></span>
    ${S.stock.length ? `<div id="rec-rows">${rows.map(row).join('') || row()}</div>
      <div class="btn-row tight">${btn('Add ingredient', 'recAdd', { cls: 'ghost sm', ic: 'plus' })}${btn('Fill typical amounts', 'recSuggest', { cls: 'ghost sm' })}</div>
      <template id="rec-tpl">${row()}</template>`
      : '<p class="muted sm">Add stock items first (Stock → Add item), then choose what each dish uses.</p>'}
  </div>`;
}
function readRecipe(fd) {
  const ids = fd.getAll('r_stock').map(String), q = fd.getAll('r_qty').map(Number);
  const out = [];
  ids.forEach((id, i) => { if (id && q[i] > 0 && byId(S.stock, id)) { const e = out.find((x) => x.stockId === id); if (e) e.qty = r3(e.qty + q[i]); else out.push({ stockId: id, qty: r3(q[i]) }); } });
  return out;
}

/* ---------------- using up stock ---------------- */
/** What a kitchen ticket uses from stock: { stockId: qty } */
function stockUse(k) {
  const use = {};
  (k.items || []).forEach((i) => {
    const m = byId(S.menu, i.menuId) || S.menu.find((x) => x.name === i.name);
    (m?.recipe || []).forEach((r) => { use[r.stockId] = r3((use[r.stockId] || 0) + r.qty * i.qty); });
  });
  return use;
}
/** Offline: change S directly. (Online mode replaces this with safe server-side decrements.) */
let applyStockUse = (use) => {
  Object.entries(use).forEach(([id, q]) => { const s = byId(S.stock, id); if (s) s.qty = r3(Number(s.qty) - q); });
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
  recSuggest(el) {
    const form = el.closest('form'); const name = form.name.value;
    const sug = suggestRecipe(name);
    if (!sug.length) return toast(name ? `No typical recipe known for "${name}" with your stock items — add ingredients by hand.` : 'Type the item name first.');
    const box = $('#rec-rows'), tpl = $('#rec-tpl').innerHTML;
    box.innerHTML = '';
    sug.forEach((r) => {
      box.insertAdjacentHTML('beforeend', tpl);
      const row = box.lastElementChild;
      row.querySelector('select').value = r.stockId; row.querySelector('input').value = r.qty;
      row.querySelector('.rec-unit').textContent = byId(S.stock, r.stockId).unit;
    });
    toast('Typical amounts filled in — adjust if your recipe differs');
  },
  fillRecipes() {
    let n = 0;
    S.menu.forEach((m) => { if (!(m.recipe && m.recipe.length)) { const r = suggestRecipe(m.name); if (r.length) { m.recipe = r; n++; } } });
    if (!n) return toast('No new recipes to fill — items already have ingredients, or no matching stock items.');
    save(); toast(`Typical ingredients added to ${pl(n, 'menu item')} — check them in Settings → Menu`);
  },
});
Changes.recStock = () => {};
document.addEventListener('change', (e) => {
  if (e.target.name !== 'r_stock') return;
  const u = e.target.closest('.rec-row')?.querySelector('.rec-unit');
  if (u) u.textContent = byId(S.stock, e.target.value)?.unit || '';
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
