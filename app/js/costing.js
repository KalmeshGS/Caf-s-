'use strict';
/* =========================================================
   Stock & profit
   1. Food costing — what each dish costs to make vs its price
   2. Stock value — quantity × average purchase price
   3. Wastage + stock movement (bought · used · wasted · corrected)
   4. Purchases from suppliers — stock up, average cost, vendor dues
   5. Leakage check — money that slipped away (discounts, food taken
      back from the kitchen, bills lowered after printing, reprints,
      food sent but never billed, waste, missing stock)
   Records: S.stockLog (purchases, waste, corrections) · S.audit (leakage events)
   ========================================================= */

const WASTE_REASONS = ['Spoiled', 'Expired', 'Burnt / spilled', 'Returned by guest', 'Order not collected', 'Donated', 'Staff meal', 'Other'];
const COST_ROLES = ['owner', 'manager'];
const FOOD_FATE_LABEL = { wasted: 'Wasted', donated: 'Donated', staff: 'Staff meal' };
const seesCost = () => COST_ROLES.includes(Session.role());
const unitCost = (s) => (s && Number(s.cost) > 0 ? Number(s.cost) : 0);
const stockValue = (s) => Math.max(0, Number(s.qty) || 0) * unitCost(s);
const qtyText = (q, unit) => `${+Number(q).toFixed(3)} ${unit || ''}`.trim();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/* ---------------- 1. food costing ---------------- */
/** Cost of one serving: { cost, missing: [stock names without a price], known } */
function dishCost(m) {
  const out = { cost: 0, missing: [], known: !!(m && m.recipe && m.recipe.length) };
  (m?.recipe || []).forEach((r) => {
    const s = byId(S.stock, r.stockId);
    if (!s) return;
    if (!unitCost(s)) { out.missing.push(s.name); return; }
    out.cost += r.qty * unitCost(s);
  });
  out.cost = round2(out.cost);
  return out;
}
/** Food cost as % of price: ≤35% is healthy for most kitchens */
function costBand(costPct) { return costPct <= 35 ? 'ok' : costPct <= 50 ? 'warm' : 'neg'; }
function costLine(m) {
  if (!seesCost()) return '';
  const c = dishCost(m);
  if (!c.known) return '';
  if (c.missing.length && !c.cost) return `<small class="muted cost-sum">Cost: add the purchase price of ${esc(c.missing.slice(0, 2).join(', '))}${c.missing.length > 2 ? '…' : ''} in Stock</small>`;
  const fc = pct(c.cost, m.price);
  return `<small class="cost-sum"><span class="cost-pill ${costBand(fc)}">Cost ${money(c.cost, true)} · ${fc}% food cost</span> profit ${money(Math.max(0, m.price - c.cost), true)}${c.missing.length ? ` <span class="muted">(without ${esc(c.missing.join(', '))})</span>` : ''}</small>`;
}
/** What the food in a bill cost to make */
const billFoodCost = (o) => round2(sum(o.items || [], (l) => {
  const m = byId(S.menu, l.menuId) || S.menu.find((x) => x.name === l.name);
  return m ? dishCost(m).cost * l.qty : 0;
}));
function billProfitLine(o) {
  if (!seesCost() || o.status !== 'paid') return '';
  const fc = billFoodCost(o);
  if (!fc) return '';
  const net = (o.subtotal ?? orderSubtotal(o)) - (o.discount || 0);
  return `<p class="fine bill-profit">Food cost ${money(fc)} · profit on food ${money(net - fc)} (${pct(net - fc, net)}%)</p>`;
}

