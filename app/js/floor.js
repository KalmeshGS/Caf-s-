'use strict';
/* =========================================================
   Orders & billing extras
   6. Table areas (AC, Garden, Party hall…) with seats per table
   7. Move a running table to another table
   8. Your own quick notes + allergy buttons
   9. Bill extras: packing / service charge, split payment, credit
      (pay later), complimentary bill, cancel bill with a reason
  10. Day summary slip (printable)
  11. Veg / non-veg / egg dot and favourite items
   ========================================================= */

/* ---------------- 8. quick notes ---------------- */
const ALLERGY_CHIPS = ['Nut allergy', 'No dairy', 'Gluten free', 'No egg', 'No seafood'];
const noteChips = () => ({
  cook: Array.isArray(S.settings?.notes?.cook) && S.settings.notes.cook.length ? S.settings.notes.cook : NOTE_CHIPS,
  allergy: Array.isArray(S.settings?.notes?.allergy) ? S.settings.notes.allergy : ALLERGY_CHIPS,
});
const hasAllergy = (note) => { const n = String(note || '').toLowerCase(); return noteChips().allergy.some((a) => n.includes(a.toLowerCase())) || /allerg/.test(n); };
const splitList = (v, max = 24) => [...new Set(String(v || '').split(',').map((x) => x.trim().slice(0, 30)).filter(Boolean))].slice(0, max);

/* ---------------- 11. veg / non-veg ---------------- */
const DIETS = { veg: 'Veg', nonveg: 'Non-veg', egg: 'Egg' };
function guessDiet(name) {
  const n = String(name || '').toLowerCase();
  if (/chicken|mutton|lamb|fish|prawn|shrimp|crab|keema|beef|pork|bacon|ham\b|seafood|meat|kabab|kebab|tikka masala|biryani.*(chicken|mutton)/.test(n)) return 'nonveg';
  if (/\begg|omelet|omelette|bhurji/.test(n)) return 'egg';
  return '';
}
const dietOf = (m) => (m && DIETS[m.diet] ? m.diet : guessDiet(m?.name));
const dietDot = (m) => { const d = dietOf(m); return d ? `<i class="diet ${d}" title="${DIETS[d]}" aria-label="${DIETS[d]}"></i>` : ''; };

/* ---------------- 6. areas ---------------- */
/** "1-10, P1-P6, 51A" → ['1'…'10', 'P1'…'P6', '51A'] */
function parseTables(text) {
  const out = [];
  for (const raw of String(text || '').split(',')) {
    const tok = raw.trim().replace(/\s+/g, ' ');
    if (!tok) continue;
    const m = tok.match(/^([A-Za-z]*)\s*(\d+)\s*-\s*([A-Za-z]*)\s*(\d+)$/);
    if (m && (!m[3] || m[3].toLowerCase() === m[1].toLowerCase())) {
      const a = Number(m[2]), b = Number(m[4]);
      if (b < a || b - a > 199) return { error: `"${tok}" — check the range.` };
      for (let i = a; i <= b; i++) out.push(`${m[1]}${i}`);
    } else {
      if (tok.length > 10) return { error: `"${tok}" — table names can be at most 10 characters.` };
      out.push(tok);
    }
  }
  return { tables: out };
}
/** "T1, T2, T3, P1" → "T1-T3, P1" (for the editor) */
function tablesText(list) {
  const parts = []; let run = null;
  const flush = () => { if (run) parts.push(run.a === run.b ? `${run.p}${run.a}` : `${run.p}${run.a}-${run.p}${run.b}`); run = null; };
  list.forEach((t) => {
    const m = String(t).match(/^([A-Za-z]*)(\d+)$/);
    if (m && run && run.p === m[1] && Number(m[2]) === run.b + 1) { run.b += 1; return; }
    flush();
    if (m) run = { p: m[1], a: Number(m[2]), b: Number(m[2]) }; else parts.push(t);
  });
  flush();
  return parts.join(', ');
}
const areaTitle = (a) => a.name || 'Tables';

