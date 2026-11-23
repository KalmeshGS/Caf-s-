'use strict';
/* =========================================================
   Notifications inbox (🔔)
   - Alerts are worked out from live café data, so they are always current:
       waiter: food ready for MY orders · upcoming reservations
       kitchen: new / changed tickets
       owner & manager: low stock · upcoming reservations · (owner) login help
       cashier: food ready to serve · upcoming reservations
   - Notices: owner/manager post a message to everyone or one role.
   - "Read" is remembered per person on this device.
   ========================================================= */

VIEWS.inbox = { label: 'Notifications', icon: 'bell' };
ICONS.bell = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>';
ICONS.megaphone = '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';

const readKey = () => `cj.read.${Session.user()?.id || 'x'}`;
function readSet() { try { return new Set(JSON.parse(localStorage.getItem(readKey()) || '[]')); } catch (e) { return new Set(); } }
function saveRead(set) { try { localStorage.setItem(readKey(), JSON.stringify([...set].slice(-400))); } catch (e) { /* ignore */ } }
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : fmtDate(t, { day: 'numeric', month: 'short' }); };
const tableTxt = (k) => (k.token ? `Token ${k.token}${k.custName ? ' · ' + k.custName : ''}` : k.table === 'Takeaway' ? `Takeaway #${k.no}` : k.table);

/** Every notification for the signed-in person, newest first */
function notifications() {
  const me = Session.user(); if (!me) return [];
  const role = me.role, out = [], day = 864e5, now = Date.now();
  const itemsTxt = (k) => k.items.map((i) => `${i.qty}× ${i.name}${i.note ? ` (${i.note})` : ''}`).join(', ');

  // Notices from the owner / manager
  (S.notices || []).filter((n) => n.to === 'all' || n.to === role || n.byId === me.id).forEach((n) => out.push({
    id: `notice:${n.id}`, type: 'notice', ic: 'megaphone', at: n.at, title: `Notice from ${n.by || 'the owner'}${n.to !== 'all' ? ` · for ${ROLES[n.to]?.label || n.to}s` : ''}`, body: n.text, noticeId: n.id, mine: n.byId === me.id,
  }));

  // Food ready to serve
  S.kots.filter((k) => (k.status === 'ready' || (k.status === 'served' && now - k.updatedAt < day))
    && (role === 'waiter' ? k.byId === me.id : ['owner', 'manager', 'cashier', 'captain'].includes(role))).forEach((k) => out.push({
    id: `ready:${k.id}`, type: 'ready', ic: 'check', at: k.updatedAt, link: '#/orders',
    title: k.status === 'ready' ? `Food ready to serve · ${tableTxt(k)}` : `Served · ${tableTxt(k)}`, body: itemsTxt(k), done: k.status === 'served',
  }));

  // Kitchen: new & changed tickets
  if (role === 'kitchen' || role === 'owner' || role === 'captain') {
    S.kots.filter((k) => k.status === 'new').forEach((k) => out.push({
      id: `kot:${k.id}:${k.changedAt || k.createdAt}`, type: 'kitchen', ic: 'flame', at: k.changedAt || k.createdAt, link: '#/kitchen',
      title: `${k.changedAt ? 'Order changed' : 'New order'} · ${tableTxt(k)}`, body: itemsTxt(k),
    }));
  }

  // Reservations in the next 90 minutes
  if (role !== 'kitchen' && role !== 'housekeeping') {
    (S.reservations || []).filter((r) => r.status === 'booked' && r.date === dayKey() && resWhen(r) - now < 90 * 60000 && resWhen(r) - now > -30 * 60000).forEach((r) => out.push({
      id: `res:${r.id}`, type: 'res', ic: 'clock', at: Math.min(now, resWhen(r) - 90 * 60000), link: '#/orders?tab=res',
      title: `Reservation at ${hm(r.time)} · ${r.name}`, body: `${pl(Number(r.guests) || 0, 'guest')} · ${r.table ? tableTitle(r.table) : 'any table'}${r.note ? ` · ${r.note}` : ''}`,
    }));
  }

  // Low stock
  if (LOW_STOCK_ROLES.includes(role)) {
    S.stock.filter(isLow).forEach((s) => out.push({
      id: `low:${s.id}:${s.qty}`, type: 'stock', ic: 'alert', at: now - 60000, link: '#/stock',
      title: `Running low · ${s.name}`, body: `${+Number(s.qty).toFixed(2)} ${s.unit} left (alert below ${s.low} ${s.unit})`,
    }));
  }

  // Tables waiting to be cleaned
  if (CLEANING_ROLES.includes(role)) {
    Object.entries(S.tableState || {}).filter(([, s]) => s && s.status === 'cleaning').forEach(([t, s]) => out.push({
      id: `clean:${t}:${s.at}`, type: 'clean', ic: 'alert', at: s.at || now, link: '#/orders',
      title: `Clean ${tableTitle(t)}`, body: `${s.note || 'Needs cleaning'}${s.by ? ` · ${s.by}` : ''}`,
    }));
  }

  // Login help requests (owner)
  if (role === 'owner') {
    openRequests().forEach((r) => { const u = userById(r.userId); out.push({
      id: `req:${r.id}`, type: 'req', ic: 'lock', at: r.createdAt, link: '#/team',
      title: `${u?.locked ? 'Account locked' : 'Password reset request'} · ${u?.name || ''}`, body: 'Open Team & access to help them log in.',
    }); });
  }
  const read = readSet();
  return out.map((n) => ({ ...n, unread: !read.has(n.id) && !n.done })).sort((a, b) => b.at - a.at);
}
const unreadCount = () => notifications().filter((n) => n.unread).length;

