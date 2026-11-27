'use strict';
/* =========================================================
   Shell, render loop, actions, forms, boot
   ========================================================= */

const MOBILE_TABS = 4;

function applyTheme() {
  const st = S.settings || {};
  const root = document.documentElement;
  const look = lookOf(st);
  root.style.setProperty('--accent', ACCENTS[look.accent] || ACCENTS.ink);
  if (look.theme === 'light' || look.theme === 'dark') root.dataset.theme = look.theme; else delete root.dataset.theme;
  document.title = st.name ? `${st.name} · Cafe Journal` : 'Cafe Journal';
}

function shell(view, content) {
  const role = Session.role();
  const r = ROLES[role];
  const rv = viewsFor(role);
  const me = Session.user();
  const st = S.settings;
  const navItem = (v, cls = '') => `<a href="#/${v}" class="nav-i ${cls} ${v === view ? 'on' : ''}" ${v === view ? 'aria-current="page"' : ''}>${icon(VIEWS[v].icon)}<span>${VIEWS[v].label}</span>${badgeFor(v)}</a>`;
  const tabs = rv.length > MOBILE_TABS + 1 ? rv.slice(0, MOBILE_TABS) : rv;
  const moreActive = rv.length > MOBILE_TABS + 1 && !tabs.includes(view);
  return `<div class="layout">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${esc(initials(st.name))}</span><span><strong>${esc(st.name)}</strong><small>${esc(st.tagline || BUSINESS_TYPES[st.type] || '')}</small></span>${aiBtn()}${bellBtn(view)}</div>
      <nav class="nav">${rv.map((v) => navItem(v)).join('')}</nav>
      <div class="me"><span class="avatar sm" style="background:${r.color}">${esc(initials(me.name))}</span><span><strong>${esc(me.name)}</strong><small>${esc(r.label)}</small></span>
        <button class="icon-btn" data-act="myPin" title="Change my password" aria-label="Change my password">${icon('lock')}</button>
        <button class="icon-btn" data-act="logout" title="Log out" aria-label="Log out">${icon('logout')}</button></div>
    </aside>
    <div class="topbar"><span class="brand-mark sm">${esc(initials(st.name))}</span><strong>${esc(st.name)}</strong>${aiBtn()}${bellBtn(view)}
      <button class="role-pill" style="--c:${r.color}" data-act="myPin" title="Change my password" aria-label="${esc(me.name)} · ${esc(r.label)} — change my password"><span class="rp-name">${esc(me.name.split(' ')[0])} · </span>${esc(r.label)}</button>
      <button class="icon-btn" data-act="logout" aria-label="Log out">${icon('logout')}</button></div>
    <main class="main" id="main">${typeof guestBar === 'function' ? guestBar() : ''}${content}</main>
    ${rv.length > 1 ? `<nav class="tabbar">${tabs.map((v) => navItem(v)).join('')}
      ${rv.length > MOBILE_TABS + 1 ? `<button class="nav-i ${moreActive ? 'on' : ''}" data-act="moreNav">${icon('more')}<span>More</span></button>` : ''}</nav>` : ''}
  </div>`;
}
function bellBtn(view) {
  const n = unreadCount();
  return `<a href="#/inbox" class="icon-btn bell ${view === 'inbox' ? 'on' : ''}" aria-label="Notifications${n ? ` (${n} unread)` : ''}" title="Notifications">${icon('bell')}${n ? `<i class="nbadge">${n > 99 ? '99+' : n}</i>` : ''}</a>`;
}
function badgeFor(v) {
  let n = 0;
  if (v === 'kitchen') n = S.kots.filter((k) => k.status === 'new').length;
  else if (v === 'billing') n = openOrders().filter((o) => o.items.length).length;
  else if (v === 'stock') n = S.stock.filter(isLow).length;
  else if (v === 'team') n = openRequests().length;
  return n ? `<i class="nbadge">${n}</i>` : '';
}

