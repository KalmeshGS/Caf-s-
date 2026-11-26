'use strict';
/* =========================================================
   Reports for any period: a day, a week, a month, a year or your own dates.
   · Pick the period, step back / forward, or type a date.
   · Older records load from the online database when needed.
   · Download the same period as PDF, Word, Excel or CSV.
   ========================================================= */

const PERIODS = { day: 'Day', week: 'Week', month: 'Month', year: 'Year', range: 'Dates' };
const inR = (dk, R) => !!dk && dk >= R.from && dk <= R.to;
const minKey = (a, b) => (a < b ? a : b);
/** Monday of the week that holds day k */
const weekStart = (k) => { const d = keyToDate(k); const wd = (d.getDay() + 6) % 7; return shiftDay(k, -wd); };
const lastDayOfMonth = (mk) => shiftDay(`${shiftMonth(mk, 1)}-01`, -1);

/** The report period → { mode, from, to, label, short } */
function periodRange(rep = App.ui.rep) {
  const a = rep.anchor || dayKey();
  let from, to, label, short;
  if (rep.mode === 'day') { from = to = a; label = fmtDate(keyToDate(a), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); short = a; }
  else if (rep.mode === 'week') { from = weekStart(a); to = shiftDay(from, 6); label = `Week ${fmtDate(keyToDate(from), { day: 'numeric', month: 'short' })} – ${fmtDate(keyToDate(to), { day: 'numeric', month: 'short', year: 'numeric' })}`; short = `${from}_to_${to}`; }
  else if (rep.mode === 'year') { const y = a.slice(0, 4); from = `${y}-01-01`; to = `${y}-12-31`; label = y; short = y; }
  else if (rep.mode === 'range') { from = minKey(rep.from || a, rep.to || a); to = (rep.from || a) > (rep.to || a) ? rep.from : (rep.to || a); label = `${fmtDate(keyToDate(from), { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(keyToDate(to), { day: 'numeric', month: 'short', year: 'numeric' })}`; short = `${from}_to_${to}`; }
  else { const mk = a.slice(0, 7); from = `${mk}-01`; to = lastDayOfMonth(mk); label = monthLabel(mk); short = mk; }
  return { mode: rep.mode, from, to, label, short, days: Math.round((keyToDate(to) - keyToDate(from)) / 864e5) + 1 };
}
function shiftPeriod(rep, n) {
  const a = rep.anchor || dayKey();
  if (rep.mode === 'day') return { ...rep, anchor: shiftDay(a, n) };
  if (rep.mode === 'week') return { ...rep, anchor: shiftDay(a, 7 * n) };
  if (rep.mode === 'month') return { ...rep, anchor: `${shiftMonth(a.slice(0, 7), n)}-01` };
  if (rep.mode === 'year') return { ...rep, anchor: `${Number(a.slice(0, 4)) + n}-01-01` };
  const R = periodRange(rep), len = R.days;
  return { ...rep, from: shiftDay(R.from, n * len), to: shiftDay(R.to, n * len), anchor: shiftDay(R.from, n * len) };
}