/* ---------------- screen ---------------- */
Views.inbox = () => {
  const list = notifications();
  const canPost = ['owner', 'manager'].includes(Session.role());
  const today = list.filter((n) => Date.now() - n.at < 864e5), older = list.filter((n) => Date.now() - n.at >= 864e5);
  const card = (n) => `<div class="note-card ${n.unread ? 'unread' : ''} ${n.type}" ${n.link ? `data-act="noteOpen" data-id="${esc(n.id)}" data-link="${esc(n.link)}" role="button" tabindex="0"` : ''}>
      <span class="note-ic">${icon(n.ic)}</span>
      <div class="note-body"><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${esc(ago(n.at))}</small></div>
      ${n.type === 'notice' && (n.mine || Session.role() === 'owner') ? `<button class="icon-btn sm ghosty" data-act="noticeDel" data-id="${esc(n.noticeId)}" aria-label="Delete notice">${icon('trash')}</button>` : n.unread ? '<i class="unread-dot" aria-label="Unread"></i>' : ''}
    </div>`;
  return `${pageHead('Inbox', 'Notifications', `<div class="btn-row tight">${list.some((n) => n.unread) ? btn('Mark all read', 'notesReadAll', { cls: 'ghost sm', ic: 'check' }) : ''}${canPost ? btn('Post a notice', 'noticeAdd', { cls: 'primary sm', ic: 'megaphone' }) : ''}</div>`)}
    ${'Notification' in window && Notification.permission === 'default' ? `<div class="banner info">${icon('bell')}<span>Get phone alerts too, even when you're on another screen.</span>${btn('Turn on alerts', 'enableAlerts', { cls: 'primary sm' })}</div>` : ''}
    ${list.length ? `${today.length ? `<section class="card note-list">${eyebrow('Today')}${today.map(card).join('')}</section>` : ''}
      ${older.length ? `<section class="card note-list">${eyebrow('Earlier')}${older.map(card).join('')}</section>` : ''}`
      : empty("You're all caught up — no notifications.")}`;
};
function noticeForm() {
  return `${sheetHead('Notifications', 'Post a notice')}
  <form data-form="notice" class="form">
    <label class="field"><span>Message</span><textarea name="text" rows="4" maxlength="500" required placeholder="e.g. Staff meeting at 4 PM today. Paneer is out of stock — don't take orders for it."></textarea></label>
    <label class="field"><span>Who should read it</span><select name="to"><option value="all">Everyone</option>${['manager', 'cashier', 'captain', 'waiter', 'kitchen', 'housekeeping'].map((r) => `<option value="${r}">${ROLES[r].label}s only</option>`).join('')}</select></label>
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions"><span></span><button class="btn primary" type="submit">${icon('send')}<span>Post notice</span></button></div>
  </form>`;
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  noteOpen(el) { const r = readSet(); r.add(el.dataset.id); saveRead(r); location.hash = el.dataset.link; },
  notesReadAll() { const r = readSet(); notifications().forEach((n) => r.add(n.id)); saveRead(r); render(); toast('All marked as read'); },
  noticeAdd() { openSheet(noticeForm()); },
  noticeDel(el) {
    if (!confirm('Delete this notice for everyone?')) return;
    S.notices = (S.notices || []).filter((n) => n.id !== el.dataset.id); save();
  },
});
Object.assign(Forms, {
  notice(fd) {
    const me = Session.user(); if (!me || !['owner', 'manager'].includes(me.role)) return;
    const text = String(fd.get('text') || '').trim(); if (!text) return formError('Please write a message.');
    const n = { id: uid('nt'), text, to: fd.get('to') || 'all', by: me.name, byId: me.id, at: Date.now() };
    (S.notices = S.notices || []).push(n);
    const r = readSet(); r.add(`notice:${n.id}`); saveRead(r);
    closeSheet(); save(); toast('Notice posted');
  },
});

/** Phone / desktop notification (+ beep, vibrate and an on-screen message) */
function phoneAlert(title, body, tag) {
  beep(); setTimeout(beep, 600);
  try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
  toast(`${title}${body ? ' — ' + body : ''}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [200, 100, 200] };
    (navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(null))
      .then((reg) => (reg ? reg.showNotification(title, opts) : new Notification(title, opts))).catch(() => { try { new Notification(title, opts); } catch (e) { /* ignore */ } });
  }
}