function render() {
  applyTheme();
  const root = $('#app');
  if (typeof Cloud !== 'undefined' && Cloud.on && !Cloud.attached) { root.innerHTML = Cloud.screen(); return; }
  if (!S.settings) {
    // Links from the website: app/#/signup opens the sign-up steps, app/#/login explains how to log in here
    const entry = parseHash().view;
    if (entry === 'signup' && App.setup.step === 0) App.setup.step = 1;
    App.setup.intent = entry === 'login' ? 'login' : '';
    if (entry === 'signup' || entry === 'login') history.replaceState(null, '', location.pathname);
    root.innerHTML = Views.setup(); return;
  }
  const role = Session.role();
  if (!role) { root.innerHTML = Session.locked && Session.account() ? Views.lockScreen() : Views.login(); return; }
  checkReady(); checkNotices(); checkDuty(); checkBillReq();
  if ((App.setup.mode === 'later' || App.setup.mode === 'profile') && App.setup.step > 0 && role === 'owner') { root.innerHTML = Views.setup(); return; }
  let { view, params } = parseHash();
  const allowed = viewsFor(role).concat('inbox', canTokens() ? ['tokens'] : []); // everyone has the notifications inbox
  if (!allowed.includes(view)) {
    view = allowed[0]; params = {};
    history.replaceState(null, '', `#/${view}`);
  }
  if (view !== App.view) { App.ui.q = ''; window.scrollTo(0, 0); }
  App.view = view; App.params = params;

  if (view === 'kitchen') {
    const n = S.kots.filter((k) => k.status === 'new').length;
    const ch = Math.max(0, ...S.kots.filter((k) => k.status === 'new').map((k) => k.changedAt || 0));
    if (App.lastNewKots !== null && (n > App.lastNewKots || ch > (App.lastKotChange || 0))) beep();
    App.lastNewKots = n; App.lastKotChange = ch;
  } else App.lastNewKots = null;

  // keep what is being typed in the home AI box across refreshes
  const q = $('#home-q'), typed = q ? q.value : '', hadFocus = q && document.activeElement === q;
  tokenChime();
  if (view === 'tokens') { root.innerHTML = Views.tokens(); return; } // full-screen token TV
  root.innerHTML = shell(view, Views[view](params));
  const q2 = $('#home-q');
  if (q2 && typed) q2.value = typed;
  if (q2 && hadFocus) q2.focus();
  if (typeof redrawChat === 'function' && App.chat?.length) redrawChat();
}

/* ---------------- actions (data-act) ---------------- */
function line(id) { const o = currentOrder(App.params); return o && { o, l: o.items.find((x) => x.id === id) }; }

