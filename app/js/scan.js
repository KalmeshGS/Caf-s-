'use strict';
/* =========================================================
   1. Barcode scanning for purchases
      · a USB / Bluetooth barcode scanner (it types the code + Enter)
      · or the phone / laptop camera (built-in BarcodeDetector where the
        browser has it, else the bundled ZXing reader — Apache-2.0)
      Each stock item can carry barcodes and "each scan adds" (pack size).
   2. Food that was cooked but never collected: Wasted / Donated / Staff meal
   ========================================================= */

const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code', 'data_matrix'];
const codesOf = (s) => String(s?.barcode || '').split(',').map((x) => x.trim()).filter(Boolean);
const normCode = (c) => String(c || '').trim().replace(/\s+/g, '');
const stockByCode = (code) => S.stock.find((s) => codesOf(s).includes(normCode(code))) || null;
const packOf = (s) => (Number(s?.pack) > 0 ? Number(s.pack) : Number(s?.step) || 1);

/* ---------------- purchase form: scan bar ---------------- */
function scanBarHtml() {
  return `<div class="scan-bar">
      <label class="scan-in">${icon('grid')}<input id="scan-in" placeholder="Scan a barcode — or type it and press Enter" autocomplete="off" aria-label="Barcode"></label>
      <button type="button" class="btn ghost sm" data-act="scanCam">${icon('camera')}<span>Camera</span></button>
      <label class="btn ghost sm" title="Take a photo of the barcode">${icon('upload')}<span>Photo</span><input type="file" accept="image/*" capture="environment" hidden data-change="scanPhoto"></label>
    </div>
    <div id="scan-cam" class="scan-cam" hidden><video playsinline muted aria-label="Camera"></video><i class="scan-aim" aria-hidden="true"></i><button type="button" class="btn light sm" data-act="scanStop">${icon('x')}<span>Stop camera</span></button></div>
    <div id="scan-msg" class="scan-msg" role="status" aria-live="polite"></div>`;
}
function scanMsg(html, tone = '') { const m = $('#scan-msg'); if (m) { m.className = `scan-msg ${tone}`; m.innerHTML = html; } }

/** Put one scanned pack into the purchase rows */
function addScanned(s) {
  const box = $('#pur-rows'); if (!box) return;
  let rows = $$('#pur-rows .pur-row');
  let row = rows.find((r) => r.querySelector('select[name=p_item]').value === s.id) || rows.find((r) => !r.querySelector('select[name=p_item]').value);
  if (!row) { Actions.purRowAdd(); rows = $$('#pur-rows .pur-row'); row = rows[rows.length - 1]; }
  const sel = row.querySelector('select[name=p_item]'), q = row.querySelector('input[name=p_qty]'), a = row.querySelector('input[name=p_amt]');
  sel.value = s.id;
  const qty = r6((Number(q.value) || 0) + packOf(s)); q.value = String(qty);
  if (!a.dataset.manual && unitCost(s)) a.value = String(round2(qty * unitCost(s)));
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  scanMsg(`${icon('check')} <b>${esc(s.name)}</b> +${esc(qtyText(packOf(s), s.unit))} · now ${esc(qtyText(qty, s.unit))}${unitCost(s) && !a.dataset.manual ? ` · ${money(round2(qty * unitCost(s)))} (check the bill amount)` : ''}`, 'ok');
  try { beep(); } catch (e) { /* ignore */ }
}
function handleScan(raw) {
  const code = normCode(raw); if (!code) return;
  const s = stockByCode(code);
  if (s) return addScanned(s);
  newProduct(code);
}

