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
  scanMsg(`<div class="scan-new"><span><b>New barcode ${esc(code)}</b> — which stock item is it? It is remembered for next time.</span>
    <div class="row-3"><select id="scan-link-item" aria-label="Stock item"><option value="">Choose…</option>${stockOptions()}</select>
    <input id="scan-link-pack" type="number" min="0" step="any" placeholder="Each scan adds (e.g. 0.5)" aria-label="Each scan adds">
    <button type="button" class="btn primary sm" data-act="scanLink" data-code="${esc(code)}">Link & add</button></div></div>`, 'warn');
}

/* ---------------- camera ---------------- */
const Cam = { stream: null, timer: null, reader: null, last: '', lastAt: 0 };
function loadScript(src) {
  return new Promise((res, rej) => { if ([...document.scripts].some((x) => x.src.endsWith(src))) return res(); const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('Could not load the barcode reader — check the internet and try again.')); document.head.appendChild(sc); });
}
function camHit(code) {
  const c = normCode(code); const now = Date.now();
  if (c === Cam.last && now - Cam.lastAt < 2000) return; // the same pack held in front of the camera
  Cam.last = c; Cam.lastAt = now; handleScan(c);
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
      Cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = Cam.stream; await video.play();
      Cam.timer = setInterval(async () => {
        watch(); if (!Cam.stream || video.readyState < 2) return;
        try { const got = await det.detect(video); if (got[0]?.rawValue) camHit(got[0].rawValue); } catch (e) { /* frame not ready */ }
      }, 250);
    } else {
      scanMsg('Starting the camera…');
      await loadScript('vendor/zxing.min.js');
      Cam.reader = new window.ZXing.BrowserMultiFormatReader();
      await Cam.reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (res) => { if (res) camHit(res.getText()); });
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
  if (e.target && e.target.id === 'scan-in' && e.key === 'Enter') { e.preventDefault(); handleScan(e.target.value); e.target.value = ''; }
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
