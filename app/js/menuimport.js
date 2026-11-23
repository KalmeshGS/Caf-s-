'use strict';
/* =========================================================
   Menu import — Excel (.xlsx), CSV, pasted cells, typed lines or a PHOTO of the menu.
   - Columns are found by their header (Item / Category / Price…) in any order;
     without a header: the number is the price, the 1st text is the name, the 2nd the category.
   - Photos are read on the phone (OCR) using the position of every word, so
     two-column menus and "Masala Dosa ........ 80" lines come out as separate items.
   - Everything is shown for checking first; then "Add to menu" or download it as a
     Cafe Journal menu file (.xlsx / .csv) that imports back perfectly.
   ========================================================= */
const MENU_COLUMNS = ['Item Name', 'Category', 'Price', 'Available'];
const HEAD_RE = {
  name: /^(s\.?\s*no\.?\s*)?(item|items|item name|name|dish|dish name|dishes|product|product name|particulars|description|menu item)$/i,
  cat: /^(category|categories|section|type|group|course|menu|menu section|cuisine)$/i,
  price: /^(price|prices|rate|rates|amount|mrp|cost|selling price|price \(.*\)|rate \(.*\)|₹|rs\.?|inr)$/i,
  avail: /^(available|availability|status|in stock|active)$/i,
};
/** "₹ 1,200/-" → 1200 · "Rs.80" → 80 · not a price → NaN */
function priceOf(s) {
  const t = String(s ?? '').trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/\s*(\/-|-|₹)$/, '').replace(/(\d),(\d{3})\b/g, '$1$2');
  return /^\d{1,6}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
const isPrice = (s) => Number.isFinite(priceOf(s));
const cleanName = (s) => String(s || '').replace(/[.·…_]{2,}/g, ' ').replace(/[\s.·:\-–—_|]+$/, '').replace(/^[\s.·:\-–—_|•*]+/, '').replace(/\s+/g, ' ').trim();
const looksHeading = (s) => { const t = cleanName(s); return t.length >= 2 && t.length <= 30 && !/\d/.test(t) && /[a-z]/i.test(t); };

