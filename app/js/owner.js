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
