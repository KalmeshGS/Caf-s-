'use strict';
/* =========================================================
   Tables: automatic status (Free / Running, from orders — unchanged)
   + manual status set by staff (Needs cleaning / Reserved / Out of service)
   + table reservations
   ========================================================= */

const TABLE_STATES = {
  cleaning: { label: 'Needs cleaning', cls: 'st-cleaning', ic: 'alert' },
  reserved: { label: 'Reserved', cls: 'st-reserved', ic: 'clock' },
  blocked: { label: 'Out of service', cls: 'st-blocked', ic: 'x' },
};
const RES_STATUS = { booked: 'Booked', arrived: 'Arrived', cancelled: 'Cancelled', noshow: 'No-show' };
const tableTitle = (t) => (/^T\d+$/.test(t) ? `Table ${t.slice(1)}` : t);
const hm = (time) => { const [h, m] = String(time || '0:0').split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const resWhen = (r) => keyToDate(r.date).getTime() + (Number(r.time.split(':')[0]) * 60 + Number(r.time.split(':')[1])) * 60000;
const dayLabel = (k) => (k === dayKey() ? 'Today' : k === shiftDay(dayKey(), 1) ? 'Tomorrow' : fmtDate(keyToDate(k), { weekday: 'short', day: 'numeric', month: 'short' }));

/** The next booked reservation for a table today (from 1 hour ago onwards) */
function nextReservation(t) {
  const now = Date.now();
  return (S.reservations || []).filter((r) => r.status === 'booked' && r.table === t && r.date === dayKey() && resWhen(r) >= now - 3600e3)
    .sort((a, b) => a.time.localeCompare(b.time))[0] || null;
}
const ordersTabs = (tab) => {
  const n = (S.reservations || []).filter((r) => r.status === 'booked' && r.date === dayKey()).length;
  if (!feat('reservations')) return ''; // bookings switched off in Business setup (data kept)
  return `<div class="tabs"><a class="tab ${tab === 'tables' ? 'on' : ''}" href="#/orders">${feat('tables') ? 'Tables' : 'Orders'}</a><a class="tab ${tab === 'res' ? 'on' : ''}" href="#/orders?tab=res">Reservations${n ? ` <i class="nbadge inline">${n}</i>` : ''}</a></div>`;
};
const rulesNotice = () => (typeof Cloud !== 'undefined' && Cloud.on && Cloud.rulesOutdated
  ? `<div class="banner warn">${icon('alert')}<span>Table status and reservations are being switched on for your café. Please refresh in a minute.</span></div>` : '');

/* ---------------- Housekeeping: only the tables that need cleaning ---------------- */
const isHousekeeping = () => Session.role() === 'housekeeping';
const canMarkClean = () => ['owner', 'manager', 'waiter', 'captain', 'housekeeping'].includes(Session.role());
function cleaningView() {
  const dirty = Object.entries(S.tableState || {}).filter(([, s]) => s && s.status === 'cleaning').sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  const others = tableNames().filter((t) => !dirty.some(([d]) => d === t));
  return `${pageHead('Housekeeping', 'Tables to clean')}
    ${'Notification' in window && Notification.permission === 'default' ? `<div class="banner info">${icon('bell')}<span>Turn on alerts so your phone rings when a table needs cleaning.</span>${btn('Turn on alerts', 'enableAlerts', { cls: 'primary sm' })}</div>` : ''}
    ${dirty.length ? `<section class="card">${eyebrow(`${pl(dirty.length, 'table')} waiting`)}
      ${dirty.map(([t, s]) => `<div class="line-row clean-row"><span><b>${esc(tableTitle(t))}</b><small class="muted"> · ${esc(ago(s.at || Date.now()))}${s.note ? ` · ${esc(s.note)}` : ''}</small></span>${btn('Cleaned', 'markClean', { cls: 'primary', ic: 'check', data: `data-t="${t}"` })}</div>`).join('')}</section>`
      : `<section class="card center">${icon('check')}<h3>All tables are clean</h3><p class="muted">You'll get an alert when a table needs cleaning.</p></section>`}
    ${others.length ? `<section class="card">${eyebrow('Report a table that needs cleaning')}<div class="chip-row">${others.map((t) => `<button class="chip" data-act="markDirty" data-t="${t}">${esc(t)}</button>`).join('')}</div></section>` : ''}`;
}

/* ---------------- Tables screen ---------------- */
function tablesView() {
  if (isHousekeeping()) return cleaningView();
  const open = openOrders();
  const tile = (t, area) => {
    const o = open.find((x) => x.table === t);
    const ms = (S.tableState || {})[t];
    const res = nextReservation(t);
    const pending = o && o.items.some((l) => l.qty > l.sent);
    const st = !o && ms ? TABLE_STATES[ms.status] : null;
    const body = o
      ? `<span>${money(orderSubtotal(o))}</span><small>${pl(sum(o.items, (l) => l.qty), 'item')} · ${elapsedMin(o.createdAt)}</small>`
      : st ? `<em class="st-label">${icon(st.ic)} ${esc(st.label)}</em>${ms.note ? `<small>${esc(ms.note)}</small>` : ''}`
        : '<small>Free</small>';
    return `<div class="table-tile ${o ? 'busy' : st ? st.cls : ''}">
      <button class="tt-main" data-act="openTable" data-t="${t}" aria-label="${esc(tableTitle(t))}">
        <strong>${esc(t)}</strong>${body}
        ${res ? `<small class="res-line">${icon('clock')} ${esc(hm(res.time))} · ${esc(res.name)} (${res.guests})</small>` : ''}
      </button>
      <button class="tt-more" data-act="tableMenu" data-t="${t}" aria-label="Status of ${esc(tableTitle(t))}" title="Table status">${icon('more')}</button>
      ${pending ? '<i class="dot" title="Not sent to kitchen"></i>' : ''}
      ${!o && ms?.status === 'cleaning' && canMarkClean() ? `<button class="tt-clean" data-act="markClean" data-t="${t}">${icon('check')} Cleaned</button>` : ''}
    </div>`;
  };
  const areas = tableAreas();
  const tiles = areas.map((a) => `${areas.length > 1 || a.name ? `<h3 class="area-h">${esc(areaTitle(a))}<small>${pl(a.tables.length, 'table')}${a.seats ? ` · ${a.seats} seats each` : ''} · ${a.tables.filter((t) => open.some((x) => x.table === t)).length} running</small></h3>` : ''}<div class="table-grid">${a.tables.map((t) => tile(t, a)).join('')}</div>`).join('');
  const takeaways = open.filter((o) => o.table === 'Takeaway' && (o.items.length || Date.now() - o.createdAt < 10 * 60000));
  const withTables = feat('tables');
  const newLabel = withTables ? 'New takeaway' : feat('takeaway') ? 'New order' : 'New order';
  return `${pageHead('Orders', withTables ? 'Tables' : 'Counter', btn(newLabel, 'newTakeaway', { cls: 'primary', ic: 'plus' }))}
    ${ordersTabs('tables')}
    ${rulesNotice()}
    ${readyCard()}
    ${!withTables ? `<div class="banner info">${icon('receipt')}<span>Tap <b>${newLabel}</b> for each customer. Open orders show below until they are paid.</span></div>` : tableNames().length ? `<div class="area-list">${tiles}</div>
      <p class="fine">Tables show <b>Free</b> / <b>Running</b> automatically from orders. Tap ⋯ on a table to mark it as needing cleaning, reserved or out of service.</p>`
      : empty('No tables set. Add tables in Settings, or use takeaway orders.')}
    ${takeaways.length ? `<h3 class="section-t">${withTables ? 'Takeaway' : 'Open orders'}</h3><div class="table-grid">${takeaways.map((o) => `
      <div class="table-tile busy"><button class="tt-main" data-act="openOrder" data-id="${o.id}"><strong>#${o.no}</strong><span>${money(orderSubtotal(o))}</span><small>${pl(sum(o.items, (l) => l.qty), 'item')} · ${elapsedMin(o.createdAt)}</small></button></div>`).join('')}</div>` : ''}`;
}

function tableSheet(t) {
  const o = openOrders().find((x) => x.table === t);
  const ms = (S.tableState || {})[t];
  const today = (S.reservations || []).filter((r) => r.table === t && r.date === dayKey() && r.status === 'booked').sort((a, b) => a.time.localeCompare(b.time));
  const choice = (k, label, ic, on) => `<button class="state-btn ${on ? 'on' : ''}" data-act="setTableStatus" data-t="${t}" data-s="${k}">${icon(ic)}<span>${esc(label)}</span></button>`;
  return `${sheetHead('Table status', tableTitle(t))}
    <p class="muted sm">${o ? `${icon('clock')} Running now — order #${o.no}, ${money(orderSubtotal(o))}. Free / Running is set automatically from orders.` : 'Free / Running is set automatically from orders. Set a status by hand when you need to:'}</p>
    ${o && ['owner', 'manager', 'cashier', 'waiter', 'captain'].includes(Session.role()) ? `<div class="btn-row">${btn('Move to another table', 'moveOpen', { cls: 'primary', ic: 'right', data: `data-t="${esc(t)}"` })}</div>` : ''}
    <div class="state-grid">
      ${choice('auto', 'Available (automatic)', 'check', !ms)}
      ${Object.entries(TABLE_STATES).map(([k, s]) => choice(k, s.label, s.ic, ms && ms.status === k)).join('')}
    </div>
    <label class="field"><span>Note <em>(optional)</em></span><input id="table-note" maxlength="60" value="${esc(ms?.note || '')}" placeholder="e.g. Spilled drink, chair broken, birthday party"></label>
    ${ms ? `<p class="fine">Set by ${esc(ms.by || '—')} at ${esc(fmtTime(ms.at))}</p>` : ''}
    ${eyebrow(`Reservations today · ${tableTitle(t)}`)}
    ${today.length ? today.map((r) => `<div class="line-row"><span>${esc(hm(r.time))} · ${esc(r.name)} (${r.guests})</span>${btn('Arrived', 'resArrived', { cls: 'ghost sm', data: `data-id="${r.id}"` })}</div>`).join('') : '<p class="muted sm">None.</p>'}
    <div class="btn-row">${btn('New reservation for this table', 'resAdd', { cls: 'ghost', ic: 'plus', data: `data-t="${t}"` })}</div>`;
}

/* ---------------- Reservations screen ---------------- */
function reservationsView() {
  const all = (S.reservations || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const showAll = App.ui.resAll;
  const list = all.filter((r) => r.date >= dayKey() && (showAll || r.status === 'booked' || r.date === dayKey()));
  const days = [...new Set(list.map((r) => r.date))];
  const row = (r) => `<div class="res-row ${r.status !== 'booked' ? 'done' : ''}">
      <div class="res-time"><b>${esc(hm(r.time))}</b><small>${pl(Number(r.guests) || 0, 'guest')}</small></div>
      <div class="res-info"><strong>${esc(r.name)}</strong>
        <small>${r.table ? esc(tableTitle(r.table)) : 'Any table'}${r.phone ? ` · <a href="tel:${esc(digits(r.phone))}">${esc(r.phone)}</a>` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</small></div>
      ${r.status === 'booked'
        ? `<div class="btn-row tight">${btn('Arrived', 'resArrived', { cls: 'primary sm', ic: 'check', data: `data-id="${r.id}"` })}
            <button class="icon-btn sm" data-act="resEdit" data-id="${r.id}" aria-label="Edit reservation">${icon('edit')}</button></div>`
        : `<span class="status ${r.status === 'arrived' ? 'ok' : 'off'}">${esc(RES_STATUS[r.status])}</span>`}
    </div>`;
  return `${pageHead('Orders', 'Reservations', btn('New reservation', 'resAdd', { cls: 'primary', ic: 'plus' }))}
    ${ordersTabs('res')}
    ${rulesNotice()}
    ${days.length ? days.map((k) => `<section class="card">${eyebrow(`${dayLabel(k)} · ${pl(list.filter((r) => r.date === k && r.status === 'booked').length, 'booking')}`)}${list.filter((r) => r.date === k).map(row).join('')}</section>`).join('')
      : empty('No upcoming reservations.', btn('Add a reservation', 'resAdd', { cls: 'ghost', ic: 'plus' }))}
    <div class="btn-row"><button class="chip ${showAll ? 'on' : ''}" data-act="resToggleAll">${showAll ? 'Showing cancelled & finished' : 'Show cancelled & finished'}</button></div>`;
}

function resForm(r = {}, presetTable = '') {
  const isNew = !r.id;
  const table = r.table ?? presetTable;
  const nextHalf = (() => { const d = new Date(Date.now() + 60 * 60000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; })();
  return `${sheetHead('Reservations', isNew ? 'New reservation' : 'Edit reservation')}
  <form data-form="reservation" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${esc(r.id || '')}">
    <div class="row-2">
      <label class="field"><span>Guest name</span><input name="name" required maxlength="50" value="${esc(r.name || '')}"></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="20" value="${esc(r.phone || '')}"></label>
    </div>
    <div class="row-3">
      <label class="field"><span>Date</span><input name="date" type="date" required min="${dayKey()}" value="${esc(r.date || dayKey())}"></label>
      <label class="field"><span>Time</span><input name="time" type="time" required value="${esc(r.time || nextHalf)}"></label>
      <label class="field"><span>Guests</span><input name="guests" type="number" min="1" max="200" required value="${esc(r.guests || 2)}"></label>
    </div>
    <label class="field"><span>Table</span><select name="table"><option value="">Any table (decide on arrival)</option>${tableNames().map((t) => `<option value="${t}" ${t === table ? 'selected' : ''}>${esc(tableTitle(t))}</option>`).join('')}</select></label>
    <label class="field"><span>Note <em>(optional)</em></span><input name="note" maxlength="80" value="${esc(r.note || '')}" placeholder="e.g. Birthday, window seat, high chair"></label>
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions">
      ${isNew ? '<span></span>' : `<div class="btn-row tight">${btn('Cancel booking', 'resSetStatus', { cls: 'danger-ghost sm', data: `data-id="${r.id}" data-s="cancelled"` })}${btn('No-show', 'resSetStatus', { cls: 'ghost sm', data: `data-id="${r.id}" data-s="noshow"` })}</div>`}
      <button class="btn primary" type="submit">${isNew ? 'Save reservation' : 'Save'}</button>
    </div>
  </form>`;
}

/* ---------------- actions ---------------- */
Views.orders = (p) => (isHousekeeping() ? cleaningView() : p.t || p.o ? orderEditor(p) : p.tab === 'res' && feat('reservations') ? reservationsView() : tablesView());

const origOpenTable = Actions.openTable;
const origAddItem = Actions.addItem;
Object.assign(Actions, {
  openTable(el) {
    const t = el.dataset.t, ms = (S.tableState || {})[t];
    const running = openOrders().some((o) => o.table === t);
    if (!running && ms && ms.status === 'blocked' && !confirm(`${tableTitle(t)} is marked "Out of service"${ms.note ? ` (${ms.note})` : ''}. Open an order anyway?`)) return;
    origOpenTable(el);
  },
  addItem(el) {
    // Seating guests at a table clears "Needs cleaning" / "Reserved" (the automatic Running status takes over)
    const t = App.params.t;
    if (t && !openOrders().some((o) => o.table === t)) {
      const ms = (S.tableState || {})[t];
      if (ms && ms.status !== 'blocked') delete S.tableState[t];
    }
    origAddItem(el);
  },
  tableMenu(el) { openSheet(tableSheet(el.dataset.t)); },
  markClean(el) {
    const t = el.dataset.t; if (!canMarkClean()) return toast('You can’t change table status.');
    if (S.tableState?.[t]?.status === 'cleaning') delete S.tableState[t];
    closeSheet(); save(); App.cleanSeen?.delete(t);
    toast(`${tableTitle(t)} is clean ✓`);
  },
  markDirty(el) {
    const t = el.dataset.t, me = Session.user(); if (!canMarkClean()) return;
    S.tableState = S.tableState || {};
    S.tableState[t] = { status: 'cleaning', note: '', by: me?.name || '', at: Date.now() };
    save(); toast(`${tableTitle(t)}: needs cleaning`);
  },
  setTableStatus(el) {
    const t = el.dataset.t, s = el.dataset.s, me = Session.user();
    S.tableState = S.tableState || {};
    if (s === 'auto') delete S.tableState[t];
    else S.tableState[t] = { status: s, note: ($('#table-note')?.value || '').trim(), by: me?.name || '', at: Date.now() };
    closeSheet(); save();
    toast(s === 'auto' ? `${tableTitle(t)}: automatic status` : `${tableTitle(t)}: ${TABLE_STATES[s].label}`);
  },
  resAdd(el) { openSheet(resForm({}, el.dataset.t || '')); },
  resEdit(el) { const r = byId(S.reservations, el.dataset.id); r && openSheet(resForm(r)); },
  resToggleAll() { App.ui.resAll = !App.ui.resAll; render(); },
  resSetStatus(el) {
    const r = byId(S.reservations, el.dataset.id); if (!r) return;
    if (el.dataset.s === 'cancelled' && !confirm(`Cancel the booking for ${r.name}?`)) return;
    r.status = el.dataset.s; r.updatedAt = Date.now();
    if (r.table && S.tableState?.[r.table]?.status === 'reserved') delete S.tableState[r.table];
    closeSheet(); save(); toast(`${r.name}: ${RES_STATUS[r.status]}`);
  },
  resArrived(el) {
    const r = byId(S.reservations, el.dataset.id); if (!r) return;
    r.status = 'arrived'; r.updatedAt = Date.now();
    if (r.table && S.tableState?.[r.table]?.status === 'reserved') delete S.tableState[r.table];
    closeSheet(); save(); toast(`${r.name} has arrived`);
    if (r.table) go('orders', { t: r.table });
  },
});

Object.assign(Forms, {
  reservation(fd) {
    const g = (k) => String(fd.get(k) || '').trim();
    const d = { name: g('name'), phone: g('phone'), date: g('date'), time: g('time'), guests: Math.max(1, num(fd.get('guests'))), table: g('table'), note: g('note') };
    if (!d.name) return formError('Please enter the guest name.');
    if (!d.date || !d.time) return formError('Please choose a date and time.');
    if (d.phone && !validPhone(d.phone)) return formError('Please check the phone number.');
    const id = fd.get('id');
    if (!id && resWhen(d) < Date.now() - 15 * 60000) return formError('That time has already passed.');
    if (d.table) {
      const when = resWhen(d);
      const clash = (S.reservations || []).find((r) => r.id !== id && r.status === 'booked' && r.table === d.table && Math.abs(resWhen(r) - when) < 90 * 60000);
      if (clash && !confirm(`${tableTitle(d.table)} is already booked at ${hm(clash.time)} for ${clash.name}. Book it anyway?`)) return;
    }
    const r = byId(S.reservations || [], id);
    if (r) Object.assign(r, d, { updatedAt: Date.now() });
    else (S.reservations = S.reservations || []).push({ id: uid('rv'), ...d, status: 'booked', createdAt: Date.now(), by: Session.user()?.name || '' });
    closeSheet(); save();
    toast(r ? 'Reservation updated' : `Booked: ${d.name}, ${dayLabel(d.date)} ${hm(d.time)}`);
  },
});
