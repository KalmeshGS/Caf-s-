'use strict';
/* =========================================================
   Service extras (captain batch 3 — some for every role)
   · Waitlist for walk-ins (seat in one tap, WhatsApp "table ready")
   · Discount / free item: floor staff ask, a manager or the owner approves
   · Opening & closing checklists (name + time on every tick)
   · Guest details on an order, guest feedback after the bill
   · Day summary for every role
   ========================================================= */

const APPROVER_ROLES = ['owner', 'manager'];
const isApprover = () => APPROVER_ROLES.includes(Session.role());

/* ---------------- waitlist ---------------- */
const waitingNow = () => (S.waitlist || []).filter((w) => w.status === 'waiting' && w.date === dayKey()).sort((a, b) => a.at - b.at);
function waitlistBlock() {
  const list = waitingNow();
  const wa = (w) => { const d = String(w.phone || '').replace(/\D/g, ''); return d.length >= 10 ? `https://wa.me/${d.length === 10 && cur().code === 'INR' ? '91' + d : d}?text=${encodeURIComponent(`Hello ${w.name}, your table at ${S.settings?.name || 'our restaurant'} is ready. Please come in!`)}` : ''; };
  return `<section class="card fb-block wl-block ${list.length ? 'bill' : ''}"><div class="card-head">${eyebrow('Waitlist')}<b class="fb-n">${list.length}</b></div>
    ${list.length ? list.map((w) => `<div class="line-row wl-row"><span><strong>${esc(w.name)} · ${pl(w.guests, 'guest')}</strong><small class="muted">${w.phone ? esc(w.phone) + ' · ' : ''}quoted ${w.quote} min${w.note ? ' · ' + esc(w.note) : ''}</small></span>
      <span class="timer ${Date.now() - w.at > w.quote * 60000 ? 'over' : ''}" data-since="${w.at}">${icon('clock')}<span>${elapsed(w.at)}</span></span>
      <span class="btn-row tight">${btn('Seat', 'wlSeatOpen', { cls: 'primary sm', data: `data-id="${w.id}"` })}${wa(w) ? `<a class="btn ghost sm" href="${esc(wa(w))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button class="icon-btn sm" data-act="wlLeft" data-id="${w.id}" aria-label="Left without a table" title="Left">${icon('x')}</button></span></div>`).join('')
      : '<p class="muted sm">Nobody waiting. When every table is full, add walk-ins here with a quoted waiting time.</p>'}
    ${btn('Add to waitlist', 'wlAddOpen', { cls: 'ghost sm', ic: 'plus' })}
  </section>`;
}
function wlAddSheet() {
  const freeN = tableNames().filter((t) => !busyTables().has(t)).length;
  return `${sheetHead('Waitlist', 'Add a walk-in group')}
    <form class="form" data-form="wlAdd">
      ${freeN ? `<div class="banner info">${icon('check')}<span>${pl(freeN, 'table')} free right now — you can seat them straight away.</span></div>` : ''}
      <div class="row-2"><label class="field"><span>Name</span><input name="name" required maxlength="30" autocomplete="off"></label>
      <label class="field"><span>Guests</span><input name="guests" type="number" min="1" max="99" value="2" required></label></div>
      <div class="row-2"><label class="field"><span>Mobile <em>(for WhatsApp)</em></span><input name="phone" type="tel" inputmode="tel" maxlength="15" autocomplete="off"></label>
      <label class="field"><span>Quoted wait (min)</span><input name="quote" type="number" min="0" max="240" value="15"></label></div>
      <label class="field"><span>Note <em>(optional)</em></span><input name="note" maxlength="60" placeholder="e.g. needs a high chair, AC area"></label>
      <button class="btn primary block" type="submit">${icon('plus')}<span>Add to waitlist</span></button>
    </form>`;
}
function wlSeatSheet(w) {
  const busy = busyTables();
  return `${sheetHead('Seat', `${w.name} · ${pl(w.guests, 'guest')}`)}
    ${tableAreas().map((a) => { const free = a.tables.filter((t) => !busy.has(t) && (S.tableState?.[t]?.status !== 'blocked')); return free.length ? `${eyebrow(areaTitle(a))}<div class="chip-row">${free.map((t) => `<button class="chip ${S.tableState?.[t]?.status === 'cleaning' ? 'warn-chip' : ''}" data-act="wlSeat" data-id="${w.id}" data-t="${esc(t)}">${esc(t)}${S.tableState?.[t]?.status === 'cleaning' ? ' · needs cleaning' : ''}</button>`).join('')}</div>` : ''; }).join('') || '<p class="muted">No free table yet.</p>'}`;
}

/* ---------------- discount / free item approval ---------------- */
const pendingApprovals = () => openOrders().filter((o) => o.discReq && o.discReq.status === 'pending');
function discAskSheet(o) {
  return `${sheetHead('Ask for a discount', `${orderLabel(o)} · ${money(orderSubtotal(o))}`)}
    <form class="form" data-form="discAsk" data-id="${o.id}">
      <div class="seg" role="radiogroup">${[['amt', '₹ off'], ['pct', '% off'], ['free', 'Make an item free']].map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''} data-change="discKind"><span>${l}</span></label>`).join('')}</div>
      <label class="field disc-x" data-k="amt"><span>Amount off</span><input name="amt" type="number" min="1" step="any" inputmode="decimal"></label>
      <label class="field disc-x" data-k="pct" hidden><span>Percent off</span><input name="pct" type="number" min="1" max="100" step="any" inputmode="decimal"></label>
      <label class="field disc-x" data-k="free" hidden><span>Item</span><select name="line">${o.items.map((l) => `<option value="${l.id}">${esc(l.name)} × ${l.qty} — ${money(l.qty * l.price)}</option>`).join('')}</select></label>
      <label class="field"><span>Reason</span><input name="reason" required maxlength="80" placeholder="e.g. food came late, regular guest, birthday"></label>
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('send')}<span>Ask the manager</span></button>
    </form>`;
}
function approvalsBlock() {
  const list = pendingApprovals();
  if (!list.length && !isApprover()) return '';
  return `<section class="card fb-block ${list.length ? 'late' : ''}"><div class="card-head">${eyebrow('Waiting for approval')}<b class="fb-n">${list.length}</b></div>
    ${list.length ? list.map((o) => `<div class="line-row appr-row"><span><strong>${esc(orderLabel(o))} · ${money(o.discReq.amount)} off</strong><small class="muted">${esc(o.discReq.what)} · ${esc(o.discReq.reason)} · asked by ${esc(o.discReq.by || '')}</small></span>
      ${isApprover() ? `<span class="btn-row tight">${btn('Approve', 'discDecide', { cls: 'primary sm', data: `data-id="${o.id}" data-v="approved"` })}${btn('No', 'discDecide', { cls: 'ghost sm', data: `data-id="${o.id}" data-v="rejected"` })}</span>` : '<small class="muted">waiting…</small>'}</div>`).join('')
      : '<p class="muted sm">Discounts and free items asked for by the floor show up here for the manager / owner.</p>'}
  </section>`;
}
/** Manager / owner: alert on a new request. The person who asked: alert on the answer. */
function checkApprovals() {
  const me = Session.user(); if (!me) { App.apprSeen = null; return; }
  const reqs = openOrders().filter((o) => o.discReq).map((o) => ({ o, k: `${o.id}:${o.discReq.at}:${o.discReq.status}` }));
  const prev = App.apprSeen; App.apprSeen = new Set(reqs.map((r) => r.k));
  if (!prev) return;
  reqs.filter((r) => !prev.has(r.k)).forEach(({ o }) => {
    const d = o.discReq;
    if (d.status === 'pending' && isApprover() && d.byId !== me.id) phoneAlert(`Approve? ${money(d.amount)} off · ${orderLabel(o)}`, `${d.what} — ${d.reason} (asked by ${d.by})`, 'approval');
    if (d.status !== 'pending' && d.byId === me.id) phoneAlert(`${d.status === 'approved' ? 'Approved ✓' : 'Not approved'} · ${orderLabel(o)}`, `${money(d.amount)} off — ${d.what}${d.decidedBy ? ` (${d.decidedBy})` : ''}`, 'approval');
  });
}