const Actions = {
  closeSheet,
  logout() { Session.set(null); closeSheet(); history.replaceState(null, '', location.pathname); render(); },
  moreNav() {
    const r = ROLES[Session.role()];
    openSheet(`${sheetHead(r.label, 'More')}<div class="more-grid">${viewsFor(Session.role()).slice(MOBILE_TABS).map((v) => `<a class="card more-i" href="#/${v}" data-act="closeSheet">${icon(VIEWS[v].icon)}<span>${VIEWS[v].label}</span>${badgeFor(v)}</a>`).join('')}</div>`);
  },

  /* orders */
  openTable(el) { go('orders', { t: el.dataset.t }); },
  openOrder(el) { go('orders', { o: el.dataset.id }); },
  toTables() {
    // Leaving a takeaway that never got any items: throw the empty order away
    const o = currentOrder(App.params);
    if (o && o.table === 'Takeaway' && o.status === 'open' && !o.items.length && !S.kots.some((k) => k.orderId === o.id)) { S.orders = S.orders.filter((x) => x !== o); persist(); }
    go('orders');
  },
  newTakeaway() {
    const o = { id: uid('o'), no: nextBillNo(), table: 'Takeaway', items: [], status: 'open', createdAt: Date.now(), by: Session.user()?.name || Session.role(), byId: Session.user()?.id || null };
    S.orders.push(o); persist(); go('orders', { o: o.id });
  },
  setCat(el) { App.ui.cat = el.dataset.cat; render(); },
  addItem(el) {
    const m = byId(S.menu, el.dataset.id); if (!m) return;
    if (!isAvail(m)) return toast(`${m.name} is ${soldOutToday(m) ? 'finished for today' : 'not available'}.`);
    let o = currentOrder(App.params);
    if (!o) {
      o = { id: uid('o'), no: nextBillNo(), table: App.params.t || 'Takeaway', items: [], status: 'open', createdAt: Date.now(), by: Session.user()?.name || Session.role(), byId: Session.user()?.id || null };
      S.orders.push(o);
    }
    if (o.status !== 'open') return toast('This bill is already paid');
    // Same item without special instructions → just one more; items with instructions stay separate lines
    const l = o.items.find((x) => x.menuId === m.id && !x.note);
    if (l) l.qty += 1; else o.items.push({ id: uid('l'), menuId: m.id, name: m.name, price: m.price, qty: 1, sent: 0, note: '' });
    save();
  },
  incLine(el) { const r = line(el.dataset.id); if (r?.l) { r.l.qty += 1; save(); } },
  decLine(el) {
    const r = line(el.dataset.id); if (!r?.l) return;
    const { o, l } = r, st = lineState(o, l);
    if (l.qty <= st.locked) return toast(`${l.name}: the kitchen has started cooking it — it can't be changed now.`);
    if (st.unsent > 0) l.qty -= 1; else { takeFromKitchen(o, l, 1); l.qty -= 1; audit('pulled', { no: o.no, table: o.table, item: l.name, qty: 1, amount: round2(l.price) }); }
    finishLineChange(o, l);
  },
  removeLine(el) {
    const r = line(el.dataset.id); if (!r?.l) return;
    const { o, l } = r, st = lineState(o, l);
    const removable = l.qty - st.locked;
    if (!removable) return toast(`${l.name}: the kitchen has started cooking it — it can't be removed now.`);
    if (!confirm(`Remove ${removable} × ${l.name}${st.locked ? ` (${st.locked} already cooking will stay)` : ''}?`)) return;
    l.qty -= st.unsent; takeFromKitchen(o, l, st.queued); l.qty -= st.queued;
    if (st.queued) audit('pulled', { no: o.no, table: o.table, item: l.name, qty: st.queued, amount: round2(l.price * st.queued) });
    finishLineChange(o, l);
  },
  lineNote(el) {
    const r = line(el.dataset.id); if (!r?.l) return;
    const st = lineState(r.o, r.l);
    if (st.locked) return toast(`${r.l.name} is already being cooked. To ask for something different, add the item again with new instructions.`);
    openSheet(noteSheet(r.l));
  },
  noteChip(el) {
    const i = $('#sheet input[name=note]'); if (!i) return;
    const parts = i.value.split(',').map((x) => x.trim()).filter(Boolean);
    const c = el.dataset.chip;
    i.value = (parts.includes(c) ? parts.filter((x) => x !== c) : [...parts, c]).join(', ');
    el.classList.toggle('on', !parts.includes(c));
  },
  sendKitchen() {
    const o = currentOrder(App.params); if (!o) return;
    const lines = o.items.filter((l) => l.qty > l.sent);
    if (!lines.length) return;
    const me = Session.user();
    const waiting = openKot(o);
    if (waiting) {
      // The kitchen hasn't started this order yet: add to the same ticket
      lines.forEach((l) => {
        const add = l.qty - l.sent;
        const it = waiting.items.find((i) => i.lineId === l.id);
        if (it) { it.qty += add; it.note = l.note || ''; } else waiting.items.push({ lineId: l.id, menuId: l.menuId, name: l.name, qty: add, note: l.note || '' });
      });
      kotTouch(waiting);
    } else {
      S.kots.push({ id: uid('k'), orderId: o.id, table: o.table, no: o.no, items: lines.map((l) => ({ lineId: l.id, menuId: l.menuId, name: l.name, qty: l.qty - l.sent, note: l.note || '' })), status: 'new', createdAt: Date.now(), updatedAt: Date.now(), byId: me?.id || o.byId || null, by: me?.name || '' });
    }
    o.items.forEach((l) => { l.sent = l.qty; });
    persist(); toast(`${waiting ? 'Kitchen ticket updated' : 'Sent to kitchen'} ✓ ${orderLabel(o)}`);
    if (o.table === 'Takeaway') render(); else go('orders');
  },
  toBill(el) { go('billing', { o: el.dataset.id }); },

  /* kitchen */
  kotNext(el) {
    const k = byId(S.kots, el.dataset.id); if (!k) return;
    const role = Session.role();
    // Cooking and "ready" belong to the kitchen (and the owner); serving ready food is the floor staff's job
    if (k.status !== 'ready' && !KITCHEN_ROLES.includes(role)) return toast('Only the kitchen can change cooking status.');
    k.status = { new: 'cooking', cooking: 'ready', ready: 'served' }[k.status] || 'served';
    k.updatedAt = Date.now();
    if (k.status === 'served') useStockFor(k); // ingredients come off the stock
    if (KITCHEN_ROLES.includes(role)) S.kots = S.kots.filter((x) => x.status !== 'served' || Date.now() - x.updatedAt < 864e5); // keep one day
    save();
  },

  /* billing */
  selectBill(el) { go('billing', { o: el.dataset.id }); },
  closeBill() { go('billing'); },
  noteClear() { const i = $('#sheet input[name=note]'); if (i) { i.value = ''; i.form.requestSubmit(); } },
  printBill(el) {
    const o = byId(S.orders, el.dataset.id); if (!o) return;
    const raw = $('form.bill input[name=discount]')?.value;
    const derr = discountError(raw, orderSubtotal(o)); if (derr) return formError(derr);
    const disc = num(raw);
    const t = orderTotals(o, disc, { service: !!$('form.bill input[name=service]:checked'), comp: $('form.bill input[name=method]:checked')?.value === 'comp' });
    if (o.status === 'open') { o.printed = { at: Date.now(), total: t.total }; persist(); } // leakage check: was it lowered later?
    printBill(receiptHtml(o, t));
  },
  payPrint(el) { App.printAfterPay = true; el.closest('form').requestSubmit(); },
  async enableAlerts() {
    beep(); // also unlocks sound on this device
    if (!('Notification' in window)) return toast('This browser cannot show notifications — sound and vibration will still alert you.');
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Alerts on — you\'ll be notified when food is ready' : 'Notifications blocked — sound and on-screen alerts will still work');
    render();
  },
  printReceipt(el) {
    const o = byId(S.orders, el.dataset.id); if (!o) return;
    if (o.status === 'paid') { audit('reprint', { no: o.no, total: o.total, orderId: o.id }); persist(); }
    printBill(receiptHtml(o));
  },
  closeDay() {
    const dk = dayKey(), paid = paidOn(dk), bm = byMethod(paid);
    const e = S.journal[dk] || { note: '', tags: [] };
    e.closing = { at: Date.now(), sales: sum(paid, (o) => o.total), bills: paid.length, ...bm, expenses: sum(expensesOn(dk), (x) => x.amount) };
    S.journal[dk] = e; save(); toast('Day closing saved to journal');
  },

  /* stock */
  stockFilter(el) { App.ui.stockFilter = el.dataset.f; render(); },
  stockAdd() { openSheet(stockForm()); },
  stockEdit(el) { const s = byId(S.stock, el.dataset.id); s && openSheet(stockForm(s)); },
  stockAdj(el) {
    const s = byId(S.stock, el.dataset.id); if (!s) return;
    const before = Number(s.qty) || 0;
    s.qty = Math.max(0, round2(before + Number(el.dataset.d) * (Number(s.step) || 1)));
    logCorrection(s, r6(s.qty - before));
    save();
  },
  stockDel(el) { if (confirm('Delete this stock item?')) { S.stock = S.stock.filter((x) => x.id !== el.dataset.id); closeSheet(); save(); } },

  /* expenses / reports */
  monthNav(el) { App.ui.month = shiftMonth(App.ui.month, Number(el.dataset.d)); if (App.ui.month > monthKey()) App.ui.month = monthKey(); render(); },
  expAdd() { openSheet(expenseForm()); },
  expDel(el) { if (confirm('Delete this expense?')) commit((s) => { s.expenses = s.expenses.filter((x) => x.id !== el.dataset.id); }); },
  exportCsv() {
    const mk = App.ui.month, pm = payMethods();
    const rows = [['Type', 'Date', 'Time', 'Ref', 'Description', 'Category/Method', 'Amount']];
    paidInMonth(mk).forEach((o) => rows.push(['Sale', dayKey(o.paidAt), fmtTime(o.paidAt), `#${o.no}`, orderLabel(o) + ': ' + o.items.map((l) => `${l.name} x${l.qty}`).join('; '), pm[o.method]?.label || o.method, o.total]));
    expensesInMonth(mk).forEach((e) => rows.push(['Expense', e.date, '', '', e.title, e.cat, -e.amount]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`${slug(S.settings.name)}-${mk}.csv`, csv, 'text/csv');
  },

  /* vendors */
  vendorAdd() { openSheet(vendorForm()); },
  vendorOpen(el) { const v = byId(S.vendors, el.dataset.id); v && openSheet(vendorSheet(v), { wide: true }); },
  vendorDel(el) {
    if (!confirm('Remove this vendor? Their past expenses stay in your records.')) return;
    commit((s) => { s.vendors = s.vendors.filter((x) => x.id !== el.dataset.id); }); closeSheet();
  },

  /* staff */
  att(el) {
    const dk = dayKey(); S.attendance[dk] = S.attendance[dk] || {};
    const cur = S.attendance[dk][el.dataset.id];
    if (cur === el.dataset.s) delete S.attendance[dk][el.dataset.id]; else S.attendance[dk][el.dataset.id] = el.dataset.s;
    save();
  },
  /* journal */
  dayNav(el) { const d = shiftDay(App.ui.day, Number(el.dataset.d)); App.ui.day = d > dayKey() ? dayKey() : d; render(); },
  dayGo(el) { App.ui.day = el.dataset.day; render(); window.scrollTo(0, 0); },
  tagToggle(el) {
    const dk = App.ui.day, e = S.journal[dk] || { note: '', tags: [] };
    e.tags = e.tags || [];
    e.tags = e.tags.includes(el.dataset.tag) ? e.tags.filter((t) => t !== el.dataset.tag) : [...e.tags, el.dataset.tag];
    S.journal[dk] = e; save();
  },

  /* settings */
  settingsTab(el) { App.ui.settingsTab = el.dataset.tab; render(); },
  menuAdd() { openSheet(menuForm(), { wide: true }); },
  menuEdit(el) { const m = byId(S.menu, el.dataset.id); m && openSheet(menuForm(m), { wide: true }); },
  menuDel(el) { if (confirm('Delete this menu item?')) { S.menu = S.menu.filter((x) => x.id !== el.dataset.id); closeSheet(); save(); } },
  menuToggle(el) { const m = byId(S.menu, el.dataset.id); if (m) { m.available = el.checked; save(); } },
  loadDemo() {
    if (!confirm('Replace ALL current data with sample data?')) return;
    makeDemo(S); S.users.forEach((u) => { if (u.staffId && !byId(S.staff, u.staffId)) u.staffId = null; });
    save(); toast('Sample data loaded');
  },
  resetAll() {
    if (!confirm('Erase everything on this device? This cannot be undone. Download a backup first if unsure.')) return;
    S = emptyState(); Session.set(null); persist(); history.replaceState(null, '', location.pathname); render();
  },
};

