// Every role × every important action, straight against firestore.rules (Firebase rules emulator)
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({ projectId: 'demo-cafe', firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const C = 'c1';
const ROLES = ['owner', 'manager', 'cashier', 'waiter', 'captain', 'kitchen', 'housekeeping'];
const now = Date.now();
const item = { id: 'l1', menuId: 'm1', name: 'Tea', price: 100, qty: 1, sent: 1, note: '' };
const openOrder = (id, extra = {}) => ({ id, no: 1, table: 'T1', items: [item], status: 'open', createdAt: now, ...extra });
const paid = (id, m, extra = {}) => ({ ...openOrder(id), status: 'paid', paidAt: now, method: m, subtotal: 100, discount: 0, tax: 5, charges: 0, total: 105, ...extra });

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'cafes', C), { name: 'Test', short: 'T', tagline: '', ownerUid: 'u_owner', createdAt: now });
    for (const r of ROLES) {
      const staff = r !== 'owner';
      await setDoc(doc(db, 'cafes', C, 'members', 'u_' + r), { role: r, active: true, name: r, ...(staff ? { loginId: 'l_' + r } : {}) });
      if (staff) await setDoc(doc(db, 'cafes', C, 'logins', 'l_' + r), { uid: 'u_' + r, email: r + '@x.invalid', version: 1, failed: 0, locked: false });
    }
    // a locked waiter
    await setDoc(doc(db, 'cafes', C, 'members', 'u_locked'), { role: 'waiter', active: true, name: 'L', loginId: 'l_locked' });
    await setDoc(doc(db, 'cafes', C, 'logins', 'l_locked'), { uid: 'u_locked', email: 'l@x.invalid', version: 1, failed: 4, locked: true });
    // someone from another café
    await setDoc(doc(db, 'cafes', 'c2', 'members', 'u_outsider'), { role: 'owner', active: true, name: 'O' });
    await setDoc(doc(db, 'cafes', C, 'meta', 'settings'), { name: 'Test' });
    await setDoc(doc(db, 'cafes', C, 'orders', 'o_open'), openOrder('o_open'));
    await setDoc(doc(db, 'cafes', C, 'orders', 'o_credit'), paid('o_credit', 'credit', { credit: { name: 'R', phone: '' } }));
    await setDoc(doc(db, 'cafes', C, 'orders', 'o_paid'), paid('o_paid', 'cash'));
    await setDoc(doc(db, 'cafes', C, 'kots', 'k_new'), { id: 'k_new', orderId: 'o_open', table: 'T1', no: 1, items: [{ lineId: 'l1', name: 'Tea', qty: 1 }], status: 'new', createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'cafes', C, 'kots', 'k_ready'), { id: 'k_ready', orderId: 'o_open', table: 'T1', no: 1, items: [{ lineId: 'l1', name: 'Tea', qty: 1 }], status: 'ready', createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'cafes', C, 'kots', 'k_cook'), { id: 'k_cook', orderId: 'o_open', table: 'T1', no: 1, items: [{ lineId: 'l1', name: 'Tea', qty: 1 }], status: 'cooking', createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'cafes', C, 'stock', 's1'), { id: 's1', name: 'Milk', unit: 'L', qty: 10, cost: 50 });
    await setDoc(doc(db, 'cafes', C, 'stockLog', 'sl1'), { id: 'sl1', type: 'purchase', date: '2026-11-25', total: 100 });
    await setDoc(doc(db, 'cafes', C, 'audit', 'a1'), { id: 'a1', type: 'reprint', date: '2026-11-25', at: now });
    await setDoc(doc(db, 'cafes', C, 'expenses', 'e1'), { id: 'e1', amount: 10, date: '2026-11-25' });
    await setDoc(doc(db, 'cafes', C, 'staffPrivate', 'st1'), { salary: 15000 });
    await setDoc(doc(db, 'cafes', C, 'menu', 'm1'), { id: 'm1', name: 'Tea', cat: 'Drinks', price: 20, available: true });
  });
}

