'use strict';
/* =========================================================
   Online database (Firebase Authentication + Cloud Firestore)

   When js/firebase-config.js has your Firebase settings, Cafe Journal runs
   in ONLINE mode:
   - All café data is stored in Firestore and synced live between devices.
   - Nothing about the café is kept on the device (memory only; the login
     session ends when the app is closed or after 15 minutes idle).
   - Passwords are handled by Firebase Authentication.
   - firestore.rules enforces who can read/write what, on Google's servers.

   How syncing works: the app keeps working with the in-memory object `S`.
   Every save() compares S with the last known server copy and writes only
   what changed. Changes from other devices arrive through live listeners
   and are merged into S.
   ========================================================= */

const Cloud = {
  on: false, app: null, auth: null, db: null, sec: null, secAuth: null,
  cid: null, me: null, attached: false, loading: false, unsubs: [], mirror: {}, privateCache: {},
  members: {}, logins: {}, pending: false, legacy: null, loadedMonths: new Set(),
  cafeCode: '', cafeName: '',
};

const ALL_ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
const PRIVATE_STAFF = ['salary', 'dob', 'email', 'address', 'emergencyName', 'emergencyPhone', 'idType', 'idNumber', 'pan'];
const WINDOW_DAYS = 62;
const SPEC = [
  { key: 'settings', kind: 'doc', path: ['meta', 'settings'], read: ALL_ROLES, write: ['owner'] },
  { key: 'seq', kind: 'doc', path: ['meta', 'seq'], read: ALL_ROLES, write: ['owner', 'manager', 'cashier', 'waiter'] },
  { key: 'menu', kind: 'items', coll: 'menu', read: ALL_ROLES, write: ['owner'] },
  { key: 'orders', kind: 'items', coll: 'orders', read: ALL_ROLES, write: ['owner', 'manager', 'cashier', 'waiter'], since: { field: 'createdAt', days: WINDOW_DAYS, num: true } },
  { key: 'kots', kind: 'items', coll: 'kots', read: ALL_ROLES, write: ALL_ROLES, since: { field: 'updatedAt', days: 2, num: true } },
  { key: 'stock', kind: 'items', coll: 'stock', read: ['owner', 'manager'], write: ['owner', 'manager'] },
  { key: 'expenses', kind: 'items', coll: 'expenses', read: ['owner', 'manager', 'cashier'], write: ['owner', 'manager'], since: { field: 'date', days: WINDOW_DAYS } },
  { key: 'vendors', kind: 'items', coll: 'vendors', read: ['owner', 'manager'], write: ['owner', 'manager'] },
  { key: 'vendorTx', kind: 'items', coll: 'vendorTx', read: ['owner', 'manager'], write: ['owner', 'manager'], since: { field: 'date', days: 120 } },
  { key: 'staff', kind: 'items', coll: 'staff', read: ['owner', 'manager', 'cashier'], write: ['owner'], private: { coll: 'staffPrivate', fields: PRIVATE_STAFF, roles: ['owner'] } },
  { key: 'attendance', kind: 'map', coll: 'attendance', read: ['owner', 'manager', 'cashier'], write: ['owner', 'manager'], days: WINDOW_DAYS },
  { key: 'journal', kind: 'map', coll: 'journal', read: ['owner', 'manager', 'cashier'], write: ['owner', 'manager', 'cashier'], days: WINDOW_DAYS },
  { key: 'requests', kind: 'items', coll: 'requests', read: ['owner'], write: ['owner'], where: ['status', '==', 'open'] },
  { key: 'tableState', kind: 'map', coll: 'tables', read: ALL_ROLES, write: ['owner', 'manager', 'cashier', 'waiter'] },
  { key: 'reservations', kind: 'items', coll: 'reservations', read: ['owner', 'manager', 'cashier', 'waiter'], write: ['owner', 'manager', 'cashier', 'waiter'], since: { field: 'date', days: 7 } },
];
const NEW_RULE_KEYS = ['tableState', 'reservations']; // need the v3.3 security rules

/* ---------------- small helpers ---------------- */
function canon(v) { // JSON with sorted keys, so the same data always gives the same text
  return JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.keys(val).sort().reduce((o, key) => { o[key] = val[key]; return o; }, {}) : val));
}
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
const cref = (...p) => FB.doc(Cloud.db, 'cafes', Cloud.cid, ...p);
const ccol = (name) => FB.collection(Cloud.db, 'cafes', Cloud.cid, name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function randomCode(n) { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; return Array.from(randBytes(n), (x) => c[x % c.length]).join(''); }
const staffEmail = (loginId, cid, v) => `${loginId}.v${v}@${cid}.staff.invalid`; // never a real mailbox
function friendly(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/email-already-in-use': 'That email already has an account — log in instead.',
    'auth/invalid-email': 'That email address looks wrong.',
    'auth/weak-password': `Use at least ${PW_MIN} characters.`,
    'auth/network-request-failed': 'No internet connection. Check your network and try again.',
    'auth/too-many-requests': 'Too many attempts from this device. Please wait a few minutes and try again.',
    'auth/requires-recent-login': 'Please log out and log in again, then try once more.',
    'auth/invalid-credential': 'Login details are not right.', 'auth/wrong-password': 'Login details are not right.',
    'auth/user-not-found': 'Login details are not right.', 'auth/invalid-login-credentials': 'Login details are not right.',
    'auth/user-disabled': 'This account has been disabled.',
    'permission-denied': "You don't have permission to do that.", 'unavailable': 'The online database is not reachable right now. Try again.',
  };
  return map[c] || (e && e.message) || 'Something went wrong. Please try again.';
}
const BAD_PASSWORD = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found'];