/* ---------------- order lines vs kitchen tickets ---------------- */
/** For one order line: not yet sent · waiting in the kitchen queue (can still change) · being cooked (locked) */
function lineState(o, l) {
  let queued = 0;
  S.kots.forEach((k) => { if (k.orderId === o.id && k.status === 'new') k.items.forEach((i) => { if (i.lineId === l.id) queued += i.qty; }); });
  return { unsent: Math.max(0, l.qty - l.sent), queued, locked: Math.max(0, l.sent - queued) };
}
const openKot = (o) => S.kots.find((k) => k.orderId === o.id && k.status === 'new');
function kotTouch(k) { k.updatedAt = Date.now(); k.changedAt = Date.now(); }
/** Take n of a line back out of tickets the kitchen hasn't started */
function takeFromKitchen(o, l, n) {
  for (const k of S.kots.filter((x) => x.orderId === o.id && x.status === 'new')) {
    const it = k.items.find((i) => i.lineId === l.id); if (!it || n <= 0) continue;
    const d = Math.min(n, it.qty); it.qty -= d; n -= d; l.sent -= d; kotTouch(k);
    if (it.qty <= 0) k.items = k.items.filter((i) => i !== it);
    if (!k.items.length) S.kots = S.kots.filter((x) => x !== k);
  }
}
function finishLineChange(o, l) {
  if (l.qty <= 0) o.items = o.items.filter((x) => x !== l);
  if (!o.items.length && !S.kots.some((k) => k.orderId === o.id)) {
    S.orders = S.orders.filter((x) => x !== o); persist(); return go('orders', o.table === 'Takeaway' ? {} : { t: o.table });
  }
  save();
}
const NOTE_CHIPS = ['Less spicy', 'Extra spicy', 'No onion', 'No garlic', 'Jain', 'Less oil', 'Less sugar', 'No sugar', 'Extra cheese', 'No ice', 'Parcel', 'Serve first'];
function noteSheet(l) {
  const parts = String(l.note || '').split(',').map((x) => x.trim());
  return `${sheetHead('Cooking instructions', l.name)}
  <form data-form="lineNote" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${l.id}">
    <div class="chip-row">${noteChips().cook.map((c) => `<button type="button" class="chip ${parts.includes(c) ? 'on' : ''}" data-act="noteChip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    ${noteChips().allergy.length ? `<div class="chip-row allergy-chips" aria-label="Allergies">${noteChips().allergy.map((c) => `<button type="button" class="chip ${parts.includes(c) ? 'on' : ''}" data-act="noteChip" data-chip="${esc(c)}">⚠ ${esc(c)}</button>`).join('')}</div>` : ''}
    <label class="field"><span>Instructions from the customer</span><input name="note" maxlength="120" value="${esc(l.note || '')}" placeholder="e.g. Less spicy, no onion, birthday candle"></label>
    <p class="muted sm">Shown in bold on the kitchen ticket.${l.qty > 1 ? ` Applies to all ${l.qty}. For different instructions on one of them, add the item again.` : ''}</p>
    <div class="form-actions">${l.note ? `<button type="button" class="btn ghost" data-act="noteClear">Clear</button>` : '<span></span>'}<button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

/* ---------------- forms (data-form) ---------------- */
const num = (v) => (v === '' || v == null ? 0 : Number(v));
const Forms = {
  lineNote(fd) {
    const r = line(fd.get('id')); if (!r?.l) return closeSheet();
    const { o, l } = r, st = lineState(o, l);
    if (st.locked) { closeSheet(); return toast('Already being cooked — instructions can\'t change now.'); }
    l.note = String(fd.get('note') || '').trim();
    S.kots.forEach((k) => { if (k.orderId === o.id && k.status === 'new') k.items.forEach((i) => { if (i.lineId === l.id && i.note !== l.note) { i.note = l.note; kotTouch(k); } }); });
    // Merge back into an identical line if the note now matches one
    closeSheet(); save();
  },
  pay(fd) {
    const o = byId(S.orders, App.params.o); if (!o || o.status !== 'open') return;
    const derr = fd.get('method') === 'comp' ? '' : discountError(fd.get('discount'), orderSubtotal(o));
    if (derr) { App.printAfterPay = false; return formError(derr); }
    const pay = readPayment(o, fd);
    if (pay.error) { App.printAfterPay = false; return formError(pay.error); }
    const t = pay.t;
    if (pay.method === 'comp') audit('comp', { no: o.no, table: o.table, amount: t.sub, reason: pay.extra.compReason });
    if (o.printed && t.total < o.printed.total - 0.009) audit('lowered', { no: o.no, table: o.table, printed: o.printed.total, paid: t.total, amount: round2(o.printed.total - t.total) });
    Object.assign(o, { status: 'paid', paidAt: Date.now(), method: pay.method, subtotal: t.sub, discount: t.discount, tax: t.tax, total: t.total, receiptPrinted: !!App.printAfterPay, ...pay.extra });
    // Pay-first orders (self-service, takeaway): the bill gets a token and the order goes to the kitchen now
    const token = tokenAfterPay(o, fd);
    if (!token) S.kots.forEach((k) => { if (k.orderId === o.id && k.status === 'ready') { k.status = 'served'; k.updatedAt = Date.now(); useStockFor(k); } });
    // Guests have paid and will leave: the table needs cleaning (alerts housekeeping, captain, waiters…)
    if (o.table && o.table !== 'Takeaway' && tableNames().includes(o.table) && !openOrders().some((x) => x.table === o.table && x !== o)) {
      S.tableState = S.tableState || {};
      if (S.tableState[o.table]?.status !== 'blocked') S.tableState[o.table] = { status: 'cleaning', note: 'Bill paid — guests leaving', by: 'Auto (bill paid)', at: Date.now() };
    }
    save(); toast(pay.method === 'credit' ? `Saved on credit — ${money(t.total)} to collect from ${pay.extra.credit.name}` : pay.method === 'comp' ? 'Free bill saved' : token ? `Paid ${money(t.total)} ✓ Token ${token}` : `Paid ${money(t.total)} ✓`);
    if (token) openSheet(tokenSheet(o));
    if (App.printAfterPay) { App.printAfterPay = false; setTimeout(() => printBill(receiptHtml(o)), 50); }
  },
  stockItem(fd) {
    const d = { name: fd.get('name').trim(), qty: num(fd.get('qty')), unit: fd.get('unit'), max: num(fd.get('max')), low: num(fd.get('low')), step: num(fd.get('step')) || 1 };
    if (fd.has('barcode')) {
      const codes = [...new Set(String(fd.get('barcode') || '').split(',').map((x) => x.trim().replace(/\s+/g, '')).filter(Boolean))];
      const clash = codes.map((c) => [c, S.stock.find((x) => x.id !== fd.get('id') && String(x.barcode || '').split(',').map((y) => y.trim()).includes(c))]).find(([, x]) => x);
      if (clash) return formError(`Barcode ${clash[0]} already belongs to ${clash[1].name}.`);
      d.barcode = codes.join(', '); const pk = num(fd.get('pack')); d.pack = pk > 0 ? pk : null;
    }
    if (fd.has('cost')) { d.cost = num(fd.get('cost')); if (!Number.isFinite(d.cost) || d.cost < 0 || d.cost > MAX_AMOUNT) return formError('Check the purchase price.'); }
    if (!d.name) return formError('Please type the stock item name.');
    for (const [v, what] of [[d.qty, 'In stock'], [d.low, 'Alert below'], [d.max, 'Full stock']]) {
      if (!Number.isFinite(v) || v < 0) return formError(`${what} can’t be negative.`);
      if (v > MAX_AMOUNT) return formError(`${what} looks too high — check for an extra zero.`);
    }
    const s = byId(S.stock, fd.get('id'));
    if (s) { const before = Number(s.qty) || 0, unit = s.unit; Object.assign(s, d); if (d.unit === unit) logCorrection(s, r6(d.qty - before)); } else S.stock.push({ id: uid('s'), ...d });
    closeSheet(); save();
  },
  expense(fd) {
    S.expenses.push({ id: uid('e'), title: fd.get('title').trim(), amount: num(fd.get('amount')), date: fd.get('date') || dayKey(), cat: fd.get('cat') || 'Other' });
    App.ui.month = (fd.get('date') || dayKey()).slice(0, 7);
    closeSheet(); save(); toast('Expense added');
  },
  vendor(fd) {
    const v = { id: uid('v'), name: fd.get('name').trim(), supplies: fd.get('supplies').trim(), phone: fd.get('phone').trim(), due: num(fd.get('due')) };
    S.vendors.push(v);
    if (v.due) S.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'bill', amount: v.due, date: dayKey(), note: 'Opening balance' });
    closeSheet(); save();
  },
  vendorBill(fd) {
    const v = byId(S.vendors, fd.get('id')); const a = num(fd.get('amount')); if (!v || a <= 0) return;
    v.due = round2(v.due + a);
    S.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'bill', amount: a, date: dayKey(), note: fd.get('note').trim() });
    S.expenses.push({ id: uid('e'), date: dayKey(), cat: 'Vendor', title: `${v.name} bill${fd.get('note').trim() ? ' · ' + fd.get('note').trim() : ''}`, amount: a, vendorId: v.id });
    save(); openSheet(vendorSheet(v), { wide: true }); toast('Bill added — also counted in expenses');
  },
  vendorPay(fd) {
    const v = byId(S.vendors, fd.get('id')); const a = num(fd.get('amount')); if (!v || a <= 0) return;
    v.due = round2(Math.max(0, v.due - a));
    S.vendorTx.push({ id: uid('t'), vendorId: v.id, type: 'payment', amount: a, date: dayKey(), method: fd.get('method') });
    save(); openSheet(vendorSheet(v), { wide: true }); toast('Payment recorded');
  },
  business(fd) {
    const tRaw = String(fd.get('tables') ?? '').trim(), tN = Number(tRaw);
    if (tRaw !== '' && (!Number.isInteger(tN) || tN < 0 || tN > MAX_TABLES)) return formError(`Tables must be a whole number from 0 to ${MAX_TABLES}.`);
    if (!String(fd.get('name') || '').trim()) return formError('Please enter the name of your place.');
    Object.assign(S.settings, {
      name: fd.get('name').trim(), tagline: fd.get('tagline').trim(), type: fd.get('type'), currency: fd.get('currency'),
      tables: fd.has('tables') ? clamp(num(fd.get('tables')), 0, 99) : S.settings.tables, tax: num(fd.get('tax')),
      openHour: clamp(num(fd.get('openHour')), 0, 23), closeHour: clamp(num(fd.get('closeHour')), 0, 23),
      footer: fd.get('footer').trim(), accent: fd.get('accent'), theme: fd.get('theme'), look: 4,
      short: shortCode(fd.get('short') || fd.get('name')),
    });
    save(); toast('Saved');
  },
  menuItem(fd) {
    const d = { name: fd.get('name').trim(), price: num(fd.get('price')), cat: fd.get('cat').trim() || 'General' };
    const m = byId(S.menu, fd.get('id'));
    if (m) Object.assign(m, d); else S.menu.push({ id: uid('m'), available: true, ...d });
    closeSheet(); save();
  },
};

