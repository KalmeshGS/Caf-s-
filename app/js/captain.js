'use strict';
/* =========================================================
   Running the floor (captain, waiters, managers)
   · On duty today: everyone who logs in is listed for today's shift
   · Sections & waiters: give tables / whole areas to a waiter for the shift
   · Request bill / print bill at the table (the cashier is alerted)
   · "Finished today": switch a dish off for everyone from the floor
   · Floor board: late food, food to serve, bills asked for, tables to clean
   ========================================================= */

const ASSIGN_ROLES = ['owner', 'manager', 'captain'];
const SERVER_ROLES = ['waiter', 'captain', 'manager', 'cashier'];
const ORDER_TAKERS = ['owner', 'manager', 'cashier', 'waiter', 'captain'];
const canAssign = () => ASSIGN_ROLES.includes(Session.role());

/* ---------------- on duty today ---------------- */
/** Register the logged-in person for today's shift (so the captain can give them tables) */
function checkDuty() {
  const me = Session.user(); if (!me || !SERVER_ROLES.includes(me.role)) return;
  S.duty = S.duty || {};
  const d = S.duty[me.id], today = dayKey();
  if (d && d.day === today && d.name === me.name && d.role === me.role) return;
  S.duty[me.id] = { name: me.name, role: me.role, day: today, at: Date.now() };
  setTimeout(save, 0); // never save from inside a render
}
/** People on the floor today (waiters first) */
/** Everyone who can serve tables: the staff list (kept by the owner's app) + who logged in today */
function onDuty() {
  const today = dayKey(), people = {};
  (S.team?.people || []).forEach((p) => { if (p && SERVER_ROLES.includes(p.role)) people[p.id] = { ...p, duty: false }; });
  Object.entries(S.duty || {}).forEach(([id, d]) => { if (d && SERVER_ROLES.includes(d.role)) people[id] = { ...(people[id] || {}), id, name: d.name, role: d.role, duty: d.day === today }; });
  return Object.values(people).sort((a, b) => (b.duty ? 1 : 0) - (a.duty ? 1 : 0) || SERVER_ROLES.indexOf(a.role) - SERVER_ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
}
/** Owner's app: keep a plain staff list (name + role only) that the captain can read */
function syncTeam() {
  const me = Session.user(); if (!me || me.role !== 'owner') return;
  const people = (S.users || []).filter((u) => u && u.active !== false && SERVER_ROLES.includes(u.role)).map((u) => ({ id: u.id, name: u.name, role: u.role })).sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(people) === JSON.stringify(S.team?.people || null)) return;
  S.team = { people, at: Date.now() };
  setTimeout(save, 0);
}
const firstName = (n) => String(n || '').split(' ')[0];