/* ---------------- what the kitchen used (from sales) ---------------- */
/** Stock used by the food sold in these bills: { stockId: qty } */
function usedBySales(orders) {
  const use = {};
  orders.forEach((o) => (o.items || []).forEach((l) => {
    const m = byId(S.menu, l.menuId) || S.menu.find((x) => x.name === l.name);
    (m?.recipe || []).forEach((r) => { use[r.stockId] = r6((use[r.stockId] || 0) + r.qty * l.qty); });
  }));
  return use;
}
/** A month key ("2026-11") or a period { from, to } → { from, to } */
const asRange = (x) => (typeof x === 'string' ? { from: `${x}-01`, to: `${x}-31`, month: x } : x);
const inRng = (dk, r) => !!dk && dk >= r.from && dk <= r.to;
const logsInMonth = (mk, type) => { const r = asRange(mk); return (S.stockLog || []).filter((x) => inRng(String(x.date || ''), r) && (!type || x.type === type)); };
const paidIn = (x) => { const r = asRange(x); return paidOrders().filter((o) => inRng(dayKey(o.paidAt), r)); };

/** Stock movement for a month, per item */
function stockMovement(mk) {
  const rows = new Map(S.stock.map((s) => [s.id, { s, bought: 0, boughtAmt: 0, used: 0, waste: 0, fix: 0 }]));
  logsInMonth(mk, 'purchase').forEach((p) => (p.lines || []).forEach((l) => { const r = rows.get(l.stockId); if (r) { r.bought += Number(l.qty) || 0; r.boughtAmt += Number(l.amount) || 0; } }));
  logsInMonth(mk, 'waste').forEach((w) => { const r = rows.get(w.stockId); if (r) r.waste += Number(w.qty) || 0; });
  logsInMonth(mk, 'count').forEach((c) => { const r = rows.get(c.stockId); if (r) r.fix += Number(c.qty) || 0; });
  Object.entries(usedBySales(paidIn(mk))).forEach(([id, q]) => { const r = rows.get(id); if (r) r.used += q; });
  return [...rows.values()];
}

/* ---------------- records ---------------- */
function addLog(entry) {
  S.stockLog = S.stockLog || [];
  S.stockLog.push({ id: uid('sl'), date: dayKey(), at: Date.now(), by: Session.user()?.name || ROLES[Session.role()]?.label || '', ...entry });
}
/** Manual stock corrections (+/− buttons, editing "in stock now") add up in one record per item per day */
function logCorrection(s, diff) {
  if (!s || !diff) return;
  S.stockLog = S.stockLog || [];
  const id = `fix-${dayKey()}-${s.id}`;
  let e = S.stockLog.find((x) => x.id === id);
  if (!e) { e = { id, type: 'count', date: dayKey(), at: Date.now(), stockId: s.id, name: s.name, unit: s.unit, qty: 0 }; S.stockLog.push(e); }
  e.qty = r6(e.qty + diff); e.cost = unitCost(s); e.amount = round2(e.qty * unitCost(s)); e.at = Date.now();
  e.by = Session.user()?.name || ROLES[Session.role()]?.label || '';
}
/** A leakage event: who did what to which bill */
function audit(type, d = {}) {
  S.audit = S.audit || [];
  const cut = shiftDay(dayKey(), -92);
  if (!Cloud?.attached) S.audit = S.audit.filter((x) => x.date >= cut); // offline: keep 3 months
  S.audit.push({ id: uid('a'), type, at: Date.now(), date: dayKey(), by: Session.user()?.name || ROLES[Session.role()]?.label || '', byId: Session.user()?.id || null, ...d });
}