/* ---------------- live inputs (data-input) ---------------- */
const Inputs = {
  menuSearch(el) { App.ui.q = el.value; const g = $('#menu-grid'); if (g) g.innerHTML = menuGrid(); },
  billDiscount(el) {
    if (typeof billLive === 'function') return billLive(el);
    const o = byId(S.orders, App.params.o); if (!o) return;
    const err = discountError(el.value, orderSubtotal(o));
    const e = el.form?.querySelector('#form-err'); if (e) e.textContent = err;
    el.setAttribute('aria-invalid', err ? 'true' : 'false');
    if (err) return;
    const t = orderTotals(o, num(el.value));
    $('#bill-total').textContent = `Total ${money(t.total)}`; $('#bill-tax').innerHTML = billTaxRowsHtml(t);
  },
  journalNote(el) {
    const dk = App.ui.day, e = S.journal[dk] || { note: '', tags: [] };
    e.note = el.value; S.journal[dk] = e;
    clearTimeout(Inputs._t);
    Inputs._t = setTimeout(() => { persist(); const s = $('#journal-saved'); if (s) s.textContent = `Saved · ${fmtTime(Date.now())}`; }, 400);
  },
};

/* ---------------- utils ---------------- */
const slug = (s) => String(s || 'cafe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cafe';
function download(name, text, type) { saveBlob(name, new Blob([text], { type })); }

/* ---------------- events ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = Actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.classList.contains('sheet-backdrop')) e.preventDefault();
  fn(el, e);
});
document.addEventListener('keydown', (e) => {
  // Escape closes an open ingredient list first, the sheet only after that
  if (e.key === 'Escape' && !$('#sheet').hidden && !e.target.closest?.('.combo')?.querySelector('.combo-list:not([hidden])')) closeSheet();
  const el = e.target.closest?.('[role="button"][data-act]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); Actions[el.dataset.act]?.(el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target; if (!f.dataset.form) return;
  e.preventDefault(); Forms[f.dataset.form]?.(new FormData(f), f);
});
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); el && Inputs[el.dataset.input]?.(el, e); });
document.addEventListener('change', (e) => {
  if (e.target.id === 'import-file') { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFile(f); return; }
  const el = e.target.closest('[data-change]'); el && Changes[el.dataset.change]?.(el, e);
});
/** Handlers for <input data-change="..."> (file pickers etc.), filled in by other modules */
const Changes = {
  designation(el) {
    const box = el.parentElement.querySelector('input[name$="_other"]');
    if (!box) return;
    box.hidden = el.value !== '__other';
    if (!box.hidden) box.focus();
  },
};
window.addEventListener('hashchange', () => { closeSheet(); render(); });
// Keep several tabs/windows on the same device in sync (e.g. kitchen screen in another window)
window.addEventListener('storage', (e) => {
  if (e.key === DB_KEY) {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type !== 'checkbox'))) { S = loadState(); return; }
    S = loadState(); if ($('#sheet').hidden) render();
  }
});
// live timers on kitchen tickets + refresh "x min" labels
setInterval(() => {
  $$('[data-since]').forEach((t) => {
    const since = Number(t.dataset.since), mins = (Date.now() - since) / 60000;
    t.querySelector('span').textContent = elapsed(since);
    t.classList.toggle('warn', mins >= 10 && mins < 20); t.classList.toggle('late', mins >= 20);
  });
}, 1000);
/* ---------------- live updates on screen ----------------
   Changes from other phones (a table cleaned, food ready, a new order…) used to wait while ANY box
   had the cursor — on a laptop the cursor often stays in the search box, so the screen never
   updated (e.g. the owner kept seeing "Needs cleaning" after the captain tapped "Cleaned").
   Now an update waits only while someone is really typing (or just tapped into a box), then the
   screen updates and the cursor and typed text stay where they were. */