const results = []; let fails = 0;
async function check(label, who, allowed, fn) {
  await seed();
  const ctx = who === 'anon' ? env.unauthenticatedContext() : env.authenticatedContext('u_' + who);
  const db = ctx.firestore();
  try { await (allowed ? assertSucceeds(fn(db)) : assertFails(fn(db))); results.push(`ok   ${allowed ? 'ALLOW' : 'DENY '} ${who.padEnd(12)} ${label}`); }
  catch (e) { fails++; results.push(`FAIL ${allowed ? 'ALLOW' : 'DENY '} ${who.padEnd(12)} ${label} — ${String(e.message || e).split('\n')[0].slice(0, 120)}`); }
}
const each = async (label, allow, fn) => { for (const r of [...ROLES, 'locked', 'outsider', 'anon']) await check(label, r, allow.includes(r), fn); };

const ref = (db, ...p) => doc(db, 'cafes', C, ...p);
const FLOOR = ['owner', 'manager', 'cashier', 'waiter', 'captain'];
const ALL = ROLES;

await each('read bills', ALL, (db) => getDoc(ref(db, 'orders', 'o_open')));
await each('open a table bill', FLOOR, (db) => setDoc(ref(db, 'orders', 'o_new'), openOrder('o_new')));
await each('add items to an open bill', FLOOR, (db) => updateDoc(ref(db, 'orders', 'o_open'), { items: [item, { ...item, id: 'l2' }] }));
await each('take a cash payment', ['owner', 'manager', 'cashier'], (db) => setDoc(ref(db, 'orders', 'o_open'), paid('o_open', 'cash')));
await each('take a split payment with charges', ['owner', 'manager', 'cashier'], (db) => setDoc(ref(db, 'orders', 'o_open'), paid('o_open', 'split', { split: { cash: 60, upi: 55 }, charges: 10, total: 115 })));
await each('save a credit bill', ['owner', 'manager', 'cashier'], (db) => setDoc(ref(db, 'orders', 'o_open'), paid('o_open', 'credit', { credit: { name: 'R', phone: '' } })));
await each('save a free bill (whole subtotal off)', ['owner', 'manager', 'cashier'], (db) => setDoc(ref(db, 'orders', 'o_open'), paid('o_open', 'comp', { discount: 100, tax: 0, total: 0, compReason: 'Guest' })));
await each('pay with a WRONG total', ['owner'], (db) => setDoc(ref(db, 'orders', 'o_open'), paid('o_open', 'cash', { total: 50 })));
await each('cancel a bill with a reason', ['owner', 'manager', 'cashier'], (db) => setDoc(ref(db, 'orders', 'o_open'), { ...openOrder('o_open'), status: 'cancelled', cancelledAt: now, cancelReason: 'Customer left' }));
await each('collect a credit bill', ['owner', 'manager', 'cashier'], (db) => updateDoc(ref(db, 'orders', 'o_credit'), { creditPaid: { at: now, method: 'cash', by: 'x' } }));
await each('change a PAID bill', ['owner'], (db) => updateDoc(ref(db, 'orders', 'o_paid'), { total: 1, subtotal: 1, tax: 0 }));
await each('delete a PAID bill', ['owner'], (db) => deleteDoc(ref(db, 'orders', 'o_paid')));
await each('send a ticket to the kitchen', FLOOR, (db) => setDoc(ref(db, 'kots', 'k_x'), { id: 'k_x', orderId: 'o_open', table: 'T1', no: 1, items: [], status: 'new', createdAt: now, updatedAt: now }));
await each('start cooking', ['owner', 'kitchen', 'captain'], (db) => updateDoc(ref(db, 'kots', 'k_new'), { status: 'cooking', updatedAt: now }));
await each('mark food ready', ['owner', 'kitchen', 'captain'], (db) => updateDoc(ref(db, 'kots', 'k_cook'), { status: 'ready', updatedAt: now }));
await each('serve ready food', ['owner', 'kitchen', 'captain', 'manager', 'cashier', 'waiter'], (db) => updateDoc(ref(db, 'kots', 'k_ready'), { status: 'served', updatedAt: now, stockDone: true }));
await each('food not collected → donated', ['owner', 'kitchen', 'captain', 'manager', 'cashier', 'waiter'], (db) => updateDoc(ref(db, 'kots', 'k_ready'), { status: 'served', updatedAt: now, stockDone: true, outcome: 'donated' }));
await each('move a ticket to another table', ['owner', 'kitchen', 'captain', 'manager', 'cashier', 'waiter'], (db) => updateDoc(ref(db, 'kots', 'k_cook'), { table: 'T5', movedFrom: 'T1', updatedAt: now }));
await each('read stock', ['owner', 'manager', 'kitchen', 'captain'], (db) => getDoc(ref(db, 'stock', 's1')));
await each('use stock (lower only)', ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'captain'], (db) => updateDoc(ref(db, 'stock', 's1'), { qty: 9 }));
await each('ADD stock', ['owner', 'manager'], (db) => updateDoc(ref(db, 'stock', 's1'), { qty: 11 }));
await each('set a purchase price', ['owner', 'manager'], (db) => updateDoc(ref(db, 'stock', 's1'), { cost: 55 }));
await each('record wastage', ['owner', 'manager', 'kitchen'], (db) => setDoc(ref(db, 'stockLog', 'w1'), { id: 'w1', type: 'waste', date: '2026-11-25', qty: 1 }));
await each('record a purchase', ['owner', 'manager'], (db) => setDoc(ref(db, 'stockLog', 'p1'), { id: 'p1', type: 'purchase', date: '2026-11-25', total: 50 }));
await each('read purchases / wastage', ['owner', 'manager', 'kitchen'], (db) => getDoc(ref(db, 'stockLog', 'sl1')));
await each('add a leakage record', ALL, (db) => setDoc(ref(db, 'audit', 'a2'), { id: 'a2', type: 'reprint', date: '2026-11-25', at: now }));
await each('READ leakage records', ['owner', 'manager'], (db) => getDoc(ref(db, 'audit', 'a1')));
await each('delete a leakage record', ['owner'], (db) => deleteDoc(ref(db, 'audit', 'a1')));
await each('change a leakage record', ['owner'], (db) => updateDoc(ref(db, 'audit', 'a1'), { type: 'x' }));
await each('read expenses', ['owner', 'manager', 'cashier'], (db) => getDoc(ref(db, 'expenses', 'e1')));
await each('read salary / KYC', ['owner'], (db) => getDoc(ref(db, 'staffPrivate', 'st1')));
await each('change café settings', ['owner'], (db) => setDoc(ref(db, 'meta', 'settings'), { name: 'Hacked' }));
await each('list all logins', ['owner'], (db) => getDocs(collection(db, 'cafes', C, 'logins')));
await each('make themself owner', ['owner'], (db) => updateDoc(ref(db, 'members', 'u_waiter'), { role: 'owner' }));