/* ---------------- opening & closing checklists ---------------- */
const CHECK_DEFAULTS = {
  open: ['Tables wiped and set (cutlery, napkins, menus)', 'Floor swept and mopped', 'Washrooms clean and stocked', 'Side station stocked (water, glasses, cutlery)', 'Lights, AC and music on', 'Staff in uniform and briefed (specials, finished dishes)', "Today's reservations checked", 'Bill printer paper and change ready'],
  close: ['All bills paid or handed over', 'Tables cleared and wiped', 'Leftover food stored / recorded', 'Side station cleaned and restocked', 'Lights, AC, gas and taps off', 'Doors and windows locked'],
};
const checkItems = (k) => (S.settings?.checklists?.[k]?.length ? S.settings.checklists[k] : CHECK_DEFAULTS[k]);
const checksToday = () => (S.checks || {})[dayKey()] || {};
const checkDone = (k) => checkItems(k).filter((it) => checksToday()[k]?.[it]).length;
function checklistCard() {
  const c = (k, label) => { const n = checkDone(k), all = checkItems(k).length; return `<button class="list-btn ck-btn ${n === all ? 'done' : ''}" data-act="checklistOpen" data-k="${k}"><span><strong>${label}</strong><small>${n === all ? 'All done ✓' : `${n} of ${all} done`}</small></span><b>${n}/${all}</b></button>`; };
  return `<section class="card fb-block"><div class="card-head">${eyebrow('Checklists')}</div>${c('open', 'Opening checklist')}${c('close', 'Closing checklist')}</section>`;
}
function checklistSheet(k) {
  const done = checksToday()[k] || {};
  return `${sheetHead(k === 'open' ? 'Before service' : 'After service', k === 'open' ? 'Opening checklist' : 'Closing checklist')}
    <div class="ck-list">${checkItems(k).map((it, i) => `<label class="check ck-row"><input type="checkbox" data-act="checkTick" data-k="${k}" data-i="${i}" ${done[it] ? 'checked' : ''}><span>${esc(it)}${done[it] ? `<small class="muted"> · ${esc(done[it].by)} · ${esc(fmtTime(done[it].at))}</small>` : ''}</span></label>`).join('')}</div>
    ${Session.role() === 'owner' ? `<details class="ck-edit"><summary class="muted sm">Change this list</summary><form class="form" data-form="checklistEdit" data-k="${k}"><label class="field"><span>One item per line</span><textarea name="items" rows="8">${esc(checkItems(k).join('\n'))}</textarea></label><button class="btn ghost" type="submit">Save list</button></form></details>` : ''}`;
}