const TEXTY = 'textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=file]):not([type=color])';
App.typedAt = 0; App.focusAt = 0;
['input', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { App.typedAt = Date.now(); }, true));
document.addEventListener('focusin', () => { App.focusAt = Date.now(); }, true);
function busyTyping() {
  const a = document.activeElement;
  return !!(a && a.matches && a.matches(TEXTY) && Date.now() - Math.max(App.typedAt, App.focusAt) < 6000);
}
/** Re-draw now, keeping the cursor (and anything typed) in the same box */
function renderKeepFocus() {
  const a = document.activeElement; let key = null, val = null, s0 = null, s1 = null;
  if (a && a.closest && a.closest('#app') && a.matches(TEXTY)) {
    key = a.id ? `#${CSS.escape(a.id)}` : a.name ? `${a.tagName.toLowerCase()}[name="${CSS.escape(a.name)}"]`
      : a.dataset.input ? `[data-input="${CSS.escape(a.dataset.input)}"]` : a.dataset.change ? `[data-change="${CSS.escape(a.dataset.change)}"]` : null;
    val = a.value; try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) { /* not a text box */ }
  }
  render();
  if (!key) return;
  const n = $('#app').querySelector(key); if (!n) return;
  if (/^(TEXTAREA|INPUT)$/.test(n.tagName) && /^(text|search|number|tel|email|url|password|textarea)$/.test(n.type || 'textarea') && n.value !== val) n.value = val;
  n.focus({ preventScroll: true });
  try { if (s0 != null) n.setSelectionRange(s0, s1); } catch (e) { /* not a text box */ }
}
/** A change arrived: show it now, or as soon as the person stops typing / closes the open sheet */
function liveRender() {
  if (!$('#sheet').hidden || busyTyping()) { App.renderPending = true; return false; }
  App.renderPending = false; renderKeepFocus(); return true;
}
setInterval(() => { if (App.renderPending && Session.user()) liveRender(); }, 1500);
// Keep every screen fresh (waiters, kitchen and counter): re-draw every 15 seconds
setInterval(() => { if (Session.user()) liveRender(); }, 15000);