/** Rows of cells (Excel / CSV / pasted) → items */
function rowsToItems(rows) {
  const out = []; let cat = '';
  let map = null;
  for (const r0 of rows) {
    const r = r0.map((c) => String(c ?? '').trim());
    if (!r.some(Boolean)) continue;
    // header row?
    const idx = (re) => r.findIndex((c) => re.test(c.replace(/\s+/g, ' ')));
    const ni = idx(HEAD_RE.name), pi = idx(HEAD_RE.price);
    if (ni >= 0 && pi >= 0) { map = { name: ni, price: pi, cat: idx(HEAD_RE.cat), avail: idx(HEAD_RE.avail) }; continue; }
    if (map) {
      const name = cleanName(r[map.name]); const price = priceOf(r[map.price]);
      if (name && Number.isFinite(price)) {
        const av = map.avail >= 0 ? !/^(no|n|false|0|off|out|unavailable|not available)$/i.test(r[map.avail] || '') : true;
        out.push({ name, cat: cleanName(map.cat >= 0 ? r[map.cat] : '') || cat || 'General', price, available: av });
      } else if (name && !r[map.price] && looksHeading(name)) cat = name; // a heading row inside the table
      continue;
    }
    // no header: the number is the price, first text = name, second text = category
    const texts = [], nums = [];
    r.forEach((c, i) => { if (!c) return; if (isPrice(c)) nums.push(i); else if (!/^\d+[.)]?$/.test(c)) texts.push(i); });
    if (nums.length && texts.length) {
      out.push({ name: cleanName(r[texts[0]]), cat: (texts[1] != null ? cleanName(r[texts[1]]) : '') || cat || 'General', price: priceOf(r[nums[nums.length - 1]]), available: true });
    } else if (texts.length === 1 && !nums.length && looksHeading(r[texts[0]])) cat = cleanName(r[texts[0]]);
  }
  return tidy(out);
}
/** Plain lines (typed, pasted from WhatsApp, or OCR text) → items. A line can hold several "name price" pairs. */
function linesToItems(text) {
  const out = []; let cat = '', pending = '';
  const pair = /([A-Za-zऀ-෿(][^₹\d\n]{0,60}?)\s*[.·…:\-–—_|]*\s*(?:₹|rs\.?|inr)?\s*(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/-|-)?(?=\s|$|[,;|])/gi;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\t+/g, '  ').trim(); if (!line) continue;
    if (isPrice(line) && pending) { out.push({ name: cleanName(pending), cat: cat || 'General', price: priceOf(line), available: true }); pending = ''; continue; }
    let m; const hits = []; pair.lastIndex = 0;
    while ((m = pair.exec(line))) {
      const name = cleanName(m[1]);
      if (name.length < 2 || !/[a-zऀ-෿]/i.test(name)) continue;
      hits.push({ name, price: Number(m[2]) });
    }
    if (hits.length) {
      if (pending && looksHeading(pending)) cat = cleanName(pending).replace(/:$/, ''); // a short line with no price, followed by items = a heading
      hits.forEach((x) => out.push({ ...x, cat: cat || 'General', available: true })); pending = ''; continue;
    }
    if (looksHeading(line) && (line === line.toUpperCase() || /:$/.test(line))) { cat = cleanName(line).replace(/:$/, ''); pending = ''; }
    else { if (pending && looksHeading(pending)) cat = cleanName(pending).replace(/:$/, ''); pending = line; }
  }
  return tidy(out);
}
/** Pasted text: table cells (tabs / commas) or plain lines */
function parseMenuText(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const tabbed = lines.filter((l) => l.includes('\t')).length >= lines.length / 2;
  if (tabbed) return rowsToItems(lines.map((l) => l.split('\t')));
  const csvLike = lines.filter((l) => /,/.test(l) && /,\s*(₹|rs\.?)?\s*\d/i.test(l + ',')).length >= lines.length / 2 || HEAD_RE.name.test((lines[0].split(',')[0] || '').trim());
  if (csvLike) { const items = rowsToItems(parseCsv(lines.join('\n'))); if (items.length) return items; }
  return linesToItems(text);
}
function tidy(items) {
  const seen = new Set();
  return items.filter((it) => it.name && Number.isFinite(it.price) && it.price >= 0 && it.price <= MAX_AMOUNT)
    .map((it) => ({ ...it, name: it.name.slice(0, 40), cat: String(it.cat || 'General').slice(0, 24) }))
    .filter((it) => { const k = it.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------------- photo (OCR with word positions) ---------------- */
/** Usual photo-reader slips inside words: "1dli" → "Idli", "B0nda" → "Bonda", "|ce" → "Ice" */
const ocrFix = (t) => (/\d/.test(t) && /[a-z]/i.test(t) && !/^\d+(pcs?|ml|g|kg|l|pc|nos?)\)?$/i.test(t) && !/^\(\d/.test(t)
  ? t.replace(/^1(?=[a-z])/, 'I').replace(/^0(?=[a-z])/i, 'O').replace(/(?<=[a-z])0(?=[a-z])/gi, 'o').replace(/(?<=[a-z])1(?=[a-z])/gi, 'l').replace(/(?<=[a-z])5(?=[a-z])/gi, 's')
  : t.replace(/^\|(?=[a-z])/, 'I'));
function ocrWordsOf(data) {
  if (Array.isArray(data.words) && data.words.length) return data.words;
  const out = [];
  (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((w) => out.push(w)))));
  return out;
}
/** Words with boxes → items, reading each column of the menu separately */
function photoToItems(data) {
  // keep every number and dot (the reader is often "unsure" about them); drop only very doubtful letters
  const words = ocrWordsOf(data).filter((w) => w.text && w.text.trim() && w.bbox && (w.confidence == null || w.confidence > 20 || /[\d₹.·]/.test(w.text)));
  if (!words.length) return linesToItems(data.text || '');
  const hs = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b); const h = hs[Math.floor(hs.length / 2)] || 12;
  const pageW = Math.max(...words.map((w) => w.bbox.x1)) || 1000;
  // 1) rows by height
  const rows = [];
  words.slice().sort((a, b) => (a.bbox.y0 + a.bbox.y1) - (b.bbox.y0 + b.bbox.y1)).forEach((w) => {
    const yc = (w.bbox.y0 + w.bbox.y1) / 2;
    const row = rows.find((r) => Math.abs(r.yc - yc) < h * 0.6);
    if (row) { row.words.push(w); row.yc = (row.yc * (row.words.length - 1) + yc) / row.words.length; } else rows.push({ yc, words: [w] });
  });
  rows.sort((a, b) => a.yc - b.yc);
  // 2) split each row into chunks at big gaps (columns); dotted leaders don't count as gaps
  const chunks = [];
  rows.forEach((r, ri) => {
    r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let cur = null;
    const money = (t) => isPrice(t) || /^(₹|rs\.?|inr)$/i.test(t) || /^(₹|rs\.?)\d/i.test(t);
    r.words.forEach((w) => {
      const t = ocrFix(w.text.trim()); if (/^[.·…_\-–—]+$/.test(t)) { if (cur) cur.x1 = w.bbox.x1; return; }
      const last = cur ? cur.text.split(' ').pop() : '';
      const priceAfterName = money(t) && !money(last);
      const amountAfterCurrency = isPrice(t) && /^(₹|rs\.?|inr)$/i.test(last);
      if (cur && w.bbox.x0 - cur.x1 > h * 2.2 && !priceAfterName && !amountAfterCurrency) { chunks.push(cur); cur = null; }
      if (cur && w.bbox.x0 - cur.x1 > h * 9 && !amountAfterCurrency) { chunks.push(cur); cur = null; } // very far apart → another column
      const wh = w.bbox.y1 - w.bbox.y0;
      if (!cur) cur = { row: ri, x0: w.bbox.x0, x1: w.bbox.x1, text: t, h: wh, bold: !!w.is_bold };
      else { cur.text += ' ' + t; cur.x1 = w.bbox.x1; cur.h = Math.max(cur.h, wh); }
    });
    if (cur) chunks.push(cur);
  });
  // 3) read chunks: "name … price", a lone price after a name, or a heading for that column
  const out = [], heads = [], pending = [];
  const near = (a, b) => Math.abs(a - b) < pageW * 0.22;
  const catAt = (x, row) => { const hd = heads.filter((x2) => x2.row <= row && near(x2.x0, x)).pop() || heads.filter((x2) => x2.row <= row).pop(); return hd ? hd.text : 'General'; };
  const priceOnly = (t) => isPrice(t) || isPrice(t.replace(/^(₹|rs\.?|inr)\s*/i, ''));
  chunks.forEach((c) => {
    const m = c.text.match(/^(.*?)[\s.·…:\-–—_|]*(?:₹|rs\.?|inr)?\s*(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/-|-)?$/i);
    const nm = m ? cleanName(m[1]).replace(/\s*(₹|rs\.?|inr)$/i, '') : '';
    if (m && /[a-z]{2}/i.test(nm) && !/^(₹|rs\.?|inr)$/i.test(nm)) { out.push({ name: nm, cat: catAt(c.x0, c.row), price: Number(m[2]), available: true }); return; }
    if (priceOnly(c.text)) {
      // price alone: the name is the chunk just before it on the same row, or the line above in this column
      const p = pending.filter((x) => (x.row === c.row && x.x1 <= c.x0) || (x.row === c.row - 1 && near(x.x0, c.x0 - (c.x1 - c.x0)))).pop()
        || pending.filter((x) => x.row === c.row - 1).pop();
      if (p) { out.push({ name: cleanName(p.text), cat: catAt(p.x0, p.row), price: priceOf(c.text.replace(/^(₹|rs\.?|inr)\s*/i, '')), available: true }); pending.splice(pending.indexOf(p), 1); }
      return;
    }
    const t = cleanName(c.text);
    // the next thing below in this column already has its own price → this line is a heading, not a name waiting for a price
    const ci = chunks.indexOf(c);
    const below = chunks.slice(ci + 1).find((x) => x.row > c.row && near(x.x0, c.x0));
    const rowHasPrice = (row, not) => chunks.some((x) => x.row === row && x !== not && priceOnly(x.text));
    const belowIsItem = below && (/[a-z]{2}.*\d/i.test(below.text) || rowHasPrice(below.row, below)) && !rowHasPrice(c.row, c);
    // a heading is in CAPITALS, bigger / bold text, ends with ":", or sits on top of priced items
    if (looksHeading(t) && (t === t.toUpperCase() || c.h > h * 1.15 || c.bold || /:$/.test(c.text.trim()) || belowIsItem)) heads.push({ ...c, text: t.replace(/:$/, '') });
    else if (/[a-z]{2}/i.test(t)) pending.push({ ...c, text: t });
  });
  // OCR often reads "₹" as a 2 / 3 / 7 in front of the price ("₹25" → "325"): flag prices far above the rest of their category
  const fixed = out.map((it) => {
    const p = String(it.price), others = out.filter((x) => x.cat === it.cat && x !== it).map((x) => x.price).sort((a, b) => a - b);
    const med = others[Math.floor(others.length / 2)];
    if (p.length >= 3 && /^[237]/.test(p) && med && it.price > med * 3 && Number(p.slice(1)) <= med * 3) return { ...it, price: Number(p.slice(1)), check: `read as ${p} — was the first digit the ₹ sign?` };
    return it;
  });
  const items = tidy(fixed);
  return items.length ? items : linesToItems(data.text || '');
}

