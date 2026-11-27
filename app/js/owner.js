'use strict';
/* =========================================================
   For the owner (batch A)
   · Alerts the moment something looks wrong (cancelled / reprinted bill,
     big discount, dish pulled after cooking, cash short, sales well down)
   · Cash drawer: opening cash, cash in / out, count at closing → short / extra
   · Today's report on WhatsApp (one tap)
   · Sales targets for the day and the month
   ========================================================= */

// isOwner() comes from staff.js
const DRAWER_ROLES = ['owner', 'manager', 'cashier'];
const canDrawer = () => DRAWER_ROLES.includes(Session.role());
const alertCfg = () => ({ discPct: 15, discMin: 100, shortMin: 50, dropPct: 40, ...(S.settings?.alertCfg || {}) });

/* ---------------- cash drawer ---------------- */
const drawerOf = (dk = dayKey()) => (S.drawer || {})[dk] || null;
/** Cash that should be in the drawer: opening + cash sales + cash credit collected + cash in − cash out */
function drawerExpected(dk = dayKey()) {
  const d = drawerOf(dk) || {};
  const cashSales = byMethod(paidOn(dk)).cash || 0;
  const credit = sum(S.orders.filter((o) => o.creditPaid && o.creditPaid.method === 'cash' && dayKey(o.creditPaid.at) === dk), (o) => o.total);
  const ins = sum((d.moves || []).filter((m) => m.type === 'in'), (m) => m.amt), outs = sum((d.moves || []).filter((m) => m.type === 'out'), (m) => m.amt);
  return { open: Number(d.open?.amt) || 0, cashSales, credit, ins, outs, expected: round2((Number(d.open?.amt) || 0) + cashSales + credit + ins - outs) };
}
function drawerSheet() {
  const dk = dayKey(), d = drawerOf(dk), e = drawerExpected(dk);
  const row = (l, v, cls = '') => `<div class="line-row ${cls}"><span>${l}</span><b>${money(v)}</b></div>`;
  return `${sheetHead('Cash drawer', fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' }))}
    ${!d?.open ? `<form class="form" data-form="drawerOpen">
        <p class="muted sm">Count the cash in the drawer before the first bill.</p>
        <label class="field"><span>Opening cash</span><input name="amt" type="number" min="0" step="any" inputmode="decimal" required autofocus></label>
        <button class="btn primary block" type="submit">${icon('check')}<span>Start the day</span></button></form>`
    : `${row('Opening cash', e.open)}${row('+ Cash sales', e.cashSales)}${e.credit ? row('+ Credit collected in cash', e.credit) : ''}${e.ins ? row('+ Cash added', e.ins) : ''}${e.outs ? row('− Cash taken out', -e.outs) : ''}${row('Should be in the drawer', e.expected, 'total')}
      ${(d.moves || []).length ? `<details><summary class="muted sm">Cash in / out (${d.moves.length})</summary>${d.moves.map((m) => `<div class="line-row sm"><span>${m.type === 'in' ? '+' : '−'} ${esc(m.reason)} · ${esc(m.by)} · ${esc(fmtTime(m.at))}</span><span>${money(m.amt)}</span></div>`).join('')}</details>` : ''}
      ${d.close ? `<div class="banner ${d.close.diff < 0 ? 'warn' : 'info'}">${icon(d.close.diff < 0 ? 'alert' : 'check')}<span>Closed by ${esc(d.close.by)} at ${esc(fmtTime(d.close.at))}: counted ${money(d.close.counted)} — ${d.close.diff === 0 ? 'matches ✓' : d.close.diff < 0 ? `<b>short by ${money(-d.close.diff)}</b>` : `extra ${money(d.close.diff)}`}${d.close.note ? ` · ${esc(d.close.note)}` : ''}</span></div>`
        : `<form class="form" data-form="drawerMove">
          <div class="seg">${[['out', 'Cash out'], ['in', 'Cash in']].map(([k, l], i) => `<label><input type="radio" name="type" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="row-2"><label class="field"><span>Amount</span><input name="amt" type="number" min="1" step="any" inputmode="decimal" required></label>
          <label class="field"><span>Why</span><input name="reason" maxlength="50" required placeholder="e.g. milk, change from bank"></label></div>
          <button class="btn ghost block" type="submit">Record</button></form>
        <form class="form" data-form="drawerClose">
          ${eyebrow('Close the day')}
          <div class="row-2"><label class="field"><span>Cash counted</span><input name="counted" type="number" min="0" step="any" inputmode="decimal" required></label>
          <label class="field"><span>Note <em>(optional)</em></span><input name="note" maxlength="60"></label></div>
          <p class="neg sm" id="form-err" role="alert"></p>
          <button class="btn primary block" type="submit">${icon('lock')}<span>Close the drawer</span></button></form>`}`}`;
}

/* ---------------- alerts for the owner ---------------- */
const ALERT_TEXT = {
  cancelled: (a) => [`Bill cancelled · ${a.table || ''} #${a.no || ''}`, `${money(a.amount || 0)} — ${a.reason || 'no reason'} (by ${a.by})`],
  reprint: (a) => [`Bill printed again · #${a.no || ''}`, `by ${a.by}`],
  pulled: (a) => [`Dish taken off after the kitchen got it · ${a.table || ''}`, `${a.qty || 1} × ${a.item || ''} — ${money(a.amount || 0)} (by ${a.by})`],
  lowered: (a) => [`Bill lowered after printing · #${a.no || ''}`, `printed ${money(a.printed || 0)}, paid ${money(a.paid || 0)} (by ${a.by})`],
  comp: (a) => [`Free bill · ${a.table || ''} #${a.no || ''}`, `${money(a.amount || 0)} — ${a.reason || ''} (by ${a.by})`],
  unclaimed: (a) => [`Food not collected · ${a.table || ''}`, `${money(a.amount || 0)} (by ${a.by})`],
};
/** Today's things the owner should know about → [{ key, title, body, at, link }] */
function ownerAlerts(dk = dayKey()) {
  const c = alertCfg(), out = [];
  (S.audit || []).filter((a) => a.date === dk && ALERT_TEXT[a.type]).forEach((a) => { const [t, b] = ALERT_TEXT[a.type](a); out.push({ key: `a:${a.id}`, title: t, body: b, at: a.at, link: '#/reports' }); });
  paidOn(dk).filter((o) => o.method !== 'comp' && o.discount > 0 && o.discount >= c.discMin && o.discount >= (o.subtotal || orderSubtotal(o)) * c.discPct / 100)
    .forEach((o) => out.push({ key: `d:${o.id}`, title: `Big discount · ${orderLabel(o)} #${o.no}`, body: `${money(o.discount)} off ${money(o.subtotal || orderSubtotal(o))}${o.discReq?.decidedBy ? ` (approved by ${o.discReq.decidedBy})` : ''} — by ${o.by || '—'}`, at: o.paidAt, link: `#/billing?o=${o.id}` }));
  const d = drawerOf(dk);
  if (d?.close && d.close.diff <= -c.shortMin) out.push({ key: `c:${dk}`, title: `Cash short by ${money(-d.close.diff)}`, body: `Counted ${money(d.close.counted)}, should be ${money(d.close.expected)} — closed by ${d.close.by}`, at: d.close.at, link: '#/billing' });
  priceRises(10).filter((r) => r.to.date === dk).forEach((r) => out.push({ key: `p:${r.s.id}:${r.to.at}`, title: `${r.s.name} costs ${r.pct}% more`, body: `${money(r.from.unit)} → ${money(r.to.unit)} per ${r.s.unit} from ${r.to.vendor}`, at: r.to.at, link: '#/stock' }));
  licDue().forEach((l) => { const n = daysTo(l.due); out.push({ key: `l:${l.id}:${l.due}`, title: `${l.name} ${n < 0 ? `overdue by ${-n} day${n === -1 ? '' : 's'}` : n === 0 ? 'due today' : `due in ${n} day${n === 1 ? '' : 's'}`}`, body: `${l.no ? `No. ${l.no} · ` : ''}${fmtDate(keyToDate(l.due), { day: 'numeric', month: 'short', year: 'numeric' })}`, at: Math.min(Date.now(), keyToDate(l.due).getTime()), link: '#/dashboard' }); });
  const drop = salesDrop(dk);
  if (drop) out.push({ key: `s:${dk}`, title: `Sales down ${drop.pct}% today`, body: `${money(drop.now)} so far vs ${money(drop.then)} by this time last ${fmtDate(keyToDate(dk), { weekday: 'long' })}`, at: drop.at, link: '#/dashboard' });
  return out.sort((a, b) => b.at - a.at);
}
/** Today vs the same weekday last week, up to the same time of day (checked from 2 pm) */
function salesDrop(dk = dayKey()) {
  if (dk !== dayKey()) return null;
  const now = new Date(); if (now.getHours() < 14) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  const upto = (k) => sum(paidOn(k).filter((o) => { const t = new Date(o.paidAt); return t.getHours() * 60 + t.getMinutes() <= mins; }), (o) => o.total);
  const then = upto(shiftDay(dk, -7)), nowS = upto(dk);
  if (then < 1000) return null;
  const pct = Math.round(((then - nowS) / then) * 100);
  return pct >= alertCfg().dropPct ? { pct, now: nowS, then, at: keyToDate(dk).getTime() + 14 * 3600e3 } : null;
}
function checkOwnerAlerts() {
  if (!isOwner()) { App.ownerSeen = null; return; }
  const list = ownerAlerts();
  const prev = App.ownerSeen; App.ownerSeen = new Set(list.map((a) => a.key));
  if (!prev) return;
  const fresh = list.filter((a) => !prev.has(a.key));
  if (fresh.length === 1) phoneAlert(fresh[0].title, fresh[0].body, 'owner-alert');
  else if (fresh.length > 1) phoneAlert(`${fresh.length} things to check`, fresh.map((a) => a.title).join(' · '), 'owner-alert');
}
function alertsCard() {
  if (!isOwner()) return '';
  const list = ownerAlerts();
  return `<section class="card owner-alerts ${list.length ? 'has' : ''}"><div class="card-head">${eyebrow('Needs your attention today')}<span class="btn-row tight">${btn('Alert settings', 'alertCfgOpen', { cls: 'ghost sm', ic: 'gear' })}</span></div>
    ${list.length ? list.slice(0, 8).map((a) => `<a class="list-btn" href="${a.link}"><span><strong>${esc(a.title)}</strong><small>${esc(a.body)}</small></span><small class="muted">${esc(fmtTime(a.at))}</small></a>`).join('')
      : `<p class="muted sm">${icon('check')} Nothing unusual today. You get a phone alert the moment a bill is cancelled or reprinted, a big discount is given, a dish is pulled after cooking, cash is short or sales are well down.</p>`}
  </section>`;
}
function alertCfgSheet() {
  const c = alertCfg();
  return `${sheetHead('Alerts', 'When should your phone ring?')}
    <form class="form" data-form="alertCfg">
      <p class="muted sm">Cancelled, reprinted and free bills, and dishes pulled after cooking, always alert you.</p>
      <div class="row-2"><label class="field"><span>Discount alert from (% of the bill)</span><input name="discPct" type="number" min="1" max="100" value="${c.discPct}"></label>
      <label class="field"><span>…and at least (₹)</span><input name="discMin" type="number" min="0" value="${c.discMin}"></label></div>
      <div class="row-2"><label class="field"><span>Cash short by more than (₹)</span><input name="shortMin" type="number" min="0" value="${c.shortMin}"></label>
      <label class="field"><span>Sales down by (% vs last week)</span><input name="dropPct" type="number" min="10" max="90" value="${c.dropPct}"></label></div>
      <button class="btn primary block" type="submit">Save</button>
    </form>`;
}