/* ---------------- start-up ---------------- */
(function initCloud() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || !window.FB) return;
  Cloud.on = true;
  Cloud.app = FB.initializeApp(cfg);
  // Sign-in is remembered on this device (only the login token — café data is never stored here)
  Cloud.auth = FB.initializeAuth(Cloud.app, { persistence: [FB.indexedDBLocalPersistence, FB.browserLocalPersistence] });
  Cloud.db = FB.initializeFirestore(Cloud.app, { localCache: FB.memoryLocalCache() });
  if (window.FIREBASE_EMULATOR) {
    FB.connectAuthEmulator(Cloud.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    FB.connectFirestoreEmulator(Cloud.db, '127.0.0.1', 8080);
  }
  // Data saved on this device by the older offline version: offer to move it online
  if (S.settings) Cloud.legacy = S;
  S = emptyState();
  try { Cloud.cafeCode = localStorage.getItem('cj.cafe') || ''; Cloud.cafeName = localStorage.getItem('cj.cafeName') || ''; } catch (e) { /* ignore */ }
  installOverrides();
  // Re-open the café after a refresh if this device is still signed in
  Cloud.restoring = true;
  let first = true;
  FB.onAuthStateChanged(Cloud.auth, async (user) => {
    if (!first) return; first = false;
    if (user && Cloud.cafeCode && Session._id === user.uid) {
      try { await attach(Cloud.cafeCode, user, true); } catch (e) { await Cloud.signOut(friendly(e)); }
    } else if (user) { try { await FB.signOut(Cloud.auth); } catch (e) { /* ignore */ } }
    Cloud.restoring = false;
    if (!Cloud.attached) render();
  });
})();

/* ---------------- syncing ---------------- */
function writable(spec) { const r = Cloud.me && Cloud.me.active !== false ? Cloud.me.role : null; return !!r && spec.write.includes(r); }
function readable(spec, r) { return spec.read.includes(r); }

async function pushNow() {
  if (!Cloud.cid || !Cloud.me) return;
  const ops = [];
  for (const spec of SPEC) {
    if (!writable(spec)) continue;
    if (Cloud.rulesOutdated && NEW_RULE_KEYS.includes(spec.key)) continue; // would make the whole save fail
    const m = Cloud.mirror[spec.key] || (Cloud.mirror[spec.key] = spec.kind === 'doc' ? { v: null } : new Map());
    if (spec.kind === 'doc') {
      const val = S[spec.key];
      if (val == null) continue;
      const j = canon(val);
      if (j !== m.v) { ops.push(['set', cref(...spec.path), plain(val)]); m.v = j; if (spec.key === 'settings') ops.push(['update', FB.doc(Cloud.db, 'cafes', Cloud.cid), { name: val.name, short: val.short || '', tagline: val.tagline || '' }]); }
      continue;
    }
    const entries = spec.kind === 'map' ? Object.entries(S[spec.key] || {}) : (S[spec.key] || []).filter((x) => x && x.id).map((x) => [x.id, x]);
    const seen = new Set();
    for (const [id, item] of entries) {
      seen.add(id);
      const j = canon(item);
      if (m.get(id) === j) continue;
      m.set(id, j);
      const data = plain(item);
      if (spec.private) {
        const priv = {}; spec.private.fields.forEach((f) => { if (f in data) { priv[f] = data[f]; delete data[f]; } });
        ops.push(['set', cref(spec.coll, id), data]);
        ops.push(['set', cref(spec.private.coll, id), priv]);
      } else ops.push(['set', cref(spec.coll, id), data]);
    }
    for (const id of [...m.keys()]) {
      if (seen.has(id)) continue;
      m.delete(id);
      ops.push(['delete', cref(spec.coll, id)]);
      if (spec.private) ops.push(['delete', cref(spec.private.coll, id)]);
    }
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = FB.writeBatch(Cloud.db);
    ops.slice(i, i + 400).forEach(([op, ref, data]) => (op === 'set' ? b.set(ref, data) : op === 'update' ? b.update(ref, data) : b.delete(ref)));
    try { await b.commit(); } catch (e) { console.warn('save failed', e); toast(`Couldn't save online — ${friendly(e)}`); }
  }
}
let pushTimer = null;
Cloud.push = () => { clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 120); };
Cloud.flush = async () => { clearTimeout(pushTimer); await pushNow(); };