/* ---------------- 5. leakage check ---------------- */
function leakage(mk) {
  const rr = asRange(mk);
  const paid = paidIn(rr);
  const ev = (S.audit || []).filter((x) => inRng(String(x.date || ''), rr));
  const disc = paid.filter((o) => (o.discount || 0) > 0 && o.method !== 'comp');
  const stale = inRng(dayKey(), rr) ? S.orders.filter((o) => o.status === 'open' && o.items.some((l) => l.sent > 0) && Date.now() - o.createdAt > 4 * 3600e3) : [];
  const staleAmt = (o) => round2(sum(o.items, (l) => Math.min(l.sent, l.qty) * l.price));
  const waste = logsInMonth(mk, 'waste');
  const missing = logsInMonth(mk, 'count').filter((c) => c.qty < 0);
  // Reprints: the first receipt of a bill is normal (unless it was already printed when paid); later ones are extra copies
  const byBill = {};
  ev.filter((x) => x.type === 'reprint').sort((a, b) => a.at - b.at).forEach((x) => { (byBill[x.orderId || x.no] = byBill[x.orderId || x.no] || []).push(x); });
  const reprints = Object.values(byBill).flatMap((list) => {
    const o = byId(S.orders, list[0].orderId) || S.orders.find((y) => y.no === list[0].no);
    return list.slice(o && o.receiptPrinted ? 0 : 1);
  });
  const groups = [
    { k: 'unbilled', title: 'Food sent to the kitchen, bill still open after 4 hours', hint: 'Served but not paid yet — or never billed.', items: stale.map((o) => ({ when: o.createdAt, who: o.by, what: `${orderLabel(o)} · bill #${o.no}`, amt: staleAmt(o) })) },
    { k: 'lowered', title: 'Bill printed, then made smaller before payment', hint: 'Guest saw one amount, a lower one was collected.', items: ev.filter((x) => x.type === 'lowered').map((x) => ({ when: x.at, who: x.by, what: `Bill #${x.no} · ${money(x.printed)} → ${money(x.paid)}`, amt: x.amount })) },
    { k: 'pulled', title: 'Items taken back after sending to the kitchen', hint: 'Removed before cooking started — check they were really not served.', items: ev.filter((x) => x.type === 'pulled').map((x) => ({ when: x.at, who: x.by, what: `${x.qty}× ${x.item} · bill #${x.no}`, amt: x.amount })) },
    { k: 'cancelled', title: 'Bills cancelled', hint: 'Cancelled with a reason — check the food was not served.', items: ev.filter((x) => x.type === 'cancelled').map((x) => ({ when: x.at, who: x.by, what: `Bill #${x.no}${x.table ? ` · ${x.table}` : ''} · ${x.reason || ''}`, amt: x.amount || 0 })) },
    { k: 'comp', title: 'Free (complimentary) bills', hint: 'Food given without payment.', items: ev.filter((x) => x.type === 'comp').map((x) => ({ when: x.at, who: x.by, what: `Bill #${x.no} · ${x.reason || ''}`, amt: x.amount || 0 })) },
    { k: 'discount', title: 'Discounts given', hint: 'Every rupee off a bill.', items: disc.map((o) => ({ when: o.paidAt, who: o.by, what: `${orderLabel(o)} · bill #${o.no}`, amt: o.discount })) },
    { k: 'reprint', title: 'Receipts printed again after payment', hint: 'A second copy can be reused for a cash sale.', items: reprints.map((x) => ({ when: x.at, who: x.by, what: `Bill #${x.no} · ${money(x.total)}`, amt: 0 })) },
    { k: 'unclaimed', title: 'Food cooked but not collected', hint: 'Wasted, donated or eaten by staff — at menu price.', items: ev.filter((x) => x.type === 'unclaimed').map((x) => ({ when: x.at, who: x.by, what: `${x.token ? `Token ${x.token}` : `Bill #${x.no}`} · ${x.items || ''} · ${FOOD_FATE_LABEL[x.fate] || x.fate || ''}`, amt: x.amount || 0 })) },
    { k: 'waste', title: 'Wasted stock', hint: 'Recorded on the Stock or Kitchen screen.', items: waste.map((w) => ({ when: w.at, who: w.by, what: `${qtyText(w.qty, w.unit)} ${w.name} · ${w.reason || ''}`, amt: w.amount || 0 })) },
    { k: 'missing', title: 'Stock missing when counted', hint: 'Less in the store than the app expected.', items: missing.map((c) => ({ when: c.at, who: c.by, what: `${qtyText(-c.qty, c.unit)} ${c.name}`, amt: Math.abs(c.amount || 0) })) },
  ];
  groups.forEach((g) => { g.amt = round2(sum(g.items, (i) => i.amt || 0)); g.items.sort((a, b) => b.when - a.when); });
  return groups;
}
function leakageCard(mk) {
  const groups = leakage(mk);
  const total = round2(sum(groups, (g) => g.amt));
  return `<section class="card leak-card">${eyebrow('Leakage check')}
    <div class="leak-total"><b class="${total ? 'neg' : ''}">${money(total)}</b><span class="muted sm">may have slipped away in this period — tap a line to see each case</span></div>
    ${groups.map((g) => `<details class="leak-g ${g.items.length ? '' : 'none'}"><summary><span><strong>${esc(g.title)}</strong><small class="muted">${esc(g.hint)}</small></span><b>${g.items.length}${g.amt ? ` · ${money(g.amt)}` : ''}</b></summary>
      ${g.items.length ? `<div class="list compact">${g.items.slice(0, 30).map((i) => `<div class="line-row leak-i"><span>${esc(i.what)}<small class="muted">${fmtDate(new Date(i.when), { day: 'numeric', month: 'short' })} ${fmtTime(i.when)}${i.who ? ` · ${esc(i.who)}` : ''}</small></span><b>${i.amt ? money(i.amt) : ''}</b></div>`).join('')}</div>` : '<p class="muted sm">Nothing in this period.</p>'}
    </details>`).join('')}
  </section>`;
}

/* ---------------- Reports: food costing card ---------------- */
function foodCostCard(mk) {
  const paid = paidIn(mk);
  const sales = sum(paid, (o) => (o.subtotal ?? orderSubtotal(o)) - (o.discount || 0));
  const fc = round2(sum(paid, billFoodCost));
  const dishes = S.menu.filter((m) => m.recipe && m.recipe.length).map((m) => ({ m, c: dishCost(m) })).filter((x) => x.c.cost > 0 && x.m.price > 0)
    .map((x) => ({ ...x, p: pct(x.c.cost, x.m.price) })).sort((a, b) => b.p - a.p);
  const noPrice = S.stock.filter((s) => !unitCost(s) && S.menu.some((m) => (m.recipe || []).some((r) => r.stockId === s.id)));
  return `<section class="card">${eyebrow('Food costing')}
    <div class="kpis mini">${kpi('Food cost of sales', money(fc), sales ? `${pct(fc, sales)}% of food sales` : '—')}${kpi('Profit on food', money(Math.max(0, sales - fc)), sales ? `${pct(sales - fc, sales)}% margin` : '—')}</div>
    ${noPrice.length ? `<div class="banner info">${icon('box')}<span>Add the purchase price of ${pl(noPrice.length, 'stock item')} (${esc(noPrice.slice(0, 4).map((s) => s.name).join(', '))}${noPrice.length > 4 ? '…' : ''}) — or record a purchase — so every dish gets a cost.</span>${can('stock') ? '<a class="btn ghost sm" href="#/stock">Stock</a>' : ''}</div>` : ''}
    ${dishes.length ? `<p class="muted sm">Highest food cost first. Under 35% is healthy; above 50% needs a price or recipe review.</p>
      ${dishes.slice(0, 12).map((x) => `<div class="meter-row cost-row"><span>${esc(x.m.name)}<small class="muted">${money(x.c.cost, true)} of ${money(x.m.price)}</small></span>${meter(Math.min(100, x.p), `var(--${x.p <= 35 ? 'ok' : x.p <= 50 ? 'amber' : 'danger'})`)}<b class="${costBand(x.p) === 'neg' ? 'neg' : ''}">${x.p}%</b></div>`).join('')}`
      : empty('Dishes get a cost once their ingredients have a purchase price.')}
  </section>`;
}

/* ---------------- Stock screen extras ---------------- */
function stockKpis() {
  if (!seesCost()) return '';
  const mk = monthKey();
  const value = round2(sum(S.stock, stockValue));
  const bought = round2(sum(logsInMonth(mk, 'purchase'), (p) => p.total || 0));
  const wasted = round2(sum(logsInMonth(mk, 'waste'), (w) => w.amount || 0));
  const noCost = S.stock.filter((s) => !unitCost(s)).length;
  const tap = (act, html) => `<button type="button" class="kpi-tap" data-act="${act}" aria-label="Show details">${html}</button>`;
  return `<div class="kpis three">
    ${kpi('Stock value now', money(value), noCost ? `${pl(noCost, 'item')} without a price` : 'at average purchase price')}
    ${tap('purchaseList', kpi('Bought this month', money(bought), `${pl(logsInMonth(mk, 'purchase').length, 'purchase')} · tap to see`))}
    ${tap('wasteList', kpi('Wasted this month', money(wasted), `${pl(logsInMonth(mk, 'waste').length, 'entry', 'entries')} · tap to see`, wasted ? 'neg' : ''))}
  </div>`;
}
function stockRowValue(s) {
  if (!seesCost()) return '';
  return unitCost(s) ? ` · ${money(unitCost(s))}/${esc(s.unit)} · worth <b>${money(stockValue(s))}</b>` : ' · <span class="warn-t">no purchase price yet</span>';
}
function movementCard(mk) {
  const rows = stockMovement(mk).filter((r) => r.bought || r.used || r.waste || r.fix || Number(r.s.qty));
  const v = (q, s) => (unitCost(s) ? money(q * unitCost(s)) : '');
  const T = (k) => round2(sum(rows, (r) => r[k] * unitCost(r.s)));
  return `${monthNav(mk)}
  <div class="kpis">${kpi('Bought', money(round2(sum(rows, (r) => r.boughtAmt))), 'purchases recorded')}${kpi('Used in dishes', money(T('used')), 'from bills × recipes')}${kpi('Wasted', money(T('waste')), '', 'neg')}${kpi('Corrections', money(T('fix')), 'counted vs expected', T('fix') < 0 ? 'neg' : '')}</div>
  <section class="card"><div class="tbl-wrap"><table class="tbl mv">
    <thead><tr><th>Item</th><th>Start*</th><th>Bought</th><th>Used</th><th>Wasted</th><th>Corrected</th><th>Now</th></tr></thead>
    <tbody>${rows.length ? rows.map((r) => {
      const now = Number(r.s.qty) || 0;
      const start = r6(now - r.bought + r.used + r.waste - r.fix);
      const cell = (q, cls = '') => `<td class="${cls}">${q ? esc(+q.toFixed(3)) : '—'}<small>${q ? v(q, r.s) : ''}</small></td>`;
      return `<tr><th>${esc(r.s.name)}<small>${esc(r.s.unit)}</small></th>${cell(start)}${cell(r.bought)}${cell(r.used)}${cell(r.waste, r.waste ? 'neg' : '')}${cell(r.fix, r.fix < 0 ? 'neg' : '')}${cell(now)}</tr>`;
    }).join('') : `<tr><td colspan="7">${empty('No stock movement this month.')}</td></tr>`}</tbody>
  </table></div>
  <p class="fine">*Start is worked out: now − bought + used + wasted − corrections. "Used" comes from bills and each dish's ingredients.</p></section>`;
}

/* ---------------- sheets ---------------- */
const stockOptions = (sel) => S.stock.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)} (${esc(s.unit)})</option>`).join('');
function purchaseRow() {
  return `<div class="pur-row">
    <label class="field"><span>Item</span><select name="p_item" required><option value="">Choose…</option>${stockOptions()}</select></label>
    <label class="field"><span>Quantity</span><input name="p_qty" type="number" step="any" min="0" inputmode="decimal" placeholder="e.g. 10"></label>
    <label class="field"><span>Total ₹</span><input name="p_amt" type="number" step="any" min="0" inputmode="decimal" placeholder="e.g. 560"></label>
    <button type="button" class="icon-btn sm" data-act="purRowDel" aria-label="Remove row">${icon('trash')}</button>
  </div>`;
}
function purchaseForm() {
  if (!S.stock.length) return `${sheetHead('Stock', 'New purchase')}<p class="muted">Add your stock items first, then record what you buy.</p>`;
  return `${sheetHead('Stock', 'New purchase')}
  <form data-form="purchase" class="form">
    <div class="row-2">
      <label class="field"><span>Bought from</span><select name="vendor"><option value="">Market (cash)</option>${S.vendors.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Bill / invoice no. <em>(optional)</em></span><input name="invoice" maxlength="30" autocomplete="off"></label>
    </div>
    <div class="row-2">
      <label class="field"><span>Date</span><input name="date" type="date" value="${dayKey()}" max="${dayKey()}" required></label>
      <div class="field"><span>Payment</span><div class="seg"><label><input type="radio" name="paid" value="1" checked><span>Paid now</span></label><label><input type="radio" name="paid" value="0"><span>Pay later</span></label></div></div>
    </div>
    ${typeof scanBarHtml === 'function' ? scanBarHtml() : ''}
    <div id="pur-rows" class="pur-rows">${purchaseRow()}</div>
    <template id="pur-tpl">${purchaseRow()}</template>
    <button type="button" class="btn ghost sm" data-act="purRowAdd">${icon('plus')}<span>Another item</span></button>
    <p class="fine">Stock goes up and each item's average purchase price is updated. "Pay later" adds the amount to the supplier's dues.</p>
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Save purchase</button></div>
  </form>`;
}
function wasteForm(stockId) {
  if (!S.stock.length) return `${sheetHead('Stock', 'Record wastage')}<p class="muted">No stock items yet.</p>`;
  return `${sheetHead('Stock', 'Record wastage')}
  <form data-form="waste" class="form">
    <label class="field"><span>Item</span><select name="item" required><option value="">Choose…</option>${stockOptions(stockId)}</select></label>
    <div class="row-2">
      <label class="field"><span>How much was wasted</span><input name="qty" type="number" step="any" min="0" required inputmode="decimal"></label>
      <label class="field"><span>Why</span><select name="reason">${WASTE_REASONS.map((r) => `<option>${r}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Note <em>(optional)</em></span><input name="note" maxlength="80"></label>
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

/* ---------------- actions & forms ---------------- */
/** Purchases / wastage recorded this month (tap the cards on the Stock screen) */
function purchaseListSheet() {
  const list = logsInMonth(monthKey(), 'purchase').sort((a, b) => b.at - a.at);
  return `${sheetHead('Stock', `Bought this month · ${money(sum(list, (p) => p.total || 0))}`)}
    <p class="muted sm">Every purchase recorded with the <b>Purchase</b> button in ${esc(monthLabel(monthKey()))}: supplier bills and market buys. They also show in Expenses${list.some((p) => !p.paid) ? ' and unpaid ones in Vendors (dues)' : ''}.</p>
    ${list.length ? list.map((p) => `<div class="card pur-card"><div class="line-row"><span><strong>${esc(p.vendorName || 'Market')}</strong><small class="muted">${fmtDate(keyToDate(p.date), { day: 'numeric', month: 'short' })}${p.invoice ? ` · Invoice ${esc(p.invoice)}` : ''} · ${p.paid ? 'Paid' : '<b class="neg">Pay later</b>'}${p.by ? ` · ${esc(p.by)}` : ''}</small></span><b>${money(p.total || 0)}</b></div>
      ${(p.lines || []).map((l) => `<div class="line-row sm"><span>${esc(l.name)} · ${esc(qtyText(l.qty, l.unit))}</span><span>${money(l.amount || 0)}</span></div>`).join('')}</div>`).join('')
    : empty('No purchases recorded this month yet.', can('stock') ? btn('Record a purchase', 'purchaseOpen', { cls: 'primary', ic: 'download' }) : '')}`;
}
function wasteListSheet() {
  const list = logsInMonth(monthKey(), 'waste').sort((a, b) => b.at - a.at);
  return `${sheetHead('Stock', `Wasted this month · ${money(sum(list, (w) => w.amount || 0))}`)}
    ${list.length ? `<div class="list compact">${list.map((w) => `<div class="line-row"><span><strong>${esc(qtyText(w.qty, w.unit))} ${esc(w.name)}</strong><small class="muted">${fmtDate(keyToDate(w.date), { day: 'numeric', month: 'short' })} · ${esc(w.reason || '')}${w.by ? ` · ${esc(w.by)}` : ''}</small></span><b class="neg">${money(w.amount || 0)}</b></div>`).join('')}</div>`
    : empty('No wastage recorded this month.')}`;
}

Object.assign(Actions, {
  purchaseList() { openSheet(purchaseListSheet(), { wide: true }); },
  wasteList() { openSheet(wasteListSheet()); },
  purchaseOpen() { openSheet(purchaseForm(), { wide: true }); },
  wasteOpen(el) { openSheet(wasteForm(el?.dataset?.id)); },
  purRowAdd() { const t = $('#pur-tpl'), box = $('#pur-rows'); if (t && box) box.insertAdjacentHTML('beforeend', t.innerHTML); },
  purRowDel(el) { const row = el.closest('.pur-row'), box = $('#pur-rows'); if (row && box.children.length > 1) row.remove(); },
});
Object.assign(Forms, {
  purchase(fd) {
    const items = fd.getAll('p_item'), qtys = fd.getAll('p_qty'), amts = fd.getAll('p_amt');
    const lines = [];
    for (let i = 0; i < items.length; i++) {
      if (!items[i] && !qtys[i] && !amts[i]) continue;
      const s = byId(S.stock, items[i]); const q = num(qtys[i]), a = num(amts[i]);
      if (!s) return formError(`Row ${i + 1}: choose the item.`);
      if (!(q > 0)) return formError(`${s.name}: type how much you bought.`);
      if (!(a >= 0) || a > MAX_AMOUNT || q > MAX_AMOUNT) return formError(`${s.name}: check the numbers.`);
      lines.push({ s, q, a });
    }
    if (!lines.length) return formError('Add at least one item.');
    const v = byId(S.vendors, fd.get('vendor'));
    const paid = fd.get('paid') !== '0';
    if (!paid && !v) return formError('"Pay later" needs a supplier — choose who you bought from.');
    const date = fd.get('date') || dayKey(), invoice = String(fd.get('invoice') || '').trim();
    const total = round2(sum(lines, (l) => l.a));
    lines.forEach(({ s, q, a }) => {
      const have = Math.max(0, Number(s.qty) || 0);
      // average purchase price: what is already in the store + what just came in
      s.cost = a > 0 ? r6(unitCost(s) && have ? (have * unitCost(s) + a) / (have + q) : a / q) : s.cost;
      s.qty = r6(have + q);
    });
    const id = uid('pu');
    S.stockLog = S.stockLog || [];
    S.stockLog.push({ id, type: 'purchase', date, at: Date.now(), by: Session.user()?.name || ROLES[Session.role()]?.label || '', vendorId: v?.id || null, vendorName: v?.name || 'Market', invoice, paid, total, lines: lines.map(({ s, q, a }) => ({ stockId: s.id, name: s.name, unit: s.unit, qty: q, amount: a })) });
    if (total > 0) {
      const title = `Purchase · ${v ? v.name : 'market'}${invoice ? ` · ${invoice}` : ''}`;
      S.expenses.push({ id: uid('e'), date, cat: v ? 'Vendor' : 'Kitchen', title, amount: total, vendorId: v?.id || undefined, purchaseId: id });
      if (v) {
        S.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'bill', amount: total, date, note: invoice ? `Invoice ${invoice}` : 'Purchase', purchaseId: id });
        if (paid) S.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'payment', amount: total, date, method: 'cash', note: 'Paid at purchase' });
        else v.due = round2((Number(v.due) || 0) + total);
      }
    }
    closeSheet(); save(); toast(`Purchase saved — ${pl(lines.length, 'item')} added to stock${!paid ? ' · added to dues' : ''}`);
  },
  waste(fd) {
    const s = byId(S.stock, fd.get('item')); const q = num(fd.get('qty'));
    if (!s) return formError('Choose the item.');
    if (!(q > 0) || q > MAX_AMOUNT) return formError('Type how much was wasted.');
    const reason = fd.get('reason') || 'Other', note = String(fd.get('note') || '').trim();
    const take = Math.min(q, Math.max(0, Number(s.qty) || 0));
    addLog({ type: 'waste', stockId: s.id, name: s.name, unit: s.unit, qty: q, cost: unitCost(s), amount: round2(q * unitCost(s)), reason: note ? `${reason} · ${note}` : reason });
    if (take > 0) applyStockUse({ [s.id]: take }); // online: a safe server-side decrement (the kitchen may do this too)
    closeSheet(); save(); toast(`Wastage saved — ${qtyText(q, s.unit)} ${s.name}`);
  },
});