// Running the floor
await each('mark a dish "finished today"', [...FLOOR, 'kitchen'], (db) => updateDoc(ref(db, 'menu', 'm1'), { soldOut: '2026-11-27' }));
await each('change a dish price', ['owner', 'manager', 'kitchen'], (db) => updateDoc(ref(db, 'menu', 'm1'), { price: 1 }));
await each('price + "finished" together', ['owner', 'manager', 'kitchen'], (db) => updateDoc(ref(db, 'menu', 'm1'), { price: 1, soldOut: '2026-11-27' }));
for (const r of [...ROLES, 'locked', 'outsider']) await check('put themself on duty today', r, FLOOR.includes(r), (db) => setDoc(ref(db, 'duty', 'u_' + r), { name: r, role: r, day: '2026-11-27', at: now }));
await each('put SOMEONE ELSE on duty', ['owner', 'manager', 'captain'], (db) => setDoc(ref(db, 'duty', 'u_other'), { name: 'x', role: 'waiter', day: '2026-11-27', at: now }));
await each('add extra fields to a duty line', [], (db) => setDoc(ref(db, 'duty', 'u_owner'), { name: 'x', role: 'owner', day: '2026-11-27', at: now, salary: 1 }));
await each('read who is on duty', ALL, (db) => getDoc(ref(db, 'duty', 'u_waiter')));
await each('give out sections & waiters', ['owner', 'manager', 'captain'], (db) => setDoc(ref(db, 'meta', 'floor'), { day: '2026-11-27', area: { main: 'u_waiter' }, table: {} }));
await each('read sections & waiters', ALL, (db) => getDoc(ref(db, 'meta', 'floor')));
await each('ask for the bill on an open table', FLOOR, (db) => updateDoc(ref(db, 'orders', 'o_open'), { billReq: { at: now, by: 'x', byId: 'u' } }));

await env.cleanup();
const byLabel = {};
results.forEach((r) => { const label = r.slice(23).split(' — ')[0]; (byLabel[label] = byLabel[label] || []).push(r.startsWith('ok') ? '✓' : '✗'); });
results.filter((r) => r.startsWith('FAIL')).forEach((r) => console.log(r));
console.log(`\n${results.length} role checks, ${fails} wrong`);
process.exit(fails ? 1 : 0);