/* ---------------- sections & waiters ---------------- */
const areaKey = (a) => (a && (a.id || a.name)) || 'main';
/** Today's assignment (it starts empty every day) */
function floorPlan() { const f = S.floor; return f && f.day === dayKey() ? f : { day: dayKey(), area: {}, table: {} }; }
/** Who looks after a table today → { id, name } or null */
function waiterOf(t) {
  const f = floorPlan(); const id = (f.table || {})[t] || (f.area || {})[areaKey(areaOf(t))];
  if (!id) return null;
  return { id, name: (S.duty || {})[id]?.name || (S.team?.people || []).find((p) => p.id === id)?.name || 'Waiter' };
}
const myTables = () => { const me = Session.user(); return me ? tableNames().filter((t) => waiterOf(t)?.id === me.id) : []; };
function sectionsSheet() {
  const people = onDuty(), f = floorPlan(), areas = tableAreas();
  const opts = (sel, none) => `<option value="">${none}</option>${people.map((p) => `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(ROLES[p.role]?.label || p.role)}${p.duty ? ' · on duty' : ''}</option>`).join('')}`;
  return `${sheetHead('Sections & waiters', `Today · ${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' })}`)}
    <form class="form" data-form="sections">
      ${people.some((p) => p.duty) ? `<p class="muted sm">${icon('users')} Logged in today: ${people.filter((p) => p.duty).map((p) => esc(p.name)).join(', ')}.</p>` : ''}
      ${people.length ? '' : `<div class="banner info">${icon('users')}<span>No waiters yet — the owner adds staff logins in Team &amp; access. Staff also appear here once they log in.</span></div>`}
      ${areas.map((a) => `<section class="sec-area">
        <label class="field"><span><b>${esc(areaTitle(a))}</b> — whole area</span><select name="area:${esc(areaKey(a))}">${opts(f.area?.[areaKey(a)], '— nobody —')}</select></label>
        <details${a.tables.some((t) => f.table?.[t]) ? ' open' : ''}><summary class="muted sm">Give single tables to someone else</summary>
          <div class="sec-tables">${a.tables.map((t) => `<label class="field"><span>${esc(t)}</span><select name="table:${esc(t)}">${opts(f.table?.[t], 'Same as area')}</select></label>`).join('')}</div>
        </details>
      </section>`).join('')}
      <div class="btn-row"><button class="btn primary" type="submit">${icon('check')}<span>Save for today</span></button>${btn('Clear all', 'sectionsClear', { cls: 'ghost' })}</div>
      <p class="fine">Each table shows its waiter's name (your own tables are highlighted). Anyone can still take any table, as before. It starts fresh every day.</p>
    </form>`;
}

/* ---------------- request bill ---------------- */
const billAsked = (o) => !!(o && o.status === 'open' && o.billReq && o.billReq.at);
/** Cashier / manager / owner: alert when a table asks for the bill */
function checkBillReq() {
  const me = Session.user(); if (!me || !can('billing')) { App.billSeen = null; return; }
  const asked = openOrders().filter(billAsked);
  const prev = App.billSeen; App.billSeen = new Set(asked.map((o) => o.id));
  if (!prev) return;
  const fresh = asked.filter((o) => !prev.has(o.id) && o.billReq.byId !== me.id);
  if (fresh.length) phoneAlert(`Bill asked · ${fresh.map(orderLabel).join(', ')}`, fresh.map((o) => `${orderLabel(o)} — ${money(orderTotals(o).total)}${o.billReq.by ? ` (by ${o.billReq.by})` : ''}`).join(' · '), 'bill');
}

/* ---------------- finished today ---------------- */
const soldOutToday = (m) => !!m && m.soldOut === dayKey();
const isAvail = (m) => !!m && m.available !== false && !soldOutToday(m);
const canSoldOut = () => [...ORDER_TAKERS, 'kitchen'].includes(Session.role());
function soldOutSheet() {
  const q = String(App.ui.soq || '').toLowerCase();
  const list = S.menu.filter((m) => m.available !== false && (!q || m.name.toLowerCase().includes(q))).sort((a, b) => (soldOutToday(b) ? 1 : 0) - (soldOutToday(a) ? 1 : 0) || a.name.localeCompare(b.name));
  return `${sheetHead('Finished today', 'Switch a dish off for everyone until tomorrow')}
    <div class="form">
      <div class="search">${icon('search')}<input type="search" id="so-q" placeholder="Search dishes" value="${esc(App.ui.soq || '')}" data-input="soSearch" aria-label="Search dishes" autocomplete="off"></div>
      <div class="so-list" id="so-list">${soldOutRows(list)}</div>
      <p class="fine">Every phone, the QR menu and the kitchen see it straight away. It comes back on by itself tomorrow.</p>
    </div>`;
}
const soldOutRows = (list) => (list.length ? list.map((m) => `<label class="line-row so-row ${soldOutToday(m) ? 'off' : ''}"><span>${dietDot(m)}${esc(m.name)}<small class="muted"> · ${esc(m.cat)}</small></span>
  <span class="so-state">${soldOutToday(m) ? '<b class="neg">Finished</b>' : '<small class="muted">Available</small>'}<span class="switch"><input type="checkbox" data-act="soToggle" data-id="${m.id}" ${soldOutToday(m) ? '' : 'checked'} aria-label="${esc(m.name)} available"><i></i></span></span></label>`).join('')
  : '<p class="muted">No dishes match.</p>');

/* ---------------- floor board ---------------- */
const LATE_MIN = 15, LONG_MIN = 90;
function floorTable(o) { return o.table === 'Takeaway' ? `Takeaway #${o.no}` : tableTitle(o.table); }
Views.floor = () => {
  const now = Date.now(), open = openOrders().filter((o) => o.items.length);
  const kots = S.kots.filter((k) => k.status !== 'served');
  const late = kots.filter((k) => (k.status === 'new' || k.status === 'cooking') && now - k.createdAt > LATE_MIN * 60000).sort((a, b) => a.createdAt - b.createdAt);
  const ready = kots.filter((k) => k.status === 'ready').sort((a, b) => a.updatedAt - b.updatedAt);
  const bills = open.filter(billAsked).sort((a, b) => a.billReq.at - b.billReq.at);
  const dirty = Object.entries(S.tableState || {}).filter(([, s]) => s && s.status === 'cleaning').sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  const long = open.filter((o) => o.table !== 'Takeaway' && now - o.createdAt > LONG_MIN * 60000);
  const tables = tableNames(), busy = busyTables(), running = tables.filter((t) => busy.has(t));
  const who = (t) => { const w = waiterOf(t); return w ? ` · ${esc(firstName(w.name))}` : ''; };
  const kTable = (k) => (k.token ? `Token ${k.token}` : k.table === 'Takeaway' ? `Takeaway #${k.no}` : tableTitle(k.table));
  const items = (k) => k.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ');
  const row = (act, data, main, sub, since, cls = '') => `<button class="list-btn fb-row ${cls}" data-act="${act}" ${data}><span><strong>${main}</strong><small>${sub}</small></span>${since ? `<span class="timer" data-since="${since}">${icon('clock')}<span>${elapsed(since)}</span></span>` : ''}</button>`;
  const block = (title, n, cls, body, emptyTxt) => `<section class="card fb-block ${n ? cls : ''}"><div class="card-head">${eyebrow(title)}<b class="fb-n">${n}</b></div>${n ? body : `<p class="muted sm">${emptyTxt}</p>`}</section>`;
  const openT = (t) => `data-t="${esc(t)}"`;
  return `${pageHead('Floor', 'Floor board', `<div class="btn-row tight">${btn('Today', 'daySheetOpen', { cls: 'ghost sm', ic: 'chart' })}${canAssign() && tables.length ? btn('Sections & waiters', 'sectionsOpen', { cls: 'ghost sm', ic: 'users' }) : ''}</div>`)}
    <div class="kpis fb-kpis">
      <div class="kpi card"><p class="eyebrow">Tables running</p><p class="kpi-v">${running.length}<small>/${tables.length}</small></p></div>
      <div class="kpi card ${late.length ? 'warn' : ''}"><p class="eyebrow">Food late (${LATE_MIN}+ min)</p><p class="kpi-v">${late.length}</p></div>
      <div class="kpi card ${ready.length ? 'ok' : ''}"><p class="eyebrow">Ready to serve</p><p class="kpi-v">${ready.length}</p></div>
      <div class="kpi card"><p class="eyebrow">Bills asked</p><p class="kpi-v">${bills.length}</p></div>
      <div class="kpi card"><p class="eyebrow">To clean</p><p class="kpi-v">${dirty.length}</p></div>
    </div>
    <div class="fb-grid">
      ${approvalsBlock()}
      ${waitlistBlock()}
      ${block('Food late', late.length, 'late', late.map((k) => row(k.table === 'Takeaway' || !tables.includes(k.table) ? 'goKitchen' : 'openTable', k.table && tables.includes(k.table) ? openT(k.table) : '', `${esc(kTable(k))}${who(k.table)}`, `${k.status === 'cooking' ? 'Cooking' : 'Not started'} · ${items(k)}`, k.createdAt, 'late')).join(''), `Nothing late. A table shows up here by itself when its food was sent to the kitchen more than ${LATE_MIN} minutes ago and is not ready yet — with the table, waiter, dishes and a running timer.`)}
      ${block('Ready — serve now', ready.length, 'ready', ready.map((k) => row(k.table && tables.includes(k.table) ? 'openTable' : 'goKitchen', k.table && tables.includes(k.table) ? openT(k.table) : '', `${esc(kTable(k))}${who(k.table)}`, items(k), k.updatedAt)).join(''), 'Nothing waiting. Shows up by itself when the kitchen taps “Mark ready” — serve it and tap “Served”.')}
      ${block('Bill asked', bills.length, 'bill', bills.map((o) => row(can('billing') ? 'selectBill' : 'openTable', can('billing') ? `data-id="${o.id}"` : openT(o.table), `${esc(floorTable(o))}${who(o.table)} · ${money(orderTotals(o).total)}`, `Asked${o.billReq.by ? ` by ${esc(o.billReq.by)}` : ''}${o.printed ? ' · bill printed' : ''}`, o.billReq.at)).join(''), 'No table waiting. Shows up by itself when a waiter or captain taps “Request bill” (or “Print bill”) on a table; it clears when the cashier takes payment.')}
      ${block('Needs cleaning', dirty.length, 'clean', dirty.map(([t, s]) => row('tableMenu', openT(t), `${esc(tableTitle(t))}${who(t)}`, esc(s.note || 'Needs cleaning'), s.at)).join(''), 'All clean. A table shows up by itself after its bill is paid, or when someone marks it “Needs cleaning”; tap “Cleaned” when done.')}
      ${feedbackBlock()}
      ${checklistCard()}
      ${block(`Seated over ${LONG_MIN} min`, long.length, 'long', long.map((o) => row('openTable', openT(o.table), `${esc(floorTable(o))}${who(o.table)} · ${money(orderSubtotal(o))}`, `Order #${o.no} · ${pl(sum(o.items, (l) => l.qty), 'item')}`, o.createdAt)).join(''), `Nobody waiting long. A table shows up by itself when guests have been seated more than ${LONG_MIN} minutes.`)}
    </div>
    <p class="fine">Nothing to fill in — this board updates itself from orders, the kitchen screen and bills, on every phone. Tap a row to open that table.</p>`;
};

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  sectionsOpen() { if (!canAssign()) return toast('Only the captain, manager or owner gives out tables.'); openSheet(sectionsSheet()); },
  sectionsClear() { if (!canAssign()) return; S.floor = { day: dayKey(), area: {}, table: {} }; closeSheet(); save(); toast('Sections cleared for today'); },
  goKitchen() { go('kitchen'); },
  billRequest(el) {
    const o = byId(S.orders, el.dataset.id); if (!o || o.status !== 'open') return;
    const me = Session.user();
    if (billAsked(o)) { o.billReq = null; save(); return toast('Bill request taken back'); }
    if (o.items.some((l) => l.qty > l.sent)) return toast('Send the new items to the kitchen first.');
    o.billReq = { at: Date.now(), by: me?.name || '', byId: me?.id || '' };
    save(); toast(`Bill asked for ${orderLabel(o)} — the cashier is alerted`);
  },
  printBillFloor(el) {
    const o = byId(S.orders, el.dataset.id); if (!o || o.status !== 'open') return;
    const t = orderTotals(o);
    o.printed = { at: Date.now(), total: t.total };
    if (!billAsked(o)) { const me = Session.user(); o.billReq = { at: Date.now(), by: me?.name || '', byId: me?.id || '' }; }
    save(); printBill(receiptHtml(o, t));
  },
  soldOutOpen() { if (!canSoldOut()) return; App.ui.soq = ''; openSheet(soldOutSheet()); },
  soToggle(el) {
    const m = byId(S.menu, el.dataset.id); if (!m || !canSoldOut()) return;
    m.soldOut = el.checked ? '' : dayKey();
    save();
    const box = $('#so-list'); if (box) { const q = String(App.ui.soq || '').toLowerCase(); box.innerHTML = soldOutRows(S.menu.filter((x) => x.available !== false && (!q || x.name.toLowerCase().includes(q))).sort((a, b) => (soldOutToday(b) ? 1 : 0) - (soldOutToday(a) ? 1 : 0) || a.name.localeCompare(b.name))); }
    toast(el.checked ? `${m.name} is available again` : `${m.name} marked finished for today`);
  },
});
Object.assign(Inputs, {
  soSearch(el) { App.ui.soq = el.value; const box = $('#so-list'); if (box) { const q = el.value.toLowerCase(); box.innerHTML = soldOutRows(S.menu.filter((x) => x.available !== false && (!q || x.name.toLowerCase().includes(q))).sort((a, b) => (soldOutToday(b) ? 1 : 0) - (soldOutToday(a) ? 1 : 0) || a.name.localeCompare(b.name))); } },
});
Object.assign(Forms, {
  sections(fd) {
    if (!canAssign()) return;
    const f = { day: dayKey(), area: {}, table: {} };
    for (const [k, v] of fd.entries()) {
      if (!v) continue;
      if (k.startsWith('area:')) f.area[k.slice(5)] = String(v);
      else if (k.startsWith('table:')) f.table[k.slice(6)] = String(v);
    }
    S.floor = f; closeSheet(); save();
    const n = new Set([...Object.values(f.area), ...Object.values(f.table)]).size;
    toast(n ? `Tables given to ${pl(n, 'person', 'people')} for today` : 'Sections cleared for today');
  },
});

/* ---------------- join tables · split bill · courses ---------------- */
function joinSheet(t) {
  const o = orderAt(t); if (!o) return '';
  const busy = busyTables();
  return `${sheetHead('Join tables', `${tableTitle(t)} + ?`)}
    <p class="muted sm">For a big group: the tables share ${tableTitle(t)}'s order and one bill. Only free tables can join — move or bill a running table first.</p>
    ${tableAreas().map((a) => { const free = a.tables.filter((x) => x !== t && !busy.has(x)); return free.length ? `${eyebrow(areaTitle(a))}<div class="chip-row">${free.map((x) => `<button class="chip" data-act="joinTo" data-t="${esc(t)}" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''; }).join('') || '<p class="muted">No free table right now.</p>'}`;
}
function splitSheet(o) {
  return `${sheetHead('Split bill', `${orderLabel(o)} — move items to a new bill`)}
    <form class="form" data-form="split" data-id="${o.id}">
      <p class="muted sm">Choose what goes on the new bill (e.g. one guest's food). Each bill is paid separately at the counter.</p>
      ${o.items.map((l) => `<div class="line-row split-row"><span>${esc(l.name)}<small class="muted"> · ${money(l.price)} · ${l.qty} on this bill</small></span>
        <span class="qty"><button type="button" class="icon-btn sm" data-act="splitStep" data-d="-1" aria-label="Less">${icon('minus')}</button><input name="mv:${esc(l.id)}" type="number" min="0" max="${l.qty}" value="0" class="inline-input split-n" aria-label="Move ${esc(l.name)}" readonly><button type="button" class="icon-btn sm" data-act="splitStep" data-d="1" aria-label="More">${icon('plus')}</button></span></div>`).join('')}
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('receipt')}<span>Make the new bill</span></button>
    </form>`;
}
Object.assign(Actions, {
  holdMode(el) { App.ui.holdNext = el.dataset.v === '1'; render(); },
  lineHold(el) {
    const r = line(el.dataset.id); if (!r?.l) return;
    if (r.l.sent > 0 && !r.l.hold) { // part already sent: hold only the rest, as its own line
      const rest = r.l.qty - r.l.sent; if (rest <= 0) return;
      r.l.qty = r.l.sent; r.o.items.push({ ...r.l, id: uid('l'), qty: rest, sent: 0, hold: true });
    } else r.l.hold = !r.l.hold;
    save();
  },
  fireHeld() {
    const o = currentOrder(App.params); if (!o) return;
    const n = sum(o.items.filter((l) => l.hold), (l) => l.qty - l.sent); if (!n) return;
    o.items.forEach((l) => { if (l.hold) delete l.hold; });
    App.ui.holdNext = false;
    Actions.sendKitchen();
  },
  joinOpen(el) { openSheet(joinSheet(el.dataset.t)); },
  joinTo(el) {
    const t = el.dataset.t, x = el.dataset.x, o = orderAt(t);
    if (!o || o.table !== t) return closeSheet();
    if (busyTables().has(x)) return toast(`${tableTitle(x)} is not free any more.`);
    o.joined = [...new Set([...(o.joined || []), x])];
    if (S.tableState?.[x] && S.tableState[x].status !== 'blocked') delete S.tableState[x];
    closeSheet(); save(); toast(`${tableTitle(x)} joined with ${tableTitle(t)} ✓`);
  },
  unjoin(el) {
    const o = orderAt(el.dataset.t); if (!o) return;
    o.joined = (o.joined || []).filter((x) => x !== el.dataset.x);
    if (!o.joined.length) delete o.joined;
    closeSheet(); save(); toast(`${tableTitle(el.dataset.x)} is a separate table again`);
  },
  splitOpen(el) {
    const o = byId(S.orders, el.dataset.id); if (!o || o.status !== 'open') return;
    if (o.items.some((l) => l.qty > l.sent && !l.hold)) return toast('Send the new items to the kitchen first.');
    openSheet(splitSheet(o));
  },
  splitStep(el) {
    const i = el.closest('.qty').querySelector('input'); const v = Math.min(Number(i.max), Math.max(0, Number(i.value) + Number(el.dataset.d)));
    i.value = v;
  },
});
Object.assign(Forms, {
  split(fd, form) {
    const o = byId(S.orders, form.dataset.id); if (!o || o.status !== 'open') return closeSheet();
    const mv = o.items.map((l) => [l, Math.min(l.qty, Math.max(0, Math.floor(Number(fd.get(`mv:${l.id}`)) || 0)))]).filter(([, n]) => n > 0);
    if (!mv.length) return formError('Choose at least one item for the new bill.');
    const left = sum(o.items, (l) => l.qty) - sum(mv, ([, n]) => n);
    if (left < 1) return formError('Leave at least one item on this bill.');
    const part = Math.max(1, ...openOrders().filter((x) => x.table === o.table).map((x) => x.part || 1)) + 1;
    if (!o.part) o.part = 1;
    const me = Session.user();
    const nb = { id: uid('o'), no: nextBillNo(), table: o.table, part, items: [], status: 'open', createdAt: Date.now(), splitOf: o.id, by: me?.name || '', byId: me?.id || null };
    mv.forEach(([l, n]) => {
      const sentMove = Math.min(n, l.sent);
      nb.items.push({ ...l, id: uid('l'), qty: n, sent: n, hold: undefined });
      l.qty -= n; l.sent = Math.max(0, l.sent - sentMove);
    });
    nb.items.forEach((l) => { delete l.hold; });
    o.items = o.items.filter((l) => l.qty > 0);
    S.orders.push(nb);
    closeSheet(); save(); toast(`New bill made: ${orderLabel(nb)} — ${money(orderSubtotal(nb))}`);
    go('orders', { o: nb.id });
  },
});
