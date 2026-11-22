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

/* ---------------- menu form: ingredients editor ----------------
   Each row: type an ingredient name OR pick it from the list. If it is not in
   stock yet, the owner / a manager can add it to stock right there. */
const ALL_UNITS = ['ml', 'L', 'g', 'kg', 'pcs'];
const NEW_BASE = { ml: 'L', L: 'L', g: 'kg', kg: 'kg', pcs: 'pcs' };
/** A sensible unit for a new stock item, from its name */
function guessUnit(name) {
  const n = String(name).toLowerCase();
  if (/milk|oil|cream|syrup|sauce|juice|water|vinegar|ghee|honey|soda/.test(n)) return 'ml';
  if (/lemon|lime|egg|bun|pav|bread|slice|bottle|can\b|packet|pack|sachet|banana|orange|apple|tea bag|patty|base|roll|sheet|cup|glass|straw/.test(n)) return 'pcs';
  return 'g';
}
function unitOptions(s, chosen) {
  const list = s ? unitChoices(s.unit) : ALL_UNITS;
  const pick = chosen || (s ? handyUnit(s.unit) : '');
  return list.map((u) => `<option ${u === pick ? 'selected' : ''}>${u}</option>`).join('');
}
function recipeRow(r = {}) {
  const s = byId(S.stock, r.stockId);
  const unit = s ? handyUnit(s.unit) : (r.unit || '');
  const shown = s && r.qty != null ? fmtAmount(convertUnit(r.qty, s.unit, unit) ?? r.qty) : (r.qty ?? '');
  const name = s ? s.name : (r.name || '');
  return `<div class="rec-row">
    <div class="combo">
      <input class="rec-name" name="r_name" value="${esc(name)}" placeholder="Type or choose…" autocomplete="off" aria-label="Ingredient" role="combobox" aria-expanded="false">
      <input type="hidden" name="r_stock" value="${s ? s.id : ''}">
      <span class="combo-caret" aria-hidden="true">${icon('down')}</span>
      <div class="combo-list" role="listbox" hidden></div>
    </div>
    <input name="r_qty" type="number" min="0" step="any" inputmode="decimal" value="${esc(String(shown))}" placeholder="How much" aria-label="Amount per serving">
    <select name="r_unit" aria-label="Unit">${unitOptions(s, unit || (name ? guessUnit(name) : ''))}</select>
    <button type="button" class="icon-btn sm" data-act="recDel" aria-label="Remove ingredient">${icon('x')}</button>
    <small class="rec-hint"></small></div>`;
}
/** Hint under a row when the typed ingredient is not in stock yet */
function rowHint(row) {
  const name = row.querySelector('.rec-name').value.trim(), id = row.querySelector('[name=r_stock]').value;
  const isNew = !!name && !id;
  row.classList.toggle('is-new', isNew);
  row.querySelector('.rec-hint').innerHTML = !isNew ? '' : canAddStock()
    ? `<b>New stock item</b> — "${esc(name)}" is added to Stock when you save (at 0 — set the quantity in Stock).`
    : `"${esc(name)}" is not in stock — ask the owner or a manager to add it.`;
}
function comboOptions(row) {
  const typed = row.querySelector('.rec-name').value.trim(), q = typed.toLowerCase();
  const items = S.stock.filter((x) => !q || x.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  const exact = S.stock.some((x) => x.name.toLowerCase() === q);
  let html = items.map((x) => `<button type="button" role="option" class="combo-opt" data-id="${x.id}"><span>${esc(x.name)}</span><small>${esc(x.unit)}</small></button>`).join('');
  if (q && !exact) html += canAddStock()
    ? `<button type="button" role="option" class="combo-opt add" data-new="1">${icon('plus')}<span>Add "${esc(typed)}" to stock</span></button>`
    : '<p class="combo-empty">Not in stock — ask the owner or a manager to add it.</p>';
  return html || `<p class="combo-empty">${S.stock.length ? 'No match.' : 'No stock items yet — type a name to add one.'}</p>`;
}
function openCombo(row) {
  $$('.rec-row').forEach((r) => { if (r !== row) closeCombo(r); });
  const list = row.querySelector('.combo-list'); list.innerHTML = comboOptions(row); list.hidden = false;
  row.querySelector('.rec-name').setAttribute('aria-expanded', 'true');
}
function closeCombo(row) {
  const l = row?.querySelector('.combo-list'); if (l) l.hidden = true;
  row?.querySelector('.rec-name')?.setAttribute('aria-expanded', 'false');
}
function pickStock(row, s) {
  row.querySelector('.rec-name').value = s.name; row.querySelector('[name=r_stock]').value = s.id;
  row.querySelector('select[name=r_unit]').innerHTML = unitOptions(s);
  closeCombo(row); rowHint(row); row.querySelector('input[name=r_qty]').focus();
}
function markNew(row) {
  row.querySelector('[name=r_stock]').value = '';
  row.querySelector('select[name=r_unit]').innerHTML = unitOptions(null, guessUnit(row.querySelector('.rec-name').value));
  closeCombo(row); rowHint(row); row.querySelector('input[name=r_qty]').focus();
}
/** Typed text that exactly matches a stock name is linked to that item */
function syncTyped(row) {
  const t = row.querySelector('.rec-name').value.trim().toLowerCase(); const hid = row.querySelector('[name=r_stock]');
  const cur = byId(S.stock, hid.value);
  if (!(cur && cur.name.toLowerCase() === t)) {
    const s = t ? S.stock.find((x) => x.name.toLowerCase() === t) : null;
    const unitSel = row.querySelector('select[name=r_unit]');
    if (s) { hid.value = s.id; unitSel.innerHTML = unitOptions(s); }
    else { const wasLinked = !!hid.value; hid.value = ''; if (wasLinked || !row.dataset.unitSet) unitSel.innerHTML = unitOptions(null, guessUnit(t)); }
  }
  rowHint(row);
}
const recInput = (e) => e.target.classList && e.target.classList.contains('rec-name');
document.addEventListener('focusin', (e) => { if (recInput(e)) openCombo(e.target.closest('.rec-row')); });
document.addEventListener('input', (e) => { if (recInput(e)) { const row = e.target.closest('.rec-row'); syncTyped(row); openCombo(row); } });
document.addEventListener('focusout', (e) => {
  if (!recInput(e) && !e.target.closest?.('.combo-list')) return;
  const row = e.target.closest('.rec-row');
  setTimeout(() => { if (row && !row.querySelector('.combo').contains(document.activeElement)) { closeCombo(row); syncTyped(row); } }, 150);
});
document.addEventListener('mousedown', (e) => { if (e.target.closest('.combo-opt')) e.preventDefault(); }); // keep focus while choosing
// once someone picks a unit by hand, typing the name no longer changes it
document.addEventListener('change', (e) => { if (e.target.name === 'r_unit') { const row = e.target.closest('.rec-row'); if (row) row.dataset.unitSet = '1'; } });
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.combo-opt'); if (!opt) return;
  const row = opt.closest('.rec-row');
  if (opt.dataset.new) markNew(row); else { const s = byId(S.stock, opt.dataset.id); if (s) pickStock(row, s); }
});
document.addEventListener('keydown', (e) => {
  if (recInput(e)) {
    const row = e.target.closest('.rec-row'); const first = row.querySelector('.combo-opt');
    if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (first && !row.querySelector('.combo-list').hidden) first.click(); else closeCombo(row); }
    else if (e.key === 'Escape') closeCombo(row);
    return;
  }
  const opt = e.target.closest?.('.combo-opt'); if (!opt) return;
  const opts = [...opt.parentNode.querySelectorAll('.combo-opt')]; const i = opts.indexOf(opt);
  if (e.key === 'ArrowDown') { e.preventDefault(); (opts[i + 1] || opt).focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); (opts[i - 1] || opt.closest('.rec-row').querySelector('.rec-name')).focus(); }
  if (e.key === 'Escape') { const row = opt.closest('.rec-row'); row.querySelector('.rec-name').focus(); closeCombo(row); }
});
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
/** Read the ingredient rows → { recipe, newStock, blocked }.
    Names not in stock become new stock items (owner / manager) when the dish is saved. */