/* ---------------- data for a period ---------------- */
const paidInRange = (R) => paidOrders().filter((o) => inR(dayKey(o.paidAt), R));
const expensesInRange = (R) => (S.expenses || []).filter((e) => inR(e.date, R));
/** Online: make sure every month of the period is loaded (bills, expenses, purchases, wastage, leakage records) */
async function ensureRange(R) {
  if (typeof Cloud === 'undefined' || !Cloud.on || !Cloud.ensureMonth || App.repLoading) return;
  // Only months older than the live window need loading (recent ones are always on the device)
  const liveFrom = Date.now() - (typeof WINDOW_DAYS === 'number' ? WINDOW_DAYS : 62) * 864e5;
  const months = []; for (let mk = R.from.slice(0, 7); mk <= R.to.slice(0, 7) && mk <= monthKey(); mk = shiftMonth(mk, 1)) months.push(mk);
  const todo = months.filter((mk) => keyToDate(mk).getTime() < liveFrom && !Cloud.loadedMonths?.has(mk));
  if (!todo.length) return;
  App.repLoading = true;
  setTimeout(render, 0); // never re-render from inside a render
  try { for (const mk of todo) await Cloud.ensureMonth(mk); } finally { App.repLoading = false; setTimeout(render, 0); }
}
/** Sales chart buckets for the period */
function periodChart(R, paid) {
  if (R.mode === 'day') {
    const st = S.settings || {}; const used = paid.map((o) => new Date(o.paidAt).getHours());
    const h0 = Math.min(Number(st.openHour ?? 8), ...used), h1 = Math.max(Number(st.closeHour ?? 22), ...used);
    const hrs = []; for (let h = h0; h <= h1; h++) hrs.push(h);
    return { title: 'Sales by hour', values: hrs.map((h) => sum(paid.filter((o) => new Date(o.paidAt).getHours() === h), (o) => o.total)), labels: hrs.map((h) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`), full: hrs.map((h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`) };
  }
  if (R.mode === 'year' || R.days > 62) {
    const months = []; for (let mk = R.from.slice(0, 7); mk <= R.to.slice(0, 7); mk = shiftMonth(mk, 1)) months.push(mk);
    return { title: 'Sales by month', values: months.map((mk) => sum(paid.filter((o) => monthKey(o.paidAt) === mk), (o) => o.total)), labels: months.map((mk) => keyToDate(mk).toLocaleDateString(undefined, { month: 'short' })), full: months.map(monthLabel), hi: months.indexOf(monthKey()) };
  }
  const days = []; for (let k = R.from; k <= R.to; k = shiftDay(k, 1)) days.push(k);
  return { title: R.mode === 'week' ? 'Sales by day' : 'Daily sales', values: days.map((k) => sum(paid.filter((o) => dayKey(o.paidAt) === k), (o) => o.total)), labels: days.map((k) => (R.mode === 'week' ? keyToDate(k).toLocaleDateString(undefined, { weekday: 'short' }) : String(Number(k.slice(8))))), full: days.map((k) => fmtDate(keyToDate(k), { weekday: 'short', day: 'numeric', month: 'short' })), hi: days.indexOf(dayKey()) };
}