function upsert(list, item) {
  const old = list.find((x) => x.id === item.id);
  if (!old) { list.push(item); return item; }
  Object.keys(old).forEach((k) => { if (!(k in item)) delete old[k]; });
  return Object.assign(old, item);
}
function applySnap(spec, snap) {
  const m = Cloud.mirror[spec.key] || (Cloud.mirror[spec.key] = spec.kind === 'doc' ? { v: null } : new Map());
  if (spec.kind === 'doc') {
    S[spec.key] = snap.exists() ? snap.data() : (spec.key === 'seq' ? { day: '', n: 0, emp: 0 } : S[spec.key]);
    m.v = canon(S[spec.key]);
    return;
  }
  snap.docChanges().forEach((ch) => {
    const id = ch.doc.id;
    if (spec.kind === 'map') {
      S[spec.key] = S[spec.key] || {};
      if (ch.type === 'removed') { delete S[spec.key][id]; m.delete(id); return; }
      S[spec.key][id] = ch.doc.data(); m.set(id, canon(S[spec.key][id]));
      return;
    }
    S[spec.key] = S[spec.key] || [];
    if (ch.type === 'removed') { S[spec.key] = S[spec.key].filter((x) => x.id !== id); m.delete(id); return; }
    const item = { ...ch.doc.data(), id };
    if (spec.private) Object.assign(item, Cloud.privateCache[id] || {});
    m.set(id, canon(upsert(S[spec.key], item)));
  });
}
function applyPrivate(spec, snap) {
  snap.docChanges().forEach((ch) => {
    const id = ch.doc.id;
    if (ch.type === 'removed') { delete Cloud.privateCache[id]; return; }
    Cloud.privateCache[id] = ch.doc.data();
    const item = (S[spec.key] || []).find((x) => x.id === id);
    if (item) { Object.assign(item, Cloud.privateCache[id]); Cloud.mirror[spec.key]?.set(id, canon(item)); }
  });
}
function specQuery(spec) {
  if (spec.kind === 'doc') return cref(...spec.path);
  const col = ccol(spec.coll);
  if (spec.where) return FB.query(col, FB.where(...spec.where));
  if (spec.kind === 'map' && spec.days) return FB.query(col, FB.where(FB.documentId(), '>=', shiftDay(dayKey(), -spec.days)));
  if (spec.since) {
    const v = spec.since.num ? Date.now() - spec.since.days * 864e5 : shiftDay(dayKey(), -spec.since.days);
    return FB.query(col, FB.where(spec.since.field, '>=', v));
  }
  return col;
}
function listen(q, onData, key) {
  return new Promise((resolve) => {
    let first = true;
    const un = FB.onSnapshot(q, (snap) => { onData(snap); if (first) { first = false; resolve(); } else Cloud.changed(); },
      (err) => {
        if (NEW_RULE_KEYS.includes(key) && err.code === 'permission-denied') { Cloud.rulesOutdated = true; if (first) { first = false; resolve(); } return; }
        console.warn('listener', err); if (first) { first = false; resolve(); } else if (err.code === 'permission-denied') Cloud.signOut('Your access has changed — please log in again.'); });
    Cloud.unsubs.push(un);
  });
}
function rebuildUsers() {
  S.users = Object.entries(Cloud.members).map(([uid, m]) => {
    const L = m.loginId ? Cloud.logins[m.loginId] || {} : {};
    return { ...m, id: uid, hash: 'online', locked: !!L.locked, failed: L.failed || 0, lockedAt: L.lockedAt?.toMillis ? L.lockedAt.toMillis() : null };
  });
  const me = S.users.find((u) => u.id === Cloud.me?.id);
  if (me) Object.assign(Cloud.me, me);
}
Cloud.changed = () => {
  if (!Cloud.attached) return;
  if (Session.user()) checkReady();
  const busyTyping = document.activeElement && document.activeElement.matches('input, textarea, select');
  if (!$('#sheet').hidden || busyTyping) { Cloud.pending = true; return; }
  render();
};
Cloud.ensureMonth = async (mk) => {
  if (!Cloud.attached || Cloud.loadedMonths.has(mk)) return;
  const start = keyToDate(mk), end = keyToDate(shiftMonth(mk, 1));
  if (start.getTime() >= Date.now() - WINDOW_DAYS * 864e5) return;
  Cloud.loadedMonths.add(mk);
  const role = Session.role();
  const jobs = [];
  const fetchInto = async (spec, q) => { const snap = await FB.getDocs(q); applySnap(spec, { docChanges: () => snap.docs.map((d) => ({ type: 'added', doc: d })) }); };
  const o = SPEC.find((s) => s.key === 'orders'), e = SPEC.find((s) => s.key === 'expenses');
  jobs.push(fetchInto(o, FB.query(ccol('orders'), FB.where('createdAt', '>=', start.getTime()), FB.where('createdAt', '<', end.getTime()))));
  if (readable(e, role)) jobs.push(fetchInto(e, FB.query(ccol('expenses'), FB.where('date', '>=', dayKey(start)), FB.where('date', '<', dayKey(end)))));
  try { await Promise.all(jobs); } catch (err) { toast(friendly(err)); }
  render();
};