/* ---------------- low stock: alert the moment an item drops to / below its "alert below" level ---------------- */
const LOW_STOCK_ROLES = ['owner', 'manager', 'kitchen', 'captain'];
function checkLowStock() {
  const me = Session.user(); if (!me || !LOW_STOCK_ROLES.includes(me.role)) { App.lowSeen = null; return; }
  const low = (S.stock || []).filter(isLow);
  const prev = App.lowSeen;
  App.lowSeen = new Set(low.map((s) => s.id));
  const line = (s) => `${s.name}: ${+Number(s.qty).toFixed(2)} ${s.unit} left${Number(s.qty) <= 0 ? ' (OUT)' : ''}`;
  if (!prev) { // just logged in: one summary
    if (low.length) setTimeout(() => toast(`${pl(low.length, 'stock item')} running low — see Stock or 🔔`), 1500);
    return;
  }
  const fresh = low.filter((s) => !prev.has(s.id));
  if (!fresh.length) return;
  phoneAlert(fresh.length === 1 ? `Running low · ${fresh[0].name}` : `${fresh.length} items running low`, fresh.map(line).join(' · '), 'low-stock');
}

/* ---------------- tables waiting to be cleaned: alert the people who clean / manage the floor ---------------- */
const CLEANING_ROLES = ['owner', 'manager', 'waiter', 'captain', 'housekeeping'];
function checkCleaning() {
  const me = Session.user(); if (!me || !CLEANING_ROLES.includes(me.role)) { App.cleanSeen = null; return; }
  const dirty = Object.entries(S.tableState || {}).filter(([, t]) => t && t.status === 'cleaning').map(([name]) => name);
  const prev = App.cleanSeen;
  App.cleanSeen = new Set(dirty);
  if (!prev) { if (dirty.length) setTimeout(() => toast(`${pl(dirty.length, 'table')} waiting to be cleaned: ${dirty.join(', ')}`), 1800); return; }
  const fresh = dirty.filter((t) => !prev.has(t));
  const notes = fresh.map((t) => S.tableState[t]?.note).filter(Boolean);
  if (fresh.length) phoneAlert(`Clean ${fresh.length === 1 ? 'table' : 'tables'} ${fresh.join(', ')}`, `${notes.length ? notes.join(' · ') + ' — ' : ''}tap “Cleaned” when done.`, 'cleaning');
}

/** Pop up new notices that arrive while the app is open (once each) */
function checkNotices() {
  const me = Session.user(); if (!me) { App.noticesSeen = null; return; }
  const mine = (S.notices || []).filter((n) => (n.to === 'all' || n.to === me.role) && n.byId !== me.id);
  const seen = App.noticesSeen;
  App.noticesSeen = new Set(mine.map((n) => n.id));
  if (!seen) return;
  const fresh = mine.filter((n) => !seen.has(n.id));
  if (!fresh.length) return;
  beep(); toast(`New notice from ${fresh[0].by}: ${fresh[0].text.slice(0, 60)}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body: fresh[0].text, tag: 'notice-' + fresh[0].id, icon: 'icons/icon-192.png' };
    (navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(null))
      .then((reg) => (reg ? reg.showNotification(`Notice from ${fresh[0].by}`, opts) : new Notification(`Notice from ${fresh[0].by}`, opts))).catch(() => {});
  }
}