/* ---------------- Settings → Floor & bills ---------------- */
function areaRow(a = {}) {
  return `<div class="area-row">
    <label class="field"><span>Area</span><input name="ar_name" maxlength="24" value="${esc(a.name || '')}" placeholder="e.g. AC, Garden, Party hall"></label>
    <label class="field"><span>Tables</span><input name="ar_tables" maxlength="200" value="${esc(tablesText(a.tables || []))}" placeholder="e.g. 1-10, P1-P6, 51A"></label>
    <label class="field"><span>Seats each</span><input name="ar_seats" type="number" min="0" max="40" value="${esc(a.seats || '')}" placeholder="4"></label>
    <button type="button" class="icon-btn sm" data-act="areaDel" aria-label="Remove area">${icon('trash')}</button>
  </div>`;
}
function floorSettings() {
  const st = S.settings, c = chargeCfg(), nc = noteChips();
  const areas = Array.isArray(st.areas) && st.areas.length ? st.areas : tableAreas().map((a) => ({ ...a, name: a.name || 'Main' }));
  return `<form class="card form" data-form="floorSettings">
    ${eyebrow('Table areas')}
    <p class="muted sm">Group your tables the way your floor is laid out. Type tables as ranges: <b>1-10</b>, <b>P1-P6</b>, or names like <b>51A</b>, separated by commas.</p>
    <div id="area-rows" class="area-rows">${(areas.length ? areas : [{}]).map(areaRow).join('')}</div>
    <template id="area-tpl">${areaRow()}</template>
    <button type="button" class="btn ghost sm" data-act="areaAdd">${icon('plus')}<span>Add area</span></button>

    ${eyebrow('Charges on the bill')}
    <div class="row-2">
      <label class="field"><span>Packing charge for parcels (${esc(cur().symbol.trim())}) <em>${c.perItem ? 'per item' : 'per order'} · 0 = none</em></span><input name="packing" type="number" min="0" step="any" value="${esc(c.packing || '')}" placeholder="0"></label>
      <label class="field"><span>Service charge % <em>dine-in · optional for the guest</em></span><input name="servicePct" type="number" min="0" max="20" step="0.5" value="${esc(c.servicePct || '')}" placeholder="0"></label>
    </div>
    <p class="fine">The service charge is off on every bill; the cashier ticks it only when the guest agrees (as required in India).</p>

    ${eyebrow('Quick notes for orders')}
    <label class="field"><span>Cooking notes <em>(comma separated)</em></span><textarea name="cook" rows="2">${esc(nc.cook.join(', '))}</textarea></label>
    <label class="field"><span>Allergy notes <em>(shown in red on the kitchen ticket)</em></span><textarea name="allergy" rows="2">${esc(nc.allergy.join(', '))}</textarea></label>
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

/* ---------------- 7. move table ---------------- */
function moveSheet(t) {
  const o = openOrders().find((x) => x.table === t);
  if (!o) return `${sheetHead('Move table', tableTitle(t))}<p class="muted">This table has no running order.</p>`;
  const busy = new Set(openOrders().map((x) => x.table));
  return `${sheetHead('Move table', `${tableTitle(t)} → ?`)}
    <p class="muted sm">The whole order (#${o.no}, ${money(orderSubtotal(o))}) and its kitchen tickets move to the new table.</p>
    ${tableAreas().map((a) => {
      const free = a.tables.filter((x) => x !== t && !busy.has(x));
      return free.length ? `${eyebrow(areaTitle(a))}<div class="chip-row">${free.map((x) => `<button class="chip" data-act="moveTo" data-from="${esc(t)}" data-to="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
    }).join('') || '<p class="muted">No free table right now.</p>'}`;
}

/* ---------------- 9. bill extras ---------------- */
function payOptionsHtml(o) {
  const pm = payMethods(), c = chargeCfg();
  const opts = [...Object.entries(pm).map(([k, m]) => [k, m.label]), ['split', 'Split'], ['credit', 'Credit'], ['comp', 'Free']];
  return `${c.servicePct && !isParcel(o) ? `<label class="check svc"><input type="checkbox" name="service" value="1" data-change="billLive" ${o.service ? 'checked' : ''}><span>Add service charge (${c.servicePct}%) — only if the guest agrees</span></label>` : ''}
    <div class="pay-opts" role="radiogroup" aria-label="Payment">${opts.map(([k, l], i) => `<label class="chip-radio"><input type="radio" name="method" value="${k}" ${i === 1 ? 'checked' : ''} data-change="billLive"><span>${esc(l)}</span></label>`).join('')}</div>
    <div class="pay-x" data-m="split" hidden>
      <div class="row-3">${Object.entries(pm).map(([k, m]) => `<label class="field"><span>${esc(m.label)}</span><input name="s_${k}" type="number" min="0" step="any" inputmode="decimal" data-input="billLive" placeholder="0"></label>`).join('')}</div>
      <p class="muted sm" id="split-left"></p>
    </div>
    <div class="pay-x" data-m="credit" hidden><div class="row-2">
      <label class="field"><span>Customer name</span><input name="cr_name" maxlength="40" autocomplete="off"></label>
      <label class="field"><span>Phone <em>(optional)</em></span><input name="cr_phone" type="tel" inputmode="numeric" maxlength="10" autocomplete="off"></label></div>
      <p class="muted sm">The bill is saved now; collect the money later from <b>Credit to collect</b>.</p></div>
    <div class="pay-x" data-m="comp" hidden><label class="field"><span>Why is it free?</span><input name="comp_reason" maxlength="60" placeholder="e.g. Owner's guest, food complaint, staff meal" autocomplete="off"></label></div>`;
}
/** Recompute the open bill live: discount, service charge, payment type */
function billLive(el) {
  const form = el.form || el.closest('form'); const o = byId(S.orders, App.params.o); if (!form || !o) return;
  const method = form.querySelector('input[name=method]:checked')?.value || 'cash';
  const dIn = form.querySelector('input[name=discount]');
  const err = method === 'comp' ? '' : discountError(dIn?.value, orderSubtotal(o));
  const e = form.querySelector('#form-err'); if (e) e.textContent = err;
  if (dIn) { dIn.setAttribute('aria-invalid', err ? 'true' : 'false'); dIn.disabled = method === 'comp'; }
  form.querySelectorAll('.pay-x').forEach((x) => { x.hidden = x.dataset.m !== method; });
  if (err) return;
  const t = orderTotals(o, num(dIn?.value), { comp: method === 'comp', service: !!form.querySelector('input[name=service]:checked') });
  $('#bill-total').textContent = `Total ${money(t.total)}`; $('#bill-tax').innerHTML = billTaxRowsHtml(t);
  const left = $('#split-left');
  if (left && method === 'split') {
    const got = sum(Object.keys(payMethods()), (k) => num(form.querySelector(`input[name=s_${k}]`)?.value));
    const diff = round2(roundShown(t.total) - got);
    left.textContent = diff > 0 ? `${money(diff, true)} still to split` : diff < 0 ? `${money(-diff, true)} more than the bill` : 'Adds up ✓';
    left.className = `sm ${diff ? 'neg' : 'pos'}`;
  }
}
/** Read the payment part of the bill form. Returns { error } or { method, t, extra } */
function readPayment(o, fd) {
  const method = fd.get('method') || 'cash';
  const t = orderTotals(o, num(fd.get('discount')), { comp: method === 'comp', service: fd.get('service') === '1' });
  const extra = { packingAmt: t.packing, serviceAmt: t.service, charges: t.charges, service: t.service > 0 };
  if (method === 'split') {
    const split = {}; Object.keys(payMethods()).forEach((k) => { const v = num(fd.get(`s_${k}`)); if (v > 0) split[k] = round2(v); });
    const got = round2(sum(Object.values(split)));
    if (Object.keys(split).length < 2) return { error: 'Split: type the amount for at least two ways of paying.' };
    if (Math.abs(got - roundShown(t.total)) > 0.01 && Math.abs(got - t.total) > 0.01) return { error: `Split amounts add up to ${money(got, true)} — the bill is ${money(roundShown(t.total))}.` };
    extra.split = split;
  } else if (method === 'credit') {
    const name = String(fd.get('cr_name') || '').trim(), phone = String(fd.get('cr_phone') || '').replace(/\D/g, '');
    if (!name) return { error: 'Credit: type the customer’s name.' };
    if (phone && phone.length !== 10) return { error: 'Credit: the phone number should have 10 digits.' };
    extra.credit = { name, phone };
  } else if (method === 'comp') {
    const reason = String(fd.get('comp_reason') || '').trim();
    if (!reason) return { error: 'Free bill: type the reason (it is shown to the owner).' };
    extra.compReason = reason;
  }
  return { method, t, extra };
}

/* Credit to collect (Billing) */
function creditCard() {
  const due = paidOrders().filter((o) => o.method === 'credit' && !o.creditPaid).sort((a, b) => a.paidAt - b.paidAt);
  if (!due.length) return '';
  return `<section class="card">${eyebrow('Credit to collect')}
    ${due.map((o) => `<div class="line-row credit-row"><span><strong>${esc(o.credit?.name || 'Customer')}</strong><small class="muted">Bill #${o.no} · ${esc(ago(o.paidAt))}${o.credit?.phone ? ` · ${esc(o.credit.phone)}` : ''}</small></span><b>${money(o.total)}</b>${btn('Collected', 'creditOpen', { cls: 'ghost sm', data: `data-id="${o.id}"` })}</div>`).join('')}
    <div class="line-row total"><span>Total to collect</span><b class="neg">${money(sum(due, (o) => o.total))}</b></div></section>`;
}
function creditSheet(o) {
  return `${sheetHead('Credit', `${o.credit?.name || 'Customer'} · ${money(o.total)}`)}
  <form data-form="creditCollect" class="form"><input type="hidden" name="id" value="${o.id}">
    <p class="muted sm">Bill #${o.no} from ${fmtDate(new Date(o.paidAt))}. How did they pay?</p>
    <div class="seg">${Object.entries(payMethods()).map(([k, m], i) => `<label><input type="radio" name="method" value="${k}" ${i === 1 ? 'checked' : ''}><span>${esc(m.label)}</span></label>`).join('')}</div>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Mark collected</button></div></form>`;
}
function cancelSheet(o) {
  return `${sheetHead('Cancel bill', `${orderLabel(o)} · #${o.no}`)}
  <form data-form="billCancel" class="form"><input type="hidden" name="id" value="${o.id}">
    <p class="muted sm">The bill (${money(orderSubtotal(o))}) is kept as <b>cancelled</b> and shown to the owner in the Leakage check. Kitchen tickets not yet started are removed.</p>
    <div class="chip-row">${['Customer left', 'Wrong order', 'Food complaint', 'Duplicate bill', 'Test bill'].map((r) => `<label class="chip-radio"><input type="radio" name="why" value="${r}"><span>${r}</span></label>`).join('')}</div>
    <label class="field"><span>Reason</span><input name="reason" maxlength="80" placeholder="Choose above or type…" autocomplete="off"></label>
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions"><span></span><button class="btn danger" type="submit">Cancel this bill</button></div></form>`;
}

/* ---------------- 10. day summary slip ---------------- */
function daySummaryHtml(dk = dayKey()) {
  const st = S.settings;
  const paid = paidOn(dk).sort((a, b) => a.no - b.no);
  const real = paid.filter((o) => o.method !== 'comp');
  const comp = paid.filter((o) => o.method === 'comp');
  const cancelled = S.orders.filter((o) => o.status === 'cancelled' && dayKey(o.cancelledAt || o.createdAt) === dk);
  const T = (f) => round2(sum(real, f));
  const subT = T((o) => o.subtotal ?? orderSubtotal(o)), disc = T((o) => o.discount || 0), tax = T((o) => o.tax || 0);
  const pack = T((o) => o.packingAmt || 0), svc = T((o) => o.serviceAmt || 0), grand = T((o) => o.total || 0);
  const ro = round2(sum(real, (o) => roundShown(o.total) - o.total));
  const bm = byMethod(paid), pm = payMethods();
  const split = st.taxProfile?.food?.split === 'CGST_SGST';
  const r = (k, v, b = '') => `<div class="r ${b}"><span>${esc(k)}</span><span>${typeof v === 'number' ? money(v, true) : esc(v)}</span></div>`;
  return `<div class="receipt summary">
    <h2>${esc(st.name)}</h2><p><b>Sales summary</b><br>${esc(fmtDate(keyToDate(dk), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</p><hr>
    ${r('Bills', String(real.length))}${real.length ? r('Bill nos.', `${real[0].no} – ${real[real.length - 1].no}`) : ''}
    ${r('Sub total', subT)}${r('Discount', -disc)}${pack ? r('Packing charge', pack) : ''}${svc ? r('Service charge', svc) : ''}
    ${split ? r('CGST', round2(tax / 2)) + r('SGST', round2(tax - round2(tax / 2))) : r('Tax', tax)}
    ${ro ? r('Round off', ro) : ''}${r('Grand total', roundShown(grand + ro), 'b')}${r('Net sales', round2(subT - disc), 'b')}<hr>
    <p><b>Payments</b></p>${Object.entries(pm).map(([k, m]) => r(m.label, bm[k] || 0)).join('')}${bm.credit ? r('Credit (to collect)', bm.credit) : ''}<hr>
    ${r('Complimentary', `${comp.length} · ${money(sum(comp, (o) => o.subtotal || 0))}`)}
    ${r('Cancelled', `${cancelled.length} · ${money(sum(cancelled, orderSubtotal))}`)}
    ${r('Discounted bills', String(real.filter((o) => o.discount > 0).length))}<hr>
    <p>Printed ${esc(new Date().toLocaleString())}${Session.user()?.name ? ` · ${esc(Session.user().name)}` : ''}</p></div>`;
}

/* ---------------- actions & forms ---------------- */
Object.assign(Actions, {
  areaAdd() { const t = $('#area-tpl'), box = $('#area-rows'); if (t && box) box.insertAdjacentHTML('beforeend', t.innerHTML); },
  areaDel(el) { const row = el.closest('.area-row'), box = $('#area-rows'); if (row && box.children.length > 1) row.remove(); else if (row) row.querySelectorAll('input').forEach((i) => { i.value = ''; }); },
  moveOpen(el) { openSheet(moveSheet(el.dataset.t)); },
  moveTo(el) {
    const from = el.dataset.from, to = el.dataset.to;
    const o = openOrders().find((x) => x.table === from); if (!o) return closeSheet();
    if (openOrders().some((x) => x.table === to)) return toast(`${tableTitle(to)} is not free any more.`);
    o.table = to;
    S.kots.forEach((k) => { if (k.orderId === o.id && k.status !== 'served') { k.table = to; k.movedFrom = from; k.updatedAt = Date.now(); } });
    audit('moved', { no: o.no, from, to, amount: 0 });
    closeSheet(); save(); toast(`Moved to ${tableTitle(to)} ✓`);
  },
  creditOpen(el) { const o = byId(S.orders, el.dataset.id); if (o) openSheet(creditSheet(o)); },
  billCancelOpen(el) { const o = byId(S.orders, el.dataset.id); if (o && o.status === 'open') openSheet(cancelSheet(o)); },
  daySummary() { printBill(daySummaryHtml(dayKey())); },
  menuFav(el) { const m = byId(S.menu, el.dataset.id); if (m) { m.fav = !m.fav; save(); } },
});
Object.assign(Changes, { billLive(el) { billLive(el); } });
Object.assign(Inputs, { billLive(el) { billLive(el); } });
Object.assign(Forms, {
  floorSettings(fd) {
    const names = fd.getAll('ar_name'), lists = fd.getAll('ar_tables'), seats = fd.getAll('ar_seats');
    const areas = [], seen = new Set();
    for (let i = 0; i < names.length; i++) {
      const name = String(names[i] || '').trim(), text = String(lists[i] || '').trim();
      if (!name && !text) continue;
      const p = parseTables(text);
      if (p.error) return formError(`${name || 'Area ' + (i + 1)}: ${p.error}`);
      if (!p.tables.length) return formError(`${name || 'Area ' + (i + 1)}: type its tables, e.g. 1-10.`);
      for (const t of p.tables) { if (seen.has(t.toLowerCase())) return formError(`Table "${t}" is listed twice — every table needs its own name.`); seen.add(t.toLowerCase()); }
      areas.push({ id: uid('ar'), name: name || `Area ${areas.length + 1}`, tables: p.tables, seats: clamp(num(seats[i]), 0, 40) });
    }
    const total = sum(areas, (a) => a.tables.length);
    if (total > 300) return formError('That is more than 300 tables — please check the ranges.');
    const busy = openOrders().filter((o) => o.table !== 'Takeaway' && !areas.some((a) => a.tables.includes(o.table)));
    if (busy.length) return formError(`${busy.map((o) => o.table).join(', ')} still ${busy.length === 1 ? 'has a running order' : 'have running orders'} — keep ${busy.length === 1 ? 'that table' : 'those tables'} in the list, or bill / move ${busy.length === 1 ? 'it' : 'them'} first.`);
    const packing = num(fd.get('packing')), servicePct = num(fd.get('servicePct'));
    if (!(packing >= 0) || packing > 10000) return formError('Check the packing charge.');
    if (!(servicePct >= 0) || servicePct > 20) return formError('Service charge should be between 0 and 20%.');
    Object.assign(S.settings, { areas, tables: total, charges: { packing: round2(packing), servicePct }, notes: { cook: splitList(fd.get('cook')), allergy: splitList(fd.get('allergy')) } });
    save(); toast('Floor & bills saved');
  },
  creditCollect(fd) {
    const o = byId(S.orders, fd.get('id')); if (!o || o.method !== 'credit') return closeSheet();
    o.creditPaid = { at: Date.now(), method: fd.get('method') || 'cash', by: Session.user()?.name || '' };
    closeSheet(); save(); toast(`Collected ${money(o.total)} from ${o.credit?.name || 'customer'} ✓`);
  },
  billCancel(fd) {
    const o = byId(S.orders, fd.get('id')); if (!o || o.status !== 'open') return closeSheet();
    const reason = String(fd.get('reason') || '').trim() || String(fd.get('why') || '').trim();
    if (!reason) return formError('Please choose or type the reason.');
    const amount = orderSubtotal(o);
    S.kots = S.kots.filter((k) => !(k.orderId === o.id && k.status === 'new'));
    Object.assign(o, { status: 'cancelled', cancelledAt: Date.now(), cancelReason: reason, cancelledBy: Session.user()?.name || '' });
    audit('cancelled', { no: o.no, table: o.table, amount, reason });
    closeSheet(); save(); go('billing'); toast(`Bill #${o.no} cancelled`);
  },
});
