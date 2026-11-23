'use strict';
/* =========================================================
   Daily report download — PDF, Word (.docx) or Excel (.xlsx)
   File name: <cafe-name>-daily-report-<YYYY-MM-DD>.<ext>
   For owner, manager and cashier. Made on this device (files.js).
   ========================================================= */
const REPORT_ROLES = ['owner', 'manager', 'cashier'];
const canReport = () => REPORT_ROLES.includes(Session.role());
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Everything in the report for one day, as plain rows */
function dailyData(dk) {
  const st = S.settings || {}, pm = payMethods();
  const bills = paidOn(dk).slice().sort((a, b) => a.paidAt - b.paidAt);
  const bm = byMethod(bills);
  const sales = sum(bills, (o) => o.total), disc = sum(bills, (o) => o.discount || 0), tax = sum(bills, (o) => o.tax || 0), sub = sum(bills, (o) => o.subtotal ?? orderSubtotal(o));
  const exps = (S.expenses || []).filter((e) => e.date === dk);
  const spend = sum(exps, (e) => e.amount);
  const items = topItems(bills);
  const open = openOrders().filter((o) => dayKey(o.createdAt) === dk && o.items.length);
  const low = (S.stock || []).filter(isLow);
  const closing = S.journal?.[dk]?.closing;
  return {
    title: `${st.name || 'Cafe'} — Daily report`, date: fmtDate(keyToDate(dk), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    meta: [st.gstin ? `GSTIN: ${st.gstin}` : '', st.fssai ? `FSSAI: ${st.fssai}` : '', `Made by ${Session.user()?.name || ''} on ${new Date().toLocaleString()}`].filter(Boolean),
    summary: [['What', 'Amount'], ['Bills paid', String(bills.length)], ['Food & drinks (before discount)', money(sub, true)], ['Discounts', money(-disc, true)], ['Tax', money(tax, true)],
      ['Total sales', money(sales, true)], ...Object.keys(pm).map((k) => [`  ${pm[k].label}`, money(bm[k] || 0, true)]), ['Expenses', money(-spend, true)], ['Sales minus expenses', money(sales - spend, true)],
      ...(open.length ? [['Bills still open', `${open.length} (${money(sum(open, (o) => orderTotals(o).total), true)})`]] : []), ...(closing ? [['Day closed at', fmtTime(closing.at)]] : [])],
    bills: [['Bill #', 'Time', 'Table', 'Items', 'Paid by', 'Discount', 'Tax', 'Total'], ...bills.map((o) => [String(o.no), fmtTime(o.paidAt), orderLabel(o), o.items.map((l) => `${l.name} x${l.qty}`).join(', '), pm[o.method]?.label || o.method, money(o.discount || 0, true), money(o.tax || 0, true), money(o.total, true)])],
    items: [['Item', 'Qty sold', 'Sales'], ...items.map((x) => [x.name, String(x.qty), money(x.rev, true)])],
    expenses: [['What', 'Paid to / note', 'Amount'], ...exps.map((e) => [e.cat || 'Expense', e.title || '', money(e.amount, true)])],
    low: [['Stock running low', 'Left', 'Alert below'], ...low.map((s) => [s.name, `${+Number(s.qty).toFixed(2)} ${s.unit}`, `${s.low} ${s.unit}`])],
    // numbers kept as numbers for Excel
    xl: {
      summary: [['What', 'Amount'], ['Bills paid', bills.length], ['Food & drinks (before discount)', r2(sub)], ['Discounts', -r2(disc)], ['Tax', r2(tax)], ['Total sales', r2(sales)],
        ...Object.keys(pm).map((k) => [pm[k].label, r2(bm[k] || 0)]), ['Expenses', -r2(spend)], ['Sales minus expenses', r2(sales - spend)]],
      bills: [['Bill #', 'Time', 'Table', 'Items', 'Paid by', 'Subtotal', 'Discount', 'Tax', 'Total'], ...bills.map((o) => [o.no, fmtTime(o.paidAt), orderLabel(o), o.items.map((l) => `${l.name} x${l.qty}`).join(', '), pm[o.method]?.label || o.method, r2(o.subtotal ?? orderSubtotal(o)), r2(o.discount), r2(o.tax), r2(o.total)])],
      items: [['Item', 'Qty sold', 'Sales'], ...items.map((x) => [x.name, x.qty, r2(x.rev)])],
      expenses: [['What', 'Paid to / note', 'Amount'], ...exps.map((e) => [e.cat || 'Expense', e.title || '', r2(e.amount)])],
    },
  };
}
function reportBlocks(d) {
  const b = [{ h: d.title, size: 32 }, { p: d.date, bold: true }, ...d.meta.map((p) => ({ p })), { h: 'Summary' }, { table: d.summary }];
  b.push({ h: 'Bills' }, d.bills.length > 1 ? { table: d.bills } : { p: 'No paid bills on this day.' });
  if (d.items.length > 1) b.push({ h: 'Items sold' }, { table: d.items });
  b.push({ h: 'Expenses' }, d.expenses.length > 1 ? { table: d.expenses } : { p: 'No expenses on this day.' });
  if (d.low.length > 1) b.push({ h: 'Stock running low (now)' }, { table: d.low });
  return b;
}
const reportName = (dk, ext) => `${slug(S.settings?.name)}-daily-report-${dk}.${ext}`;
function reportSheet(dk = dayKey()) {
  return `${sheetHead('Daily report', 'Download')}
    <div class="form">
      <label class="field"><span>Day</span><input type="date" id="rep-day" value="${dk}" max="${dayKey()}"></label>
      <p class="muted sm">Sales, every bill, items sold, payment split (cash / ${esc(walletLabel())} / card), discounts, tax and expenses. Saved as <b>${esc(reportName('YYYY-MM-DD', '…'))}</b>.</p>
      <div class="btn-row">${btn('PDF', 'reportDl', { cls: 'primary', ic: 'download', data: 'data-f="pdf"' })}${btn('Word', 'reportDl', { cls: 'ghost', ic: 'download', data: 'data-f="docx"' })}${btn('Excel', 'reportDl', { cls: 'ghost', ic: 'download', data: 'data-f="xlsx"' })}</div>
      <p class="neg sm" id="form-err" role="alert"></p>
    </div>`;
}
Object.assign(Actions, {
  reportOpen() { if (!canReport()) return toast('Only owner, manager or cashier can download reports.'); openSheet(reportSheet()); },
  async reportDl(el) {
    if (!canReport()) return;
    const dk = $('#rep-day')?.value || dayKey();
    if (dk > dayKey()) return formError('Pick today or an earlier day.');
    if (typeof Cloud !== 'undefined' && Cloud.on && Cloud.ensureMonth) await Cloud.ensureMonth(monthKey(keyToDate(dk))); // older months load on demand
    const d = dailyData(dk), f = el.dataset.f;
    if (f === 'pdf') saveBlob(reportName(dk, 'pdf'), writePdf(reportBlocks(d), `${S.settings?.name || 'Cafe'} - ${dk}`));
    else if (f === 'docx') saveBlob(reportName(dk, 'docx'), writeDocx(reportBlocks(d)));
    else saveBlob(reportName(dk, 'xlsx'), writeXlsx([{ name: 'Summary', rows: [[d.title], [d.date], ...d.meta.map((m) => [m]), [], ...d.xl.summary], header: false }, { name: 'Bills', rows: d.xl.bills }, { name: 'Items sold', rows: d.xl.items }, { name: 'Expenses', rows: d.xl.expenses }]));
    toast(`Report saved: ${reportName(dk, f)}`);
  },
});
