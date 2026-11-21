'use strict';
/* =========================================================
   Shell, render loop, actions, forms, boot
   ========================================================= */

const MOBILE_TABS = 4;

function applyTheme() {
  const st = S.settings || {};
  const root = document.documentElement;
  root.style.setProperty('--accent', ACCENTS[st.accent] || ACCENTS.green);
  if (st.theme === 'light' || st.theme === 'dark') root.dataset.theme = st.theme; else delete root.dataset.theme;
  document.title = st.name ? `${st.name} · Cafe Journal` : 'Cafe Journal';
}

function shell(view, content) {
  const role = Session.role();
  const r = ROLES[role];
  const me = Session.user();
  const st = S.settings;
  const navItem = (v, cls = '') => `<a href="#/${v}" class="nav-i ${cls} ${v === view ? 'on' : ''}" ${v === view ? 'aria-current="page"' : ''}>${icon(VIEWS[v].icon)}<span>${VIEWS[v].label}</span>${badgeFor(v)}</a>`;
  const tabs = r.views.length > MOBILE_TABS + 1 ? r.views.slice(0, MOBILE_TABS) : r.views;
  const moreActive = r.views.length > MOBILE_TABS + 1 && !tabs.includes(view);
  return `<div class="layout">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${esc(initials(st.name))}</span><span><strong>${esc(st.name)}</strong><small>${esc(st.tagline || BUSINESS_TYPES[st.type] || '')}</small></span></div>
      <nav class="nav">${r.views.map((v) => navItem(v)).join('')}</nav>
      <div class="me"><span class="avatar sm" style="background:${r.color}">${esc(initials(me.name))}</span><span><strong>${esc(me.name)}</strong><small>${esc(r.label)}</small></span>
        <button class="icon-btn" data-act="myPin" title="Change my password" aria-label="Change my password">${icon('lock')}</button>
        <button class="icon-btn" data-act="logout" title="Log out" aria-label="Log out">${icon('logout')}</button></div>
    </aside>
    <div class="topbar"><span class="brand-mark sm">${esc(initials(st.name))}</span><strong>${esc(st.name)}</strong>
      <button class="role-pill" style="--c:${r.color}" data-act="myPin" title="Change my password">${esc(me.name.split(' ')[0])} · ${esc(r.label)}</button>
      <button class="icon-btn" data-act="logout" aria-label="Log out">${icon('logout')}</button></div>
    <main class="main" id="main">${content}</main>
    ${r.views.length > 1 ? `<nav class="tabbar">${tabs.map((v) => navItem(v)).join('')}
      ${r.views.length > MOBILE_TABS + 1 ? `<button class="nav-i ${moreActive ? 'on' : ''}" data-act="moreNav">${icon('more')}<span>More</span></button>` : ''}</nav>` : ''}
  </div>`;
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
  if (!S.settings) {
    // Links from the website: app/#/signup opens the sign-up steps, app/#/login explains how to log in here
    const entry = parseHash().view;
    if (entry === 'signup' && App.setup.step === 0) App.setup.step = 1;
    App.setup.intent = entry === 'login' ? 'login' : '';
    if (entry === 'signup' || entry === 'login') history.replaceState(null, '', location.pathname);
    root.innerHTML = Views.setup(); return;
  }
  const role = Session.role();
  if (!role) { root.innerHTML = Views.login(); return; }
  let { view, params } = parseHash();
  const allowed = ROLES[role].views;
  if (!allowed.includes(view)) {
    view = allowed[0]; params = {};
    history.replaceState(null, '', `#/${view}`);
  }
  if (view !== App.view) { App.ui.q = ''; window.scrollTo(0, 0); }
  App.view = view; App.params = params;

  if (view === 'kitchen') {
    const n = S.kots.filter((k) => k.status === 'new').length;
    if (App.lastNewKots !== null && n > App.lastNewKots) beep();
    App.lastNewKots = n;
  } else App.lastNewKots = null;

  root.innerHTML = shell(view, Views[view](params));
}

/* ---------------- actions (data-act) ---------------- */
function line(id) { const o = currentOrder(App.params); return o && { o, l: o.items.find((x) => x.id === id) }; }