function readRecipe(fd) {
  const names = fd.getAll('r_name').map((x) => String(x).trim()), ids = fd.getAll('r_stock').map(String);
  const q = fd.getAll('r_qty').map(Number), units = fd.getAll('r_unit').map(String);
  const out = [], newStock = [], blocked = [];
  names.forEach((nm, i) => {
    let s = byId(S.stock, ids[i]) || (nm ? S.stock.find((x) => x.name.toLowerCase() === nm.toLowerCase()) : null)
      || newStock.find((x) => x.name.toLowerCase() === nm.toLowerCase());
    if ((!s && !nm) || !(q[i] > 0)) return;
    if (!s) {
      if (!canAddStock()) { blocked.push(nm); return; }
      const unit = NEW_BASE[units[i]] || 'pcs';
      s = { id: uid('s'), name: nm.replace(/^\w/, (c) => c.toUpperCase()).slice(0, 40), unit, qty: 0, max: unit === 'pcs' ? 50 : 5, low: 0, step: 1 };
      newStock.push(s);
    }
    const inStockUnit = convertUnit(q[i], units[i] || s.unit, s.unit) ?? q[i];
    const e = out.find((x) => x.stockId === s.id);
    if (e) e.qty = r6(e.qty + inStockUnit); else out.push({ stockId: s.id, qty: r6(inStockUnit) });
  });
  return { recipe: out, newStock, blocked };
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
  recDel(el) { const row = el.closest('.rec-row'); const box = $('#rec-rows'); if (row && box.children.length > 1) row.remove(); else if (row) row.outerHTML = recipeRow(); },
  fillRecipes() {
    let n = 0;
    S.menu.forEach((m) => { if (!(m.recipe && m.recipe.length)) { const r = suggestRecipe(m.name); if (r.length) { m.recipe = r; n++; } } });
    if (!n) return toast('Nothing filled — dishes already have ingredients, or their ingredients are not in your stock yet. Open a dish and use "Recipe library" to add them.');
    save(); toast(`Ingredients from the recipe library added to ${pl(n, 'menu item')} — tap a dish to check the amounts`);
  },
});
Changes.recStock = () => {};
/* ---------------- dish photo: small square JPEG (about 20–40 KB), stored with the menu item ---------------- */
function readDishPhoto(file, size = 360) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose a photo.'));
    if (file.size > 20 * 1024 * 1024) return reject(new Error('That photo is too large.'));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.max(size / img.width, size / img.height), w = img.width * s, h = img.height * s;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#1c1c1e'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h); URL.revokeObjectURL(url);
      let q = 0.78, out = c.toDataURL('image/jpeg', q);
      while (out.length > 110000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')); };
    img.src = url;
  });
}
Changes.dishPhoto = (el) => {
  const f = el.files[0]; el.value = '';
  readDishPhoto(f).then((data) => {
    const form = el.closest('form'); form.photo.value = data;
    $('#dish-prev').innerHTML = dishImg({ photo: data, name: form.name.value });
    const rm = form.querySelector('[data-act=dishPhotoClear]'); if (rm) rm.hidden = false;
    el.previousElementSibling.textContent = 'Change photo';
  }).catch((e) => toast(e.message));
};
Actions.dishPhotoClear = (el) => {
  const form = el.closest('form'); form.photo.value = '';
  $('#dish-prev').innerHTML = dishImg({ name: form.name.value }); el.hidden = true;
};

Object.assign(Forms, {
  menuItem(fd) {
    const photo = String(fd.get('photo') || '');
    const { recipe, newStock, blocked } = readRecipe(fd);
    const d = { photo: /^data:image\/jpeg;base64,/.test(photo) && photo.length < 120000 ? photo : '', name: String(fd.get('name') || '').trim(), price: num(fd.get('price')), cat: String(fd.get('cat') || '').trim() || 'General', recipe };
    if (!d.name) return formError('Please enter the item name.');
    if (blocked.length) return formError(`${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} not in stock. Ask the owner or a manager to add ${blocked.length === 1 ? 'it' : 'them'} to Stock, or clear ${blocked.length === 1 ? 'that row' : 'those rows'}.`);
    newStock.forEach((s) => S.stock.push(s));
    const m = byId(S.menu, fd.get('id'));
    if (m) Object.assign(m, d); else S.menu.push({ id: uid('m'), available: true, ...d });
    closeSheet(); save();
    if (newStock.length) toast(`Saved. Added to stock: ${newStock.map((s) => s.name).join(', ')} — set how much you have in Stock.`);
    else if (!d.recipe.length && S.stock.length) toast(`Saved. Tip: add ingredients so stock reduces automatically when ${d.name} is served.`);
  },
});