/* ---------------- signing in & out ---------------- */
async function attach(cid, user, restoring) {
  Cloud.cid = cid; Cloud.loading = true; render();
  const ms = await FB.getDoc(cref('members', user.uid));
  const m = ms.exists() ? ms.data() : null;
  if (!m || m.active !== true) { await Cloud.signOut(m ? 'This account has been disabled. Ask the owner.' : 'You no longer have access to this café.'); return; }
  Cloud.me = { ...m, id: user.uid, hash: 'online' };
  if (!restoring || Session._id !== user.uid) Session.set(user.uid); // fresh login; a refresh keeps the lock state
  App.kotSeen = null;
  Cloud.rulesOutdated = false;
  S = emptyState(); Cloud.mirror = {}; Cloud.privateCache = {}; Cloud.members = {}; Cloud.logins = {}; Cloud.loadedMonths = new Set();
  const role = m.role;
  const jobs = [];
  for (const spec of SPEC) {
    if (!readable(spec, role)) continue;
    if (spec.private && spec.private.roles.includes(role)) jobs.push(listen(ccol(spec.private.coll), (snap) => applyPrivate(spec, snap)));
    jobs.push(listen(specQuery(spec), (snap) => applySnap(spec, snap), spec.key));
  }
  if (role === 'owner') {
    jobs.push(listen(ccol('members'), (snap) => { snap.docChanges().forEach((ch) => { if (ch.type === 'removed') delete Cloud.members[ch.doc.id]; else Cloud.members[ch.doc.id] = ch.doc.data(); }); rebuildUsers(); }));
    jobs.push(listen(ccol('logins'), (snap) => { snap.docChanges().forEach((ch) => { if (ch.type === 'removed') delete Cloud.logins[ch.doc.id]; else Cloud.logins[ch.doc.id] = ch.doc.data(); }); rebuildUsers(); }));
  } else S.users = [Cloud.me];
  await Promise.all(jobs);
  // Show a small "offline" notice whenever the live connection drops
  Cloud.unsubs.push(FB.onSnapshot(cref('meta', 'settings'), { includeMetadataChanges: true }, (snap) => {
    document.body.classList.toggle('is-offline', snap.metadata.fromCache);
  }, () => {}));
  if (!S.settings) { await Cloud.signOut('Could not load this café. Please try again.'); return; }
  S.seq = Object.assign({ day: '', n: 0, emp: 0 }, S.seq);
  if (!S.settings.short) S.settings.short = shortCode(S.settings.name);
  Cloud.attached = true; Cloud.loading = false;
  try { localStorage.setItem('cj.cafe', cid); localStorage.setItem('cj.cafeName', S.settings.name); } catch (e) { /* ignore */ }
  Cloud.cafeCode = cid; Cloud.cafeName = S.settings.name;
  FB.updateDoc(cref('members', user.uid), { lastLogin: Date.now() }).catch(() => {});
  closeSheet();
  const keep = restoring && ROLES[role].views.includes(parseHash().view);
  if (!keep) history.replaceState(null, '', `#/${ROLES[role].views[0]}`);
  render();
  if (restoring) return;
  const n = role === 'owner' ? openRequests().length : 0;
  toast(n ? `Welcome, ${m.name} — ${n} login request${n > 1 ? 's' : ''} waiting` : `Welcome, ${m.name}`);
}
Cloud.signOut = async (msg) => {
  Cloud.unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
  Cloud.unsubs = []; Cloud.attached = false; Cloud.loading = false; Cloud.me = null; Cloud.mirror = {}; Cloud.pendingUser = null;
  Session._id = null; Session.locked = false; Session.save(); App.kotSeen = null;
  document.body.classList.remove('is-offline');
  S = emptyState();
  try { await FB.signOut(Cloud.auth); } catch (e) { /* ignore */ }
  closeSheet();
  App.cloudView = 'login';
  history.replaceState(null, '', location.pathname);
  render();
  if (msg) toast(msg);
};
/** After too many wrong passwords on the lock screen: lock the staff login online (one step at a time, as the rules require) */
async function lockLogin(cid, loginId) {
  const ref = FB.doc(Cloud.db, 'cafes', cid, 'logins', loginId);
  try {
    let L = (await FB.getDoc(ref)).data();
    for (let i = 0; L && !L.locked && i < LOCK_AFTER; i++) {
      const failed = (L.failed || 0) + 1, locked = failed >= LOCK_AFTER;
      await FB.updateDoc(ref, locked ? { failed, locked: true, lockedAt: FB.serverTimestamp() } : { failed });
      L = { ...L, failed, locked };
    }
  } catch (e) { /* ignore */ }
}
async function afterSignIn(cid, user) {
  Session.set(user.uid);
  const ms = await FB.getDoc(FB.doc(Cloud.db, 'cafes', cid, 'members', user.uid));
  const m = ms.exists() ? ms.data() : null;
  if (!m || m.active !== true) { await FB.signOut(Cloud.auth); return formError(m ? 'This account has been disabled. Ask the owner.' : 'You no longer have access to this café.'); }
  if (m.mustChange) {
    Cloud.pendingUser = { cid, user, member: m };
    return openSheet(changePwSheet({ id: user.uid, name: m.name, hash: 'online' }, 'first'));
  }
  await attach(cid, user);
}