/* ---------------- guest details & feedback ---------------- */
function guestSheet(o) {
  const g = o.guest || {};
  return `${sheetHead('Guest', orderLabel(o))}
    <form class="form" data-form="guest" data-id="${o.id}">
      <div class="row-2"><label class="field"><span>Name</span><input name="name" maxlength="40" value="${esc(g.name || '')}" autocomplete="off"></label>
      <label class="field"><span>Mobile</span><input name="phone" type="tel" inputmode="tel" maxlength="15" value="${esc(g.phone || '')}" autocomplete="off"></label></div>
      <div class="row-2"><label class="field"><span>Birthday <em>(optional)</em></span><input name="bday" type="date" value="${esc(g.bday || '')}"></label>
      <label class="field"><span>Anniversary <em>(optional)</em></span><input name="anniv" type="date" value="${esc(g.anniv || '')}"></label></div>
      <label class="field"><span>Likes / notes <em>(optional)</em></span><input name="note" maxlength="80" value="${esc(g.note || '')}" placeholder="e.g. less spicy, window seat"></label>
      ${o.guest?.phone ? '' : guestHistoryHint(o)}
      <button class="btn primary block" type="submit">${icon('check')}<span>Save guest</span></button>
      <p class="fine">Only for this café's own records — never shared.</p>
    </form>`;
}
const guestHistoryHint = () => '';
/** Earlier visits of a guest (by mobile number) */
function guestVisits(phone) {
  const d = String(phone || '').replace(/\D/g, '').slice(-10); if (d.length < 10) return [];
  return S.orders.filter((o) => o.status === 'paid' && String(o.guest?.phone || '').replace(/\D/g, '').slice(-10) === d);
}
const STARS = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
function feedbackHtml(o) {
  if (o.status !== 'paid') return '';
  return `<div class="fbk" data-id="${o.id}"><span class="muted sm">${o.rating ? 'Guest feedback' : 'How was it? Ask the guest:'}</span>
    <div class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${o.rating >= n ? 'on' : ''}" data-act="rate" data-id="${o.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
    ${o.rating && o.rating <= 3 ? `<input class="inline-input fbk-note" maxlength="100" placeholder="What went wrong? (optional)" value="${esc(o.feedback || '')}" data-change="rateNote" data-id="${o.id}">` : ''}</div>`;
}
/** Floor board: tables paid in the last 30 minutes, ask for feedback */
function feedbackBlock() {
  const list = paidOn(dayKey()).filter((o) => o.table !== 'Takeaway' && !o.rating && Date.now() - o.paidAt < 30 * 60000).sort((a, b) => b.paidAt - a.paidAt).slice(0, 6);
  if (!list.length) return '';
  return `<section class="card fb-block"><div class="card-head">${eyebrow('Ask for feedback')}<b class="fb-n">${list.length}</b></div>
    ${list.map((o) => `<div class="line-row"><span><strong>${esc(orderLabel(o))}${o.guest?.name ? ' · ' + esc(o.guest.name) : ''}</strong><small class="muted">paid ${esc(ago(o.paidAt))} · ${money(o.total)}</small></span>${feedbackHtml(o)}</div>`).join('')}
  </section>`;
}