/* ---------------- read any file ---------------- */
async function readMenuFile(file, onStatus = () => {}) {
  const name = file.name || '';
  if (/\.xlsx$/i.test(name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') { onStatus('Reading the Excel file…'); return rowsToItems(await readXlsx(file)); }
  if (/\.xls$/i.test(name)) throw new Error('Old Excel (.xls) files can’t be read — open it in Excel and “Save as” .xlsx or CSV.');
  if (/\.(csv|txt|tsv)$/i.test(name) || /^text\//.test(file.type)) { onStatus('Reading the file…'); const t = await file.text(); return /\.tsv$/i.test(name) ? rowsToItems(t.split(/\r?\n/).map((l) => l.split('\t'))) : (/\.csv$/i.test(name) ? rowsToItems(parseCsv(t)) : parseMenuText(t)); }
  if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|bmp)$/i.test(name)) {
    onStatus('Reading the menu photo… (the first time, the reader downloads about 7 MB)');
    const worker = await ocrWorker((m) => { if (m.status === 'recognizing text') onStatus(`Reading the photo… ${Math.round(m.progress * 100)}%`); else if (/load/.test(m.status || '')) onStatus(`Getting the photo reader ready… ${Math.round((m.progress || 0) * 100)}%`); });
    try { await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }); } catch (e) { /* older reader */ }
    const { data } = await worker.recognize(await downscale(file, 2400), {}, { text: true, blocks: true });
    return photoToItems(data);
  }
  if (/\.pdf$/i.test(name)) throw new Error('PDF menus can’t be read here — take a photo/screenshot of the menu, or export it to Excel.');
  throw new Error('Choose an Excel (.xlsx), CSV or photo file.');
}

