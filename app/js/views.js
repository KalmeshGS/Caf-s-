'use strict';
/* =========================================================
   Views — each returns an HTML string for the main area
   ========================================================= */

const App = {
  view: '', params: {},
  ui: { cat: 'All', q: '', month: monthKey(), day: dayKey(), stockFilter: 'all', settingsTab: 'business' },
  lastNewKots: null,
};
const can = (view) => { const r = Session.role(); return !!r && ROLES[r].views.includes(view); };
const Views = {};

/* Setup wizard: onboarding.js · Login & Team: auth.js · Staff & ID cards: staff.js */

/* ---------------- 01 Dashboard ---------------- */
Views.dashboard = () => {
  const today = dayKey();
  const paid = paidOn(today);
  const sales = sum(paid, (o) => o.total);
  const exp = sum(expensesOn(today), (e) => e.amount);
  const profit = sales - exp;
  const h0 = Number(S.settings.openHour ?? 8), h1 = Number(S.settings.closeHour ?? 22);
  const hrs = []; for (let h = h0; h <= h1; h++) hrs.push(h);
  const hourly = hrs.map((h) => sum(paid.filter((o) => new Date(o.paidAt).getHours() === h), (o) => o.total));
  const top = topItems(paid).slice(0, 5);
  const low = S.stock.filter(isLow);
  const dues = S.vendors.filter((v) => v.due > 0);
  const open = openOrders();
  const nowH = new Date().getHours();
  const yday = sum(paidOn(shiftDay(today, -1)), (o) => o.total);
  const diff = yday ? Math.round(((sales - yday) / yday) * 100) : null;

  return `${pageHead(Session.role() === 'owner' ? 'Owner dashboard' : 'Dashboard', `Today · ${fmtDate(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}`, live())}
  ${requestsCard()}
  <div class="kpis">
    ${kpi("Today's sales", money(sales), `${paid.length} bills${diff !== null && sales ? ` · ${diff >= 0 ? '+' : ''}${diff}% vs yesterday` : ''}`)}
    ${kpi("Today's expenses", money(exp), `${expensesOn(today).length} ${expensesOn(today).length === 1 ? 'entry' : 'entries'}`, 'neg')}
    ${kpi("Today's profit", money(profit), 'Sales − expenses', profit >= 0 ? 'pos' : 'neg')}
    ${kpi('Running tables', String(open.length), open.length ? money(sum(open, orderSubtotal)) + ' on tables' : 'All clear')}
  </div>
  <div class="grid-2 wide-left">
    <section class="card">
      <div class="card-head">${eyebrow('Sales · hourly')}<span class="muted sm">${paid.length ? 'Avg bill ' + money(sales / paid.length) : ''}</span></div>
      ${barChart(hourly, hrs.map((h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p')), { hi: hrs.indexOf(nowH) })}
    </section>
    <section class="card">
      ${eyebrow('Top items today')}
      ${top.length ? `<ol class="rank">${top.map((t) => `<li><span>${esc(t.name)}</span><b>${t.qty}</b></li>`).join('')}</ol>` : empty('No sales yet today.')}
    </section>
  </div>
  <div class="grid-2">
    <section class="card">
      <div class="card-head">${eyebrow('Running low')}${can('stock') ? `<a class="link" href="#/stock">Stock →</a>` : ''}</div>
      ${low.length ? low.slice(0, 5).map((s) => `<div class="line-row"><span>${icon('alert', 'warn')} ${esc(s.name)}</span><b class="neg">${esc(s.qty)} ${esc(s.unit)}</b></div>`).join('') : `<p class="muted">${icon('check')} Stock looks healthy.</p>`}
    </section>
    <section class="card">
      <div class="card-head">${eyebrow('To pay vendors')}${can('vendors') ? `<a class="link" href="#/vendors">Vendors →</a>` : ''}</div>
      ${dues.length ? dues.slice(0, 5).map((v) => `<div class="line-row"><span>${esc(v.name)}</span><b class="neg">${money(v.due)}</b></div>`).join('') + `<div class="line-row total"><span>Total due</span><b>${money(sum(dues, (v) => v.due))}</b></div>` : `<p class="muted">${icon('check')} Nothing pending.</p>`}
    </section>
  </div>`;
};

/* ---------------- 02 Orders ---------------- */
function currentOrder(p) {
  if (p.o) return byId(S.orders, p.o);
  if (p.t) return S.orders.find((o) => o.status === 'open' && o.table === p.t);
  return null;
}
Views.orders = (p) => (p.t || p.o ? orderEditor(p) : tablesView());

function tablesView() {
  const open = openOrders();
  const tables = tableNames().map((t) => {
    const o = open.find((x) => x.table === t);
    const pending = o && o.items.some((l) => l.qty > l.sent);
    return `<button class="table-tile ${o ? 'busy' : ''}" data-act="openTable" data-t="${t}">
      <strong>${esc(t)}</strong>
      ${o ? `<span>${money(orderSubtotal(o))}</span><small>${sum(o.items, (l) => l.qty)} items · ${elapsedMin(o.createdAt)}</small>${pending ? '<i class="dot" title="Not sent to kitchen"></i>' : ''}`
          : '<small>Free</small>'}
    </button>`;
  }).join('');
  const takeaways = open.filter((o) => o.table === 'Takeaway');
  return `${pageHead('Orders', 'Tables', btn('New takeaway', 'newTakeaway', { cls: 'primary', ic: 'plus' }))}
    ${tableNames().length ? `<div class="table-grid">${tables}</div>` : empty('No tables set. Add tables in Settings, or use takeaway orders.')}
    ${takeaways.length ? `<h3 class="section-t">Takeaway</h3><div class="table-grid">${takeaways.map((o) => `
      <button class="table-tile busy" data-act="openOrder" data-id="${o.id}"><strong>#${o.no}</strong><span>${money(orderSubtotal(o))}</span><small>${sum(o.items, (l) => l.qty)} items · ${elapsedMin(o.createdAt)}</small></button>`).join('')}</div>` : ''}`;
}
const elapsedMin = (ts) => { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };

function menuGrid() {
  const q = App.ui.q.trim().toLowerCase();
  const items = S.menu.filter((m) => (App.ui.cat === 'All' || m.cat === App.ui.cat) && (!q || m.name.toLowerCase().includes(q)));
  if (!items.length) return empty(S.menu.length ? 'Nothing matches.' : 'Your menu is empty — add items in Settings → Menu.');
  return items.map((m) => `<button class="menu-item" data-act="addItem" data-id="${m.id}" ${m.available === false ? 'disabled' : ''}>
      <span>${esc(m.name)}</span><small>${m.available === false ? 'Not available' : money(m.price)}</small></button>`).join('');
}

function orderEditor(p) {
  const o = currentOrder(p);
  if (p.o && !o) return empty('This order no longer exists.', btn('Back to tables', 'toTables'));
  const label = o ? orderLabel(o) : p.t;
  const cats = ['All', ...new Set(S.menu.map((m) => m.cat))];
  if (!cats.includes(App.ui.cat)) App.ui.cat = 'All';
  const lines = o ? o.items : [];
  const unsent = sum(lines, (l) => Math.max(0, l.qty - l.sent));
  const sub = o ? orderSubtotal(o) : 0;
  const role = Session.role();

  return `<div class="crumb"><button class="icon-btn" data-act="toTables" aria-label="Back">${icon('left')}</button><span>${esc(ROLES[role].label)} · Order</span></div>
  <div class="order-layout">
    <section class="menu-pane">
      <div class="search">${icon('search')}<input type="search" placeholder="Search menu" value="${esc(App.ui.q)}" data-input="menuSearch" aria-label="Search menu"></div>
      <div class="chip-row scroll">${cats.map((c) => `<button class="chip ${c === App.ui.cat ? 'on' : ''}" data-act="setCat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="menu-grid" id="menu-grid">${menuGrid()}</div>
    </section>
    <aside class="card ticket">
      ${eyebrow(o ? `Order #${o.no} · ${fmtTime(o.createdAt)}` : 'New order')}
      <h2>${esc(label === 'Takeaway' ? 'Takeaway' : label.startsWith('T') ? 'Table ' + label.slice(1) : label)}</h2>
      <div class="ticket-lines">
      ${lines.length ? lines.map((l) => `<div class="tline">
          <div><strong>${esc(l.name)}</strong><small>${money(l.price)} × ${l.qty}${l.qty > l.sent ? ` <em class="new">+${l.qty - l.sent} new</em>` : ''}</small></div>
          <div class="qty"><button class="icon-btn sm" data-act="decLine" data-id="${l.id}" aria-label="Less">${icon('minus')}</button><b>${l.qty}</b><button class="icon-btn sm" data-act="incLine" data-id="${l.id}" aria-label="More">${icon('plus')}</button></div>
        </div>`).join('') : `<p class="muted">Tap items on the menu to add them.</p>`}
      </div>
      <div class="line-row total"><span>Subtotal</span><b>${money(sub)}</b></div>
      <div class="ticket-actions">
        <button class="btn primary block" data-act="sendKitchen" ${unsent ? '' : 'disabled'}>${icon(unsent ? 'send' : 'check')}<span>${unsent ? `Send to kitchen (${unsent})` : o && lines.length ? 'Sent to kitchen' : 'Send to kitchen'}</span></button>
        ${o && can('billing') && lines.length ? btn('Go to bill', 'toBill', { cls: 'ghost block', ic: 'receipt', data: `data-id="${o.id}"` }) : ''}
      </div>
    </aside>
  </div>
  <div class="mobile-bar"><span>${sum(lines, (l) => l.qty)} items · <b>${money(sub)}</b></span>
    <button class="btn primary" data-act="sendKitchen" ${unsent ? '' : 'disabled'}>${unsent ? `Send (${unsent})` : 'Sent'}</button></div>`;
}

/* ---------------- Kitchen screen ---------------- */
Views.kitchen = () => {
  const active = S.kots.filter((k) => k.status !== 'served').sort((a, b) => a.createdAt - b.createdAt);
  const col = (status, title, next) => {
    const list = active.filter((k) => k.status === status);
    return `<section class="k-col"><div class="k-col-h"><span>${esc(title)}</span><b>${list.length}</b></div>
      ${list.length ? list.map((k) => `<article class="kot card ${status}">
        <div class="kot-h"><strong>${esc(k.table === 'Takeaway' ? 'TA #' + k.no : k.table)}</strong>${status === 'new' ? '<span class="badge warm">New</span>' : `<small class="muted">#${k.no}</small>`}</div>
        <ul>${k.items.map((i) => `<li><b>${i.qty}×</b> ${esc(i.name)}</li>`).join('')}</ul>
        <div class="kot-f"><span class="timer" data-since="${k.createdAt}">${icon('clock')}<span>${elapsed(k.createdAt)}</span></span>
        <button class="btn ${status === 'ready' ? 'ghost' : 'primary'} sm" data-act="kotNext" data-id="${k.id}">${esc(next)}</button></div>
      </article>`).join('') : `<p class="muted k-empty">—</p>`}</section>`;
  };
  return `${pageHead('Kitchen', 'Kitchen screen', live())}
    <div class="kitchen">${col('new', 'New', 'Start cooking')}${col('cooking', 'Cooking', 'Mark ready')}${col('ready', 'Ready to serve', 'Served')}</div>
    <p class="fine">Tip: open this screen on the kitchen tablet. New tickets ping and the timer turns amber after 10 min, red after 20.</p>`;
};

/* ---------------- 03 Billing ---------------- */
Views.billing = (p) => {
  const open = openOrders().filter((o) => o.items.length);
  const sel = p.o ? byId(S.orders, p.o) : null;
  const today = dayKey();
  const paid = paidOn(today).sort((a, b) => b.paidAt - a.paidAt);
  const bm = byMethod(paid), total = sum(paid, (o) => o.total);
  const pm = payMethods();

  let bill = '';
  if (sel && sel.status === 'open') {
    const t = orderTotals(sel);
    bill = `<form class="card bill" data-form="pay">
      <div class="card-head">${eyebrow(`Billing · ${orderLabel(sel)} · #${sel.no}`)}<button type="button" class="icon-btn" data-act="closeBill" aria-label="Close bill">${icon('x')}</button></div>
      <h2 id="bill-total">Total ${money(t.total)}</h2>
      <div class="bill-lines">${sel.items.map((l) => `<div class="line-row"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.qty * l.price)}</span></div>`).join('')}</div>
      <div class="line-row"><span>Subtotal</span><span>${money(t.sub)}</span></div>
      <label class="line-row"><span>Discount</span><input class="inline-input" name="discount" type="number" min="0" step="any" value="${sel.discount || ''}" placeholder="0" data-input="billDiscount"></label>
      <div class="line-row"><span>Tax (${Number(S.settings.tax) || 0}%)</span><span id="bill-tax">${money(t.tax)}</span></div>
      <div class="seg">${Object.entries(pm).map(([k, m], i) => `<label><input type="radio" name="method" value="${k}" ${i === 1 ? 'checked' : ''}><span>${esc(m.label)}</span></label>`).join('')}</div>
      <button class="btn primary block" type="submit">${icon('check')}<span>Mark as paid</span></button>
    </form>`;
  } else if (sel && sel.status === 'paid') {
    bill = `<div class="card bill paid">
      <div class="card-head">${eyebrow(`Billing · ${orderLabel(sel)} · #${sel.no}`)}<span class="badge ok">${icon('check')} Paid</span></div>
      <h2>Total ${money(sel.total)}</h2>
      ${sel.items.map((l) => `<div class="line-row"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.qty * l.price)}</span></div>`).join('')}
      <div class="line-row"><span>Paid by</span><b>${esc(pm[sel.method]?.label || sel.method)} · ${fmtTime(sel.paidAt)}</b></div>
      <div class="row-2">${btn('Print receipt', 'printReceipt', { cls: 'ghost', ic: 'printer', data: `data-id="${sel.id}"` })}${btn('Done', 'closeBill', { cls: 'primary' })}</div>
    </div>`;
  }

  const openList = open.length ? open.map((o) => `<button class="list-btn ${sel && sel.id === o.id ? 'on' : ''}" data-act="selectBill" data-id="${o.id}">
      <span><strong>${esc(orderLabel(o))}</strong><small>#${o.no} · ${sum(o.items, (l) => l.qty)} items · ${elapsedMin(o.createdAt)}</small></span><b>${money(orderTotals(o).total)}</b></button>`).join('')
    : empty('No open bills. Orders from tables show up here.');

  const closing = S.journal[today]?.closing;
  return `${pageHead('Billing', 'Bills', '')}
  <div class="grid-2 wide-left">
    <div class="stack">
      ${bill}
      <section class="card">${eyebrow('Open bills')}<div class="list">${openList}</div></section>
    </div>
    <div class="stack">
      <section class="card">
        <div class="card-head">${eyebrow(`Day closing · ${fmtDate(new Date())}`)}<b>${money(total)}</b></div>
        ${Object.entries(pm).map(([k, m]) => `<div class="meter-row"><span>${esc(m.label)}</span>${meter(total ? (bm[k] / total) * 100 : 0, m.color)}<b>${money(bm[k])}</b></div>`).join('')}
        <p class="muted sm">${paid.length} bills paid today${closing ? ` · closed at ${fmtTime(closing.at)}` : ''}</p>
        ${btn(closing ? 'Update day closing' : 'Close day & save to journal', 'closeDay', { cls: 'ghost block', ic: 'book' })}
      </section>
      <section class="card">${eyebrow('Paid today')}
        <div class="list compact">${paid.length ? paid.slice(0, 12).map((o) => `<button class="list-btn" data-act="selectBill" data-id="${o.id}">
          <span><strong>${esc(orderLabel(o))}</strong><small>#${o.no} · ${fmtTime(o.paidAt)} · ${esc(pm[o.method]?.label || '')}</small></span><b>${money(o.total)}</b></button>`).join('') : empty('Nothing yet.')}</div>
      </section>
    </div>
  </div>`;
};

/* ---------------- 04 Stock ---------------- */
Views.stock = () => {
  const f = App.ui.stockFilter;
  const low = S.stock.filter(isLow);
  const list = (f === 'low' ? low : S.stock).slice().sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));
  return `${pageHead('Stock · live', 'Inventory', btn('Add item', 'stockAdd', { cls: 'primary', ic: 'plus' }))}
  ${low.length ? `<div class="banner warn">${icon('alert')}<span><b>${low.length} item${low.length > 1 ? 's' : ''} running low:</b> ${low.map((s) => esc(s.name)).join(', ')}. Reorder before you run out.</span></div>` : ''}
  <div class="chip-row"><button class="chip ${f === 'all' ? 'on' : ''}" data-act="stockFilter" data-f="all">All (${S.stock.length})</button><button class="chip ${f === 'low' ? 'on' : ''}" data-act="stockFilter" data-f="low">Low (${low.length})</button></div>
  <section class="card">
    ${list.length ? list.map((s) => {
      const pct = s.max ? (s.qty / s.max) * 100 : 0;
      const lo = isLow(s);
      return `<div class="stock-row">
        <div class="stock-main" data-act="stockEdit" data-id="${s.id}" role="button" tabindex="0">
          <div class="line-row"><strong>${esc(s.name)}</strong><b class="${lo ? 'neg' : ''}">${esc(+Number(s.qty).toFixed(2))} ${esc(s.unit)}</b></div>
          ${meter(pct, lo ? 'var(--danger)' : 'var(--accent)')}
          <small class="muted">Alert at ${esc(s.low)} ${esc(s.unit)} · full ${esc(s.max)} ${esc(s.unit)}</small>
        </div>
        <div class="qty"><button class="icon-btn sm" data-act="stockAdj" data-id="${s.id}" data-d="-1" aria-label="Use">${icon('minus')}</button><button class="icon-btn sm" data-act="stockAdj" data-id="${s.id}" data-d="1" aria-label="Add">${icon('plus')}</button></div>
      </div>`;
    }).join('') : empty(f === 'low' ? 'Nothing is running low.' : 'No stock items yet.', f === 'low' ? '' : btn('Add first item', 'stockAdd', { cls: 'ghost', ic: 'plus' }))}
  </section>`;
};

function stockForm(s = {}) {
  return `${sheetHead('Stock', s.id ? 'Edit item' : 'Add item')}
  <form data-form="stockItem" class="form">
    <input type="hidden" name="id" value="${esc(s.id || '')}">
    <label class="field"><span>Item name</span><input name="name" required maxlength="40" value="${esc(s.name || '')}" placeholder="e.g. Milk"></label>
    <div class="row-2">
      <label class="field"><span>In stock now</span><input name="qty" type="number" step="any" min="0" required value="${esc(s.qty ?? '')}"></label>
      <label class="field"><span>Unit</span><select name="unit">${UNITS.map((u) => `<option ${u === (s.unit || 'kg') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    </div>
    <div class="row-3">
      <label class="field"><span>Full level</span><input name="max" type="number" step="any" min="0" required value="${esc(s.max ?? '')}"></label>
      <label class="field"><span>Alert below</span><input name="low" type="number" step="any" min="0" required value="${esc(s.low ?? '')}"></label>
      <label class="field"><span>+/− step</span><input name="step" type="number" step="any" min="0.01" value="${esc(s.step ?? 1)}"></label>
    </div>
    <div class="form-actions">${s.id ? btn('Delete', 'stockDel', { cls: 'danger-ghost', ic: 'trash', data: `data-id="${s.id}"` }) : '<span></span>'}
      <button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

/* ---------------- 05 Expenses ---------------- */
Views.expenses = () => {
  const mk = App.ui.month;
  const list = expensesInMonth(mk).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(list, (e) => e.amount);
  const segs = Object.entries(EXPENSE_CATS).map(([c, color]) => ({ label: c, color, value: sum(list.filter((e) => e.cat === c), (e) => e.amount) })).filter((s) => s.value);
  return `${pageHead(`Expenses · ${monthLabel(mk)}`, 'Expenses', btn('Entry', 'expAdd', { cls: 'primary', ic: 'plus' }))}
  ${monthNav(mk)}
  <div class="grid-2 wide-right">
    <section class="card donut-card">
      ${donut(segs, { center: money(total), sub: 'this month' })}
      <ul class="legend">${segs.sort((a, b) => b.value - a.value).map((s) => `<li><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${money(s.value)}</b></li>`).join('') || '<li class="muted">No expenses yet</li>'}</ul>
    </section>
    <section class="card">
      ${list.length ? list.map((e) => `<div class="exp-row" style="--c:${EXPENSE_CATS[e.cat] || '#999'}">
        <div><strong>${esc(e.title)}</strong><small><span class="tag" style="--c:${EXPENSE_CATS[e.cat] || '#999'}">${esc(e.cat)}</span> ${fmtDate(keyToDate(e.date))}</small></div>
        <b>${money(e.amount)}</b>
        <button class="icon-btn sm ghosty" data-act="expDel" data-id="${e.id}" aria-label="Delete">${icon('trash')}</button></div>`).join('') : empty('No expenses this month.', btn('Add an entry', 'expAdd', { cls: 'ghost', ic: 'plus' }))}
    </section>
  </div>`;
};
function expenseForm() {
  return `${sheetHead('Expenses', 'New entry')}
  <form data-form="expense" class="form">
    <label class="field"><span>What for?</span><input name="title" required maxlength="60" placeholder="e.g. Gas cylinder"></label>
    <div class="row-2">
      <label class="field"><span>Amount</span><input name="amount" type="number" min="0" step="any" required></label>
      <label class="field"><span>Date</span><input name="date" type="date" value="${dayKey()}" max="${dayKey()}" required></label>
    </div>
    <div class="field"><span>Category</span><div class="chip-row">${Object.keys(EXPENSE_CATS).map((c, i) => `<label class="chip-radio"><input type="radio" name="cat" value="${c}" ${i === 1 ? 'checked' : ''}><span>${c}</span></label>`).join('')}</div></div>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Save entry</button></div>
  </form>`;
}

/* ---------------- 06 Vendors ---------------- */
Views.vendors = () => {
  const total = sum(S.vendors, (v) => v.due);
  return `${pageHead('Vendors', 'What you owe', btn('Vendor', 'vendorAdd', { cls: 'primary', ic: 'plus' }))}
  <div class="kpis two">${kpi('Total due', money(total), `${S.vendors.filter((v) => v.due > 0).length} vendors pending`, total ? 'neg' : 'pos')}
    ${kpi('Paid this month', money(sum(S.vendorTx.filter((t) => t.type === 'payment' && t.date.startsWith(monthKey())), (t) => t.amount)), 'All vendors')}</div>
  <section class="card">
    ${S.vendors.length ? S.vendors.map((v) => `<button class="list-btn" data-act="vendorOpen" data-id="${v.id}">
      <span class="with-av"><span class="avatar sm soft">${esc(initials(v.name))}</span><span><strong>${esc(v.name)}</strong><small>${esc(v.supplies || '—')}</small></span></span>
      ${v.due > 0 ? `<b class="neg">${money(v.due)}<small>due</small></b>` : `<span class="badge ok">${icon('check')} Paid</span>`}</button>`).join('')
    : empty('Add the people who supply you — milk, vegetables, bakery…', btn('Add vendor', 'vendorAdd', { cls: 'ghost', ic: 'plus' }))}
    ${S.vendors.length ? `<div class="line-row total"><span>Total due</span><b class="${total ? 'neg' : ''}">${money(total)}</b></div>` : ''}
  </section>`;
};
function vendorSheet(v) {
  const tx = S.vendorTx.filter((t) => t.vendorId === v.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return `${sheetHead(v.supplies || 'Vendor', v.name)}
  <div class="kpis two">${kpi('Due now', money(v.due), '', v.due ? 'neg' : 'pos')}${kpi('Bills this month', money(sum(tx.filter((t) => t.type === 'bill' && t.date.startsWith(monthKey())), (t) => t.amount)))}</div>
  <div class="row-2">
    <form data-form="vendorBill" class="card form tight"><input type="hidden" name="id" value="${v.id}">${eyebrow('Got a bill')}
      <input name="amount" type="number" min="0" step="any" placeholder="Amount" required aria-label="Bill amount"><input name="note" maxlength="40" placeholder="Note (optional)" aria-label="Note">
      <button class="btn ghost block" type="submit">${icon('plus')}<span>Add bill</span></button></form>
    <form data-form="vendorPay" class="card form tight"><input type="hidden" name="id" value="${v.id}">${eyebrow('Paid them')}
      <input name="amount" type="number" min="0" step="any" placeholder="Amount" value="${v.due || ''}" required aria-label="Payment amount">
      <select name="method" aria-label="Method">${Object.entries(payMethods()).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('')}</select>
      <button class="btn primary block" type="submit">${icon('check')}<span>Record payment</span></button></form>
  </div>
  ${eyebrow('History')}
  <div class="list compact">${tx.length ? tx.map((t) => `<div class="line-row"><span>${t.type === 'bill' ? 'Bill' : 'Paid'} · ${fmtDate(keyToDate(t.date))}${t.note ? ' · ' + esc(t.note) : ''}</span><b class="${t.type === 'bill' ? 'neg' : 'pos'}">${t.type === 'bill' ? '+' : '−'}${money(t.amount)}</b></div>`).join('') : '<p class="muted">No entries yet.</p>'}</div>
  <div class="form-actions">${btn('Remove vendor', 'vendorDel', { cls: 'danger-ghost', ic: 'trash', data: `data-id="${v.id}"` })}<span></span></div>`;
}
const vendorForm = () => `${sheetHead('Vendors', 'Add vendor')}
  <form data-form="vendor" class="form">
    <label class="field"><span>Name</span><input name="name" required maxlength="40" placeholder="e.g. Sharma Dairy"></label>
    <label class="field"><span>Supplies</span><input name="supplies" maxlength="60" placeholder="e.g. Milk, paneer"></label>
    <label class="field"><span>Phone <em>(optional)</em></span><input name="phone" type="tel" maxlength="20"></label>
    <label class="field"><span>Already owe them <em>(optional)</em></span><input name="due" type="number" min="0" step="any" placeholder="0"></label>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">Save vendor</button></div>
  </form>`;

/* ---------------- 08 Reports ---------------- */
Views.reports = () => {
  const mk = App.ui.month;
  const paid = paidInMonth(mk);
  const exps = expensesInMonth(mk);
  const sales = sum(paid, (o) => o.total), spend = sum(exps, (e) => e.amount), profit = sales - spend;
  const d = keyToDate(mk);
  const daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daily = Array.from({ length: daysIn }, (_, i) => sum(paid.filter((o) => new Date(o.paidAt).getDate() === i + 1), (o) => o.total));
  const top = topItems(paid).slice(0, 6);
  const maxQ = Math.max(1, ...top.map((t) => t.qty));
  const cats = Object.entries(EXPENSE_CATS).map(([c, color]) => ({ c, color, v: sum(exps.filter((e) => e.cat === c), (e) => e.amount) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const bm = byMethod(paid), pm = payMethods();
  const best = daily.indexOf(Math.max(...daily));

  return `${pageHead(`Report · ${monthLabel(mk)}`, 'Month at a glance', `<button class="btn ghost" data-act="exportCsv">${icon('download')}<span>CSV</span></button>`)}
  ${monthNav(mk)}
  <div class="kpis">
    ${kpi('Sales', money(sales), `${paid.length} bills`)}
    ${kpi('Expenses', money(spend), `${exps.length} ${exps.length === 1 ? 'entry' : 'entries'}`, 'neg')}
    ${kpi('Avg. bill', money(paid.length ? sales / paid.length : 0), daily.some(Boolean) ? `Best day: ${best + 1} ${fmtDate(d, { month: 'short' })}` : '')}
    <div class="kpi card profit"><p class="eyebrow">Real profit · ${esc(fmtDate(d, { month: 'long' }))}</p><p class="kpi-v">${money(profit)}</p><p class="kpi-s">${sales ? Math.round((profit / sales) * 100) + '% margin' : '—'}</p></div>
  </div>
  <section class="card">${eyebrow('Daily sales')}${barChart(daily, daily.map((_, i) => String(i + 1)), { hi: mk === monthKey() ? new Date().getDate() - 1 : -1 })}</section>
  <div class="grid-2">
    <section class="card">${eyebrow('Best sellers')}
      ${top.length ? top.map((t, i) => `<div class="meter-row"><span>${i === 0 ? '★ ' : ''}${esc(t.name)}</span>${meter((t.qty / maxQ) * 100, i === 0 ? 'var(--accent)' : 'var(--warm)')}<b>${t.qty} sold</b></div>`).join('') : empty('No sales this month.')}
    </section>
    <section class="card">${eyebrow('Where the money went')}
      ${cats.length ? cats.map((x) => `<div class="meter-row"><span>${esc(x.c)}</span>${meter((x.v / spend) * 100, x.color)}<b>${Math.round((x.v / spend) * 100)}%</b></div>`).join('') : empty('No expenses this month.')}
    </section>
  </div>
  <section class="card">${eyebrow('How customers paid')}
    ${Object.entries(pm).map(([k, m]) => `<div class="meter-row"><span>${esc(m.label)}</span>${meter(sales ? (bm[k] / sales) * 100 : 0, m.color)}<b>${money(bm[k])}</b></div>`).join('')}
  </section>`;
};

/* ---------------- Journal ---------------- */
const JOURNAL_TAGS = ['Busy', 'Slow', 'Festival', 'Event', 'Rain', 'Holiday', 'Short-staffed', 'New item'];
Views.journal = () => {
  const dk = App.ui.day;
  const e = S.journal[dk] || { note: '', tags: [] };
  const paid = paidOn(dk), exps = expensesOn(dk);
  const sales = sum(paid, (o) => o.total), spend = sum(exps, (x) => x.amount);
  const att = S.attendance[dk] || {};
  const present = Object.values(att).filter((s) => s === 'present' || s === 'late').length;
  const top = topItems(paid)[0];
  const recent = Object.entries(S.journal).filter(([k, v]) => k !== dk && (v.note || v.tags?.length || v.closing)).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  const c = e.closing;
  const pm = payMethods();
  return `${pageHead('Journal', 'Daybook', '')}
  <div class="stepper">
    <button class="icon-btn" data-act="dayNav" data-d="-1" aria-label="Previous day">${icon('left')}</button>
    <span>${dk === dayKey() ? 'Today · ' : ''}${fmtDate(keyToDate(dk), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
    <button class="icon-btn" data-act="dayNav" data-d="1" aria-label="Next day" ${dk >= dayKey() ? 'disabled' : ''}>${icon('right')}</button>
  </div>
  <div class="grid-2 wide-left">
    <section class="card journal-page">
      ${eyebrow('Notes for the day')}
      <textarea data-input="journalNote" rows="9" placeholder="How did the day go? Anything to remember — a supplier issue, a regular's birthday, an idea for the menu…">${esc(e.note)}</textarea>
      <div class="chip-row">${JOURNAL_TAGS.map((t) => `<button class="chip ${e.tags?.includes(t) ? 'on' : ''}" data-act="tagToggle" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <p class="fine" id="journal-saved">Saves automatically.</p>
    </section>
    <section class="card">
      ${eyebrow('Day at a glance')}
      <div class="line-row"><span>Sales</span><b>${money(sales)}</b></div>
      <div class="line-row"><span>Bills</span><b>${paid.length}</b></div>
      <div class="line-row"><span>Expenses</span><b class="neg">${money(spend)}</b></div>
      <div class="line-row total"><span>Profit</span><b class="${sales - spend >= 0 ? 'pos' : 'neg'}">${money(sales - spend)}</b></div>
      <div class="line-row"><span>Staff present</span><b>${present} / ${S.staff.length}</b></div>
      ${top ? `<div class="line-row"><span>Top item</span><b>${esc(top.name)} · ${top.qty}</b></div>` : ''}
      ${c ? `<div class="closing">${eyebrow(`Day closed · ${fmtTime(c.at)}`)}${Object.keys(pm).map((k) => `<div class="line-row"><span>${esc(pm[k].label)}</span><b>${money(c[k] || 0)}</b></div>`).join('')}</div>` : ''}
    </section>
  </div>
  ${recent.length ? `<h3 class="section-t">Earlier entries</h3><div class="entries">${recent.map(([k, v]) => `<button class="card entry" data-act="dayGo" data-day="${k}">
      ${eyebrow(fmtDate(keyToDate(k), { weekday: 'short', day: 'numeric', month: 'short' }))}
      <p>${esc((v.note || (v.closing ? 'Day closed · ' + money(v.closing.sales) : '')).slice(0, 140))}</p>
      ${v.tags?.length ? `<div class="chip-row">${v.tags.map((t) => `<span class="chip sm">${esc(t)}</span>`).join('')}</div>` : ''}</button>`).join('')}</div>` : ''}`;
};

/* ---------------- Settings ---------------- */
Views.settings = () => {
  const tabs = { business: 'Business', menu: 'Menu', data: 'Data' };
  if (!tabs[App.ui.settingsTab]) App.ui.settingsTab = 'business';
  const tab = App.ui.settingsTab;
  const st = S.settings;
  let body = '';
  if (tab === 'business') {
    body = `<form class="card form" data-form="business">
      <div class="row-3"><label class="field"><span>Name</span><input name="name" required maxlength="40" value="${esc(st.name)}"></label>
      <label class="field"><span>Short code <em>(employee IDs)</em></span><input name="short" maxlength="4" value="${esc(st.short || shortCode(st.name))}" style="text-transform:uppercase"></label>
      <label class="field"><span>Tagline</span><input name="tagline" maxlength="60" value="${esc(st.tagline || '')}"></label></div>
      <div class="row-3">
        <label class="field"><span>Type</span><select name="type">${Object.entries(BUSINESS_TYPES).map(([k, v]) => `<option value="${k}" ${k === st.type ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label class="field"><span>Currency</span><select name="currency">${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === st.currency ? 'selected' : ''}>${c.code} · ${esc(c.symbol.trim())}</option>`).join('')}</select></label>
        <label class="field"><span>Tables</span><input name="tables" type="number" min="0" max="99" value="${esc(st.tables)}"></label>
      </div>
      <div class="row-3">
        <label class="field"><span>Tax %</span><input name="tax" type="number" min="0" max="40" step="0.5" value="${esc(st.tax)}"></label>
        <label class="field"><span>Opens at (hour)</span><input name="openHour" type="number" min="0" max="23" value="${esc(st.openHour ?? 8)}"></label>
        <label class="field"><span>Closes at (hour)</span><input name="closeHour" type="number" min="0" max="23" value="${esc(st.closeHour ?? 22)}"></label>
      </div>
      <label class="field"><span>Receipt footer</span><input name="footer" maxlength="80" value="${esc(st.footer || 'Thank you, visit again!')}"></label>
      <div class="field"><span>Accent colour — match your brand</span><div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<label><input type="radio" name="accent" value="${k}" ${k === (st.accent || 'green') ? 'checked' : ''}><i style="background:${c}" title="${k}"></i></label>`).join('')}</div></div>
      <div class="field"><span>Appearance</span><div class="seg">${['auto', 'light', 'dark'].map((t) => `<label><input type="radio" name="theme" value="${t}" ${t === (st.theme || 'auto') ? 'checked' : ''}><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`).join('')}</div></div>
      <div class="form-actions"><span></span><button class="btn primary" type="submit">Save changes</button></div>
    </form>`;
  } else if (tab === 'menu') {
    const cats = [...new Set(S.menu.map((m) => m.cat))];
    body = `<div class="card-head">${eyebrow(`${S.menu.length} items · ${cats.length} categories`)}${btn('Menu item', 'menuAdd', { cls: 'primary', ic: 'plus' })}</div>
      ${cats.map((c) => `<section class="card">${eyebrow(c)}${S.menu.filter((m) => m.cat === c).map((m) => `<div class="menu-row ${m.available === false ? 'off' : ''}">
        <span>${esc(m.name)}</span><b>${money(m.price)}</b>
        <label class="switch" title="Available"><input type="checkbox" data-act="menuToggle" data-id="${m.id}" ${m.available !== false ? 'checked' : ''}><i></i></label>
        <button class="icon-btn sm" data-act="menuEdit" data-id="${m.id}" aria-label="Edit">${icon('edit')}</button></div>`).join('')}</section>`).join('') || empty('No menu yet.', btn('Add first item', 'menuAdd', { cls: 'ghost', ic: 'plus' }))}`;
  } else {
    const size = (JSON.stringify(S).length / 1024).toFixed(0);
    if (typeof Cloud !== 'undefined' && Cloud.on) {
      body = `<section class="card">${eyebrow('Online database')}<p>${icon('check')} Connected. All data is stored securely online and synced live to every device. Nothing is kept on this device.</p>
        <div class="line-row"><span>Café code (for staff logins)</span><b class="emp-id lg">${esc(Cloud.cid.toUpperCase())}</b></div></section>
      <section class="card">${eyebrow('Backup')}<p class="muted">Download an encrypted copy of everything, to keep for your records.</p><div class="btn-row">${btn('Download backup', 'exportData', { cls: 'primary', ic: 'download' })}</div></section>
      <section class="card">${eyebrow('Sample data')}<p class="muted">Replace all café data (online, for everyone) with ~5 weeks of sample data. Logins are kept.</p>${btn('Load sample data', 'loadDemo', { cls: 'ghost' })}</section>`;
    } else
    body = `<section class="card">${eyebrow('Backup')}<p class="muted">All data lives in this browser (${size} KB). Download an <b>encrypted backup</b> regularly — it is locked with a passphrase you choose — and restore it on any other phone or computer.</p>
      <div class="btn-row">${btn('Download backup', 'exportData', { cls: 'primary', ic: 'download' })}${btn('Restore backup', 'importData', { cls: 'ghost', ic: 'upload' })}</div>
      <input type="file" id="import-file" accept="application/json,.json" hidden></section>
    <section class="card">${eyebrow('Sample data')}<p class="muted">Replace everything with ~5 weeks of realistic sample data to explore the app.</p>${btn('Load sample data', 'loadDemo', { cls: 'ghost' })}</section>
    <section class="card danger-zone">${eyebrow('Start over')}<p class="muted">Erase all data on this device and run setup again.</p>${btn('Erase everything', 'resetAll', { cls: 'danger-ghost', ic: 'trash' })}</section>`;
  }
  return `${pageHead('Settings', st.name, '')}
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tab ${k === tab ? 'on' : ''}" data-act="settingsTab" data-tab="${k}">${v}</button>`).join('')}</div>
    <div class="stack">${body}</div>`;
};
function menuForm(m = {}) {
  const cats = [...new Set(S.menu.map((x) => x.cat))];
  return `${sheetHead('Menu', m.id ? 'Edit item' : 'Add item')}
  <form data-form="menuItem" class="form">
    <input type="hidden" name="id" value="${esc(m.id || '')}">
    <label class="field"><span>Item name</span><input name="name" required maxlength="40" value="${esc(m.name || '')}"></label>
    <div class="row-2">
      <label class="field"><span>Price</span><input name="price" type="number" min="0" step="any" required value="${esc(m.price ?? '')}"></label>
      <label class="field"><span>Category</span><input name="cat" required maxlength="24" list="cat-list" value="${esc(m.cat || cats[0] || '')}"><datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    </div>
    <div class="form-actions">${m.id ? btn('Delete', 'menuDel', { cls: 'danger-ghost', ic: 'trash', data: `data-id="${m.id}"` }) : '<span></span>'}<button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

/* ---------------- Receipt (print) ---------------- */
function receiptHtml(o) {
  const st = S.settings, pm = payMethods();
  return `<div class="receipt">
    <h2>${esc(st.name)}</h2>${st.tagline ? `<p>${esc(st.tagline)}</p>` : ''}
    <p>${esc(orderLabel(o))} · Bill #${o.no}<br>${new Date(o.paidAt).toLocaleString()}</p><hr>
    ${o.items.map((l) => `<div class="r"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.qty * l.price)}</span></div>`).join('')}<hr>
    <div class="r"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
    ${o.discount ? `<div class="r"><span>Discount</span><span>−${money(o.discount)}</span></div>` : ''}
    ${o.tax ? `<div class="r"><span>Tax</span><span>${money(o.tax)}</span></div>` : ''}
    <div class="r b"><span>Total</span><span>${money(o.total)}</span></div>
    <p>Paid by ${esc(pm[o.method]?.label || o.method)}</p><hr><p>${esc(st.footer || 'Thank you, visit again!')}</p></div>`;
}