/* ---------------- day summary (every role) ---------------- */
function daySheet() {
  const me = Session.user(), role = Session.role(), today = dayKey();
  const paid = paidOn(today), tablePaid = paid.filter((o) => o.table !== 'Takeaway');
  const mins = (list) => (list.length ? Math.round(sum(list, (o) => (o.paidAt - o.createdAt) / 60000) / list.length) : 0);
  const rated = (list) => list.filter((o) => o.rating);
  const avgR = (list) => { const r = rated(list); return r.length ? (sum(r, (o) => o.rating) / r.length).toFixed(1) : '—'; };
  const stat = (l, v, s = '') => `<div class="kpi card"><p class="eyebrow">${l}</p><p class="kpi-v">${v}</p>${s ? `<p class="kpi-s">${s}</p>` : ''}</div>`;
  let body = '';
  if (role === 'kitchen') {
    const done = S.kots.filter((k) => k.readyAt && dayKey(k.readyAt) === today);
    const cook = done.length ? Math.round(sum(done, (k) => (k.readyAt - k.createdAt) / 60000) / done.length) : 0;
    body = `<div class="kpis">${stat('Tickets ready', done.length)}${stat('Average time to ready', `${cook} min`)}${stat('Late (15+ min)', done.filter((k) => k.readyAt - k.createdAt > 15 * 60000).length)}${stat('Waiting now', S.kots.filter((k) => k.status === 'new' || k.status === 'cooking').length)}</div>`;
  } else if (role === 'housekeeping') {
    const dirty = Object.values(S.tableState || {}).filter((s) => s && s.status === 'cleaning').length;
    body = `<div class="kpis">${stat('Tables paid today', tablePaid.length, 'each one needed cleaning')}${stat('Waiting to be cleaned', dirty)}</div>`;
  } else if (role === 'waiter' || role === 'captain') {
    const mine = paid.filter((o) => o.byId === me.id || (o.table !== 'Takeaway' && waiterOf(o.table)?.id === me.id));
    body = `<div class="kpis">${stat('My bills', mine.length)}${stat('My sales', money(sum(mine, (o) => o.total)))}${stat('Average table time', `${mins(mine.filter((o) => o.table !== 'Takeaway'))} min`)}${stat('Guest rating', avgR(mine), `${rated(mine).length} rated`)}</div>`;
  }
  if (['owner', 'manager', 'captain', 'cashier'].includes(role)) {
    const per = {}; paid.forEach((o) => { const w = (o.table !== 'Takeaway' && waiterOf(o.table)?.name) || o.by || '—'; (per[w] = per[w] || []).push(o); });
    body += `<div class="kpis">${stat('Bills', paid.length)}${stat('Sales', money(sum(paid, (o) => o.total)))}${stat('Tables served', tablePaid.length, `avg ${mins(tablePaid)} min at the table`)}${stat('Guest rating', avgR(paid), `${rated(paid).length} of ${paid.length} rated`)}</div>
      ${Object.keys(per).length ? `<h3 class="section-t">By waiter</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waiter</th><th>Bills</th><th>Sales</th><th>Avg table time</th><th>Rating</th></tr></thead><tbody>${Object.entries(per).sort((a, b) => sum(b[1], (o) => o.total) - sum(a[1], (o) => o.total)).map(([w, l]) => `<tr><td>${esc(w)}</td><td>${l.length}</td><td>${money(sum(l, (o) => o.total))}</td><td>${mins(l.filter((o) => o.table !== 'Takeaway'))} min</td><td>${avgR(l)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${tableAreas().length > 1 ? `<h3 class="section-t">By section</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Section</th><th>Tables served</th><th>Sales</th></tr></thead><tbody>${tableAreas().map((a) => { const l = tablePaid.filter((o) => a.tables.includes(o.table)); return `<tr><td>${esc(areaTitle(a))}</td><td>${l.length}</td><td>${money(sum(l, (o) => o.total))}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
  }
  const lows = paid.filter((o) => o.rating && o.rating <= 3);
  if (lows.length && ['owner', 'manager', 'captain'].includes(role)) body += `<h3 class="section-t">Unhappy guests</h3>${lows.map((o) => `<div class="line-row"><span>${esc(orderLabel(o))}${o.guest?.name ? ' · ' + esc(o.guest.name) : ''} · ${STARS(o.rating)}</span><small class="muted">${esc(o.feedback || '')}</small></div>`).join('')}`;
  return `${sheetHead('Day summary', `${ROLES[role]?.label || ''} · ${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' })}`)}${body || '<p class="muted">Nothing yet today.</p>'}`;
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  wlAddOpen() { openSheet(wlAddSheet()); },
  wlSeatOpen(el) { const w = byId(S.waitlist || [], el.dataset.id); if (w) openSheet(wlSeatSheet(w)); },
  wlSeat(el) {
    const w = byId(S.waitlist || [], el.dataset.id), t = el.dataset.t; if (!w) return closeSheet();
    if (busyTables().has(t)) return toast(`${tableTitle(t)} is not free any more.`);
    Object.assign(w, { status: 'seated', table: t, seatedAt: Date.now() });
    if (S.tableState?.[t] && S.tableState[t].status !== 'blocked') delete S.tableState[t];
    App.ui.seatGuest = { t, name: w.name, phone: w.phone || '' };
    closeSheet(); save(); toast(`${w.name} seated at ${tableTitle(t)} ✓`);
    go('orders', { t });
  },
  wlLeft(el) { const w = byId(S.waitlist || [], el.dataset.id); if (!w || !confirm(`${w.name} left without a table?`)) return; w.status = 'left'; w.leftAt = Date.now(); save(); },
  discAskOpen(el) { const o = byId(S.orders, el.dataset.id); if (o && o.status === 'open') openSheet(discAskSheet(o)); },
  discDecide(el) {
    if (!isApprover()) return;
    const o = byId(S.orders, el.dataset.id); if (!o || !o.discReq || o.discReq.status !== 'pending') return;
    const me = Session.user(), v = el.dataset.v;
    Object.assign(o.discReq, { status: v, decidedBy: me?.name || '', decidedAt: Date.now() });
    if (v === 'approved') { o.discount = Math.min(orderSubtotal(o), round2(Number(o.discount || 0) + o.discReq.amount)); }
    save(); toast(v === 'approved' ? `Approved: ${money(o.discReq.amount)} off ${orderLabel(o)}` : 'Not approved');
  },
  checklistOpen(el) { openSheet(checklistSheet(el.dataset.k)); },
  checkTick(el) {
    const k = el.dataset.k, it = checkItems(k)[Number(el.dataset.i)]; if (!it) return;
    const me = Session.user(), day = dayKey();
    S.checks = S.checks || {}; const d = S.checks[day] = S.checks[day] || {}; d[k] = d[k] || {};
    if (el.checked) d[k][it] = { by: me?.name || '', at: Date.now() }; else delete d[k][it];
    save();
    const sh = $('#sheet'); if (sh && !sh.hidden) { const body = sh.querySelector('.sheet-body') || sh; const html = checklistSheet(k); const tmp = document.createElement('div'); tmp.innerHTML = html; const nl = tmp.querySelector('.ck-list'); const ol = sh.querySelector('.ck-list'); if (nl && ol) ol.replaceWith(nl); }
  },
  guestOpen(el) { const o = byId(S.orders, el.dataset.id); if (o) openSheet(guestSheet(o)); },
  rate(el) {
    const o = byId(S.orders, el.dataset.id); if (!o || o.status !== 'paid') return;
    o.rating = Number(el.dataset.n); save();
    toast(o.rating >= 4 ? 'Thanks — feedback saved ⭐' : 'Saved — add what went wrong if you can');
  },
  daySheetOpen() { openSheet(daySheet()); },
});
Object.assign(Changes, {
  discKind(el) { $$('#sheet .disc-x').forEach((x) => { x.hidden = x.dataset.k !== el.value; }); },
  rateNote(el) { const o = byId(S.orders, el.dataset.id); if (!o || o.status !== 'paid') return; o.feedback = el.value.trim().slice(0, 100); setTimeout(save, 0); }, // may fire while the screen redraws (blur)
});
Object.assign(Forms, {
  wlAdd(fd) {
    const name = String(fd.get('name') || '').trim(); if (!name) return formError('Enter a name.');
    S.waitlist = S.waitlist || [];
    S.waitlist.push({ id: uid('w'), name: name.slice(0, 30), guests: Math.max(1, Math.min(99, Number(fd.get('guests')) || 1)), phone: String(fd.get('phone') || '').trim().slice(0, 15), quote: Math.max(0, Math.min(240, Number(fd.get('quote')) || 0)), note: String(fd.get('note') || '').trim().slice(0, 60), status: 'waiting', at: Date.now(), date: dayKey(), by: Session.user()?.name || '' });
    closeSheet(); save(); toast(`${name} added to the waitlist`);
  },
  discAsk(fd, form) {
    const o = byId(S.orders, form.dataset.id); if (!o || o.status !== 'open') return closeSheet();
    const sub = orderSubtotal(o), kind = fd.get('kind'), reason = String(fd.get('reason') || '').trim();
    let amount = 0, what = '';
    if (kind === 'amt') { amount = Number(fd.get('amt')); what = `${money(amount)} off`; }
    else if (kind === 'pct') { const p = Number(fd.get('pct')); amount = round2(sub * p / 100); what = `${p}% off`; }
    else { const l = o.items.find((x) => x.id === fd.get('line')); if (l) { amount = round2(l.qty * l.price); what = `${l.qty} × ${l.name} free`; } }
    if (!(amount > 0)) return formError('Enter how much.');
    if (amount > sub) return formError(`It can't be more than the bill (${money(sub)}).`);
    if (!reason) return formError('Say why — the manager sees it.');
    const me = Session.user();
    if (isApprover()) { o.discount = Math.min(sub, round2(Number(o.discount || 0) + amount)); o.discReq = { amount, what, reason, by: me?.name || '', byId: me?.id || '', at: Date.now(), status: 'approved', decidedBy: me?.name || '', decidedAt: Date.now() }; closeSheet(); save(); return toast(`${money(amount)} off ${orderLabel(o)} ✓`); }
    o.discReq = { amount, what, reason, by: me?.name || '', byId: me?.id || '', at: Date.now(), status: 'pending' };
    closeSheet(); save(); toast('Asked — the manager / owner gets an alert');
  },
  checklistEdit(fd, form) {
    if (Session.role() !== 'owner') return;
    const items = String(fd.get('items') || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
    S.settings.checklists = { ...(S.settings.checklists || {}), [form.dataset.k]: items };
    save(); openSheet(checklistSheet(form.dataset.k)); toast('Checklist saved');
  },
  guest(fd, form) {
    const o = byId(S.orders, form.dataset.id); if (!o) return closeSheet();
    const g = {}; ['name', 'phone', 'bday', 'anniv', 'note'].forEach((k) => { const v = String(fd.get(k) || '').trim(); if (v) g[k] = v.slice(0, 80); });
    if (g.phone && String(g.phone).replace(/\D/g, '').length < 10) return formError('Enter a 10-digit mobile number (or leave it empty).');
    if (Object.keys(g).length) o.guest = g; else delete o.guest;
    closeSheet(); save();
    const n = g.phone ? guestVisits(g.phone).length : 0;
    toast(n ? `Guest saved — welcome back! ${pl(n, 'earlier visit')}` : 'Guest saved');
  },
});
