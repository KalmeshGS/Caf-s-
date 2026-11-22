'use strict';
/* =========================================================
   Cafe Journal — core: helpers, constants, store, charts, UI
   Everything is stored locally in this browser (localStorage).
   ========================================================= */

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const dayKey = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const monthKey = (d = new Date()) => dayKey(d).slice(0, 7);
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const shiftDay = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const shiftMonth = (k, n) => { const d = keyToDate(k); return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString(undefined, o);
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const monthLabel = (mk) => keyToDate(mk).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
/** "1 bill", "2 bills" */
const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
function elapsed(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${pad(m)}:${pad(s % 60)}`;
}

/* ---------- constants ---------- */
const CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', dec: 0, scale: 1, wallet: 'UPI' },
  { code: 'USD', symbol: '$', locale: 'en-US', dec: 2, scale: 0.03, wallet: 'Wallet' },
  { code: 'EUR', symbol: '€', locale: 'en-IE', dec: 2, scale: 0.028, wallet: 'Wallet' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', dec: 2, scale: 0.024, wallet: 'Wallet' },
  { code: 'AED', symbol: 'AED ', locale: 'en-AE', dec: 2, scale: 0.12, wallet: 'Wallet' },
  { code: 'SAR', symbol: 'SAR ', locale: 'en-US', dec: 2, scale: 0.12, wallet: 'Wallet' },
  { code: 'NPR', symbol: 'Rs ', locale: 'en-IN', dec: 0, scale: 1.6, wallet: 'QR' },
  { code: 'LKR', symbol: 'Rs ', locale: 'en-IN', dec: 0, scale: 3.5, wallet: 'QR' },
  { code: 'BDT', symbol: '৳', locale: 'en-IN', dec: 0, scale: 1.4, wallet: 'bKash' },
  { code: 'PKR', symbol: 'Rs ', locale: 'en-IN', dec: 0, scale: 3.3, wallet: 'Wallet' },
];
/** Older cafés kept the first default (green, auto) — they get the new house look until they choose one in Settings */
/** The house look (cream + clay) is used until the owner picks a colour / appearance in Settings (look: 3) */
const lookOf = (st = {}) => (st.look === 3 ? { accent: st.accent || 'clay', theme: st.theme || 'light' } : { accent: 'clay', theme: 'light' });
const ACCENTS = { clay: '#b5562a', red: '#c8372d', olive: '#6b6f4c', green: '#1f7a4d', coffee: '#8a5a33', indigo: '#4f46e5', terracotta: '#c2410c', teal: '#0f766e', charcoal: '#3f3f46' };
const EXPENSE_CATS = { Rent: '#6366f1', Utilities: '#eab308', Vendor: '#c2783c', Kitchen: '#16a34a', Salary: '#0ea5e9', Maintenance: '#a855f7', Marketing: '#ec4899', Other: '#94a3b8' };
/** Common job titles for the Designation dropdown ("Other" lets you type your own) */
const DESIGNATIONS = ['Manager', 'Assistant Manager', 'Head Chef', 'Chef', 'Cook', 'Kitchen Helper', 'Barista', 'Cashier', 'Captain', 'Waiter', 'Steward', 'Bartender', 'Baker', 'Housekeeping', 'Dishwasher', 'Delivery', 'Security', 'Accountant', 'Helper'];
/** Designation picker: a dropdown of common roles + "Other" with a text box */
function designationField(name, value, label = 'Designation') {
  const v = String(value || '').trim();
  const other = !!v && !DESIGNATIONS.includes(v);
  return `<label class="field"><span>${label}</span>
    <select name="${name}" data-change="designation" aria-label="${label}">
      <option value="">Choose…</option>
      ${DESIGNATIONS.map((d) => `<option ${d === v ? 'selected' : ''}>${esc(d)}</option>`).join('')}
      <option value="__other" ${other ? 'selected' : ''}>Other (type it)</option>
    </select>
    <input name="${name}_other" maxlength="30" value="${other ? esc(v) : ''}" placeholder="Type the designation" ${other ? '' : 'hidden'} aria-label="Other designation"></label>`;
}
/** Read the chosen designation (the typed text when "Other" is picked) */
const designationValue = (sel, other) => (sel === '__other' ? String(other || '').trim() : String(sel || '').trim());
const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'packs', 'dozen', 'bottles', 'cylinders'];
const BUSINESS_TYPES = { cafe: 'Café', restaurant: 'Restaurant', hotel: 'Hotel / Dhaba', bakery: 'Bakery', other: 'Something else' };
const ATT = { present: { label: 'Present', short: 'P' }, late: { label: 'Late', short: 'L' }, leave: { label: 'Leave', short: 'Lv' }, absent: { label: 'Absent', short: 'A' } };

const ROLES = {
  owner:   { label: 'Owner',   desc: 'Everything',            color: '#1f7a4d', views: ['dashboard', 'orders', 'kitchen', 'billing', 'menu', 'stock', 'expenses', 'vendors', 'staff', 'reports', 'journal', 'team', 'settings'] },
  manager: { label: 'Manager', desc: 'Orders · billing · menu & recipes · stock · expenses · vendors · staff', color: '#4f46e5', views: ['dashboard', 'orders', 'billing', 'menu', 'stock', 'expenses', 'vendors', 'staff', 'journal'] },
  cashier: { label: 'Cashier', desc: 'Billing · orders · day closing', color: '#c2783c', views: ['billing', 'orders', 'journal'] },
  waiter:  { label: 'Waiter',  desc: 'Orders · tables & cleaning · reservations · serving', color: '#0f766e', views: ['orders'] },
  kitchen: { label: 'Kitchen', desc: 'Kitchen screen · menu & recipes', color: '#d97706', views: ['kitchen', 'menu'] },
};

/** Only these roles may start cooking / mark food ready (everyone may mark ready food as served) */
const KITCHEN_ROLES = ['owner', 'kitchen'];
const VIEWS = {
  dashboard: { label: 'Dashboard', icon: 'grid' },
  orders:    { label: 'Orders',    icon: 'clipboard' },
  kitchen:   { label: 'Kitchen',   icon: 'flame' },
  billing:   { label: 'Billing',   icon: 'receipt' },
  menu:      { label: 'Menu & recipes', icon: 'cup' },
  stock:     { label: 'Stock',     icon: 'box' },
  expenses:  { label: 'Expenses',  icon: 'wallet' },
  vendors:   { label: 'Vendors',   icon: 'truck' },
  staff:     { label: 'Staff',     icon: 'users' },
  reports:   { label: 'Reports',   icon: 'chart' },
  journal:   { label: 'Journal',   icon: 'book' },
  team:      { label: 'Team & access', icon: 'lock' },
  settings:  { label: 'Settings',  icon: 'gear' },
};

/* ---------- icons (stroke, 24 grid) ---------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  clipboard: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  flame: '<path d="M12 22c3.9 0 7-2.9 7-6.8 0-3.6-2.4-5.6-3.9-8.2-.6 1.7-1.6 2.7-2.6 3.1.2-3.1-.9-6-3.5-8.1.2 3.6-1.6 5.6-3.1 7.7C5 11.2 5 12.9 5 15.2 5 19.1 8.1 22 12 22z"/>',
  receipt: '<path d="M5 2.5h14V21l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 7.5h6M9 11h6M9 14.5h3.5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  wallet: '<path d="M17 6.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1.5"/><rect x="3" y="6.5" width="18" height="14" rx="2"/><path d="M21 11h-4a2 2 0 0 0 0 4h4"/>',
  truck: '<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3V16h-7"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7.5 16v-4M12 16V8M16.5 16v-6M21 16V5" />',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14"/><path d="M8.5 7.5h7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  printer: '<path d="M6 9V2.5h12V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7.5H6z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  cup: '<path d="M4 8h13v5.5A5.5 5.5 0 0 1 11.5 19h-2A5.5 5.5 0 0 1 4 13.5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v2.5M12 2.5v2.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  idcard: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16a3 3 0 0 1 6 0M14 10h4.5M14 13.5h3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------- store ---------- */
const DB_KEY = 'cafe-journal.v1';
const SESSION_KEY = 'cafe-journal.session';

function emptyState() {
  return {
    v: 1,
    settings: null,
    menu: [], orders: [], kots: [], stock: [], expenses: [],
    vendors: [], vendorTx: [], staff: [], attendance: {}, journal: {}, tableState: {}, reservations: [], notices: [],
    users: [], requests: [], recovery: null,
    seq: { day: '', n: 0, emp: 0 },
  };
}
const APP_VERSION = '4.0';
const DEFAULT_PIN = '1234'; // only for accounts created by older versions; they must set a password

/** Short code for employee IDs: "Kalmesh Kitchen" -> "KK", "KK" -> "KK", "Brewhouse" -> "BR" */
function shortCode(name) {
  const clean = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return 'EMP';
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 4);
  return words[0].length <= 4 ? words[0] : words[0].slice(0, 2);
}
/** Next employee ID: SHORT + YY (joining year) + running 3-digit serial, e.g. KK26001 */
function nextEmpId(st, joinDate) {
  const short = (st.settings.short || shortCode(st.settings.name)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'EMP';
  const yy = String((joinDate ? keyToDate(joinDate) : new Date()).getFullYear()).slice(-2);
  const n = (Number(st.seq.emp) || 0) + 1;
  return { empId: `${short}${yy}${String(n).padStart(3, '0')}`, n };
}
function loadState() {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) return migrate(Object.assign(emptyState(), JSON.parse(raw))); } catch (e) { /* ignore */ }
  return emptyState();
}
/** Older versions had one shared PIN per role. Turn each role into a person with PIN 1234 who must set their own. */
function migrate(st) {
  if (st.pins || (st.settings && !st.users.length)) {
    st.users = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'].map((role) => ({
      id: uid('u'), name: ROLES[role].label, role, phone: '', pin: DEFAULT_PIN, mustChange: true, active: true, createdAt: Date.now(),
    }));
    delete st.pins;
  }
  st.requests = Array.isArray(st.requests) ? st.requests : [];
  delete st.otps;
  st.seq = Object.assign({ day: '', n: 0, emp: 0 }, st.seq);
  if (st.settings && !st.settings.short) st.settings.short = shortCode(st.settings.name);
  if (st.settings) (st.staff || []).forEach((p) => {
    if (!p.joinDate) p.joinDate = dayKey();
    if (!p.empId) { const { empId, n } = nextEmpId(st, p.joinDate); p.empId = empId; st.seq.emp = n; }
  });
  return st;
}
let S = loadState();

function persist() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(S)); return true; }
  catch (e) { toast('Could not save — browser storage is full'); return false; }
}
/** Save + re-render the screen */
function save() { persist(); render(); }
/** Run a mutation then save */
function commit(fn) { fn(S); save(); }

/* Sign-in session — kept across refreshes.
   Owners, managers and cashiers are LOCKED after IDLE_LOCK_MIN minutes without use
   (they unlock with just their password). Waiters and kitchen stay signed in. */
const IDLE_LOCK_MIN = 5;
const LOCK_AFTER_MIN = IDLE_LOCK_MIN;
const IDLE_ROLES = ['owner', 'manager', 'cashier'];
const SESS_KEY = 'cj.session';
const Session = {
  _id: null, _last: Date.now(), locked: false, fails: 0, _saved: 0,
  load() {
    try { const s = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); if (s && s.id) Object.assign(this, { _id: s.id, _last: s.last || 0, locked: !!s.locked, fails: s.fails || 0 }); } catch (e) { /* ignore */ }
  },
  save() {
    try { if (this._id) localStorage.setItem(SESS_KEY, JSON.stringify({ id: this._id, last: this._last, locked: this.locked, fails: this.fails })); else localStorage.removeItem(SESS_KEY); } catch (e) { /* ignore */ }
    this._saved = Date.now();
  },
  /** The signed-in person, even while the screen is locked */
  account() {
    const u = this._id && (S.users || []).find((x) => x.id === this._id);
    return u && u.active !== false && !u.mustChange && !u.locked && u.hash && ROLES[u.role] ? u : null;
  },
  idleLimit(role) { return IDLE_ROLES.includes(role) ? IDLE_LOCK_MIN * 60000 : Infinity; },
  user() {
    const u = this.account(); if (!u) return null;
    if (!this.locked && Date.now() - this._last > this.idleLimit(u.role)) { this.locked = true; this.save(); }
    return this.locked ? null : u;
  },
  role() { const u = this.user(); return u ? u.role : null; },
  set(id) { Object.assign(this, { _id: id || null, locked: false, fails: 0, _last: Date.now() }); this.save(); },
  unlock() { Object.assign(this, { locked: false, fails: 0, _last: Date.now() }); this.save(); },
  touch() { if (this._id && !this.locked) { this._last = Date.now(); if (Date.now() - this._saved > 10000) this.save(); } },
};
Session.load();
try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* remove sign-in saved by older versions */ }

/* ---------- selectors ---------- */
const cur = () => CURRENCIES.find((c) => c.code === S.settings?.currency) || CURRENCIES[0];
function money(n) {
  const c = cur(); n = Number(n) || 0;
  const s = Math.abs(n).toLocaleString(c.locale, { minimumFractionDigits: 0, maximumFractionDigits: c.dec });
  return (n < 0 ? '−' : '') + c.symbol + s;
}
const walletLabel = () => cur().wallet;
const payMethods = () => ({ cash: { label: 'Cash', color: '#c58b4c' }, upi: { label: walletLabel(), color: '#22a06b' }, card: { label: 'Card', color: '#6366f1' } });

const byId = (list, id) => list.find((x) => x.id === id);
const paidOrders = () => S.orders.filter((o) => o.status === 'paid');
const paidOn = (dk) => paidOrders().filter((o) => dayKey(o.paidAt) === dk);
const paidInMonth = (mk) => paidOrders().filter((o) => monthKey(o.paidAt) === mk);
const expensesOn = (dk) => S.expenses.filter((e) => e.date === dk);
const expensesInMonth = (mk) => S.expenses.filter((e) => e.date.startsWith(mk));
const openOrders = () => S.orders.filter((o) => o.status === 'open');
const orderSubtotal = (o) => sum(o.items, (l) => l.qty * l.price);
const orderLabel = (o) => (o.table === 'Takeaway' ? `Takeaway #${o.no}` : o.table);
const isLow = (s) => Number(s.qty) <= Number(s.low);
const tableNames = () => Array.from({ length: Number(S.settings?.tables) || 0 }, (_, i) => `T${i + 1}`);

function orderTotals(o, discount = o.discount || 0) {
  const sub = orderSubtotal(o);
  const disc = clamp(Number(discount) || 0, 0, sub);
  const taxable = sub - disc;
  const tax = round2((taxable * (Number(S.settings?.tax) || 0)) / 100);
  return { sub, discount: disc, tax, total: round2(taxable + tax) };
}
function topItems(orders) {
  const m = {};
  orders.forEach((o) => o.items.forEach((l) => {
    const k = l.name; m[k] = m[k] || { name: k, qty: 0, rev: 0 };
    m[k].qty += l.qty; m[k].rev += l.qty * l.price;
  }));
  return Object.values(m).sort((a, b) => b.qty - a.qty || b.rev - a.rev);
}
function byMethod(orders) {
  const r = { cash: 0, upi: 0, card: 0 };
  orders.forEach((o) => { r[o.method] = (r[o.method] || 0) + o.total; });
  return r;
}
function nextBillNo() {
  const today = dayKey();
  if (S.seq.day !== today) S.seq = { day: today, n: 0 };
  S.seq.n += 1;
  return S.seq.n;
}

/* ---------- charts (pure SVG) ---------- */
function barChart(values, labels, { h = 150, fmt = money, color = 'var(--warm)', hi = -1 } = {}) {
  const n = values.length;
  if (!n) return '';
  const max = Math.max(1, ...values);
  const w = 100 / n;
  const every = n <= 12 ? 1 : Math.ceil(n / 8);
  const top = 8, base = h - 22;
  const bars = values.map((v, i) => {
    const bh = Math.max(v > 0 ? 3 : 0, (v / max) * (base - top));
    const fill = i === hi ? 'var(--accent)' : color;
    return `<g><title>${esc(labels[i])} · ${esc(fmt(v))}</title>
      <rect x="${i * w + w * 0.16}%" y="${base - bh}" width="${w * 0.68}%" height="${bh}" rx="3" fill="${fill}" opacity="${v ? 1 : 0.25}"/>
      ${i % every === 0 ? `<text x="${i * w + w / 2}%" y="${h - 6}" text-anchor="middle">${esc(labels[i])}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="chart" width="100%" height="${h}" role="img" aria-label="Bar chart">
    <line x1="0" x2="100%" y1="${base + 0.5}" y2="${base + 0.5}" class="axis"/>${bars}</svg>`;
}
function donut(segs, { size = 136, stroke = 18, center = '', sub = '' } = {}) {
  const total = sum(segs, (s) => s.value);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  let off = 0;
  const arcs = total ? segs.filter((s) => s.value > 0).map((s) => {
    const len = (s.value / total) * c;
    const gap = segs.filter((x) => x.value > 0).length > 1 ? Math.min(2, len / 3) : 0;
    const el = `<circle r="${r}" cx="${mid}" cy="${mid}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - gap)} ${c}" stroke-dashoffset="${-off}"><title>${esc(s.label)}</title></circle>`;
    off += len; return el;
  }).join('') : '';
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Donut chart">
    <circle r="${r}" cx="${mid}" cy="${mid}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <g transform="rotate(-90 ${mid} ${mid})">${arcs}</g>
    <text x="50%" y="${mid - (sub ? 2 : -5)}" text-anchor="middle" class="donut-c">${esc(center)}</text>
    ${sub ? `<text x="50%" y="${mid + 15}" text-anchor="middle" class="donut-s">${esc(sub)}</text>` : ''}</svg>`;
}
const meter = (pct, color = 'var(--accent)') => `<div class="meter"><span style="width:${clamp(pct, 0, 100)}%;background:${color}"></span></div>`;

/* ---------- small UI pieces ---------- */
const eyebrow = (t) => `<p class="eyebrow">${esc(t)}</p>`;
function pageHead(kicker, title, right = '') {
  return `<header class="page-head"><div>${eyebrow(kicker)}<h1>${esc(title)}</h1></div><div class="page-head-r">${right}</div></header>`;
}
const kpi = (label, value, sub = '', tone = '') => `<div class="kpi card ${tone}"><p class="eyebrow">${esc(label)}</p><p class="kpi-v">${esc(value)}</p>${sub ? `<p class="kpi-s">${esc(sub)}</p>` : ''}</div>`;
const empty = (msg, action = '') => `<div class="empty"><p>${esc(msg)}</p>${action}</div>`;
const live = () => '<span class="live"><i></i>Live</span>';
const btn = (label, act, { cls = '', ic = '', data = '' } = {}) => `<button type="button" class="btn ${cls}" data-act="${act}" ${data}>${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>`;
const monthNav = (mk) => `<div class="stepper">
  <button class="icon-btn" data-act="monthNav" data-d="-1" aria-label="Previous month">${icon('left')}</button>
  <span>${esc(monthLabel(mk))}</span>
  <button class="icon-btn" data-act="monthNav" data-d="1" aria-label="Next month" ${mk >= monthKey() ? 'disabled' : ''}>${icon('right')}</button></div>`;

/* ---------- sheet (modal) & toast ---------- */
function openSheet(html, { wide = false } = {}) {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-backdrop" data-act="closeSheet"></div>
    <div class="sheet-panel ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
  document.body.classList.add('no-scroll');
  setTimeout(() => { const f = el.querySelector('[autofocus], input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea'); f && f.focus(); }, 60);
}
function closeSheet() {
  const el = $('#sheet'); el.hidden = true; el.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
const sheetHead = (kicker, title) => `<div class="sheet-head"><div>${eyebrow(kicker)}<h2>${esc(title)}</h2></div>
  <button class="icon-btn" data-act="closeSheet" aria-label="Close">${icon('x')}</button></div>`;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- router ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { view: path || '', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function go(view, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const next = `#/${view}${qs ? '?' + qs : ''}`;
  if (location.hash === next) render(); else location.hash = next;
}

/* ---------- beep for kitchen ---------- */
function beep() {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
  } catch (e) { /* audio not available */ }
}