// Auto-lock: any tap or key keeps the session alive; after LOCK_AFTER_MIN idle minutes, back to the PIN screen
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => Session.touch(), { capture: true, passive: true }));
function checkLock() {
  if (!Session._id || Session.locked) return;
  if (Session.account() && !Session.user() && Session.locked) { closeSheet(); render(); toast(`Locked after ${IDLE_LOCK_MIN} minutes without use`); }
}
setInterval(checkLock, 10000);
document.addEventListener('visibilitychange', () => { if (document.hidden) Session.save(); else checkLock(); });

/* ---------------- "food is ready" alerts for the person who took the order ---------------- */
function checkReady() {
  const me = Session.user();
  if (!me) { App.kotSeen = null; return; }
  const prev = App.kotSeen;
  App.kotSeen = Object.fromEntries(S.kots.map((k) => [k.id, k.status]));
  if (!prev) return;
  const mine = S.kots.filter((k) => k.status === 'ready' && prev[k.id] && prev[k.id] !== 'ready' && (k.byId ? k.byId === me.id : me.role === 'waiter'));
  if (mine.length) notifyReady(mine);
}
function notifyReady(list) {
  const what = list.map((k) => (k.token ? `Token ${k.token}` : k.table === 'Takeaway' ? `Takeaway #${k.no}` : k.table)).join(', ');
  const body = list.map((k) => k.items.map((i) => `${i.qty}× ${i.name}`).join(', ')).join(' · ');
  beep(); setTimeout(beep, 700);
  try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch (e) { /* ignore */ }
  toast(`Food ready to serve: ${what}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body, tag: 'ready-' + list[0].id, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [250, 120, 250] };
    const title = `Ready to serve · ${what}`;
    (navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(null))
      .then((reg) => (reg ? reg.showNotification(title, opts) : new Notification(title, opts))).catch(() => { try { new Notification(title, opts); } catch (e) { /* ignore */ } });
  }
}

/* ---------------- boot (after every script, incl. auth.js, has loaded) ---------------- */
document.addEventListener('DOMContentLoaded', render);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Register once; only ask for an update when a worker is already running (calling update() while the
  // first install is still in progress is what logged "An unknown error occurred when fetching the script")
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((r) => { if (r.active && !r.installing && !r.waiting) return r.update(); })
    .catch((e) => console.info('Offline mode not available:', e && e.message)));
  // When a new version takes over, reload once so nobody keeps using old screens
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
