'use strict';
/* =========================================================
   Pay first → token → kitchen (spec §8 flow B, §9.2)
   - Self-service places (pay before food) and EVERY takeaway / parcel
     order: the customer pays first, the bill gets a token number, and
     the same token goes to the kitchen.
   - Tokens count 1, 2, 3… and start again each day.
   - Kitchen marks Ready → the token shows as Ready (token TV screen,
     ready list); "Collected" closes it and takes the stock off.
   - Table orders that pay at the end (restaurants) are unchanged.
   ========================================================= */

/** Does this order pay before it goes to the kitchen? */
function isPrepaid(o) {
  if (!o) return false;
  if (o.status === 'paid' && o.token) return true;
  if (o.table === 'Takeaway') return true; // takeaway / parcel / counter orders, at every kind of place
  return feat('prepaid_flow') && !feat('running_bill'); // pay-first places, even when the customer sits at a table
}
/** Next token for today (starts at 1 every day) */
function nextToken() {
  const today = dayKey();
  S.seq = S.seq || {};
  if (S.seq.tday !== today) { S.seq.tday = today; S.seq.token = 0; }
  S.seq.token = (Number(S.seq.token) || 0) + 1;
  return S.seq.token;
}
/** Called by the bill screen right after a pay-first order is paid */
function tokenAfterPay(o, fd) {
  if (!isPrepaid(o)) return null;
  o.token = o.token || nextToken();
  o.parcel = fd ? fd.get('parcel') === '1' : o.table === 'Takeaway';
  const name = fd ? String(fd.get('custName') || '').trim().slice(0, 24) : '';
  if (name) o.custName = name; else delete o.custName;
  const me = Session.user();
  // tickets already sent (older takeaways) carry the token too
  S.kots.forEach((k) => { if (k.orderId === o.id) Object.assign(k, { token: o.token, parcel: o.parcel, ...(o.custName ? { custName: o.custName } : {}) }); });
  const lines = o.items.filter((l) => l.qty > (l.sent || 0));
  if (lines.length) {
    const items = lines.map((l) => ({ lineId: l.id, menuId: l.menuId, name: l.name, qty: l.qty - (l.sent || 0), note: l.note || '' }));
    if (feat('kitchen') === 'none') {
      // the person billing also makes it: no kitchen ticket; stock comes off now
      useStockFor({ items, stockDone: false });
    } else {
      S.kots.push({ id: uid('k'), orderId: o.id, table: o.table, no: o.no, token: o.token, parcel: o.parcel, ...(o.custName ? { custName: o.custName } : {}),
        items, status: 'new', createdAt: Date.now(), updatedAt: Date.now(), byId: me?.id || o.byId || null, by: me?.name || '' });
    }
    o.items.forEach((l) => { l.sent = l.qty; });
  }
  return o.token;
}
const tokenSheet = (o) => `${sheetHead('Payment received', orderLabel(o))}
  <div class="token-big xl"><small>Token</small><b>${esc(o.token)}</b>${o.parcel ? '<em>Parcel</em>' : '<em>Eat here</em>'}</div>
  <p class="center">${feat('kitchen') === 'none' ? 'Hand over the order.' : 'Sent to the kitchen with the same token. Call it out when it’s ready.'}</p>
  <div class="row-2">${btn('Print bill', 'printReceipt', { cls: 'ghost', ic: 'printer', data: `data-id="${o.id}"` })}${btn('New order', 'tokenNewOrder', { cls: 'primary', ic: 'plus' })}</div>`;

/* ---------------- token TV screen ---------------- */
const TOKEN_ROLES = ['owner', 'manager', 'cashier', 'kitchen', 'captain'];
const canTokens = () => TOKEN_ROLES.includes(Session.role());
Views.tokens = () => {
  const today = dayKey();
  const ks = S.kots.filter((k) => k.token && dayKey(k.createdAt) === today);
  const prep = ks.filter((k) => k.status === 'new' || k.status === 'cooking').sort((a, b) => a.token - b.token);
  const ready = ks.filter((k) => k.status === 'ready').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const tile = (k, cls) => `<div class="tv-tok ${cls}"><b>${esc(k.token)}</b>${k.custName ? `<small>${esc(k.custName)}</small>` : ''}</div>`;
  return `<main class="tv">
    <header class="tv-h"><strong>${esc(S.settings?.name || '')}</strong><span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <button class="btn ghost sm tv-exit" data-act="closeTokens">${icon('x')}<span>Close</span></button></header>
    <div class="tv-cols">
      <section><h2>Preparing</h2><div class="tv-grid">${prep.map((k) => tile(k, 'prep')).join('') || '<p class="tv-empty">—</p>'}</div></section>
      <section class="ready"><h2>Ready — please collect</h2><div class="tv-grid">${ready.map((k) => tile(k, 'ready')).join('') || '<p class="tv-empty">—</p>'}</div></section>
    </div></main>`;
};
let tvReady = null;
function tokenChime() {
  // a new token became ready: sound (and speak the number when the device can)
  const ready = S.kots.filter((k) => k.token && k.status === 'ready').map((k) => k.id);
  if (tvReady && ready.some((id) => !tvReady.includes(id))) {
    beep();
    try {
      const k = S.kots.find((x) => x.id === ready.find((id) => !tvReady.includes(id)));
      if (k && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(`Token ${k.token}`));
    } catch (e) { /* ignore */ }
  }
  tvReady = ready;
}

Object.assign(Actions, {
  /** Pay-first order: go to the bill (or, for staff who can't bill, leave it with the counter) */
  payFirst() {
    const o = currentOrder(App.params); if (!o || !o.items.length) return;
    if (can('billing')) return go('billing', { o: o.id });
    save(); toast(`${orderLabel(o)} is waiting at the counter for payment — the token is given when they pay.`); go('orders');
  },
  openTokens() { go('tokens'); },
  closeTokens() { history.back(); setTimeout(() => { if (App.view === 'tokens') go(viewsFor(Session.role())[0]); }, 150); },
  tokenNewOrder() { closeSheet(); Actions.newTakeaway(); },
});