/* ---------------- a new product: look its barcode up, create the stock item ---------------- */
const productCache = {};
/** Free public product database (Open Food Facts). Only the barcode number is sent. → { name, unit, size } or null */
async function lookupProduct(code) {
  if (code in productCache) return productCache[code];
  let out = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,quantity,categories_tags`, { signal: ctl.signal, credentials: 'omit' });
    clearTimeout(t);
    const j = r.ok ? await r.json() : null;
    const p = j && j.status === 1 ? j.product : null;
    if (p) {
      const brand = String(p.brands || '').split(',')[0].trim();
      let name = String(p.product_name_en || p.product_name || '').trim();
      if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`;
      if (!name) name = brand;
      const size = String(p.quantity || '').trim();
      if (size && name && !name.toLowerCase().replace(/\s/g, '').includes(size.toLowerCase().replace(/\s/g, ''))) name = `${name} ${size}`;
      const drink = (p.categories_tags || []).some((c) => /beverage|water|drink|juice|soda/.test(c));
      if (name) out = { name: name.replace(/\s+/g, ' ').slice(0, 40), unit: drink ? 'bottles' : 'pcs', size };
    }
  } catch (e) { out = null; }
  productCache[code] = out; return out;
}
/** Create a stock item for a scanned barcode and put it in the purchase */
function createScannedStock(code, info) {
  const same = S.stock.find((x) => x.name.toLowerCase() === info.name.toLowerCase());
  const s = same || { id: uid('s'), name: info.name.slice(0, 40), unit: info.unit || 'pcs', qty: 0, max: 24, low: 2, step: 1, pack: 1 };
  s.barcode = [...codesOf(s), code].join(', ');
  if (!same) S.stock.push(s);
  persist();
  // the item list in every row now needs the new item
  $$('#pur-rows select[name=p_item], #pur-tpl').forEach(() => {});
  $$('#pur-rows select[name=p_item]').forEach((sel) => { if (!sel.querySelector(`option[value="${s.id}"]`)) sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)} (${esc(s.unit)})</option>`); });
  const tpl = $('#pur-tpl'); if (tpl) tpl.innerHTML = purchaseRow();
  addScanned(s);
  const m = $('#scan-msg'); if (m) m.insertAdjacentHTML('beforeend', `<div class="scan-sub">${same ? 'Matched to your stock item' : 'New stock item created'}${info.from ? ' from the product database' : ''} — type the bill amount below.</div>`);
}
async function newProduct(code) {
  scanMsg(`${icon('clock')} Looking up barcode <b>${esc(code)}</b>…`);
  const info = await lookupProduct(code);
  if (stockByCode(code)) return addScanned(stockByCode(code)); // linked meanwhile (a second scan)
  if (info) return createScannedStock(code, { ...info, from: true });
  scanMsg(`<div class="scan-new"><span><b>New product</b> · barcode ${esc(code)} isn't in the product database. Type its name once — it is remembered.</span>
    <div class="row-2"><input id="scan-new-name" maxlength="40" placeholder="e.g. Bisleri water 1 L" aria-label="Product name" autocomplete="off">
    <button type="button" class="btn primary sm" data-act="scanNewAdd" data-code="${esc(code)}">Add to stock</button></div>
    ${S.stock.length ? `<details class="scan-or"><summary>It's one of my stock items</summary><div class="row-2"><select id="scan-link-item" aria-label="Stock item"><option value="">Choose…</option>${stockOptions()}</select><button type="button" class="btn ghost sm" data-act="scanLink" data-code="${esc(code)}">Link</button></div></details>` : ''}</div>`, 'warn');
  setTimeout(() => $('#scan-new-name')?.focus(), 30);
}

/* ---------------- camera ---------------- */
const Cam = { stream: null, timer: null, reader: null, last: '', lastAt: 0 };
// Back camera, sharp enough for the thin bars of a product barcode, focusing continuously where the phone allows
const CAM_VIDEO = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] };
/** ZXing settings: only product barcodes (faster, fewer misreads) and try harder on blurry / tilted ones */
function zxHints() {
  const Z = window.ZXing, F = Z.BarcodeFormat, h = new Map();
  h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE]);
  h.set(Z.DecodeHintType.TRY_HARDER, true);
  return h;
}
/** Read a barcode from a photo (the phone's own camera app focuses and takes a sharp picture) */
async function decodePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    if ('BarcodeDetector' in window) {
      try { const bmp = await createImageBitmap(file); const got = await new window.BarcodeDetector({ formats: SCAN_FORMATS }).detect(bmp); if (got[0]?.rawValue) return got[0].rawValue; } catch (e) { /* fall back to ZXing */ }
    }
    await loadScript('vendor/zxing.min.js');
    const Z = window.ZXing, reader = new Z.BrowserMultiFormatReader(zxHints());
    const img = new Image(); img.src = url; await img.decode();
    // phones take very large photos: try a few sizes (smaller is often easier for the 1D reader)
    for (const w of [1600, 1000, 2400]) {
      const sc = Math.min(1, w / img.naturalWidth), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const im = new Image(); im.src = c.toDataURL('image/jpeg', 0.92); await im.decode();
      try { return (await reader.decodeFromImageElement(im)).getText(); } catch (e) { /* next size */ }
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
function loadScript(src) {
  return new Promise((res, rej) => { if ([...document.scripts].some((x) => x.src.endsWith(src))) return res(); const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('Could not load the barcode reader — check the internet and try again.')); document.head.appendChild(sc); });
}
function camHit(code) {
  const c = normCode(code); const now = Date.now();
  if (c === Cam.last && now - Cam.lastAt < 2000) return; // the same pack held in front of the camera
  Cam.last = c; Cam.lastAt = now; routeScan(c);
}
function camStop() {
  clearInterval(Cam.timer); Cam.timer = null;
  try { Cam.reader && Cam.reader.reset(); } catch (e) { /* ignore */ }
  Cam.reader = null;
  if (Cam.stream) Cam.stream.getTracks().forEach((t) => t.stop());
  Cam.stream = null;
  const box = $('#scan-cam'); if (box) box.hidden = true;
}
async function camStart() {
  const box = $('#scan-cam'), video = box && box.querySelector('video'); if (!video) return;
  if (!navigator.mediaDevices?.getUserMedia) return scanMsg('This browser cannot use the camera. Use a barcode scanner, or type the code.', 'warn');
  box.hidden = false; scanMsg('Point the camera at the barcode…');
  const watch = () => { if (!document.body.contains(video)) camStop(); }; // sheet closed → camera off
  try {
    if ('BarcodeDetector' in window) {
      const supported = await (window.BarcodeDetector.getSupportedFormats?.() || Promise.resolve(SCAN_FORMATS));
      const det = new window.BarcodeDetector({ formats: SCAN_FORMATS.filter((f) => supported.includes(f)) });
      Cam.stream = await navigator.mediaDevices.getUserMedia({ video: CAM_VIDEO, audio: false });
      video.srcObject = Cam.stream; await video.play();
      Cam.timer = setInterval(async () => {
        watch(); if (!Cam.stream || video.readyState < 2) return;
        try { const got = await det.detect(video); if (got[0]?.rawValue) camHit(got[0].rawValue); } catch (e) { /* frame not ready */ }
      }, 250);
    } else {
      scanMsg('Starting the camera…');
      await loadScript('vendor/zxing.min.js');
      Cam.reader = new window.ZXing.BrowserMultiFormatReader(zxHints(), 150);
      await Cam.reader.decodeFromConstraints({ video: CAM_VIDEO, audio: false }, video, (res) => { if (res) camHit(res.getText()); });
      Cam.stream = video.srcObject;
      Cam.timer = setInterval(watch, 500);
      scanMsg('Point the camera at the barcode…');
    }
  } catch (e) {
    camStop();
    scanMsg(e && e.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for this site in the browser settings — or use a barcode scanner.' : e && e.name === 'NotFoundError' ? 'No camera found on this device. Use a barcode scanner, or type the code.' : (e.message || 'The camera could not start.'), 'warn');
  }
}

// A barcode scanner "types" the code and presses Enter: catch Enter in the scan box so it doesn't save the form
document.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'scan-in' && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); routeScan(e.target.value); e.target.value = ''; }
}, true);
// Typing a bill amount yourself stops scans from overwriting it
document.addEventListener('input', (e) => { if (e.target && e.target.name === 'p_amt') e.target.dataset.manual = '1'; }, true);

/* ---------------- food cooked but never collected ---------------- */
const FOOD_FATE = { wasted: 'Wasted (thrown away)', donated: 'Donated', staff: 'Staff meal' };
const canFoodFate = () => ['owner', 'manager', 'kitchen'].includes(Session.role());
function unclaimedSheet(k) {
  const o = byId(S.orders, k.orderId);
  const price = (i) => (byId(S.menu, i.menuId)?.price || 0) * i.qty;
  const use = stockUse(k);
  const cost = round2(sum(Object.entries(use), ([id, q]) => q * unitCost(byId(S.stock, id))));
  return `${sheetHead('Not collected', k.token ? `Token ${k.token}` : k.table === 'Takeaway' ? `Takeaway #${k.no}` : k.table)}
  <form data-form="kotUnclaimed" class="form"><input type="hidden" name="id" value="${k.id}">
    <div class="list compact">${k.items.map((i) => `<div class="line-row"><span>${i.qty}× ${esc(i.name)}</span><span class="muted">${money(price(i))}</span></div>`).join('')}</div>
    <p class="muted sm">What happened to the food? The ingredients come off the stock and the loss shows in Reports → Leakage check${seesCost() && cost ? ` (ingredients worth ${money(cost)})` : ''}.</p>
    <div class="state-grid">${Object.entries(FOOD_FATE).map(([v, l], i) => `<label class="state-btn"><input type="radio" name="fate" value="${v}" ${i ? '' : 'checked'}><span>${icon(v === 'wasted' ? 'trash' : v === 'donated' ? 'users' : 'cup')} ${esc(l)}</span></label>`).join('')}</div>
    <label class="field"><span>Note <em>(optional)</em></span><input name="note" maxlength="80" placeholder="e.g. Given to the temple / NGO, customer didn't come"></label>
    ${o && o.status === 'open' ? `<p class="banner warn sm">${icon('alert')}<span>Bill #${o.no} is still open. If the customer won't pay, cancel it from Billing.</span></p>` : ''}
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Save</button></div></form>`;
}

/* ---------------- actions & forms ---------------- */
Object.assign(Actions, {
  scanCam() { if (Cam.stream || Cam.reader) return; camStart(); },
  scanStop() { camStop(); scanMsg(''); },
  scanLink(el) {
    const s = byId(S.stock, $('#scan-link-item')?.value); const code = normCode(el.dataset.code);
    if (!s) return scanMsg('Choose the stock item first.', 'warn');
    const other = stockByCode(code); if (other && other !== s) return scanMsg(`That barcode already belongs to ${esc(other.name)}.`, 'warn');
    s.barcode = [...codesOf(s), code].join(', ');
    const pk = Number($('#scan-link-pack')?.value); if (pk > 0) s.pack = r6(pk);
    persist(); addScanned(s);
  },
  kotUnclaimed(el) { const k = byId(S.kots, el.dataset.id); if (k && canFoodFate()) openSheet(unclaimedSheet(k)); },
});
Object.assign(Forms, {
  kotUnclaimed(fd) {
    const k = byId(S.kots, fd.get('id')); if (!k || k.status === 'served') return closeSheet();
    const fate = FOOD_FATE[fd.get('fate')] ? fd.get('fate') : 'wasted';
    const note = String(fd.get('note') || '').trim();
    const use = stockUse(k);
    Object.entries(use).forEach(([id, q]) => {
      const s = byId(S.stock, id); if (!s) return;
      addLog({ type: 'waste', stockId: s.id, name: s.name, unit: s.unit, qty: q, cost: unitCost(s), amount: round2(q * unitCost(s)), reason: `Order not collected · ${FOOD_FATE[fate]}${note ? ` · ${note}` : ''}`, orderNo: k.no });
    });
    if (!k.stockDone) { k.stockDone = true; if (Object.keys(use).length) applyStockUse(use); }
    const value = round2(sum(k.items, (i) => (byId(S.menu, i.menuId)?.price || 0) * i.qty));
    audit('unclaimed', { no: k.no, table: k.table, token: k.token || null, fate, items: k.items.map((i) => `${i.qty}× ${i.name}`).join(', '), amount: value, note });
    Object.assign(k, { status: 'served', outcome: fate, updatedAt: Date.now() });
    closeSheet(); save(); toast(`Saved — ${FOOD_FATE[fate].toLowerCase()}`);
  },
});

/* =========================================================
   Retail-style scanning everywhere
   · A barcode scanner machine (USB / Bluetooth) works on every screen —
     no box to click first. It "types" very fast and presses Enter; that is
     how it is told apart from a person typing.
       Orders / Billing → the item is added to the bill (a new counter bill
       if none is open)   ·   Stock → a purchase starts with the item
   · Camera scanning from the order screen and the Stock screen
   · Menu items can carry barcodes (packaged goods: water, soft drinks…)
   ========================================================= */
const menuByCode = (code) => S.menu.find((m) => String(m.barcode || '').split(',').map((x) => x.trim()).includes(normCode(code))) || null;
const FLOOR_SELLERS = ['owner', 'manager', 'cashier', 'waiter', 'captain'];
const onView = (v) => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard') === v;

/** Add one menu item to an open bill (same rules as tapping it on the menu) */
function sellAdd(o, m) {
  if (m.available === false) return toast(`${m.name} is switched off (not available today).`);
  const l = o.items.find((x) => x.menuId === m.id && !x.note);
  if (l) l.qty += 1; else o.items.push({ id: uid('l'), menuId: m.id, name: m.name, price: m.price, qty: 1, sent: 0, note: '' });
  save(); try { beep(); } catch (e) { /* ignore */ }
  const q = o.items.find((x) => x.menuId === m.id && !x.note)?.qty || 1;
  const box = $('#sell-scan-msg');
  if (box) box.innerHTML = `${icon('check')} <b>${esc(m.name)}</b> × ${q} · ${money(m.price)}`; else toast(`Scanned: ${m.name} × ${q}`);
}
/** The bill a scan should go to: the open order on screen, else a new counter bill */
function sellTarget() {
  if (onView('orders') && (App.params.o || App.params.t)) {
    let o = currentOrder(App.params);
    if (o && o.status !== 'open') return null;
    if (!o) { o = { id: uid('o'), no: nextBillNo(), table: App.params.t || 'Takeaway', items: [], status: 'open', createdAt: Date.now(), by: Session.user()?.name || Session.role(), byId: Session.user()?.id || null }; S.orders.push(o); }
    return o;
  }
  const o = { id: uid('o'), no: nextBillNo(), table: 'Takeaway', items: [], status: 'open', createdAt: Date.now(), by: Session.user()?.name || Session.role(), byId: Session.user()?.id || null };
  S.orders.push(o); persist(); go('orders', { o: o.id });
  return o;
}
function sellScan(code) {
  const m = menuByCode(code);
  if (m) { const o = sellTarget(); if (o) sellAdd(o, m); else toast('This bill is already paid.'); return; }
  const s = stockByCode(code);
  if (canEditMenu()) return openSheet(linkMenuSheet(code, s));
  toast(`Barcode ${normCode(code)} is not on the menu${s ? ` (it is the stock item ${s.name})` : ''} — ask the owner to add it to a menu item.`);
}
function linkMenuSheet(code, s) {
  const items = S.menu.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `${sheetHead('New barcode', normCode(code))}
    <p class="muted sm">This barcode is not on your menu yet${s ? ` (it belongs to the stock item <b>${esc(s.name)}</b>)` : ''}. Which menu item is it? It is remembered — next time the scan adds it straight to the bill.</p>
    <label class="field"><span>Menu item</span><select id="link-menu"><option value="">Choose…</option>${items.map((m) => `<option value="${m.id}">${esc(m.name)} · ${money(m.price)}</option>`).join('')}</select></label>
    <div class="btn-row">${btn('Link & add to bill', 'linkMenu', { cls: 'primary', ic: 'check', data: `data-code="${esc(normCode(code))}"` })}${btn('New menu item', 'linkMenuNew', { cls: 'ghost', ic: 'plus', data: `data-code="${esc(normCode(code))}"` })}</div>`;
}
/** Camera sheet for selling: every scan adds to the bill; stays open for the next one */
function sellScanSheet() {
  return `${sheetHead('Scan to bill', 'Point the camera at the barcode')}
    <div id="scan-cam" class="scan-cam"><video playsinline muted aria-label="Camera"></video><i class="scan-aim" aria-hidden="true"></i></div>
    <div id="scan-msg" class="scan-msg" role="status" aria-live="polite"></div>
    <p id="sell-scan-msg" class="scan-msg ok" role="status" aria-live="polite"></p>
    <label class="scan-in">${icon('grid')}<input id="scan-in" placeholder="…or type the barcode and press Enter" autocomplete="off" aria-label="Barcode"></label>
    <p class="fine">Have a barcode scanner machine? Just scan — on the Orders or Stock screen. No setup needed.</p>
    <label class="btn ghost sm">${icon('upload')}<span>Take a photo of the barcode instead</span><input type="file" accept="image/*" capture="environment" hidden data-change="scanPhoto"></label>
    <div class="form-actions"><span></span>${btn('Done', 'scanDone', { cls: 'primary' })}</div>`;
}
/** Where a scan goes, from wherever it came (scanner machine, camera, typed) */
function routeScan(raw) {
  const code = normCode(raw); if (!code) return;
  const sheetOpen = !$('#sheet').hidden;
  if (sheetOpen && $('#sheet form[data-form=purchase]')) return handleScan(code);   // receiving stock
  if (sheetOpen && $('#sell-scan-msg')) return sellScan(code);                    // camera / box on "Scan to bill"
  if (sheetOpen) return;                                                           // some other form is open: don't act behind it
  const role = Session.role();
  if (onView('orders') && FLOOR_SELLERS.includes(role)) return sellScan(code);
  if (onView('stock') && typeof seesCost === 'function' && seesCost()) { openSheet(purchaseForm(), { wide: true }); setTimeout(() => handleScan(code), 30); return; }
  const m = menuByCode(code), s = stockByCode(code);
  toast(m ? `Scanned: ${m.name} (${money(m.price)}) — open Orders to add it to a bill` : s ? `Scanned: ${s.name} — open Stock to receive it` : `Scanned ${code} — not on the menu or in stock`);
}

/* The scanner machine: fast key bursts ending with Enter, while nobody is typing in a box */
const Wedge = { buf: '', last: 0, gaps: [] };
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (t && t.id === 'scan-in') return; // the scan box handles itself
  const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  const now = performance.now();
  if (e.key === 'Enter') {
    const fast = Wedge.buf.length >= 4 && Wedge.gaps.length && Wedge.gaps.reduce((a, b) => a + b, 0) / Wedge.gaps.length < 45;
    if (fast && !typing) { e.preventDefault(); e.stopPropagation(); const code = Wedge.buf; Wedge.buf = ''; Wedge.gaps = []; routeScan(code); return; }
    // the menu search box on the order screen: a scanned code there adds the item
    if (t && t.matches && t.matches('[data-input=menuSearch]') && menuByCode(t.value)) { e.preventDefault(); const v = t.value; t.value = ''; App.ui.q = ''; sellScan(v); const g = $('#menu-grid'); if (g) g.innerHTML = menuGrid(); return; }
    Wedge.buf = ''; Wedge.gaps = []; return;
  }
  if (e.key.length !== 1 || typing) { if (typing) { Wedge.buf = ''; Wedge.gaps = []; } return; }
  if (Wedge.buf && now - Wedge.last > 80) { Wedge.buf = ''; Wedge.gaps = []; }
  if (Wedge.buf) Wedge.gaps.push(now - Wedge.last);
  Wedge.buf += e.key; Wedge.last = now;
}, true);

Object.assign(Actions, {
  sellScanOpen() {
    if (!FLOOR_SELLERS.includes(Session.role())) return;
    openSheet(sellScanSheet());
    setTimeout(() => camStart(), 50);
  },
  scanDone() { camStop(); closeSheet(); },
  stockScanOpen() { openSheet(purchaseForm(), { wide: true }); setTimeout(() => { $('#scan-in')?.focus(); }, 60); },
  linkMenu(el) {
    const m = byId(S.menu, $('#link-menu')?.value); const code = normCode(el.dataset.code);
    if (!m) return toast('Choose the menu item first.');
    const other = menuByCode(code); if (other && other !== m) return toast(`That barcode already belongs to ${other.name}.`);
    m.barcode = [...String(m.barcode || '').split(',').map((x) => x.trim()).filter(Boolean), code].join(', ');
    closeSheet(); persist();
    const o = sellTarget(); if (o) sellAdd(o, m);
  },
  linkMenuNew(el) { const code = normCode(el.dataset.code); openSheet(menuForm({ barcode: code }), { wide: true }); },
});

Object.assign(Actions, {
  scanNewAdd(el) {
    const name = String($('#scan-new-name')?.value || '').trim();
    if (!name) { $('#scan-new-name')?.focus(); return scanMsg('Type the product name first.', 'warn'); }
    createScannedStock(normCode(el.dataset.code), { name, unit: /water|bisleri|kinley|aquafina|bottle|cola|soda|juice/i.test(name) ? 'bottles' : 'pcs' });
  },
});
Object.assign(Changes, {
  async scanPhoto(el) {
    const f = el.files && el.files[0]; el.value = ''; if (!f) return;
    scanMsg(`${icon('clock')} Reading the barcode in the photo…`);
    const code = await decodePhoto(f).catch(() => null);
    if (!code) return scanMsg('No barcode found in that photo. Hold the phone 10–15 cm away, keep the bars straight and sharp, and try again — or type the number.', 'warn');
    routeScan(code);
  },
});