/* ---------------- the Reports screen ---------------- */
function periodBar(rep, R) {
  const today = dayKey();
  const pick = rep.mode === 'day' ? `<input type="date" class="inline-input rep-date" value="${R.from}" max="${today}" data-change="repDate" aria-label="Day">`
    : rep.mode === 'week' ? `<input type="date" class="inline-input rep-date" value="${rep.anchor}" max="${today}" data-change="repDate" aria-label="Any day in the week">`
      : rep.mode === 'month' ? `<input type="month" class="inline-input rep-date" value="${R.from.slice(0, 7)}" max="${today.slice(0, 7)}" data-change="repMonth" aria-label="Month">`
        : rep.mode === 'year' ? `<select class="inline-input rep-date" data-change="repYear" aria-label="Year">${Array.from({ length: 6 }, (_, i) => Number(today.slice(0, 4)) - i).map((y) => `<option ${String(y) === R.from.slice(0, 4) ? 'selected' : ''}>${y}</option>`).join('')}</select>`
          : `<input type="date" class="inline-input rep-date" value="${R.from}" max="${today}" data-change="repFrom" aria-label="From"><span class="muted">to</span><input type="date" class="inline-input rep-date" value="${R.to}" max="${today}" data-change="repTo" aria-label="To">`;
  const atEnd = R.to >= today;
  return `<div class="rep-bar">
    <div class="seg rep-modes" role="tablist">${Object.entries(PERIODS).map(([k, l]) => `<label><input type="radio" name="repMode" value="${k}" ${rep.mode === k ? 'checked' : ''} data-change="repMode"><span>${l}</span></label>`).join('')}</div>
    <div class="rep-nav">
      <button class="icon-btn" data-act="repShift" data-d="-1" aria-label="Previous">${icon('left')}</button>
      <div class="rep-pick">${pick}</div>
      <button class="icon-btn" data-act="repShift" data-d="1" aria-label="Next" ${atEnd ? 'disabled' : ''}>${icon('right')}</button>
      ${R.from !== today || rep.mode !== 'day' ? `<button class="link-btn" data-act="repToday">Today</button>` : ''}
    </div>
  </div>`;
}
Views.reports = () => {
  App.ui.rep = App.ui.rep || { mode: 'month', anchor: dayKey() };
  const rep = App.ui.rep, R = periodRange(rep);
  ensureRange(R); // loads older records once, then re-renders
  const paid = paidInRange(R), exps = expensesInRange(R);
  const sales = sum(paid, (o) => o.total), spend = sum(exps, (e) => e.amount), profit = sales - spend;
  // the period before, for a quick comparison
  const P = periodRange(shiftPeriod(rep, -1));
  const prevSales = sum(paidInRange(P), (o) => o.total);
  const vs = prevSales ? Math.round(((sales - prevSales) / prevSales) * 100) : null;
  const ch = periodChart(R, paid);
  const top = topItems(paid).slice(0, 8), maxQ = Math.max(1, ...top.map((t) => t.qty));
  const cats = Object.entries(EXPENSE_CATS).map(([c, color]) => ({ c, color, v: sum(exps.filter((e) => e.cat === c), (e) => e.amount) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const bm = byMethod(paid), pm = payMethods();
  const bestI = ch.values.indexOf(Math.max(...ch.values));
  return `${pageHead(`Report · ${R.label}`, R.mode === 'day' ? 'Day at a glance' : R.mode === 'week' ? 'Week at a glance' : R.mode === 'year' ? 'Year at a glance' : R.mode === 'range' ? 'Your dates' : 'Month at a glance',
    `<div class="btn-row tight">${btn('Download report', 'reportOpen', { cls: 'primary', ic: 'download' })}</div>`)}
  ${periodBar(rep, R)}
  ${App.repLoading ? `<div class="banner info">${icon('clock')}<span>Loading older records…</span></div>` : ''}
  <div class="kpis">
    ${kpi('Sales', money(sales), `${pl(paid.length, 'bill')}${vs != null ? ` · ${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs)}% vs previous ${rep.mode === 'range' ? 'period' : PERIODS[rep.mode].toLowerCase()}` : ''}`)}
    ${kpi('Expenses', money(spend), `${exps.length} ${exps.length === 1 ? 'entry' : 'entries'}`, 'neg')}
    ${kpi('Avg. bill', money(paid.length ? sales / paid.length : 0), ch.values.some(Boolean) && ch.values.length > 1 ? `Best: ${(ch.full || ch.labels)[bestI]}` : '')}
    <div class="kpi card profit"><p class="eyebrow">Real profit · ${esc(R.mode === 'day' ? 'this day' : R.mode === 'range' ? 'these dates' : `this ${PERIODS[rep.mode].toLowerCase()}`)}</p><p class="kpi-v">${money(profit)}</p><p class="kpi-s">${sales ? `${Math.round((profit / sales) * 100)}% of sales` : '—'}</p></div>
  </div>
  <section class="card">${eyebrow(ch.title)}${ch.values.some(Boolean) ? barChart(ch.values, ch.labels, { hi: ch.hi ?? -1 }) : empty('No sales in this period.')}</section>
  <div class="grid-2">
    <section class="card">${eyebrow('Best sellers')}
      ${top.length ? top.map((t, i) => `<div class="meter-row"><span>${i === 0 ? '★ ' : ''}${esc(t.name)}</span>${meter((t.qty / maxQ) * 100, i === 0 ? 'var(--accent)' : 'var(--warm)')}<b>${t.qty} sold</b></div>`).join('') : empty('No sales yet.')}
    </section>
    <section class="card">${eyebrow('Where the money went')}
      ${cats.length ? cats.map((x) => `<div class="meter-row"><span>${esc(x.c)}</span>${meter((x.v / spend) * 100, x.color)}<b>${money(x.v)}</b></div>`).join('') : empty('No expenses in this period.')}
    </section>
  </div>
  ${typeof seesCost === 'function' && seesCost() ? `<div class="grid-2">${foodCostCard(R)}${leakageCard(R)}</div>` : ''}
  <section class="card">${eyebrow('How customers paid')}
    ${[...Object.entries(pm), ...(bm.credit ? [['credit', { label: 'Credit (to collect)', color: '#a86a12' }]] : [])].map(([k, m]) => `<div class="meter-row"><span>${esc(m.label)}</span>${meter(sales ? ((bm[k] || 0) / sales) * 100 : 0, m.color)}<b>${money(bm[k] || 0)}</b></div>`).join('')}
  </section>`;
};

/* ---------------- downloads for a period ---------------- */
function periodData(R) {
  const st = S.settings || {}, pm = payMethods();
  const bills = paidInRange(R).slice().sort((a, b) => a.paidAt - b.paidAt);
  const bm = byMethod(bills);
  const sales = sum(bills, (o) => o.total), disc = sum(bills, (o) => o.discount || 0), tax = sum(bills, (o) => o.tax || 0), sub = sum(bills, (o) => o.subtotal ?? orderSubtotal(o));
  const charges = sum(bills, (o) => o.charges || 0);
  const exps = expensesInRange(R).sort((a, b) => a.date.localeCompare(b.date)), spend = sum(exps, (e) => e.amount);
  const cancelled = S.orders.filter((o) => o.status === 'cancelled' && inR(dayKey(o.cancelledAt || o.createdAt), R));
  const items = topItems(bills);
  const kind = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly', range: 'Sales' }[R.mode] || 'Sales';
  const multi = R.days > 1;
  // a row per day (or per month for a year)
  const byMonth = R.mode === 'year' || R.days > 62;
  const buckets = [];
  if (multi) {
    if (byMonth) for (let mk = R.from.slice(0, 7); mk <= R.to.slice(0, 7); mk = shiftMonth(mk, 1)) buckets.push({ k: mk, label: monthLabel(mk), ok: (o) => monthKey(o.paidAt) === mk, okE: (e) => e.date.startsWith(mk) });
    else for (let k = R.from; k <= R.to; k = shiftDay(k, 1)) buckets.push({ k, label: fmtDate(keyToDate(k), { weekday: 'short', day: 'numeric', month: 'short' }), ok: (o) => dayKey(o.paidAt) === k, okE: (e) => e.date === k });
  }
  const per = buckets.map((x) => { const b = bills.filter(x.ok), e = exps.filter(x.okE); return { label: x.label, n: b.length, s: sum(b, (o) => o.total), e: sum(e, (y) => y.amount) }; });
  const leak = typeof leakage === 'function' && typeof seesCost === 'function' && seesCost() ? leakage(R).filter((g) => g.items.length) : [];
  const fc = typeof billFoodCost === 'function' && typeof seesCost === 'function' && seesCost() ? round2(sum(bills, billFoodCost)) : 0;
  const summary = [['What', 'Amount'], ['Bills paid', String(bills.length)], ['Food & drinks (before discount)', money(sub, true)], ['Discounts', money(-disc, true)], ...(charges ? [['Packing / service charges', money(charges, true)]] : []), ['Tax', money(tax, true)],
    ['Total sales', money(sales, true)], ...Object.keys(pm).map((k) => [`  ${pm[k].label}`, money(bm[k] || 0, true)]), ...(bm.credit ? [['  Credit (to collect)', money(bm.credit, true)]] : []),
    ['Expenses', money(-spend, true)], ['Sales minus expenses', money(sales - spend, true)], ...(fc ? [['Food cost of what was sold', money(fc, true)]] : []), ...(cancelled.length ? [['Cancelled bills', `${cancelled.length} (${money(sum(cancelled, orderSubtotal), true)})`]] : [])];
  return {
    kind, title: `${st.name || 'Cafe'} — ${kind} report`, date: R.label,
    meta: [st.gstin ? `GSTIN: ${st.gstin}` : '', st.fssai ? `FSSAI: ${st.fssai}` : '', `Made by ${Session.user()?.name || ''} on ${new Date().toLocaleString()}`].filter(Boolean),
    summary,
    per: [[byMonth ? 'Month' : 'Day', 'Bills', 'Sales', 'Expenses', 'Sales − expenses'], ...per.map((x) => [x.label, String(x.n), money(x.s, true), money(x.e, true), money(x.s - x.e, true)])],
    bills: [['Bill #', 'Date', 'Time', 'Table', 'Items', 'Paid by', 'Discount', 'Tax', 'Total'], ...bills.map((o) => [String(o.no), dayKey(o.paidAt), fmtTime(o.paidAt), orderLabel(o), o.items.map((l) => `${l.name} x${l.qty}`).join(', '), paidByText(o), money(o.discount || 0, true), money(o.tax || 0, true), money(o.total, true)])],
    items: [['Item', 'Qty sold', 'Sales'], ...items.map((x) => [x.name, String(x.qty), money(x.rev, true)])],
    expenses: [['Date', 'What', 'Paid to / note', 'Amount'], ...exps.map((e) => [e.date, e.cat || 'Expense', e.title || '', money(e.amount, true)])],
    leak: [['Leakage check', 'Cases', 'Amount'], ...leak.map((g) => [g.title, String(g.items.length), money(g.amt, true)])],
    xl: {
      summary: summary.map((r, i) => (i === 0 ? r : [r[0].trim(), r[1]])),
      per: [[byMonth ? 'Month' : 'Day', 'Bills', 'Sales', 'Expenses', 'Sales - expenses'], ...per.map((x) => [x.label, x.n, round2(x.s), round2(x.e), round2(x.s - x.e)])],
      bills: [['Bill #', 'Date', 'Time', 'Table', 'Items', 'Paid by', 'Subtotal', 'Discount', 'Tax', 'Total'], ...bills.map((o) => [o.no, dayKey(o.paidAt), fmtTime(o.paidAt), orderLabel(o), o.items.map((l) => `${l.name} x${l.qty}`).join(', '), paidByText(o), round2(o.subtotal ?? orderSubtotal(o)), round2(o.discount || 0), round2(o.tax || 0), round2(o.total)])],
      items: [['Item', 'Qty sold', 'Sales'], ...items.map((x) => [x.name, x.qty, round2(x.rev)])],
      expenses: [['Date', 'What', 'Paid to / note', 'Amount'], ...exps.map((e) => [e.date, e.cat || 'Expense', e.title || '', round2(e.amount)])],
    },
    multi,
  };
}
function periodBlocks(d) {
  const b = [{ h: d.title, size: 32 }, { p: d.date, bold: true }, ...d.meta.map((p) => ({ p })), { h: 'Summary' }, { table: d.summary }];
  if (d.multi) b.push({ h: d.per[0][0] === 'Month' ? 'Month by month' : 'Day by day' }, { table: d.per });
  if (d.items.length > 1) b.push({ h: 'Items sold' }, { table: d.items });
  if (d.leak.length > 1) b.push({ h: 'Leakage check' }, { table: d.leak });
  b.push({ h: 'Expenses' }, d.expenses.length > 1 ? { table: d.expenses } : { p: 'No expenses in this period.' });
  b.push({ h: 'Bills' }, d.bills.length > 1 ? { table: d.bills } : { p: 'No paid bills in this period.' });
  return b;
}
const periodFile = (R, ext) => `${slug(S.settings?.name)}-${({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly', range: 'sales' })[R.mode] || 'sales'}-report-${R.short}.${ext}`;
function periodSheet(start) {
  const rep = { ...(start || App.ui.rep || { mode: 'day', anchor: dayKey() }) };
  App.dl = rep;
  const R = periodRange(rep);
  return `${sheetHead('Download report', R.label)}
    <div class="form">
      <div class="seg" role="radiogroup" aria-label="Period">${Object.entries(PERIODS).map(([k, l]) => `<label><input type="radio" name="dlMode" value="${k}" ${rep.mode === k ? 'checked' : ''} data-change="dlMode"><span>${l}</span></label>`).join('')}</div>
      <div class="row-2" id="dl-dates">${dlDates(rep, R)}</div>
      <p class="muted sm" id="dl-label">${esc(R.label)} · sales, every bill, items sold, payment split, discounts, tax, expenses${R.days > 1 ? ', day-by-day totals' : ''}. Saved as <b>${esc(periodFile(R, '…'))}</b>.</p>
      <div class="btn-row">${btn('PDF', 'periodDl', { cls: 'primary', ic: 'download', data: 'data-f="pdf"' })}${btn('Word', 'periodDl', { cls: 'ghost', ic: 'download', data: 'data-f="docx"' })}${btn('Excel', 'periodDl', { cls: 'ghost', ic: 'download', data: 'data-f="xlsx"' })}${btn('CSV', 'periodDl', { cls: 'ghost', ic: 'download', data: 'data-f="csv"' })}</div>
      <p class="neg sm" id="form-err" role="alert"></p>
    </div>`;
}
function dlDates(rep, R) {
  const today = dayKey();
  if (rep.mode === 'range') return `<label class="field"><span>From</span><input type="date" id="dl-from" value="${R.from}" max="${today}" data-change="dlDate"></label><label class="field"><span>To</span><input type="date" id="dl-to" value="${R.to}" max="${today}" data-change="dlDate"></label>`;
  if (rep.mode === 'month') return `<label class="field"><span>Month</span><input type="month" id="dl-a" value="${R.from.slice(0, 7)}" max="${today.slice(0, 7)}" data-change="dlDate"></label>`;
  if (rep.mode === 'year') return `<label class="field"><span>Year</span><select id="dl-a" data-change="dlDate">${Array.from({ length: 6 }, (_, i) => Number(today.slice(0, 4)) - i).map((y) => `<option ${String(y) === R.from.slice(0, 4) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;
  return `<label class="field"><span>${rep.mode === 'week' ? 'Any day in the week' : 'Day'}</span><input type="date" id="dl-a" value="${rep.anchor || today}" max="${today}" data-change="dlDate"></label>`;
}
function dlRead() {
  const rep = App.dl || { mode: 'day', anchor: dayKey() };
  const a = $('#dl-a')?.value;
  if (rep.mode === 'range') { rep.from = $('#dl-from')?.value || rep.from; rep.to = $('#dl-to')?.value || rep.to; rep.anchor = rep.from; }
  else if (rep.mode === 'month' && a) rep.anchor = `${a}-01`;
  else if (rep.mode === 'year' && a) rep.anchor = `${a}-01-01`;
  else if (a) rep.anchor = a;
  App.dl = rep; return rep;
}
function dlRefresh() {
  const rep = dlRead(), R = periodRange(rep);
  const box = $('#dl-dates'); if (box && !box.contains(document.activeElement)) box.innerHTML = dlDates(rep, R);
  const l = $('#dl-label'); if (l) l.innerHTML = `${esc(R.label)} · sales, every bill, items sold, payment split, discounts, tax, expenses${R.days > 1 ? ', day-by-day totals' : ''}. Saved as <b>${esc(periodFile(R, '…'))}</b>.`;
  const h = $('#sheet .sheet-head h2'); if (h) h.textContent = R.label;
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  repShift(el) { App.ui.rep = shiftPeriod(App.ui.rep || { mode: 'month', anchor: dayKey() }, Number(el.dataset.d)); render(); },
  repToday() { App.ui.rep = { mode: App.ui.rep?.mode === 'range' ? 'day' : (App.ui.rep?.mode || 'day'), anchor: dayKey() }; render(); },
  reportOpen() {
    if (typeof canReport === 'function' && !canReport()) return toast('Only owner, manager or cashier can download reports.');
    // From Reports: the period on screen. From Billing / Journal: that day (switch to week / month / year in the sheet)
    const h = location.hash;
    openSheet(periodSheet(h.startsWith('#/reports') ? App.ui.rep : { mode: 'day', anchor: h.startsWith('#/journal') ? (App.ui.day || dayKey()) : dayKey() }));
  },
  async periodDl(el) {
    if (typeof canReport === 'function' && !canReport()) return;
    const rep = dlRead(), R = periodRange(rep);
    if (R.from > dayKey()) return formError('Pick today or an earlier date.');
    if (R.days > 400) return formError('Choose up to about one year at a time.');
    for (let i = 0; App.repLoading && i < 100; i++) await new Promise((r) => setTimeout(r, 100)); // a load already running
    await ensureRange(R);
    const d = periodData(R), f = el.dataset.f;
    if (f === 'pdf') saveBlob(periodFile(R, 'pdf'), writePdf(periodBlocks(d), `${S.settings?.name || 'Cafe'} - ${R.label}`));
    else if (f === 'docx') saveBlob(periodFile(R, 'docx'), writeDocx(periodBlocks(d)));
    else if (f === 'csv') {
      const rows = [['Type', 'Date', 'Time', 'Ref', 'Description', 'Category / paid by', 'Amount'],
        ...paidInRange(R).sort((a, b) => a.paidAt - b.paidAt).map((o) => ['Sale', dayKey(o.paidAt), fmtTime(o.paidAt), `#${o.no}`, `${orderLabel(o)}: ${o.items.map((l) => `${l.name} x${l.qty}`).join('; ')}`, paidByText(o), o.total]),
        ...expensesInRange(R).map((e) => ['Expense', e.date, '', '', e.title, e.cat, -e.amount])];
      saveBlob(periodFile(R, 'csv'), new Blob([rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
    } else saveBlob(periodFile(R, 'xlsx'), writeXlsx([{ name: 'Summary', rows: [[d.title], [d.date], ...d.meta.map((m) => [m]), [], ...d.xl.summary], header: false }, ...(d.multi ? [{ name: d.per[0][0] === 'Month' ? 'By month' : 'By day', rows: d.xl.per }] : []), { name: 'Bills', rows: d.xl.bills }, { name: 'Items sold', rows: d.xl.items }, { name: 'Expenses', rows: d.xl.expenses }]));
    toast(`Report saved: ${periodFile(R, f)}`);
  },
});
Object.assign(Changes, {
  repMode(el) { const old = App.ui.rep || { mode: 'month', anchor: dayKey() }; const R = periodRange(old); App.ui.rep = el.value === 'range' ? (old.mode === 'day' || old.mode === 'week' ? { mode: 'range', from: R.from, to: minKey(R.to, dayKey()), anchor: R.from } : { mode: 'range', from: `${minKey(R.to, dayKey()).slice(0, 7)}-01`, to: minKey(R.to, dayKey()), anchor: `${minKey(R.to, dayKey()).slice(0, 7)}-01` }) : { mode: el.value, anchor: minKey(R.to, dayKey()) < R.from ? R.from : (old.mode === 'day' ? old.anchor : minKey(R.to, dayKey())) }; render(); },
  repDate(el) { if (el.value) { App.ui.rep = { ...App.ui.rep, anchor: el.value }; render(); } },
  repMonth(el) { if (el.value) { App.ui.rep = { ...App.ui.rep, anchor: `${el.value}-01` }; render(); } },
  repYear(el) { App.ui.rep = { ...App.ui.rep, anchor: `${el.value}-01-01` }; render(); },
  repFrom(el) { if (el.value) { App.ui.rep = { ...App.ui.rep, from: el.value, anchor: el.value }; render(); } },
  repTo(el) { if (el.value) { App.ui.rep = { ...App.ui.rep, to: el.value }; render(); } },
  dlMode(el) { App.dl = { ...dlRead(), mode: el.value }; if (el.value === 'range') { const R = periodRange({ ...App.dl, mode: 'month' }); App.dl.from = R.from; App.dl.to = minKey(R.to, dayKey()); } const box = $('#dl-dates'); if (box) box.innerHTML = dlDates(App.dl, periodRange(App.dl)); dlRefresh(); },
  dlDate() { dlRefresh(); },
});