/* ---------------- review sheet ---------------- */
const canEditMenu = () => ['owner', 'manager', 'kitchen'].includes(Session.role());
App.menuImp = { items: [], target: 'menu' };
function menuImportSheet(target = 'menu') {
  App.menuImp.target = target;
  const items = App.menuImp.items;
  const have = new Set((target === 'setup' ? filled(App.setup.d.menu) : S.menu).map((m) => String(m.name).toLowerCase()));
  const rows = items.map((it, i) => `<div class="mi-row">
      <input type="checkbox" class="mi-on" data-i="${i}" ${have.has(it.name.toLowerCase()) ? '' : 'checked'} aria-label="Use ${esc(it.name)}">
      <input class="mi-name" data-i="${i}" maxlength="40" value="${esc(it.name)}" aria-label="Item name">
      <input class="mi-cat" data-i="${i}" maxlength="24" value="${esc(it.cat)}" list="mi-cats" aria-label="Category">
      <input class="mi-price" data-i="${i}" type="number" min="0" step="any" value="${esc(it.price)}" aria-label="Price">
      ${have.has(it.name.toLowerCase()) ? '<small class="muted">already on menu — price will be updated</small>' : it.check ? `<small class="warn-t">Check price: ${esc(it.check)}</small>` : '<small></small>'}</div>`).join('');
  const canAdd = target === 'setup' || canEditMenu();
  return `${sheetHead('Menu import', 'Read a menu from a photo or file')}
    <div class="mi-pick">
      <label class="btn ghost sm">${icon('camera')}<span>Photo of menu</span><input type="file" accept="image/*" hidden data-change="menuImpFile"></label>
      <label class="btn ghost sm">${icon('upload')}<span>Excel / CSV file</span><input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden data-change="menuImpFile"></label>
      ${btn('Paste text', 'menuImpPasteToggle', { cls: 'ghost sm', ic: 'clipboard' })}
      ${btn('Blank template', 'menuImpTemplate', { cls: 'ghost sm', ic: 'download' })}
    </div>
    <div id="mi-paste" hidden><textarea id="mi-text" rows="5" placeholder="Copy cells from Excel / Google Sheets, or one item per line:&#10;TIFFIN&#10;Masala Dosa  80&#10;Idli Vada, 55"></textarea>${btn('Read text', 'menuImpReadText', { cls: 'primary sm', ic: 'check' })}</div>
    <p class="muted sm" id="mi-status">${items.length ? `${pl(items.length, 'item')} found — fix anything wrong, untick what you don't want.` : 'Choose a photo, an Excel/CSV file, or paste text. Columns can be in any order: Item Name, Category, Price.'}</p>
    ${items.length ? `<div class="mi-head"><span></span><span>Item name</span><span>Category</span><span>Price</span><span></span></div><div class="mi-list">${rows}</div>
      <datalist id="mi-cats">${[...new Set(items.map((x) => x.cat).concat(S.menu.map((m) => m.cat)))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <p class="neg sm" id="form-err" role="alert"></p>
      <div class="btn-row">
        ${canAdd ? btn(target === 'setup' ? 'Add ticked to my menu list' : 'Add ticked to menu', 'menuImpAdd', { cls: 'primary', ic: 'plus' }) : '<span class="muted sm">Only owner, manager or kitchen can change the menu — download the file and send it to them.</span>'}
        ${btn('Download Excel', 'menuImpXlsx', { cls: 'ghost sm', ic: 'download' })}${btn('Download CSV', 'menuImpCsv', { cls: 'ghost sm', ic: 'download' })}
      </div>` : ''}`;
}
function menuImpCollect() {
  return $$('#sheet .mi-row').map((r) => ({
    on: r.querySelector('.mi-on').checked, name: cleanName(r.querySelector('.mi-name').value), cat: cleanName(r.querySelector('.mi-cat').value) || 'General', price: r.querySelector('.mi-price').value,
  }));
}
const menuFileRows = (items) => [MENU_COLUMNS, ...items.map((it) => [it.name, it.cat, Number(it.price) || 0, it.available === false ? 'No' : 'Yes'])];
const menuFileName = (ext) => `${slug(S.settings?.name || App.setup?.d?.name || 'cafe')}-menu-${dayKey()}.${ext}`;
Object.assign(Actions, {
  menuImpOpen(el) { App.menuImp.items = []; openSheet(menuImportSheet(el?.dataset?.target || 'menu'), { wide: true }); },
  menuImpPasteToggle() { const p = $('#mi-paste'); if (p) { p.hidden = !p.hidden; $('#mi-text')?.focus(); } },
  menuImpReadText() { App.menuImp.items = parseMenuText($('#mi-text')?.value); openSheet(menuImportSheet(App.menuImp.target), { wide: true }); if (!App.menuImp.items.length) $('#mi-status').textContent = 'No items with a price found. One item per line, like "Masala Dosa 80".'; },
  menuImpTemplate() {
    saveBlob(`cafe-journal-menu-template.xlsx`, writeXlsx([{ name: 'Menu', rows: [MENU_COLUMNS, ['Masala Dosa', 'South Indian Tiffin', 80, 'Yes'], ['Filter Coffee', 'Beverages', 30, 'Yes']] }]));
    toast('Template downloaded — fill one item per row, keep the header, then import it.');
  },
  menuImpXlsx() { const items = menuImpCollect().filter((x) => x.on); saveBlob(menuFileName('xlsx'), writeXlsx([{ name: 'Menu', rows: menuFileRows(items) }])); toast('Excel menu file downloaded — it imports straight back into Cafe Journal.'); },
  menuImpCsv() { const items = menuImpCollect().filter((x) => x.on); saveBlob(menuFileName('csv'), new Blob([csvText(menuFileRows(items))], { type: 'text/csv' })); toast('CSV menu file downloaded.'); },
  menuImpAdd() {
    const rows = menuImpCollect().filter((x) => x.on);
    if (!rows.length) return formError('Tick at least one item.');
    for (const r of rows) {
      const p = Number(r.price);
      if (!r.name) return formError('Every ticked row needs an item name.');
      if (!Number.isFinite(p) || p <= 0 || p > MAX_AMOUNT) return formError(`"${r.name}": check the price.`);
    }
    if (App.menuImp.target === 'setup') {
      const d = App.setup.d, keep = filled(d.menu);
      const fresh = rows.filter((r) => !keep.some((k) => k.name.toLowerCase() === r.name.toLowerCase()));
      d.menu = keep.concat(fresh.map((r) => ({ name: r.name, cat: r.cat, price: String(Number(r.price)) })));
      closeSheet(); render(); return toast(`${pl(fresh.length, 'item')} added to your menu list`);
    }
    if (!canEditMenu()) return formError('Only owner, manager or kitchen can change the menu.');
    let added = 0, updated = 0;
    rows.forEach((r) => {
      const old = S.menu.find((m) => m.name.toLowerCase() === r.name.toLowerCase());
      if (old) { old.price = Number(r.price); old.cat = r.cat; updated++; return; }
      S.menu.push({ id: uid('m'), name: r.name, cat: r.cat, price: Number(r.price), available: true, recipe: typeof suggestRecipe === 'function' ? suggestRecipe(r.name, S.stock) : [] });
      added++;
    });
    save(); closeSheet(); toast(`${added ? pl(added, 'item') + ' added' : ''}${added && updated ? ' · ' : ''}${updated ? pl(updated, 'price') + ' updated' : ''} — see Menu`);
  },
});
Changes.menuImpFile = async (el) => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  const st = (t) => { const s = $('#mi-status'); if (s) s.textContent = t; };
  try {
    App.menuImp.items = await readMenuFile(f, st);
    openSheet(menuImportSheet(App.menuImp.target), { wide: true });
    if (!App.menuImp.items.length) st('No items with a price were found. For photos: a clear, straight, well-lit photo of one page works best.');
  } catch (e) { st(e.message || String(e)); }
};