const Actions = {
  closeSheet,
  logout() { Session.set(null); closeSheet(); history.replaceState(null, '', location.pathname); render(); },
  moreNav() {
    const r = ROLES[Session.role()];
    openSheet(`${sheetHead(r.label, 'More')}<div class="more-grid">${r.views.slice(MOBILE_TABS).map((v) => `<a class="card more-i" href="#/${v}" data-act="closeSheet">${icon(VIEWS[v].icon)}<span>${VIEWS[v].label}</span>${badgeFor(v)}</a>`).join('')}</div>`);
  },

  /* orders */
  openTable(el) { go('orders', { t: el.dataset.t }); },
  openOrder(el) { go('orders', { o: el.dataset.id }); },
  toTables() { go('orders'); },
  newTakeaway() {
    const o = { id: uid('o'), no: nextBillNo(), table: 'Takeaway', items: [], status: 'open', createdAt: Date.now(), by: Session.user()?.name || Session.role() };
    S.orders.push(o); persist(); go('orders', { o: o.id });
  },
  setCat(el) { App.ui.cat = el.dataset.cat; render(); },
  addItem(el) {
    const m = byId(S.menu, el.dataset.id); if (!m) return;
    let o = currentOrder(App.params);
    if (!o) {
      o = { id: uid('o'), no: nextBillNo(), table: App.params.t || 'Takeaway', items: [], status: 'open', createdAt: Date.now(), by: Session.user()?.name || Session.role() };
      S.orders.push(o);
    }
    if (o.status !== 'open') return toast('This bill is already paid');
    const l = o.items.find((x) => x.menuId === m.id);
    if (l) l.qty += 1; else o.items.push({ id: uid('l'), menuId: m.id, name: m.name, price: m.price, qty: 1, sent: 0 });
    save();
  },
  incLine(el) { const r = line(el.dataset.id); if (r?.l) { r.l.qty += 1; save(); } },
  decLine(el) {
    const r = line(el.dataset.id); if (!r?.l) return;
    if (r.l.qty <= r.l.sent && !confirm(`${r.l.name} was already sent to the kitchen. Remove one anyway?`)) return;
    r.l.qty -= 1; r.l.sent = Math.min(r.l.sent, r.l.qty);
    if (r.l.qty <= 0) r.o.items = r.o.items.filter((x) => x !== r.l);
    if (!r.o.items.length && !S.kots.some((k) => k.orderId === r.o.id)) {
      S.orders = S.orders.filter((x) => x !== r.o); persist(); return go('orders', r.o.table === 'Takeaway' ? {} : { t: r.o.table });
    }
    save();
  },
  sendKitchen() {
    const o = currentOrder(App.params); if (!o) return;
    const items = o.items.filter((l) => l.qty > l.sent).map((l) => ({ name: l.name, qty: l.qty - l.sent }));
    if (!items.length) return;
    o.items.forEach((l) => { l.sent = l.qty; });
    S.kots.push({ id: uid('k'), orderId: o.id, table: o.table, no: o.no, items, status: 'new', createdAt: Date.now(), updatedAt: Date.now() });
    persist(); toast(`Sent to kitchen ✓ ${orderLabel(o)}`);
    if (o.table === 'Takeaway') render(); else go('orders');
  },
  toBill(el) { go('billing', { o: el.dataset.id }); },

  /* kitchen */
  kotNext(el) {
    const k = byId(S.kots, el.dataset.id); if (!k) return;
    k.status = { new: 'cooking', cooking: 'ready', ready: 'served' }[k.status] || 'served';
    k.updatedAt = Date.now();
    S.kots = S.kots.filter((x) => x.status !== 'served' || Date.now() - x.updatedAt < 864e5); // keep one day
    save();
  },

  /* billing */
  selectBill(el) { go('billing', { o: el.dataset.id }); },
  closeBill() { go('billing'); },
  printReceipt(el) {
    const o = byId(S.orders, el.dataset.id); if (!o) return;
    $('#print').innerHTML = receiptHtml(o); window.print();
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
    s.qty = Math.max(0, round2(Number(s.qty) + Number(el.dataset.d) * (Number(s.step) || 1)));
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
  menuAdd() { openSheet(menuForm()); },
  menuEdit(el) { const m = byId(S.menu, el.dataset.id); m && openSheet(menuForm(m)); },
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

/* ---------------- forms (data-form) ---------------- */
const num = (v) => (v === '' || v == null ? 0 : Number(v));
const Forms = {
  pay(fd) {
    const o = byId(S.orders, App.params.o); if (!o || o.status !== 'open') return;
    const t = orderTotals(o, num(fd.get('discount')));
    Object.assign(o, { status: 'paid', paidAt: Date.now(), method: fd.get('method') || 'cash', subtotal: t.sub, discount: t.discount, tax: t.tax, total: t.total });
    S.kots.forEach((k) => { if (k.orderId === o.id && k.status === 'ready') { k.status = 'served'; k.updatedAt = Date.now(); } });
    save(); toast(`Paid ${money(t.total)} ✓`);
  },
  stockItem(fd) {
    const d = { name: fd.get('name').trim(), qty: num(fd.get('qty')), unit: fd.get('unit'), max: num(fd.get('max')), low: num(fd.get('low')), step: num(fd.get('step')) || 1 };
    const s = byId(S.stock, fd.get('id'));
    if (s) Object.assign(s, d); else S.stock.push({ id: uid('s'), ...d });
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
    Object.assign(S.settings, {
      name: fd.get('name').trim(), tagline: fd.get('tagline').trim(), type: fd.get('type'), currency: fd.get('currency'),
      tables: clamp(num(fd.get('tables')), 0, 99), tax: num(fd.get('tax')),
      openHour: clamp(num(fd.get('openHour')), 0, 23), closeHour: clamp(num(fd.get('closeHour')), 0, 23),
      footer: fd.get('footer').trim(), accent: fd.get('accent'), theme: fd.get('theme'),
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
    const o = byId(S.orders, App.params.o); if (!o) return;
    const t = orderTotals(o, num(el.value));
    $('#bill-total').textContent = `Total ${money(t.total)}`; $('#bill-tax').textContent = money(t.tax);
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
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

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
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
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
const Changes = {};
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
setInterval(() => { if ($('#sheet').hidden && ['orders', 'billing', 'dashboard'].includes(App.view) && !document.activeElement?.matches('input,textarea,select')) render(); }, 60000);

// Auto-lock: any tap or key keeps the session alive; after LOCK_AFTER_MIN idle minutes, back to the PIN screen
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => Session.touch(), { capture: true, passive: true }));
setInterval(() => {
  if (Session._id && !Session.user()) { closeSheet(); history.replaceState(null, '', location.pathname); render(); toast('Locked — enter your PIN'); }
}, 30000);

/* ---------------- boot (after every script, incl. auth.js, has loaded) ---------------- */
document.addEventListener('DOMContentLoaded', render);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {}));
  // When a new version takes over, reload once so nobody keeps using old screens
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