/* ---------------- targets ---------------- */
const targets = () => S.settings?.targets || {};
function targetsCard() {
  const t = targets(); const today = dayKey(), mk = today.slice(0, 7);
  const dayS = sum(paidOn(today), (o) => o.total), monS = sum(paidOrders().filter((o) => monthKey(o.paidAt) === mk), (o) => o.total);
  if (!t.day && !t.month) return isOwner() ? `<section class="card target-card"><div class="card-head">${eyebrow('Sales targets')}${btn('Set targets', 'targetsOpen', { cls: 'ghost sm' })}</div><p class="muted sm">Set a daily and monthly sales target to see your progress here.</p></section>` : '';
  const dim = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0).getDate(), dayNo = Number(today.slice(8));
  const bar = (label, v, goal, pace) => { const pct = goal ? Math.min(100, Math.round((v / goal) * 100)) : 0; return `<div class="tgt"><div class="line-row"><span>${label}</span><b>${money(v)} <small class="muted">of ${money(goal)} · ${pct}%</small></b></div><div class="tgt-bar"><i style="width:${pct}%"></i>${pace != null ? `<em style="left:${Math.min(100, pace)}%" title="Where you should be today"></em>` : ''}</div></div>`; };
  return `<section class="card target-card"><div class="card-head">${eyebrow('Sales targets')}${isOwner() ? btn('Change', 'targetsOpen', { cls: 'ghost sm' }) : ''}</div>
    ${t.day ? bar('Today', dayS, t.day) : ''}${t.month ? bar(`This month · day ${dayNo} of ${dim}`, monS, t.month, Math.round((dayNo / dim) * 100)) : ''}
    ${t.month ? `<p class="muted sm">${monS >= t.month * dayNo / dim ? `${icon('check')} Ahead of pace` : `Needs ${money(Math.max(0, (t.month - monS) / Math.max(1, dim - dayNo + 1)))} a day for the rest of the month`}</p>` : ''}</section>`;
}
function targetsSheet() {
  const t = targets();
  return `${sheetHead('Sales targets', 'Shown on the dashboard')}
    <form class="form" data-form="targets"><div class="row-2">
      <label class="field"><span>Daily target (₹)</span><input name="day" type="number" min="0" step="100" value="${t.day || ''}"></label>
      <label class="field"><span>Monthly target (₹)</span><input name="month" type="number" min="0" step="1000" value="${t.month || ''}"></label></div>
      <button class="btn primary block" type="submit">Save</button></form>`;
}