/* ---------------- screens shown before login ---------------- */
function cloudLoginView() {
  const code = Cloud.cafeCode;
  const name = Cloud.cafeName;
  return `<main class="center-screen login-bg">
    <form class="card login-card" data-form="login" autocomplete="off" novalidate>
      <div class="brand-mark lg">${name ? esc(shortCode(name).slice(0, 3)) : icon('cup')}</div>
      <h1>${esc(name || 'Cafe Journal')}</h1>
      <p class="eyebrow center">Log in</p>
      ${code ? `<div class="cafe-chip">${icon('lock')}<span>Café code <b>${esc(code.toUpperCase())}</b></span><button type="button" class="link-btn" data-act="changeCafe">Change</button></div><input type="hidden" name="cafe" value="${esc(code)}">`
        : `<label class="field"><span>Café code <em>(staff: ask the owner — owners can leave this empty)</em></span><input name="cafe" autocapitalize="characters" spellcheck="false" placeholder="e.g. KK-7F3Q2" style="text-transform:uppercase"></label>`}
      <label class="field"><span>Employee ID — or owner email</span>
        <input name="who" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="e.g. KK26001 or you@email.com" value="${esc(App.loginWho || '')}"></label>
      ${pwField('pw', 'Password')}
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('lock')}<span>Log in</span></button>
      <button class="btn ghost block" type="button" data-act="forgotFromLogin">Forgot password?</button>
      <p class="fine center">New café? <button type="button" class="link-btn" data-act="goSignup">Sign up</button></p>
      <p class="fine center">${icon('lock')} Your café's data is stored securely online. Nothing is kept on this device.</p>
    </form>
    <p class="fine center version">Cafe Journal v${APP_VERSION} · online</p></main>`;
}
function cloudLegacyIntro() {
  const st = Cloud.legacy.settings;
  return `<main class="center-screen onboard"><div class="card onb">
    <div class="brand-mark lg">${icon('upload')}</div>
    <h1>Move ${esc(st.name)} online</h1>
    <p class="muted center">Cafe Journal now keeps your data in a secure online database, so every phone and computer sees the same orders, staff and reports.</p>
    <div class="banner info">${icon('box')}<span>We found <b>${esc(st.name)}</b> saved on this device from before: ${pl(Cloud.legacy.menu.length, 'menu item')}, ${pl(Cloud.legacy.staff.length, 'staff member', 'staff')}, ${pl(Cloud.legacy.orders.length, 'bill')}. Sign up once and it will all be moved online, then removed from this device.</span></div>
    <button class="choice primary" data-act="legacyMove">${icon('upload')}<span><b>Move my café online</b><small>Create the owner account — 3 quick steps</small></span>${icon('right')}</button>
    <button class="choice" data-act="legacyFresh">${icon('plus')}<span><b>Start a new café instead</b><small>The old data stays on this device until you sign up</small></span>${icon('right')}</button>
    <button class="choice" data-act="goLogin">${icon('lock')}<span><b>Log in</b><small>My café is already online</small></span>${icon('right')}</button>
  </div></main>`;
}
Cloud.screen = () => {
  if (Cloud.restoring || Cloud.loading) return `<main class="center-screen"><div class="card onb center"><div class="brand-mark lg">${icon('cup')}</div><h2>Loading your café…</h2><p class="muted">Fetching the latest data securely.</p></div></main>`;
  const v = parseHash().view;
  if (v === 'signup' || v === 'login') { App.cloudView = v; history.replaceState(null, '', location.pathname); }
  if (App.cloudView === 'signup' || (Cloud.legacy && !App.cloudView)) {
    if (App.setup.step === 0 && Cloud.legacy && !App.legacyChoice) return cloudLegacyIntro();
    if (App.setup.step === 0) App.setup.step = 1;
    return Views.setup();
  }
  return cloudLoginView();
};
function cloudSheet(title, sub, body) { return `${sheetHead(title, sub)}${body}`; }
function cloudWarnSheet(code, loginId, failed) {
  const left = LOCK_AFTER - failed;
  return cloudSheet('Having trouble?', loginId.toUpperCase(), `
    <div class="banner warn">${icon('alert')}<span><b>${failed} wrong attempts.</b> ${left === 1 ? 'One more' : left + ' more'} wrong password and this account will be <b>locked</b> until the owner unlocks it.</span></div>
    <p class="muted">Forgot your password? Ask the owner to reset it — they'll see your request on their dashboard.</p>
    <div class="btn-row">${btn('Ask owner to reset', 'cloudRequest', { cls: 'primary', ic: 'send', data: `data-cafe="${esc(code)}" data-login="${esc(loginId)}"` })}${btn('Try again', 'closeSheet', { cls: 'ghost' })}</div>`);
}
function cloudLockedSheet(code, loginId, sent) {
  return cloudSheet('Account locked', loginId.toUpperCase(), `
    <div class="banner bad">${icon('lock')}<span>This account was locked after ${LOCK_AFTER} wrong passwords. Only the owner can unlock it.</span></div>
    ${sent ? `<p class="ok-t">${icon('check')} Request sent to the owner. Please tell them — they'll unlock your account and give you a temporary password.</p>${btn('OK', 'closeSheet', { cls: 'ghost block' })}`
      : btn('Send unlock request to owner', 'cloudRequest', { cls: 'primary block', ic: 'send', data: `data-cafe="${esc(code)}" data-login="${esc(loginId)}"` })}`);
}
async function createRequest(code, loginId) {
  const ls = await FB.getDoc(FB.doc(Cloud.db, 'cafes', code, 'logins', loginId));
  if (!ls.exists()) return false;
  const L = ls.data();
  const id = uid('rq');
  await FB.setDoc(FB.doc(Cloud.db, 'cafes', code, 'requests', id), { id, loginId, userId: L.uid, type: L.locked ? 'unlock' : 'reset', status: 'open', createdAt: Date.now() });
  return L.locked ? 'locked' : true;
}
/** A second Firebase app, used by the owner to create staff accounts without being signed out */
function secondaryAuth() {
  if (!Cloud.sec) {
    Cloud.sec = FB.initializeApp(window.FIREBASE_CONFIG, 'staff-admin');
    Cloud.secAuth = FB.initializeAuth(Cloud.sec, { persistence: FB.inMemoryPersistence });
    if (window.FIREBASE_EMULATOR) FB.connectAuthEmulator(Cloud.secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return Cloud.secAuth;
}
async function createStaffAccount(email, pw) {
  const a = secondaryAuth();
  const cred = await FB.createUserWithEmailAndPassword(a, email, pw);
  const newUid = cred.user.uid;
  await FB.signOut(a);
  return newUid;
}

/** Retry a database read a few times if the connection dropped for a moment */
async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (e.code !== 'unavailable' || i >= tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}
/** Owner gives someone a staff login: creates their sign-in and access records */
Cloud.giveAccess = async ({ staff, name, phone, role, pw }) => {
  const loginId = (staff ? staff.empId : name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const label = loginId.toUpperCase();
  if (!loginId) return { ok: false, name, role, error: 'Add the person under Staff first.' };
  if (Cloud.logins[loginId]) return { ok: false, name, role, error: `Login ID ${label} is already in use.` };
  try {
    const email = staffEmail(loginId, Cloud.cid, 1);
    const newUid = await createStaffAccount(email, pw);
    const b = FB.writeBatch(Cloud.db);
    b.set(cref('members', newUid), { name, phone: phone || '', role, staffId: staff ? staff.id : null, loginId, active: true, mustChange: true, createdAt: Date.now() });
    b.set(cref('logins', loginId), { email, uid: newUid, failed: 0, locked: false, version: 1 });
    await b.commit();
    Cloud.logins[loginId] = { email, uid: newUid, failed: 0, locked: false, version: 1 };
    return { ok: true, name, role, loginId: label };
  } catch (e) { return { ok: false, name, role, error: friendly(e) }; }
};
Cloud.giveAccessMany = async (list) => {
  const out = [];
  for (const L of list) out.push(await Cloud.giveAccess({ staff: L.staff, name: L.staff.name, phone: L.staff.phone, role: L.role, pw: L.pw }));
  return out;
};

/* ---------------- sign up (owner creates the café) ---------------- */
async function cloudSignup(fd, form) {
  keepSetupFields(form);
  const d = App.setup.d;
  const email = String(d.email || '').trim().toLowerCase();
  if (!String(d.owner || '').trim()) return formError('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return formError('Please enter a valid email address — you log in with it.');
  if (!/^[+\d][\d\s-]{6,}$/.test(String(d.phone || '').trim())) return formError('Please enter a valid mobile number.');
  const err = passwordError(fd.get('pw1'), fd.get('pw2'), { name: d.owner }); if (err) return formError(err);
  busy(form, true);
  try {
    const cred = await FB.createUserWithEmailAndPassword(Cloud.auth, email, fd.get('pw1'));
    const user = cred.user;
    const st = {
      name: d.name.trim(), short: d.short, tagline: String(d.tagline || '').trim(), type: d.type || 'cafe',
      currency: d.currency || 'INR', tables: clamp(num(d.tables), 0, 99), tax: num(d.tax),
      openHour: 8, closeHour: 22, accent: 'green', theme: 'auto', footer: 'Thank you, visit again!',
    };
    const moving = App.legacyChoice === 'move' && Cloud.legacy;
    const base = moving ? Object.assign(emptyState(), Cloud.legacy) : emptyState();
    base.settings = moving ? Object.assign({}, base.settings, st) : st;
    base.seq = Object.assign({ day: '', n: 0, emp: 0 }, base.seq);
    const logins = applyDraft(base, d); // the menu, stock and staff typed during sign-up — no sample data
    let cid = '';
    for (let i = 0; i < 5 && !cid; i++) { const c = `${st.short.toLowerCase()}-${randomCode(5)}`; if (!(await FB.getDoc(FB.doc(Cloud.db, 'cafes', c))).exists()) cid = c; }
    await FB.setDoc(FB.doc(Cloud.db, 'cafes', cid), { name: st.name, short: st.short, tagline: st.tagline, ownerUid: user.uid, createdAt: Date.now() });
    const member = { name: d.owner.trim(), phone: String(d.phone).trim(), email, role: 'owner', staffId: null, loginId: null, active: true, mustChange: false, createdAt: Date.now() };
    await FB.setDoc(FB.doc(Cloud.db, 'cafes', cid, 'members', user.uid), member);
    await FB.setDoc(FB.doc(Cloud.db, 'profiles', user.uid), { cafeId: cid });
    // Upload everything
    S = Object.assign(emptyState(), plain(base)); S.users = []; S.requests = []; delete S.recovery;
    S.seq = Object.assign({ day: '', n: 0, emp: 0 }, S.seq);
    Cloud.cid = cid; Cloud.me = { ...member, id: user.uid }; Session._id = user.uid; Session._last = Date.now(); Cloud.mirror = {};
    await Cloud.flush();
    if (moving) { try { localStorage.removeItem(DB_KEY); } catch (e) { /* ignore */ } Cloud.legacy = null; }
    FB.sendEmailVerification(user).catch(() => {});
    App.setup = { step: 0, mode: 'signup', d: newDraft() }; App.legacyChoice = null; App.cloudView = 'login';
    await attach(cid, user);
    const results = await Cloud.giveAccessMany(logins);
    openSheet(`${sheetHead('Your café is online', st.name)}
      <p>Everything is now stored securely online${moving ? ' — and removed from this device' : ''}.</p>
      <p class="muted">Your <b>café code</b> — staff type it the first time they log in on a phone:</p>
      <div class="recovery-code">${esc(cid.toUpperCase())}</div>
      <p class="muted sm">You log in with <b>${esc(email)}</b>. Forgot your password? Use "Forgot password" on the login page and a reset link is emailed to you.</p>
      ${loginsSummary(results)}
      ${btn('Got it', 'closeSheet', { cls: 'primary block' })}`);
  } catch (e) { formError(friendly(e)); } finally { busy(form, false); }
}

/* ---------------- overrides (only in online mode) ---------------- */
function installOverrides() {
  // Never write café data to the device
  persist = function () { if (Cloud.attached || Cloud.me) Cloud.push(); return true; };
  loadState = function () { return S; };
  // The signed-in person comes from Firebase
  Session.account = function () { return Cloud.me && Cloud.attached ? Cloud.me : null; };
  const baseSet = Session.set.bind(Session);
  Session.set = function (id) { if (id) return baseSet(id); if (Cloud.me || Cloud.auth.currentUser) Cloud.signOut(); else baseSet(null); };
  // After a sheet closes, show changes that arrived from other devices meanwhile
  const origClose = closeSheet;
  closeSheet = function () { origClose(); if (Cloud.pending) { Cloud.pending = false; setTimeout(render, 0); } };
  Actions.closeSheet = closeSheet;

  const origMonthNav = Actions.monthNav;
  const origSetupStep = Forms.setupStep;
  const origSetupBack = Actions.setupBack;

  Object.assign(Actions, {
    goSignup() { App.cloudView = 'signup'; App.setup.step = 0; render(); },
    goLogin() { App.cloudView = 'login'; render(); },
    legacyMove() {
      const st = Cloud.legacy.settings;
      App.legacyChoice = 'move';
      App.setup.mode = 'signup';
      Object.assign(App.setup.d, newDraft(), { name: st.name, short: st.short || shortCode(st.name), type: st.type, tagline: st.tagline || '', currency: st.currency, tables: st.tables, tax: st.tax });
      App.setup.step = 1; render();
    },
    legacyFresh() { App.legacyChoice = 'fresh'; App.setup = { step: 1, mode: 'signup', d: newDraft() }; render(); },
    setupBack(el) { if (App.setup.step <= 1 && App.setup.mode !== 'later') { App.cloudView = Cloud.legacy ? 'signup' : 'login'; App.setup.step = 0; App.legacyChoice = null; return render(); } origSetupBack(el); },
    changeCafe() { Cloud.cafeCode = ''; Cloud.cafeName = ''; try { localStorage.removeItem('cj.cafe'); localStorage.removeItem('cj.cafeName'); } catch (e) { /* ignore */ } render(); },
    monthNav(el) { origMonthNav(el); Cloud.ensureMonth(App.ui.month); },
    async forgotFromLogin() {
      const form = $('form[data-form=login]');
      const who = String(form?.who.value || '').trim();
      const code = String(form?.cafe.value || Cloud.cafeCode || '').trim().toLowerCase();
      App.loginWho = who;
      if (!who) return formError('Type your Employee ID (or owner email) first, then tap Forgot password.');
      if (who.includes('@')) {
        try { await FB.sendPasswordResetEmail(Cloud.auth, who); } catch (e) { /* same answer either way */ }
        return openSheet(cloudSheet('Forgot password', 'Check your email', `<p>If <b>${esc(who)}</b> is an owner account, we've emailed a link to set a new password.</p><p class="muted">Check spam too. The link works for a limited time.</p>${btn('OK', 'closeSheet', { cls: 'primary block' })}`));
      }
      if (!code) return formError('Enter your café code first (ask the owner).');
      try { await createRequest(code, who.toLowerCase()); } catch (e) { /* same answer either way */ }
      openSheet(requestSentSheet());
    },
    async cloudRequest(el) {
      try { await createRequest(el.dataset.cafe, el.dataset.login); } catch (e) { return toast(friendly(e)); }
      openSheet(cloudLockedSheet(el.dataset.cafe, el.dataset.login, true).replace('Account locked', 'Request sent'));
    },
    myPin() { if (Cloud.me) openSheet(changePwSheet({ id: Cloud.me.id, name: Cloud.me.name, hash: 'online' }, 'self')); },
    async unlockUser(el) {
      const u = userById(el.dataset.id); if (!u || !u.loginId) return;
      try { await FB.updateDoc(cref('logins', u.loginId), { locked: false, failed: 0 }); } catch (e) { return toast(friendly(e)); }
      closeRequests(u, 'done'); save(); toast(`${u.name} unlocked — they can log in with their password`);
    },
    async accessDel(el) {
      const u = userById(el.dataset.id); if (!u) return;
      if (u.id === Cloud.me.id) return formError("You can't remove your own access.");
      if (u.role === 'owner' && activeOwners().length <= 1) return formError('Keep at least one owner.');
      if (!confirm(`Remove login access for ${u.name}? Their staff record stays.`)) return;
      const b = FB.writeBatch(Cloud.db);
      b.delete(cref('members', u.id)); if (u.loginId) b.delete(cref('logins', u.loginId));
      try { await b.commit(); } catch (e) { return formError(friendly(e)); }
      closeRequests(u, 'dismissed'); closeSheet(); save();
    },
    setPwOpen(el) {
      const u = userById(el.dataset.id); if (!u) return;
      if (!u.loginId) return toast('Owners who log in with email reset their password with "Forgot password" on the login page.');
      openSheet(setPwSheet(u));
    },
    async recoveryNew() { toast('Online accounts use email password reset — no recovery code needed.'); },
    exportData() { openSheet(backupSheet()); },
    async copyRules() {
      try {
        const txt = await (await fetch('../firestore.rules', { cache: 'no-store' })).text();
        if (!txt.includes('service cloud.firestore')) throw new Error('not found');
        await navigator.clipboard.writeText(txt);
        toast('New rules copied');
      } catch (e) { return toast('Could not copy automatically — open firestore.rules in the GitHub repo and copy it.'); }
      window.open(`https://console.firebase.google.com/project/${encodeURIComponent(window.FIREBASE_CONFIG.projectId)}/firestore/rules`, '_blank', 'noopener');
    },
  });

  Object.assign(Forms, {
    async unlock(fd, form) {
      const u = Cloud.me, user = Cloud.auth.currentUser;
      if (!u || !user) return Cloud.signOut();
      busy(form, true);
      try {
        await FB.reauthenticateWithCredential(user, FB.EmailAuthProvider.credential(user.email, String(fd.get('pw') || '')));
        Session.unlock(); render();
      } catch (e) {
        if (!BAD_PASSWORD.includes(e.code)) return formError(friendly(e));
        Session.fails += 1; Session.save();
        if (Session.fails >= LOCK_AFTER) {
          const { cid } = Cloud, loginId = u.loginId;
          await Cloud.signOut();
          if (loginId) { await lockLogin(cid, loginId); return openSheet(cloudLockedSheet(cid, loginId, false)); }
          return toast('Too many wrong passwords — please log in again.');
        }
        formError(`Wrong password — ${LOCK_AFTER - Session.fails} ${LOCK_AFTER - Session.fails === 1 ? 'try' : 'tries'} left before the account locks.`);
      } finally { busy(form, false); if (form.pw) form.pw.value = ''; }
    },
    async login(fd, form) {
      const who = String(fd.get('who') || '').trim(), pw = String(fd.get('pw') || '');
      const code = String(fd.get('cafe') || Cloud.cafeCode || '').trim().toLowerCase();
      App.loginWho = who;
      if (!who || !pw) return formError('Enter your Employee ID (or owner email) and password.');
      busy(form, true);
      try {
        if (who.includes('@')) {
          const cred = await FB.signInWithEmailAndPassword(Cloud.auth, who, pw);
          const prof = await FB.getDoc(FB.doc(Cloud.db, 'profiles', cred.user.uid));
          if (!prof.exists()) { await FB.signOut(Cloud.auth); return formError('This email is not an owner of any café. Staff: log in with your Employee ID.'); }
          return await afterSignIn(prof.data().cafeId, cred.user);
        }
        if (!code) return formError('Enter your café code (ask the owner).');
        const loginId = who.toLowerCase();
        const lref = FB.doc(Cloud.db, 'cafes', code, 'logins', loginId);
        const ls = await FB.getDoc(lref);
        if (!ls.exists()) { await sleep(500); return formError('Login details are not right.'); }
        const L = ls.data();
        if (L.locked) return openSheet(cloudLockedSheet(code, loginId, false));
        let cred;
        try { cred = await FB.signInWithEmailAndPassword(Cloud.auth, L.email, pw); }
        catch (e) {
          if (!BAD_PASSWORD.includes(e.code)) throw e;
          const failed = (L.failed || 0) + 1, locked = failed >= LOCK_AFTER;
          await FB.updateDoc(lref, locked ? { failed, locked: true, lockedAt: FB.serverTimestamp() } : { failed }).catch(() => {});
          if (locked) return openSheet(cloudLockedSheet(code, loginId, false));
          if (failed >= WARN_AFTER) return openSheet(cloudWarnSheet(code, loginId, failed));
          return formError('Login details are not right.');
        }
        if (L.failed) await FB.updateDoc(lref, { failed: 0 }).catch(() => {});
        await afterSignIn(code, cred.user);
      } catch (e) { formError(friendly(e)); } finally { busy(form, false); if (form.pw) form.pw.value = ''; }
    },
    async newPw(fd, form) {
      const pw = fd.get('pw1'), pw2 = fd.get('pw2'), mode = fd.get('mode');
      const user = mode === 'self' ? Cloud.auth.currentUser : Cloud.pendingUser?.user;
      if (!user) return;
      const err = passwordError(pw, pw2, { name: mode === 'self' ? Cloud.me?.name : Cloud.pendingUser?.member.name }); if (err) return formError(err);
      busy(form, true);
      try {
        if (mode === 'self') {
          await FB.reauthenticateWithCredential(user, FB.EmailAuthProvider.credential(user.email, String(fd.get('old') || '')));
          await FB.updatePassword(user, pw);
          closeSheet(); return toast('Password changed');
        }
        await FB.updatePassword(user, pw);
        const { cid } = Cloud.pendingUser;
        await FB.updateDoc(FB.doc(Cloud.db, 'cafes', cid, 'members', user.uid), { mustChange: false, lastLogin: Date.now() });
        Cloud.pendingUser = null;
        await attach(cid, user);
      } catch (e) { formError(BAD_PASSWORD.includes(e.code) ? 'Current password is not right.' : friendly(e)); } finally { busy(form, false); }
    },
    async setupStep(fd, form) { if (App.setup.mode === 'later' || stepName() !== 'owner') return origSetupStep(fd, form); return cloudSignup(fd, form); },
    async access(fd, form) {
      const id = fd.get('id'), staffId = fd.get('staffId') || '', role = fd.get('role') || 'waiter';
      const p = staffId ? byId(S.staff, staffId) : null;
      const name = (p ? p.name : String(fd.get('name') || '')).trim();
      const phone = (p ? p.phone || '' : String(fd.get('phone') || '')).trim();
      if (!name) return formError('Pick an employee or type a name.');
      if (S.users.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return formError('Someone already has that name — add a surname or initial.');
      const u = userById(id);
      busy(form, true);
      try {
        if (u) {
          const active = !!fd.get('active');
          if (u.role === 'owner' && (role !== 'owner' || !active) && activeOwners().length <= 1) return formError('Keep at least one active owner.');
          if (u.id === Cloud.me.id && (!active || role !== u.role)) return formError("You can't change your own role or disable yourself.");
          await FB.updateDoc(cref('members', u.id), { name, phone, role, active, staffId: staffId || null });
          closeSheet(); return toast('Saved');
        }
        const err = passwordError(fd.get('pw1'), fd.get('pw2'), { name }); if (err) return formError(err);
        const r = await Cloud.giveAccess({ staff: p, name, phone, role, pw: fd.get('pw1') });
        if (!r.ok) return formError(r.error);
        closeSheet();
        toast(`${name} can now log in with ${r.loginId} and café code ${Cloud.cid.toUpperCase()}`);
      } catch (e) { formError(friendly(e)); } finally { busy(form, false); }
    },
    async setPw(fd, form) {
      const u = userById(fd.get('id')); if (!u || !u.loginId) return;
      const err = passwordError(fd.get('pw1'), fd.get('pw2'), u); if (err) return formError(err);
      busy(form, true);
      try {
        const L = Cloud.logins[u.loginId] || (await withRetry(() => FB.getDoc(cref('logins', u.loginId)))).data() || {};
        const version = (L.version || 1) + 1;
        const email = staffEmail(u.loginId, Cloud.cid, version);
        const newUid = await createStaffAccount(email, fd.get('pw1'));
        const m = { ...Cloud.members[u.id] };
        const b = FB.writeBatch(Cloud.db);
        b.delete(cref('members', u.id)); // the old sign-in no longer opens anything
        b.set(cref('members', newUid), { ...m, mustChange: true });
        b.set(cref('logins', u.loginId), { email, uid: newUid, failed: 0, locked: false, version });
        await b.commit();
        closeRequests(u, 'done'); save();
        closeSheet(); toast(`New temporary password set for ${u.name}`);
      } catch (e) { formError(friendly(e)); } finally { busy(form, false); }
    },
  });
}