/* ---------------- today's report on WhatsApp ---------------- */
function dayReportText(dk = dayKey()) {
  const paid = paidOn(dk), real = paid.filter((o) => o.method !== 'comp'), bm = byMethod(paid), pm = payMethods();
  const sales = sum(real, (o) => o.total), disc = sum(real, (o) => o.discount || 0);
  const cancelled = S.orders.filter((o) => o.status === 'cancelled' && dayKey(o.cancelledAt || o.createdAt) === dk);
  const exp = sum(expensesOn(dk), (e) => e.amount), top = topItems(paid).slice(0, 5), d = drawerOf(dk), al = isOwner() ? ownerAlerts(dk) : [];
  const t = targets();
  const L = [`*${S.settings?.name || 'Cafe'} — ${fmtDate(keyToDate(dk), { weekday: 'short', day: 'numeric', month: 'short' })}*`, '',
    `Sales: *${money(sales)}* (${pl(real.length, 'bill')}${real.length ? `, avg ${money(sales / real.length)}` : ''})`,
    ...(t.day ? [`Target: ${money(t.day)} — ${Math.round((sales / t.day) * 100)}%`] : []),
    `Payments: ${Object.entries(pm).map(([k, m]) => `${m.label} ${money(bm[k] || 0)}`).join(' · ')}${bm.credit ? ` · Credit ${money(bm.credit)}` : ''}`,
    `Discounts: ${money(disc)} · Free bills: ${paid.length - real.length} · Cancelled: ${cancelled.length}`,
    `Expenses: ${money(exp)} · Sales − expenses: ${money(sales - exp)}`,
    ...(d?.close ? [`Cash: counted ${money(d.close.counted)} vs ${money(d.close.expected)} — ${d.close.diff === 0 ? 'matches' : d.close.diff < 0 ? `SHORT ${money(-d.close.diff)}` : `extra ${money(d.close.diff)}`}`] : []),
    ...(top.length ? ['', 'Top dishes: ' + top.map((x) => `${x.name} ×${x.qty}`).join(', ')] : []),
    ...(al.length ? ['', `To check (${al.length}): ` + al.slice(0, 5).map((a) => a.title).join('; ')] : []),
    '', '— Cafe Journal'];
  return L.join('\n');
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  drawerOpenSheet() { if (!canDrawer()) return; openSheet(drawerSheet()); },
  alertCfgOpen() { if (isOwner()) openSheet(alertCfgSheet()); },
  targetsOpen() { if (isOwner()) openSheet(targetsSheet()); },
  dayReportShare() {
    const text = dayReportText();
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { navigator.share({ text }).catch(() => {}); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  },
});
Object.assign(Forms, {
  drawerOpen(fd) {
    const amt = Number(fd.get('amt')); if (!(amt >= 0)) return formError('Enter the opening cash.');
    S.drawer = S.drawer || {}; const dk = dayKey();
    S.drawer[dk] = { ...(S.drawer[dk] || {}), open: { amt: round2(amt), by: Session.user()?.name || '', at: Date.now() }, moves: S.drawer[dk]?.moves || [] };
    save(); openSheet(drawerSheet()); toast('Drawer opened');
  },
  drawerMove(fd) {
    const amt = Number(fd.get('amt')), reason = String(fd.get('reason') || '').trim(); if (!(amt > 0) || !reason) return;
    const d = S.drawer[dayKey()]; d.moves = d.moves || [];
    d.moves.push({ type: fd.get('type') === 'in' ? 'in' : 'out', amt: round2(amt), reason: reason.slice(0, 50), by: Session.user()?.name || '', at: Date.now() });
    save(); openSheet(drawerSheet());
  },
  drawerClose(fd) {
    const counted = Number(fd.get('counted')); if (!(counted >= 0)) return formError('Enter the cash you counted.');
    const dk = dayKey(), e = drawerExpected(dk), diff = round2(counted - e.expected);
    S.drawer[dk].close = { counted: round2(counted), expected: e.expected, diff, note: String(fd.get('note') || '').trim().slice(0, 60), by: Session.user()?.name || '', at: Date.now() };
    save(); openSheet(drawerSheet());
    toast(diff === 0 ? 'Drawer closed — cash matches ✓' : diff < 0 ? `Drawer closed — short by ${money(-diff)}` : `Drawer closed — ${money(diff)} extra`);
  },
  alertCfg(fd) {
    if (!isOwner()) return;
    const n = (k, d) => Math.max(0, Number(fd.get(k)) || d);
    S.settings.alertCfg = { discPct: n('discPct', 15), discMin: n('discMin', 0), shortMin: n('shortMin', 0), dropPct: Math.min(90, Math.max(10, n('dropPct', 40))) };
    closeSheet(); save(); toast('Alert settings saved');
  },
  targets(fd) {
    if (!isOwner()) return;
    S.settings.targets = { day: Math.max(0, Number(fd.get('day')) || 0), month: Math.max(0, Number(fd.get('month')) || 0) };
    closeSheet(); save(); toast('Targets saved');
  },
});

/* =========================================================
   For the owner (batch B)
   · GST report for the CA (GSTR-1 ready Excel) + accounting export
   · Profit & loss with prime cost
   · Menu engineering (stars, workhorses, puzzles, dogs)
   · Supplier price watch
   ========================================================= */
const GST_RATES = [0, 5, 12, 18, 28];
const STATE_CODES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh' };
/** One bill's GST parts: taxable value, tax, the rate it was billed at */
function gstOf(o) {
  const taxable = round2((o.subtotal ?? orderSubtotal(o)) - (o.discount || 0) + (o.packingAmt || 0) + (o.serviceAmt || 0));
  const tax = round2(o.tax || 0);
  const raw = taxable > 0 ? (tax / taxable) * 100 : 0;
  const rate = GST_RATES.reduce((b, r) => (Math.abs(r - raw) < Math.abs(b - raw) ? r : b), 0);
  return { taxable, tax, rate };
}
function gstData(R) {
  const paid = paidInRange(R).filter((o) => o.method !== 'comp');
  const cancelled = S.orders.filter((o) => o.status === 'cancelled' && inR(dayKey(o.cancelledAt || o.createdAt), R));
  const byRate = {}; const days = {};
  paid.forEach((o) => {
    const g = gstOf(o), r = byRate[g.rate] = byRate[g.rate] || { rate: g.rate, bills: 0, taxable: 0, tax: 0 };
    r.bills++; r.taxable = round2(r.taxable + g.taxable); r.tax = round2(r.tax + g.tax);
    const k = dayKey(o.paidAt), d = days[k] = days[k] || { date: k, bills: 0, taxable: 0, tax: 0, total: 0, cash: 0, upi: 0, card: 0, credit: 0 };
    d.bills++; d.taxable = round2(d.taxable + g.taxable); d.tax = round2(d.tax + g.tax); d.total = round2(d.total + o.total);
    const bm = byMethod([o]); ['cash', 'upi', 'card', 'credit'].forEach((m) => { d[m] = round2(d[m] + (bm[m] || 0)); });
  });
  const nos = paid.map((o) => Number(o.no)).filter((n) => n > 0).sort((a, b) => a - b);
  const gstin = String(S.settings?.gstin || '').toUpperCase(), sc = gstin.slice(0, 2);
  return { paid, cancelled, rates: Object.values(byRate).sort((a, b) => a.rate - b.rate), days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)), nos, gstin, pos: STATE_CODES[sc] || STATE_CODES[Number(sc)] ? `${sc}-${STATE_CODES[sc] || STATE_CODES[Number(sc)]}` : '', taxable: round2(sum(paid, (o) => gstOf(o).taxable)), tax: round2(sum(paid, (o) => gstOf(o).tax)) };
}
function gstCard(R) {
  const g = gstData(R), half = (t) => round2(t / 2);
  return `<section class="card"><div class="card-head">${eyebrow(`GST · ${R.label}`)}${btn('Excel for your CA', 'gstDl', { cls: 'ghost sm', ic: 'download' })}</div>
    ${g.paid.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rate</th><th>Bills</th><th>Taxable</th><th>CGST</th><th>SGST</th></tr></thead><tbody>${g.rates.map((r) => `<tr><td>${r.rate}%</td><td>${r.bills}</td><td>${money(r.taxable, true)}</td><td>${money(half(r.tax), true)}</td><td>${money(round2(r.tax - half(r.tax)), true)}</td></tr>`).join('')}
      <tr class="b"><td>Total</td><td>${g.paid.length}</td><td>${money(g.taxable, true)}</td><td>${money(half(g.tax), true)}</td><td>${money(round2(g.tax - half(g.tax)), true)}</td></tr></tbody></table></div>
      <p class="muted sm">${g.gstin ? `GSTIN ${esc(g.gstin)}${g.pos ? ` · ${esc(g.pos)}` : ''}` : 'Add your GSTIN in Settings → Business setup.'} · Bills ${g.nos.length ? `${g.nos[0]}–${g.nos[g.nos.length - 1]}` : '—'} · ${g.cancelled.length} cancelled. The Excel has the B2C summary, HSN/SAC summary and documents list for GSTR-1, plus a day-wise sheet for your accounts.</p>`
      : '<p class="muted sm">No bills in this period.</p>'}</section>`;
}
function gstWorkbook(R) {
  const g = gstData(R), half = (t) => round2(t / 2);
  return writeXlsx([
    { name: 'Summary', header: false, rows: [[`${S.settings?.name || ''} — GST summary`], [R.label], [g.gstin ? `GSTIN: ${g.gstin}` : 'GSTIN: (not set)'], [], ['Rate', 'Bills', 'Taxable value', 'CGST', 'SGST', 'Total tax'], ...g.rates.map((r) => [`${r.rate}%`, r.bills, r.taxable, half(r.tax), round2(r.tax - half(r.tax)), r.tax]), ['Total', g.paid.length, g.taxable, half(g.tax), round2(g.tax - half(g.tax)), g.tax], [], ['Made with Cafe Journal — check the figures with your CA before filing.']] },
    { name: 'b2cs', rows: [['Type', 'Place Of Supply', 'Rate', 'Applicable % of Tax Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'], ...g.rates.map((r) => ['OE', g.pos, r.rate, '', r.taxable, 0, ''])] },
    { name: 'hsn', rows: [['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'], ...g.rates.map((r) => ['996331', 'Restaurant service', 'NA', r.bills, round2(r.taxable + r.tax), r.rate, r.taxable, 0, half(r.tax), round2(r.tax - half(r.tax)), 0])] },
    { name: 'docs', rows: [['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'], ['Invoices for outward supply', g.nos[0] || '', g.nos[g.nos.length - 1] || '', g.paid.length + g.cancelled.length, g.cancelled.length]] },
    { name: 'Day-wise (accounts)', rows: [['Date', 'Bills', 'Taxable value', 'CGST', 'SGST', 'Bill total', 'Cash', 'UPI', 'Card', 'Credit'], ...g.days.map((d) => [d.date, d.bills, d.taxable, half(d.tax), round2(d.tax - half(d.tax)), d.total, d.cash, d.upi, d.card, d.credit])] },
  ]);
}

/** Profit & loss for a period, with prime cost (food + staff) */
function pnlData(R) {
  const paid = paidInRange(R).filter((o) => o.method !== 'comp'), exps = expensesInRange(R);
  const sales = round2(sum(paid, (o) => gstOf(o).taxable));
  const byCat = (c) => round2(sum(exps.filter((e) => e.cat === c), (e) => e.amount));
  const purchases = round2(sum((S.stockLog || []).filter((x) => x.type === 'purchase' && inR(x.date, R)), (x) => x.total || 0));
  const food = round2(purchases + byCat('Kitchen') + byCat('Vendor'));
  const recipeFood = round2(sum(paid, typeof billFoodCost === 'function' ? billFoodCost : () => 0));
  let labour = byCat('Salary'), labourEst = false;
  if (!labour) { const monthly = sum((S.staff || []).filter((p) => p.active !== false), (p) => Number(p.salary) || 0); if (monthly) { labour = round2(monthly * Math.min(R.days, 31) / 30); labourEst = true; } }
  const others = ['Rent', 'Utilities', 'Maintenance', 'Marketing', 'Other'].map((c) => [c, byCat(c)]).filter(([, v]) => v);
  const other = round2(sum(others, ([, v]) => v));
  const profit = round2(sales - food - labour - other);
  const p = (v) => (sales ? Math.round((v / sales) * 1000) / 10 : 0);
  return { sales, tax: round2(sum(paid, (o) => o.tax || 0)), purchases, food, recipeFood, labour, labourEst, others, other, profit, foodPct: p(food), labourPct: p(labour), primePct: p(food + labour), profitPct: p(profit) };
}
function pnlCard(R) {
  const d = pnlData(R);
  const row = (l, v, s = '', cls = '') => `<div class="line-row ${cls}"><span>${l}${s ? ` <small class="muted">${s}</small>` : ''}</span><b>${money(v)}</b></div>`;
  const tone = (v, ok, warn) => (v <= ok ? 'pos' : v <= warn ? '' : 'neg');
  return `<section class="card"><div class="card-head">${eyebrow(`Profit & loss · ${R.label}`)}</div>
    ${row('Sales (before tax)', d.sales, d.tax ? `+ ${money(d.tax)} tax collected (not yours)` : '')}
    ${row('− Food & ingredients', d.food, `${d.foodPct}% of sales${d.recipeFood ? ` · recipes say ${money(d.recipeFood)}` : ''}`)}
    ${row('− Staff salaries', d.labour, `${d.labourPct}%${d.labourEst ? ' · estimated from monthly salaries' : ''}`)}
    ${d.others.map(([c, v]) => row(`− ${c}`, v)).join('')}
    ${row('Profit', d.profit, `${d.profitPct}% of sales`, 'total')}
    <div class="pnl-kpis"><span class="${tone(d.foodPct, 35, 40)}">Food cost <b>${d.foodPct}%</b><small>healthy 28–35%</small></span><span class="${tone(d.primePct, 65, 70)}">Prime cost <b>${d.primePct}%</b><small>food + staff · aim ≤ 65%</small></span></div>
    ${d.foodPct > 35 && d.sales ? `<p class="sm neg">${icon('alert')} Food cost is high — check wastage, portion sizes and supplier prices (Stock → Prices), or raise prices on low-profit dishes (menu engineering below).</p>` : ''}
  </section>`;
}

/** Menu engineering for a period: popularity × profit per plate */
function menuEng(R) {
  const qty = {}; paidInRange(R).forEach((o) => o.items.forEach((l) => { if (l.menuId) qty[l.menuId] = (qty[l.menuId] || 0) + l.qty; }));
  const rows = S.menu.filter((m) => qty[m.id] && m.price > 0).map((m) => { const c = typeof dishCost === 'function' ? dishCost(m) : { cost: 0, known: false }; return { m, qty: qty[m.id], margin: round2(m.price - (c.cost || 0)), known: c.known && c.cost > 0 }; });
  const known = rows.filter((r) => r.known);
  if (!known.length) return { rows: [], unknown: rows.length };
  const total = sum(known, (r) => r.qty), avgQty = total / known.length;
  const avgMargin = sum(known, (r) => r.margin * r.qty) / total;
  known.forEach((r) => { const pop = r.qty >= 0.7 * avgQty, prof = r.margin >= avgMargin; r.k = pop && prof ? 'star' : pop ? 'horse' : prof ? 'puzzle' : 'dog'; });
  return { rows: known, unknown: rows.length - known.length, avgMargin };
}
const ME = {
  star: { label: 'Stars', tip: 'Popular and profitable — keep them, show them first, never run out.', cls: 'pos' },
  horse: { label: 'Workhorses', tip: 'Popular but low profit — raise the price a little, or make the portion / recipe cheaper.', cls: '' },
  puzzle: { label: 'Puzzles', tip: 'Profitable but rarely ordered — move them up the menu, let waiters suggest them, add a photo.', cls: '' },
  dog: { label: 'Dogs', tip: 'Neither popular nor profitable — rework or drop them.', cls: 'neg' },
};
function menuEngCard(R) {
  const e = menuEng(R);
  if (!e.rows.length) return `<section class="card">${eyebrow('Menu engineering')}<p class="muted sm">Add recipes with ingredient prices (Menu & recipes) to see which dishes are Stars, Workhorses, Puzzles and Dogs.</p></section>`;
  return `<section class="card me-card">${eyebrow(`Menu engineering · ${R.label}`)}<div class="me-grid">${Object.entries(ME).map(([k, v]) => { const list = e.rows.filter((r) => r.k === k).sort((a, b) => b.qty - a.qty); return `<div class="me-box ${k}"><p class="eyebrow ${v.cls}">${v.label} (${list.length})</p><p class="muted sm">${v.tip}</p>${list.slice(0, 6).map((r) => `<div class="line-row sm"><span>${esc(r.m.name)}</span><small>${r.qty} sold · ${money(r.margin)}/plate</small></div>`).join('') || '<p class="muted sm">—</p>'}</div>`; }).join('')}</div>
    <p class="fine">Popular = sold at least 70% of the average dish. Profitable = earns at least the average ${money(e.avgMargin)} per plate (price − recipe cost).${e.unknown ? ` ${pl(e.unknown, 'dish')} without recipe cost not included.` : ''}</p></section>`;
}

/** Supplier prices: price per unit from every purchase */
function priceHistory(stockId) {
  const out = [];
  (S.stockLog || []).filter((x) => x.type === 'purchase').forEach((p) => (p.lines || []).forEach((l) => { if (l.stockId === stockId && l.qty > 0 && l.amount > 0) out.push({ date: p.date, at: p.at || keyToDate(p.date).getTime(), vendor: p.vendorName || 'Market', unit: round2(l.amount / l.qty), qty: l.qty }); }));
  return out.sort((a, b) => a.at - b.at);
}
/** Items whose latest purchase price went up (vs the purchase before) */
function priceRises(minPct = 5) {
  return S.stock.map((s) => { const h = priceHistory(s.id); if (h.length < 2) return null; const a = h[h.length - 2], b = h[h.length - 1]; const pct = Math.round(((b.unit - a.unit) / a.unit) * 100); return pct >= minPct ? { s, from: a, to: b, pct } : null; }).filter(Boolean);
}
function priceWatchCard() {
  const items = S.stock.map((s) => ({ s, h: priceHistory(s.id) })).filter((x) => x.h.length);
  const rises = priceRises();
  return `<section class="card"><div class="card-head">${eyebrow('Supplier prices')}</div>
    ${rises.length ? `<div class="banner warn">${icon('alert')}<span>Price went up: ${rises.map((r) => `<b>${esc(r.s.name)}</b> +${r.pct}% (${money(r.from.unit)} → ${money(r.to.unit)}/${esc(r.s.unit)}, ${esc(r.to.vendor)})`).join(' · ')}</span></div>` : ''}
    ${items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Last price</th><th>Before</th><th>Change</th><th>Supplier</th></tr></thead><tbody>${items.sort((a, b) => a.s.name.localeCompare(b.s.name)).map(({ s, h }) => { const b = h[h.length - 1], a = h[h.length - 2]; const pct = a ? Math.round(((b.unit - a.unit) / a.unit) * 100) : null; return `<tr><td><button class="link-btn" data-act="priceHist" data-id="${s.id}">${esc(s.name)}</button></td><td>${money(b.unit)}/${esc(s.unit)}</td><td>${a ? money(a.unit) : '—'}</td><td class="${pct > 0 ? 'neg' : pct < 0 ? 'pos' : ''}">${pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct}%`}</td><td>${esc(b.vendor)}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="muted sm">Record purchases (Stock → Bought stock) to see price changes here.</p>'}</section>`;
}
function priceHistSheet(s) {
  const h = priceHistory(s.id);
  const byV = {}; h.forEach((x) => { (byV[x.vendor] = byV[x.vendor] || []).push(x.unit); });
  return `${sheetHead('Price history', `${s.name} (per ${s.unit})`)}
    ${Object.keys(byV).length > 1 ? `<p class="muted sm">Cheapest supplier lately: <b>${esc(Object.entries(byV).map(([v, l]) => [v, l[l.length - 1]]).sort((a, b) => a[1] - b[1])[0][0])}</b></p>` : ''}
    ${h.slice().reverse().map((x, i, arr) => { const prev = arr[i + 1]; const pct = prev ? Math.round(((x.unit - prev.unit) / prev.unit) * 100) : null; return `<div class="line-row"><span>${esc(fmtDate(keyToDate(x.date), { day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(x.vendor)}<small class="muted"> · ${esc(+x.qty.toFixed(2))} ${esc(s.unit)}</small></span><b>${money(x.unit)}${pct ? ` <small class="${pct > 0 ? 'neg' : 'pos'}">${pct > 0 ? '+' : ''}${pct}%</small>` : ''}</b></div>`; }).join('') || '<p class="muted">No purchases yet.</p>'}`;
}

Object.assign(Actions, {
  gstDl() { if (!seesCost()) return; const R = periodRange(App.ui.rep || { mode: 'month', anchor: dayKey() }); saveBlob(`${slug(S.settings?.name)}-gst-${R.short}.xlsx`, gstWorkbook(R)); toast('GST Excel saved — share it with your CA'); },
  priceHist(el) { const s = byId(S.stock, el.dataset.id); if (s) openSheet(priceHistSheet(s)); },
});

/* =========================================================
   For the owner (batch C)
   · Licences & due dates (FSSAI, GST returns, fire NOC…) with reminders
   · Payroll from attendance: absent days, advances, net pay, payslip PDF
   · Guests: visits, spend, birthdays, WhatsApp wishes / offers, loyalty points
   · Change history: who changed a price, a setting, a login or stock, and when
   ========================================================= */

/* ---------------- licences & due dates ---------------- */
const LICENCE_PRESETS = [
  ['FSSAI licence', 12, 60], ['GST return (GSTR-1)', 1, 5], ['GST return (GSTR-3B)', 1, 5], ['Trade licence', 12, 30], ['Fire NOC', 12, 30],
  ['Shop & establishment', 12, 30], ['Pest control', 1, 3], ['Staff medical certificates', 12, 30], ['Water test', 6, 15], ['Weights & measures', 12, 30], ['Liquor licence', 12, 60], ['Signage licence', 12, 30],
];
const licences = () => S.settings?.licences || [];
const daysTo = (k) => Math.round((keyToDate(k) - keyToDate(dayKey())) / 864e5);
const addMonths = (k, n) => { const d = keyToDate(k); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return dayKey(d.getTime()); };
const licDue = () => licences().filter((l) => l.due && daysTo(l.due) <= (Number(l.remind) || 30)).sort((a, b) => a.due.localeCompare(b.due));
function licenceCard() {
  if (!isOwner()) return '';
  const list = licences().slice().sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const when = (l) => { const n = daysTo(l.due); return n < 0 ? `<b class="neg">overdue ${-n} day${n === -1 ? '' : 's'}</b>` : n === 0 ? '<b class="neg">today</b>' : n <= (Number(l.remind) || 30) ? `<b class="warn-t">in ${n} day${n === 1 ? '' : 's'}</b>` : `<span class="muted">${esc(fmtDate(keyToDate(l.due), { day: 'numeric', month: 'short', year: 'numeric' }))}</span>`; };
  return `<section class="card"><div class="card-head">${eyebrow('Licences & due dates')}${btn(list.length ? 'Manage' : 'Add', 'licOpen', { cls: 'ghost sm' })}</div>
    ${list.length ? list.slice(0, 5).map((l) => `<div class="line-row"><span>${esc(l.name)}${l.no ? ` <small class="muted">· ${esc(l.no)}</small>` : ''}</span>${when(l)}</div>`).join('')
      : '<p class="muted sm">Add your FSSAI licence, GST filing dates, fire NOC, trade licence, pest control… and get a reminder before each one is due.</p>'}</section>`;
}
function licSheet() {
  const list = licences().slice().sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return `${sheetHead('Licences & due dates', 'You get a reminder before each one')}
    ${list.map((l) => `<div class="line-row lic-row"><span><b>${esc(l.name)}</b><small class="muted">${l.no ? ` · ${esc(l.no)}` : ''} · due ${esc(fmtDate(keyToDate(l.due), { day: 'numeric', month: 'short', year: 'numeric' }))}${l.every ? ` · every ${l.every} month${l.every > 1 ? 's' : ''}` : ''}</small></span>
      <span class="btn-row tight">${btn(l.every ? 'Done' : 'Renewed', 'licDone', { cls: 'ghost sm', data: `data-id="${l.id}"` })}<button class="icon-btn sm" data-act="licDel" data-id="${l.id}" aria-label="Remove">${icon('trash')}</button></span></div>`).join('')}
    <form class="form" data-form="licAdd">
      ${eyebrow('Add')}
      <label class="field"><span>What</span><select name="preset" data-change="licPreset"><option value="">Choose…</option>${LICENCE_PRESETS.map(([n]) => `<option>${esc(n)}</option>`).join('')}<option value="__other">Something else…</option></select></label>
      <label class="field" id="lic-name" hidden><span>Name</span><input name="name" maxlength="40"></label>
      <div class="row-2"><label class="field"><span>Next due date</span><input name="due" type="date" required></label>
      <label class="field"><span>Licence / ref. no. <em>(optional)</em></span><input name="no" maxlength="30"></label></div>
      <div class="row-2"><label class="field"><span>Repeats every (months, 0 = once)</span><input name="every" type="number" min="0" max="60" value="12"></label>
      <label class="field"><span>Remind me (days before)</span><input name="remind" type="number" min="0" max="180" value="30"></label></div>
      <button class="btn primary block" type="submit">${icon('plus')}<span>Add</span></button>
    </form>`;
}

/* ---------------- payroll ---------------- */
function payrollRows(mk) {
  const dim = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0).getDate();
  return (S.staff || []).filter((p) => p.active !== false && Number(p.salary) > 0).map((p) => {
    const c = { P: 0, L: 0, Lv: 0, A: 0 };
    Object.entries(S.attendance || {}).forEach(([dk, day]) => { if (dk.startsWith(mk) && day && day[p.id]) c[day[p.id]] = (c[day[p.id]] || 0) + 1; });
    const salary = Number(p.salary) || 0, perDay = salary / dim;
    const deduct = round2(perDay * c.A);
    const exp = (S.expenses || []).filter((e) => e.staffId === p.id && e.forMonth === mk);
    const adv = round2(sum(exp.filter((e) => e.advance), (e) => e.amount));
    const paidE = exp.find((e) => !e.advance);
    const net = round2(Math.max(0, salary - deduct - adv));
    return { p, c, salary, deduct, adv, net, paid: paidE || null, dim, advances: exp.filter((e) => e.advance) };
  });
}
function payrollSheet() {
  const mk = App.ui.payMonth || monthKey(), rows = payrollRows(mk);
  return `${sheetHead('Payroll', monthLabel(mk))}
    <div class="row-2"><label class="field"><span>Month</span><input type="month" value="${mk}" max="${monthKey()}" data-change="payMonth"></label></div>
    ${rows.length ? rows.map((r) => `<div class="card pay-row">
      <div class="line-row"><span><b>${esc(r.p.name)}</b><small class="muted"> · ${esc(r.p.empId || '')} · ${money(r.salary)}/month</small></span>${r.paid ? `<span class="badge ok">${icon('check')} Paid ${money(r.paid.amount)}</span>` : `<b>${money(r.net)}</b>`}</div>
      <small class="muted">Present ${r.c.P} · Late ${r.c.L} · Leave ${r.c.Lv} (paid) · Absent ${r.c.A} (−${money(r.deduct)})${r.adv ? ` · Advance −${money(r.adv)}` : ''} · days not marked count as present</small>
      <div class="btn-row tight">${r.paid ? '' : btn(`Pay ${money(r.net)}`, 'payrollPay', { cls: 'primary sm', data: `data-id="${r.p.id}" data-m="${mk}"` })}${btn('Advance', 'payrollAdvOpen', { cls: 'ghost sm', data: `data-id="${r.p.id}" data-m="${mk}"` })}${btn('Payslip', 'payslip', { cls: 'ghost sm', ic: 'download', data: `data-id="${r.p.id}" data-m="${mk}"` })}</div>
    </div>`).join('') : '<p class="muted">Add staff with a monthly salary (Staff) to run payroll.</p>'}
    ${rows.length ? `<p class="line-row total"><span>Total to pay</span><b>${money(sum(rows.filter((r) => !r.paid), (r) => r.net))}</b></p>` : ''}
    <p class="fine">Absent days are cut at salary ÷ days in the month; leave is paid. Paying records the amount in Expenses → Salary.</p>`;
}
function payslipPdf(r, mk) {
  const st = S.settings || {};
  return writePdf([
    { h: `${st.name || ''} — Payslip` }, { p: `${monthLabel(mk)} · ${r.p.name}${r.p.empId ? ` (${r.p.empId})` : ''}${r.p.role ? ` · ${r.p.role}` : ''}` },
    { table: [['Item', 'Amount'], ['Monthly salary', money(r.salary, true)], [`Absent ${r.c.A} day(s)`, `-${money(r.deduct, true)}`], ['Advance taken', `-${money(r.adv, true)}`], ['Net pay', money(r.net, true)]] },
    { p: `Days: present ${r.c.P}, late ${r.c.L}, leave ${r.c.Lv}, absent ${r.c.A} of ${r.dim}.` },
    { p: r.paid ? `Paid on ${fmtDate(keyToDate(r.paid.date), { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'Not paid yet.' },
    { p: 'Signature (employee): ____________________     Signature (employer): ____________________' },
  ], `Payslip ${r.p.name} ${mk}`);
}

/* ---------------- guests & loyalty ---------------- */
const phone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const loyalty = () => ({ on: false, per100: 1, value: 1, ...(S.settings?.loyalty || {}) });
function guestsList() {
  const g = {}; const L = loyalty();
  S.orders.filter((o) => o.status === 'paid' && (o.guest?.phone || o.credit?.phone)).forEach((o) => {
    const ph = phone10(o.guest?.phone || o.credit?.phone); if (ph.length < 10) return;
    const x = g[ph] = g[ph] || { phone: ph, name: '', visits: 0, spend: 0, last: 0, first: o.paidAt, bday: '', anniv: '', earned: 0, used: 0, note: '' };
    x.visits++; x.spend = round2(x.spend + o.total); x.first = Math.min(x.first, o.paidAt);
    if (o.paidAt >= x.last) { x.last = o.paidAt; x.name = o.guest?.name || o.credit?.name || x.name; }
    if (o.guest?.bday) x.bday = o.guest.bday; if (o.guest?.anniv) x.anniv = o.guest.anniv; if (o.guest?.note) x.note = o.guest.note;
    if (o.method !== 'comp') x.earned += Math.floor((o.total || 0) / 100) * L.per100;
    x.used += Number(o.pointsUsed) || 0;
  });
  return Object.values(g).map((x) => ({ ...x, points: Math.max(0, x.earned - x.used) }));
}
const pointsOf = (phone) => { const x = guestsList().find((g) => g.phone === phone10(phone)); return x ? x.points : 0; };
const nextDate = (md) => { if (!md) return null; const t = dayKey(); const y = t.slice(0, 4); let k = `${y}-${md.slice(5)}`; if (k < t) k = `${Number(y) + 1}-${md.slice(5)}`; return k; };
function guestsSheet() {
  const tab = App.ui.gTab || 'all', L = loyalty(), all = guestsList();
  const soon = (k) => { const n = nextDate(k); return n && daysTo(n) <= 7; };
  const list = (tab === 'bday' ? all.filter((g) => soon(g.bday) || soon(g.anniv)) : tab === 'away' ? all.filter((g) => Date.now() - g.last > 30 * 864e5) : all).sort((a, b) => (tab === 'all' ? b.spend - a.spend : a.last - b.last));
  const msg = (g) => (soon(g.bday) ? `Happy birthday ${g.name || ''}! 🎂 Come celebrate at ${S.settings?.name || 'our place'} — a sweet on us.` : soon(g.anniv) ? `Happy anniversary ${g.name || ''}! Celebrate with us at ${S.settings?.name || 'our place'}.` : tab === 'away' ? `Hello ${g.name || ''}, we miss you at ${S.settings?.name || 'our place'}! Come by this week.` : `Hello ${g.name || ''}, thank you for visiting ${S.settings?.name || 'us'}!`);
  const wa = (g) => `https://wa.me/${cur().code === 'INR' ? '91' : ''}${g.phone}?text=${encodeURIComponent(msg(g) + (L.on && g.points ? ` You have ${g.points} points (${money(g.points * L.value)}).` : ''))}`;
  return `${sheetHead('Guests', `${all.length} guests with a mobile number`)}
    <div class="seg">${[['all', 'Top guests'], ['bday', 'Birthdays this week'], ['away', 'Not seen 30+ days']].map(([k, l]) => `<button type="button" class="seg-btn" data-act="gTab" data-k="${k}" aria-pressed="${tab === k}"><span>${l}</span></button>`).join('')}</div>
    <div class="g-list">${list.slice(0, 100).map((g) => `<div class="line-row g-row"><span><b>${esc(g.name || 'Guest')}</b><small class="muted"> · ${esc(g.phone)} · ${pl(g.visits, 'visit')} · ${money(g.spend)} · last ${esc(fmtDate(g.last, { day: 'numeric', month: 'short' }))}${g.bday ? ` · 🎂 ${esc(fmtDate(keyToDate(g.bday), { day: 'numeric', month: 'short' }))}` : ''}${L.on ? ` · ${g.points} pts` : ''}${g.note ? ` · ${esc(g.note)}` : ''}</small></span><a class="btn ghost sm" href="${esc(wa(g))}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('') || '<p class="muted">Nobody here yet. Save the guest\'s mobile on an order (Guest details) to build this list.</p>'}</div>
    <form class="form loy-form" data-form="loyalty"><details${L.on ? ' open' : ''}><summary>${eyebrow('Loyalty points')}</summary>
      <label class="check"><input type="checkbox" name="on" ${L.on ? 'checked' : ''}><span>Give points on every bill (guest's mobile needed)</span></label>
      <div class="row-2"><label class="field"><span>Points per ₹100</span><input name="per100" type="number" min="1" max="100" value="${L.per100}"></label>
      <label class="field"><span>1 point is worth (₹)</span><input name="value" type="number" min="0.1" step="0.1" value="${L.value}"></label></div>
      <button class="btn ghost" type="submit">Save</button></details></form>`;
}

/* ---------------- change history ---------------- */
function logChange(area, what, from, to) { audit('change', { area, what, from: from == null ? '' : String(from), to: to == null ? '' : String(to) }); }
function changesSheet() {
  const f = App.ui.chArea || 'all';
  const all = (S.audit || []).filter((a) => a.type === 'change').sort((a, b) => b.at - a.at);
  const list = all.filter((a) => f === 'all' || a.area === f);
  const areas = ['all', ...new Set(all.map((a) => a.area))];
  return `${sheetHead('Change history', 'Who changed what, and when')}
    <div class="chip-row">${areas.map((a) => `<button class="chip ${a === f ? 'on' : ''}" data-act="chArea" data-k="${esc(a)}">${esc(a === 'all' ? 'All' : a)}</button>`).join('')}</div>
    ${list.slice(0, 200).map((a) => `<div class="line-row ch-row"><span><b>${esc(a.what)}</b>${a.from || a.to ? `<small class="muted"> · ${esc(a.from || '—')} → ${esc(a.to || '—')}</small>` : ''}</span><small class="muted">${esc(a.by)} · ${esc(fmtDate(a.at, { day: 'numeric', month: 'short' }))} ${esc(fmtTime(a.at))}</small></div>`).join('') || '<p class="muted">No changes recorded yet. From now on, price, menu, settings, staff, login and stock changes are listed here.</p>'}`;
}
/** Wrap a form so its changes are recorded: snap() before and after, diff() → [[area, what, from, to]] */
function watchForm(name, snap, diff) {
  const f = Forms[name]; if (typeof f !== 'function' || f.__watched) return;
  const w = function (...args) {
    const before = snap(); const r = f.apply(this, args);
    const fin = () => { try { const d = diff(before, snap()); if (d.length) { d.forEach((x) => logChange(...x)); setTimeout(save, 0); } } catch (e) { /* never block a save */ } };
    if (r && typeof r.then === 'function') return r.then((v) => { fin(); return v; });
    fin(); return r;
  };
  w.__watched = true; Forms[name] = w;
}
const mapBy = (list, pick) => Object.fromEntries((list || []).map((x) => [x.id, pick(x)]));
function installWatches() {
  watchForm('menuItem', () => mapBy(S.menu, (m) => ({ name: m.name, price: m.price, cat: m.cat })), (a, b) => {
    const out = [];
    Object.entries(b).forEach(([id, n]) => { const o = a[id]; if (!o) out.push(['Menu', `New dish: ${n.name}`, '', money(n.price)]); else { if (o.price !== n.price) out.push(['Menu', `Price · ${n.name}`, money(o.price), money(n.price)]); if (o.name !== n.name) out.push(['Menu', 'Dish renamed', o.name, n.name]); } });
    Object.entries(a).forEach(([id, o]) => { if (!b[id]) out.push(['Menu', `Dish removed: ${o.name}`, money(o.price), '']); });
    return out;
  });
  const KEYS = { name: 'Name', tax: 'Tax %', tables: 'Tables', currency: 'Currency', openHour: 'Opening hour', closeHour: 'Closing hour', footer: 'Bill footer', gstin: 'GSTIN', fssai: 'FSSAI no.' };
  ['business', 'floorSettings', 'charges', 'billSettings'].forEach((n) => watchForm(n, () => JSON.parse(JSON.stringify(S.settings || {})), (a, b) => {
    const out = [];
    Object.entries(KEYS).forEach(([k, l]) => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(['Settings', l, a[k] ?? '', b[k] ?? '']); });
    if (JSON.stringify(a.charges) !== JSON.stringify(b.charges)) out.push(['Settings', 'Packing / service charge', JSON.stringify(a.charges || {}), JSON.stringify(b.charges || {})]);
    if (JSON.stringify(a.areas) !== JSON.stringify(b.areas)) out.push(['Settings', 'Tables & areas', (a.areas || []).map((x) => x.name).join(', '), (b.areas || []).map((x) => x.name).join(', ')]);
    return out;
  }));
  ['access', 'setPw', 'userEdit', 'userSave'].forEach((n) => watchForm(n, () => mapBy(S.users, (u) => ({ name: u.name, role: u.role, active: u.active !== false, must: !!u.mustChange })), (a, b) => {
    const out = [];
    Object.entries(b).forEach(([id, n]) => { const o = a[id]; if (!o) out.push(['Team', `Login given: ${n.name}`, '', ROLES[n.role]?.label || n.role]); else { if (o.role !== n.role) out.push(['Team', `Role · ${n.name}`, ROLES[o.role]?.label || o.role, ROLES[n.role]?.label || n.role]); if (o.active !== n.active) out.push(['Team', `Login ${n.active ? 'switched on' : 'switched off'}: ${n.name}`, '', '']); if (!o.must && n.must) out.push(['Team', `Password reset: ${n.name}`, '', '']); } });
    Object.entries(a).forEach(([id, o]) => { if (!b[id] && !Object.values(b).some((x) => x.name === o.name)) out.push(['Team', `Login removed: ${o.name}`, '', '']); });
    return out;
  }));
  watchForm('staff', () => mapBy(S.staff, (p) => ({ name: p.name, salary: Number(p.salary) || 0, active: p.active !== false })), (a, b) => {
    const out = [];
    Object.entries(b).forEach(([id, n]) => { const o = a[id]; if (!o) out.push(['Staff', `New staff: ${n.name}`, '', '']); else { if (o.salary !== n.salary) out.push(['Staff', `Salary · ${n.name}`, money(o.salary), money(n.salary)]); if (o.active !== n.active) out.push(['Staff', `${n.name} ${n.active ? 'back at work' : 'left'}`, '', '']); } });
    return out;
  });
  watchForm('stockItem', () => mapBy(S.stock, (s) => ({ name: s.name, qty: Number(s.qty), unit: s.unit, cost: Number(s.cost) || 0 })), (a, b) => {
    const out = [];
    Object.entries(b).forEach(([id, n]) => { const o = a[id]; if (!o) out.push(['Stock', `New stock item: ${n.name}`, '', `${n.qty} ${n.unit}`]); else { if (o.qty !== n.qty) out.push(['Stock', `Stock count · ${n.name}`, `${o.qty} ${n.unit}`, `${n.qty} ${n.unit}`]); if (o.cost !== n.cost) out.push(['Stock', `Cost · ${n.name}`, money(o.cost), money(n.cost)]); } });
    return out;
  });
}
window.addEventListener('load', installWatches); // after every module (and the online mode) has set up its forms

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  licOpen() { if (isOwner()) openSheet(licSheet()); },
  licDone(el) {
    const l = licences().find((x) => x.id === el.dataset.id); if (!l) return;
    if (l.every) { const was = l.due; l.due = addMonths(l.due, Number(l.every)); logChange('Licences', `${l.name} done`, was, l.due); }
    else { const d = prompt(`New expiry date for ${l.name} (YYYY-MM-DD)`, addMonths(l.due, 12)); if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return; logChange('Licences', `${l.name} renewed`, l.due, d); l.due = d; }
    save(); openSheet(licSheet());
  },
  licDel(el) { if (!confirm('Remove this reminder?')) return; S.settings.licences = licences().filter((x) => x.id !== el.dataset.id); save(); openSheet(licSheet()); },
  payrollOpen() { if (!isOwner()) return; App.ui.payMonth = App.ui.payMonth || monthKey(); openSheet(payrollSheet(), { wide: true }); },
  payrollPay(el) {
    const r = payrollRows(el.dataset.m).find((x) => x.p.id === el.dataset.id); if (!r || r.paid) return;
    if (!confirm(`Pay ${r.p.name} ${money(r.net)} for ${monthLabel(el.dataset.m)}?`)) return;
    S.expenses.push({ id: uid('e'), date: dayKey(), cat: 'Salary', title: `Salary · ${r.p.name} · ${monthLabel(el.dataset.m)}`, amount: r.net, staffId: r.p.id, forMonth: el.dataset.m });
    save(); openSheet(payrollSheet(), { wide: true }); toast(`Paid ${money(r.net)} to ${r.p.name}`);
  },
  payrollAdvOpen(el) {
    const p = byId(S.staff, el.dataset.id); if (!p) return;
    const a = Number(prompt(`Advance for ${p.name} (₹)`, '')); if (!(a > 0)) return;
    S.expenses.push({ id: uid('e'), date: dayKey(), cat: 'Salary', title: `Advance · ${p.name}`, amount: round2(a), staffId: p.id, forMonth: el.dataset.m, advance: true });
    logChange('Staff', `Advance · ${p.name}`, '', money(a));
    save(); openSheet(payrollSheet(), { wide: true }); toast('Advance recorded — it comes off this month\'s salary');
  },
  payslip(el) { const r = payrollRows(el.dataset.m).find((x) => x.p.id === el.dataset.id); if (r) saveBlob(`payslip-${slug(r.p.name)}-${el.dataset.m}.pdf`, payslipPdf(r, el.dataset.m)); },
  guestsOpen() { App.ui.gTab = App.ui.gTab || 'all'; openSheet(guestsSheet(), { wide: true }); },
  gTab(el) { App.ui.gTab = el.dataset.k; openSheet(guestsSheet(), { wide: true }); },
  changesOpen() { if (!isOwner()) return; openSheet(changesSheet(), { wide: true }); },
  chArea(el) { App.ui.chArea = el.dataset.k; openSheet(changesSheet(), { wide: true }); },
  usePoints(el) {
    const o = byId(S.orders, el.dataset.id); if (!o || o.status !== 'open') return;
    const L = loyalty(), pts = pointsOf(o.guest?.phone), sub = orderSubtotal(o);
    const n = Math.min(pts, Math.floor((sub - (o.discount || 0)) / L.value)); if (n <= 0) return;
    o.pointsUsed = n; o.discount = round2((o.discount || 0) + n * L.value);
    save(); toast(`${n} points used — ${money(n * L.value)} off`);
  },
});
Object.assign(Changes, {
  licPreset(el) { const box = $('#lic-name'); const p = LICENCE_PRESETS.find(([n]) => n === el.value); if (box) box.hidden = el.value !== '__other'; if (p) { const f = el.form; f.every.value = p[1]; f.remind.value = p[2]; } },
  payMonth(el) { if (el.value) { App.ui.payMonth = el.value; openSheet(payrollSheet(), { wide: true }); } },
});
Object.assign(Forms, {
  licAdd(fd) {
    const preset = fd.get('preset'), name = String(preset === '__other' ? fd.get('name') : preset || '').trim();
    if (!name) return formError('Choose what it is.');
    const due = fd.get('due'); if (!due) return formError('Pick the next due date.');
    S.settings.licences = [...licences(), { id: uid('lic'), name: name.slice(0, 40), no: String(fd.get('no') || '').trim().slice(0, 30), due, every: Math.max(0, Number(fd.get('every')) || 0), remind: Math.max(0, Number(fd.get('remind')) || 0) }];
    logChange('Licences', `Added: ${name}`, '', due);
    save(); openSheet(licSheet()); toast('Reminder added');
  },
  loyalty(fd) {
    if (!isOwner()) return;
    const was = loyalty().on;
    S.settings.loyalty = { on: fd.get('on') === 'on', per100: Math.max(1, Number(fd.get('per100')) || 1), value: Math.max(0.1, Number(fd.get('value')) || 1) };
    if (was !== S.settings.loyalty.on) logChange('Settings', 'Loyalty points', was ? 'on' : 'off', S.settings.loyalty.on ? 'on' : 'off');
    save(); openSheet(guestsSheet(), { wide: true }); toast('Loyalty points saved');
  },
});
