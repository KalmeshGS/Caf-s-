'use strict';
/* =========================================================
   Accounts & security
   - Login page: Employee ID / phone / name + password. Nobody is listed.
   - Passwords are never stored: only a salted PBKDF2-SHA256 hash (150k rounds).
   - The owner types each person's first password; they must change it at first login.
   - 3 wrong passwords  -> pop-up offering "ask the owner to reset"
     4 wrong passwords  -> account LOCKED until the owner unlocks it
   - Reset / unlock requests appear on the Owner dashboard and in Team & access.
   - Owner recovery code (stored hashed) for a forgotten or locked owner account.
   - Backups are encrypted with AES-256-GCM using a passphrase.
   ========================================================= */

App.loginFails = {}; // rate-limit for unknown login names (memory only)
const ROLE_ORDER = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
const PW_MIN = 6;
const WARN_AFTER = 3;
const LOCK_AFTER = 4;
const KDF_ROUNDS = 150000;

/* ---------------- crypto helpers (Web Crypto) ---------------- */
const te = new TextEncoder();
function b64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function randBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
async function kdfBits(secret, salt, rounds = KDF_ROUNDS) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}
function sameText(a, b) { // constant-time compare
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hashSecret(secret) { const salt = randBytes(16); return { salt: b64(salt), rounds: KDF_ROUNDS, hash: await kdfBits(secret, salt) }; }
async function checkSecret(rec, secret) { return !!rec && !!rec.hash && sameText(await kdfBits(secret, unb64(rec.salt), rec.rounds || KDF_ROUNDS), rec.hash); }

async function setPassword(u, pw) {
  const h = await hashSecret(pw);
  Object.assign(u, { salt: h.salt, rounds: h.rounds, hash: h.hash, pwChangedAt: Date.now() });
  delete u.pin;
}
async function checkPassword(u, pw) {
  if (u.hash) return checkSecret(u, pw);
  if (u.pin != null) return pw === String(u.pin); // account from an older version; must set a password next
  return false;
}
function passwordError(pw, pw2, u) {
  pw = String(pw || '');
  if (pw.length < PW_MIN) return `Use at least ${PW_MIN} characters.`;
  if (pw.length > 64) return 'Keep it under 64 characters.';
  if (pw !== pw2) return "The two passwords don't match.";
  if (/^(.)\1+$/.test(pw)) return "Too easy — don't repeat one character.";
  if (['123456', '1234567', '12345678', '123456789', 'password', 'qwerty', '111111', '000000', 'abc123', '654321', 'password1', '123123'].includes(pw.toLowerCase())) return 'That password is too common — pick something harder to guess.';
  const low = pw.toLowerCase();
  if (u && u.name && low === String(u.name).toLowerCase()) return "Don't use your name as the password.";
  if (S.settings && low === String(S.settings.name).toLowerCase()) return "Don't use the café name as the password.";
  return '';
}
async function newRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = randBytes(12);
  const raw = Array.from(a, (x) => chars[x % chars.length]).join('');
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  S.recovery = { ...(await hashSecret(code.replace(/-/g, ''))), createdAt: Date.now() };
  persist();
  return code;
}
async function checkRecovery(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!S.recovery) return false;
  if (S.recovery.hash) return checkSecret(S.recovery, c);
  if (S.recovery.code) return c === S.recovery.code.replace(/-/g, ''); // older plain code
  return false;
}

/* ---------------- encrypted backups (AES-256-GCM) ---------------- */
async function aesKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KDF_ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBackup(obj, pass) {
  const salt = randBytes(16), iv = randBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(pass, salt), te.encode(JSON.stringify(obj)));
  return { format: 'cafe-journal-backup', encrypted: true, v: 1, cafe: obj.settings?.name || '', at: new Date().toISOString(), salt: b64(salt), iv: b64(iv), data: b64(data) };
}
async function decryptBackup(file, pass) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, await aesKey(pass, unb64(file.salt)), unb64(file.data));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------------- people helpers ---------------- */
const userById = (id) => byId(S.users, id);
const activeUsers = () => S.users.filter((u) => u.active !== false);
const activeOwners = () => activeUsers().filter((u) => u.role === 'owner');
const currentUser = () => Session.user();
const staffOf = (u) => (u && u.staffId ? byId(S.staff, u.staffId) : null);
const empIdOf = (u) => staffOf(u)?.empId || '';
const digits = (p) => String(p || '').replace(/\D/g, '');
const openRequests = () => S.requests.filter((r) => r.status === 'open' && userById(r.userId));
function userStatus(u) {
  if (u.active === false) return ['Disabled', 'off'];
  if (u.locked) return ['Locked', 'bad'];
  if (!u.hash) return ['Must set password', 'warn'];
  if (u.mustChange) return ['Temporary password', 'warn'];
  return ['Active', 'ok'];
}
/** Find an active account by Employee ID, name (any case) or phone (last 10 digits) */
function findLogin(who) {
  const w = String(who || '').trim().toLowerCase();
  if (!w) return null;
  const d = digits(w);
  const list = activeUsers();
  return list.find((u) => empIdOf(u).toLowerCase() === w)
    || list.find((u) => String(u.name).trim().toLowerCase() === w)
    || (d.length >= 6 ? list.find((u) => digits(u.phone) && digits(u.phone).slice(-10) === d.slice(-10)) : null)
    || null;
}
function raiseRequest(u, type) {
  const open = openRequests().find((r) => r.userId === u.id);
  if (open) { if (type === 'unlock') open.type = 'unlock'; persist(); return open; }
  const r = { id: uid('rq'), userId: u.id, type, createdAt: Date.now(), status: 'open' };
  S.requests.push(r); S.requests = S.requests.slice(-100); persist();
  return r;
}
function closeRequests(u, how) { S.requests.forEach((r) => { if (r.userId === u.id && r.status === 'open') { r.status = how; r.closedAt = Date.now(); } }); }
function avatarHtml(u, cls = 'sm') {
  const p = staffOf(u);
  if (p?.photo) return `<img class="avatar ${cls} photo" src="${esc(p.photo)}" alt="">`;
  return `<span class="avatar ${cls}" style="background:${ROLES[u.role].color}">${esc(initials(u.name))}</span>`;
}
const pwField = (name, label, extra = '') => `<label class="field"><span>${label}</span>
  <span class="pw-wrap"><input name="${name}" type="password" maxlength="64" autocomplete="${name === 'old' || name === 'pw' ? 'current-password' : 'new-password'}" required ${extra}>
  <button type="button" class="pw-eye" data-act="togglePw" aria-label="Show password">${icon('eye')}</button></span></label>`;

/* ---------------- Login page ---------------- */
Views.login = () => {
  const st = S.settings;
  const legacyOwner = activeOwners().find((u) => !u.hash && u.pin === DEFAULT_PIN);
  return `<main class="center-screen login-bg">
    <form class="card login-card" data-form="login" autocomplete="off" novalidate>
      <div class="brand-mark lg">${esc((st.short || shortCode(st.name)).slice(0, 3))}</div>
      <h1>${esc(st.name)}</h1>
      ${st.tagline ? `<p class="muted center">${esc(st.tagline)}</p>` : ''}
      <p class="eyebrow center">Staff log in</p>
      ${parseHash().view === 'signup' ? `<div class="banner info">${icon('check')}<span><b>${esc(st.name)}</b> is already set up on this device. Log in below. (To register a different café, the owner can use Settings → Data → Erase.)</span></div>` : ''}
      <label class="field"><span>Employee ID, phone or name</span>
        <input name="who" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus placeholder="e.g. ${esc((st.short || 'KK') + String(new Date().getFullYear()).slice(-2))}001" value="${esc(App.loginWho || '')}"></label>
      ${pwField('pw', 'Password')}
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('lock')}<span>Log in</span></button>
      <button class="btn ghost block" type="button" data-act="forgotFromLogin">Forgot password?</button>
      ${legacyOwner ? `<p class="fine center">First time after the update? Type <b>${esc(legacyOwner.name)}</b> and <b>${esc(DEFAULT_PIN)}</b>, then set a proper password.</p>` : ''}
      <p class="fine center">${icon('lock')} Accounts lock after ${LOCK_AFTER} wrong passwords. Only the owner can unlock them.</p>
    </form>
    <p class="fine center version">Cafe Journal v${APP_VERSION}</p></main>`;
};

function changePwSheet(u, mode) {
  const title = mode === 'self' ? 'Change my password' : 'Set your own password';
  const note = mode === 'self' ? 'Choose a new password only you know.'
    : !u.hash ? 'Cafe Journal now uses passwords instead of 4-digit PINs. Please choose your password.'
      : 'This is a temporary password from the owner. Please replace it with one only you know.';
  return `${sheetHead(u.name, title)}
  <form data-form="newPw" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${u.id}"><input type="hidden" name="mode" value="${mode}">
    <p class="muted">${esc(note)}</p>
    ${mode === 'self' ? pwField('old', 'Current password') : ''}
    ${pwField('pw1', `New password <em>(at least ${PW_MIN} characters)</em>`)}
    ${pwField('pw2', 'Repeat new password')}
    <p class="neg sm" id="form-err" role="alert"></p>
    <button class="btn primary block" type="submit">${icon('check')}<span>Save password${mode === 'self' ? '' : ' & continue'}</span></button>
  </form>`;
}
function warnSheet(u) {
  const left = LOCK_AFTER - (u.failed || 0);
  return `${sheetHead('Having trouble?', u.name)}
    <div class="banner warn">${icon('alert')}<span><b>${u.failed} wrong attempts.</b> ${left === 1 ? 'One more' : left + ' more'} wrong password and this account will be <b>locked</b> until the owner unlocks it.</span></div>
    ${u.role === 'owner' ? `<p class="muted">Forgot it? Use your owner recovery code instead.</p>
      <div class="btn-row">${btn('Use recovery code', 'ownerRecoverOpen', { cls: 'primary', data: `data-id="${u.id}"` })}${btn('Try again', 'closeSheet', { cls: 'ghost' })}</div>`
      : `<p class="muted">Forgot your password? Ask the owner to reset it — they'll see your request on their dashboard.</p>
      <div class="btn-row">${btn('Ask owner to reset', 'requestReset', { cls: 'primary', ic: 'send', data: `data-id="${u.id}"` })}${btn('Try again', 'closeSheet', { cls: 'ghost' })}</div>`}`;
}
function lockedSheet(u) {
  const req = openRequests().find((r) => r.userId === u.id);
  return `${sheetHead('Account locked', u.name)}
    <div class="banner bad">${icon('lock')}<span>This account was locked after ${LOCK_AFTER} wrong passwords${u.lockedAt ? ` (${esc(fmtTime(u.lockedAt))})` : ''}. ${u.role === 'owner' ? 'Unlock it with your owner recovery code.' : 'Only the owner can unlock it.'}</span></div>
    ${u.role === 'owner' ? recoveryForm(u)
      : req ? `<p class="ok-t">${icon('check')} Request sent to the owner at ${esc(fmtTime(req.createdAt))}. Please tell them — they'll unlock your account and give you a temporary password.</p>${btn('OK', 'closeSheet', { cls: 'ghost block' })}`
        : `${btn('Send unlock request to owner', 'requestReset', { cls: 'primary block', ic: 'send', data: `data-id="${u.id}"` })}`}`;
}
function requestSentSheet() {
  return `${sheetHead('Forgot password', 'Request sent')}
    <p>If that account exists, the owner will now see a <b>password reset request</b> on their dashboard.</p>
    <p class="muted">Tell the owner. They'll give you a temporary password, and you'll choose your own when you log in.</p>
    ${btn('OK', 'closeSheet', { cls: 'primary block' })}`;
}
function recoveryForm(u) {
  return `<form data-form="ownerRecover" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${u.id}">
    <label class="field"><span>Owner recovery code</span><input name="code" maxlength="16" required placeholder="XXXX-XXXX-XXXX" style="text-transform:uppercase" autocapitalize="characters" spellcheck="false"></label>
    ${pwField('pw1', `New password <em>(at least ${PW_MIN} characters)</em>`)}
    ${pwField('pw2', 'Repeat new password')}
    <p class="neg sm" id="form-err" role="alert"></p>
    <button class="btn primary block" type="submit">${icon('check')}<span>Unlock & set new password</span></button>
    ${activeOwners().length > 1 ? '<p class="fine">Another owner can also unlock you from Team & access.</p>' : ''}
  </form>`;
}
function recoveryShownSheet(code, then) {
  App.afterRecovery = then;
  return `${sheetHead('Owner recovery code', 'Write this down')}
    <p class="muted">If you forget your owner password or your account gets locked, this code unlocks it. Keep it somewhere safe and private — it is shown <b>only now</b>.</p>
    <div class="recovery-code">${esc(code)}</div>
    <button class="btn primary block" data-act="recoveryDone">${icon('check')}<span>I've written it down</span></button>`;
}

/* ---------------- Requests card (Owner dashboard + Team) ---------------- */
function requestsCard() {
  if (Session.role() !== 'owner') return '';
  const list = openRequests();
  if (!list.length) return '';
  return `<section class="card req-card">
    <div class="card-head">${eyebrow('Login help requests')}<span class="badge warm">${list.length} waiting</span></div>
    ${list.map((r) => {
      const u = userById(r.userId);
      return `<div class="req-row">
        <div class="with-av">${avatarHtml(u)}
          <span><strong>${esc(u.name)} <small class="muted">· ${esc(ROLES[u.role].label)}${empIdOf(u) ? ' · ' + esc(empIdOf(u)) : ''}</small></strong>
          <small>${u.locked ? '<span class="neg">Locked after wrong passwords</span>' : 'Forgot password'} · ${esc(fmtDate(r.createdAt, { day: 'numeric', month: 'short' }))} ${esc(fmtTime(r.createdAt))}</small></span></div>
        <div class="btn-row tight">
          ${btn(u.locked ? 'Unlock & set password' : 'Set new password', 'setPwOpen', { cls: 'primary sm', ic: 'lock', data: `data-id="${u.id}"` })}
          ${u.locked ? btn('Unlock only', 'unlockUser', { cls: 'ghost sm', data: `data-id="${u.id}"` }) : ''}
          <button class="icon-btn sm" data-act="dismissRequest" data-id="${r.id}" aria-label="Dismiss request" title="Dismiss">${icon('x')}</button>
        </div></div>`;
    }).join('')}
    <p class="fine">Make sure it's really them (in person or by phone) before giving a new password.</p>
  </section>`;
}

/* ---------------- Team & access (owner) ---------------- */
Views.team = () => {
  const me = currentUser();
  const f = App.ui.teamFilter || 'all';
  const all = S.users.slice().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const needs = (u) => u.locked || !u.hash || u.mustChange;
  const list = f === 'all' ? all : f === 'attention' ? all.filter(needs) : all.filter((u) => u.role === f);
  const chips = [['all', `All (${all.length})`], ...ROLE_ORDER.map((r) => [r, `${ROLES[r].label} (${all.filter((u) => u.role === r).length})`]), ['attention', `Needs attention (${all.filter(needs).length})`]];
  return `${pageHead('Team & access', 'Who can log in', btn('Give login access', 'accessAdd', { cls: 'primary', ic: 'plus' }))}
    ${requestsCard()}
    ${typeof Cloud !== 'undefined' && Cloud.on ? `<div class="banner info">${icon('lock')}<span>Café code <b class="emp-id">${esc(Cloud.cid.toUpperCase())}</b> — staff type it with their Employee ID the first time they log in on a phone.</span></div>` : ''}
    <div class="chip-row scroll">${chips.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="teamFilter" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    <section class="card">
      ${list.length ? list.map((u) => {
        const [st, tone] = userStatus(u);
        return `<div class="acct-row ${u.active === false ? 'off' : ''}">
          <div class="with-av">${avatarHtml(u)}
            <span><strong>${esc(u.name)}${u.id === me?.id ? ' <small class="muted">(you)</small>' : ''}</strong>
            <small>${empIdOf(u) ? esc(empIdOf(u)) + ' · ' : ''}${u.phone ? esc(u.phone) : 'No phone'}${u.lastLogin ? ' · last login ' + esc(fmtDate(u.lastLogin, { day: 'numeric', month: 'short' })) : ''}</small></span></div>
          <span class="role-tag" style="--c:${ROLES[u.role].color}">${esc(ROLES[u.role].label)}</span>
          <span class="status ${tone}">${esc(st)}</span>
          <div class="btn-row tight">
            ${u.locked ? btn('Unlock', 'unlockUser', { cls: 'ghost sm', ic: 'lock', data: `data-id="${u.id}"` }) : ''}
            ${u.id !== me?.id ? btn('Set password', 'setPwOpen', { cls: 'ghost sm', data: `data-id="${u.id}"` }) : btn('Change my password', 'myPin', { cls: 'ghost sm' })}
            <button class="icon-btn sm" data-act="accessEdit" data-id="${u.id}" aria-label="Edit ${esc(u.name)}">${icon('edit')}</button>
          </div></div>`;
      }).join('') : empty('No one here.')}
    </section>
    <div class="grid-2">
      <section class="card">${eyebrow('What each role can open')}
        ${ROLE_ORDER.map((r) => `<div class="line-row"><span class="role-tag" style="--c:${ROLES[r].color}">${esc(ROLES[r].label)}</span><small class="muted right">${esc(ROLES[r].views.map((v) => VIEWS[v].label).join(' · '))}</small></div>`).join('')}
      </section>
      <section class="card">${eyebrow('Security')}
        <ul class="sec-list">
          <li>${icon('check')} Passwords are stored only as salted hashes — nobody, not even the owner, can read them.</li>
          <li>${icon('check')} ${WARN_AFTER} wrong tries → reset prompt · ${LOCK_AFTER} wrong tries → account locked until you unlock it.</li>
          <li>${icon('check')} The app locks itself after ${LOCK_AFTER_MIN} minutes without use.</li>
          <li>${icon('check')} Personal &amp; KYC details are visible to owners only.</li>
        </ul>
        ${typeof Cloud !== 'undefined' && Cloud.on ? `<p class="muted sm">${icon('check')} Online: passwords are managed by Firebase Authentication and every read/write is checked by security rules on the server. Owners reset a forgotten password by email.</p>`
        : `<p class="muted sm">Owner recovery code: ${S.recovery ? `created ${esc(fmtDate(S.recovery.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }))}` : '<span class="neg">not created</span>'}</p>
        <div class="btn-row">${btn(S.recovery ? 'New recovery code' : 'Create recovery code', 'recoveryNew', { cls: 'ghost sm', ic: 'lock' })}</div>`}
      </section>
    </div>`;
};

function accessForm(u = {}, presetStaffId = '') {
  const isNew = !u.id;
  const linked = new Set(S.users.filter((x) => x.staffId && x.id !== u.id).map((x) => x.staffId));
  const options = S.staff.filter((p) => p.active !== false && !linked.has(p.id));
  const sel = u.staffId || presetStaffId;
  return `${sheetHead('Team & access', isNew ? 'Give login access' : `Edit · ${u.name}`)}
  <form data-form="access" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${esc(u.id || '')}">
    <label class="field"><span>Employee</span>
      <select name="staffId" data-change="accessStaff">
        <option value="">— Not on the staff list (type details below) —</option>
        ${options.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.empId)} · ${esc(p.name)} · ${esc(p.role || '')}</option>`).join('')}
      </select></label>
    <div class="row-2 manual-fields" ${sel ? 'hidden' : ''}>
      <label class="field"><span>Name</span><input name="name" maxlength="40" value="${esc(u.staffId ? '' : u.name || '')}"></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="20" value="${esc(u.staffId ? '' : u.phone || '')}"></label>
    </div>
    ${!options.length && isNew ? `<p class="muted sm">Tip: add people under <a class="link" href="#/staff" data-act="closeSheet">Staff</a> first — their details and employee ID are picked up here.</p>` : ''}
    <div class="field"><span>Role — what they can open</span><div class="chip-row">${ROLE_ORDER.map((k) => `<label class="chip-radio"><input type="radio" name="role" value="${k}" ${(u.role || 'waiter') === k ? 'checked' : ''}><span>${esc(ROLES[k].label)}</span></label>`).join('')}</div></div>
    ${isNew ? `${pwField('pw1', `First password <em>(you type it, at least ${PW_MIN} characters)</em>`)}
      ${pwField('pw2', 'Repeat first password')}
      <p class="muted sm">Give this password to them privately. They must change it the first time they log in.</p>`
      : `<label class="check"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}><span>Can log in (untick to disable)</span></label>`}
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions">${!isNew && u.id !== currentUser()?.id ? btn('Remove access', 'accessDel', { cls: 'danger-ghost', ic: 'trash', data: `data-id="${u.id}"` }) : '<span></span>'}
      <button class="btn primary" type="submit">${isNew ? 'Give access' : 'Save'}</button></div>
  </form>`;
}
function setPwSheet(u) {
  return `${sheetHead(u.locked ? 'Unlock & set password' : 'Set a new password', u.name)}
  <form data-form="setPw" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${u.id}">
    <p class="muted">Type a temporary password and give it to ${esc(u.name)} privately. ${u.locked ? 'This also unlocks the account. ' : ''}They'll be asked to choose their own at the next login.</p>
    ${pwField('pw1', `Temporary password <em>(at least ${PW_MIN} characters)</em>`)}
    ${pwField('pw2', 'Repeat it')}
    <p class="neg sm" id="form-err" role="alert"></p>
    <button class="btn primary block" type="submit">${icon('check')}<span>Save${u.locked ? ' & unlock' : ''}</span></button>
  </form>`;
}

/* ---------------- helpers ---------------- */
function formError(msg) { const e = ($('#sheet').hidden ? null : $('#sheet #form-err')) || $('#form-err'); if (e) e.textContent = msg; else toast(msg); }
function busy(form, on) { const b = form && form.querySelector('button[type=submit]'); if (b) { b.disabled = on; b.classList.toggle('loading', on); } }
function loginAs(u) {
  Session.set(u.id);
  u.lastLogin = Date.now(); u.failed = 0; persist();
  App.loginWho = '';
  closeSheet();
  history.replaceState(null, '', `#/${ROLES[u.role].views[0]}`);
  render();
  const n = u.role === 'owner' ? openRequests().length : 0;
  toast(n ? `Welcome, ${u.name} — ${n} login request${n > 1 ? 's' : ''} waiting` : `Welcome, ${u.name}`);
}
async function finishPwSet(u) {
  if (u.role === 'owner' && !(S.recovery && S.recovery.hash)) openSheet(recoveryShownSheet(await newRecoveryCode(), u.id));
  else loginAs(u);
}
function backupSheet() {
  return `${sheetHead('Backup', 'Download encrypted backup')}
  <form data-form="backup" class="form" autocomplete="off">
    <p class="muted">The backup file is locked with a passphrase. You'll need it to restore — <b>it can't be recovered if you forget it.</b></p>
    ${pwField('pw1', 'Backup passphrase <em>(at least 8 characters)</em>', 'minlength="8"')}
    ${pwField('pw2', 'Repeat passphrase')}
    <p class="neg sm" id="form-err" role="alert"></p>
    <button class="btn primary block" type="submit">${icon('download')}<span>Download backup</span></button>
  </form>`;
}
function restorePassSheet() {
  return `${sheetHead('Restore', 'Enter backup passphrase')}
  <form data-form="restorePass" class="form" autocomplete="off">
    <p class="muted">Backup of <b>${esc(App.pendingRestore?.cafe || 'your café')}</b>${App.pendingRestore?.at ? ` from ${esc(fmtDate(App.pendingRestore.at, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}.</p>
    ${pwField('pass', 'Passphrase')}
    <p class="neg sm" id="form-err" role="alert"></p>
    <button class="btn primary block" type="submit">${icon('upload')}<span>Restore</span></button>
  </form>`;
}
function applyRestore(data) {
  if (!data || !data.settings || !Array.isArray(data.orders)) return toast('That file is not a valid backup');
  if (S.settings && !confirm(`Restore "${data.settings.name}"? This replaces everything on this device.`)) return;
  S = migrate(Object.assign(emptyState(), data)); Session.set(null); persist();
  closeSheet(); history.replaceState(null, '', location.pathname); render();
  toast('Backup restored — please log in');
}
/** Called by the file picker (#import-file) */
function restoreFile(file) {
  file.text().then((txt) => {
    const data = JSON.parse(txt);
    if (data && data.encrypted && data.format === 'cafe-journal-backup') { App.pendingRestore = data; openSheet(restorePassSheet()); }
    else applyRestore(data);
  }).catch(() => toast('That file is not a valid backup'));
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  togglePw(el) {
    const i = el.parentElement.querySelector('input'); if (!i) return;
    const show = i.type === 'password'; i.type = show ? 'text' : 'password';
    el.innerHTML = icon(show ? 'eyeOff' : 'eye'); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  },
  forgotFromLogin() {
    const who = $('form[data-form=login] input[name=who]')?.value || '';
    if (!who.trim()) return formError('Type your Employee ID, phone or name first, then tap Forgot password.');
    App.loginWho = who;
    const u = findLogin(who);
    if (u && u.role === 'owner') return openSheet(`${sheetHead('Forgot password', u.name)}<p class="muted">Use the owner recovery code you wrote down when you set up.</p>${recoveryForm(u)}`);
    if (u) raiseRequest(u, u.locked ? 'unlock' : 'reset');
    openSheet(requestSentSheet()); // same answer whether or not the account exists
  },
  requestReset(el) {
    const u = userById(el.dataset.id); if (!u || u.role === 'owner') return;
    raiseRequest(u, u.locked ? 'unlock' : 'reset');
    openSheet(u.locked ? lockedSheet(u) : requestSentSheet());
  },
  ownerRecoverOpen(el) { const u = userById(el.dataset.id); u && openSheet(`${sheetHead('Recovery code', u.name)}${recoveryForm(u)}`); },
  recoveryDone() {
    const u = userById(App.afterRecovery); App.afterRecovery = null;
    if (u && !Session.user()) loginAs(u); else { closeSheet(); render(); }
  },
  async recoveryNew() {
    if (S.recovery && !confirm('Create a new recovery code? The old one stops working.')) return;
    openSheet(recoveryShownSheet(await newRecoveryCode(), null));
  },
  myPin() { const u = currentUser(); u && openSheet(changePwSheet(u, 'self')); },
  teamFilter(el) { App.ui.teamFilter = el.dataset.f; render(); },
  accessAdd(el) { openSheet(accessForm({}, el.dataset.staff || '')); },
  accessEdit(el) { const u = userById(el.dataset.id); u && openSheet(accessForm(u)); },
  setPwOpen(el) { const u = userById(el.dataset.id); u && openSheet(setPwSheet(u)); },
  unlockUser(el) {
    const u = userById(el.dataset.id); if (!u) return;
    u.locked = false; u.failed = 0; closeRequests(u, 'done'); save();
    toast(`${u.name} unlocked — they can log in with their password`);
  },
  dismissRequest(el) { const r = byId(S.requests, el.dataset.id); if (r) { r.status = 'dismissed'; save(); } },
  accessDel(el) {
    const u = userById(el.dataset.id); if (!u) return;
    if (u.id === currentUser()?.id) return formError("You can't remove your own access.");
    if (u.role === 'owner' && activeOwners().length <= 1) return formError('Keep at least one owner.');
    if (!confirm(`Remove login access for ${u.name}? Their staff record stays.`)) return;
    S.users = S.users.filter((x) => x.id !== u.id); closeRequests(u, 'dismissed'); closeSheet(); save();
  },
  exportData() { openSheet(backupSheet()); },
  importData() { $('#import-file').click(); },
});

Changes.accessStaff = (el) => { const m = el.form.querySelector('.manual-fields'); if (m) m.hidden = !!el.value; };

/* ---------------- forms ---------------- */
Object.assign(Forms, {
  async login(fd, form) {
    const who = String(fd.get('who') || '').trim(), pw = String(fd.get('pw') || '');
    App.loginWho = who;
    if (!who || !pw) return formError('Enter your Employee ID (or phone / name) and password.');
    const key = who.toLowerCase();
    const mem = App.loginFails[key];
    if (mem && mem.until > Date.now()) return formError(`Too many tries. Wait ${Math.ceil((mem.until - Date.now()) / 1000)} seconds.`);
    const u = findLogin(who);
    if (u && u.locked) { form.pw.value = ''; return openSheet(lockedSheet(u)); }
    busy(form, true);
    const ok = u ? await checkPassword(u, pw) : (await kdfBits(pw, randBytes(16)), false); // same delay for unknown names
    busy(form, false);
    form.pw.value = '';
    if (u && ok) {
      u.failed = 0; persist();
      if (!u.hash || u.mustChange) { App.pinUser = u.id; return openSheet(changePwSheet(u, 'first')); }
      return loginAs(u);
    }
    if (!u) {
      const f = App.loginFails[key] = { n: (mem?.n || 0) + 1, until: 0 };
      if (f.n >= LOCK_AFTER) { f.until = Date.now() + 60000; f.n = 0; }
      return formError('Login details are not right.');
    }
    u.failed = (u.failed || 0) + 1;
    if (u.failed >= LOCK_AFTER) { u.locked = true; u.lockedAt = Date.now(); persist(); return openSheet(lockedSheet(u)); }
    persist();
    if (u.failed >= WARN_AFTER) return openSheet(warnSheet(u));
    formError('Login details are not right.');
  },
  async newPw(fd, form) {
    const u = userById(fd.get('id')); if (!u) return;
    const mode = fd.get('mode'), pw = fd.get('pw1'), pw2 = fd.get('pw2');
    if (mode !== 'self' && App.pinUser !== u.id) return;
    busy(form, true);
    try {
      if (mode === 'self' && !(await checkPassword(u, fd.get('old') || ''))) return formError('Current password is not right.');
      const err = passwordError(pw, pw2, u); if (err) return formError(err);
      if (await checkPassword(u, pw)) return formError('Choose a different password from the old one.');
      await setPassword(u, pw); u.mustChange = false; persist();
      if (mode === 'self') { closeSheet(); toast('Password changed'); return render(); }
      await finishPwSet(u);
    } finally { busy(form, false); }
  },
  async ownerRecover(fd, form) {
    const u = userById(fd.get('id')); if (!u || u.role !== 'owner') return;
    busy(form, true);
    try {
      if (!(await checkRecovery(fd.get('code')))) return formError('That recovery code is not right.');
      const err = passwordError(fd.get('pw1'), fd.get('pw2'), u); if (err) return formError(err);
      await setPassword(u, fd.get('pw1'));
      Object.assign(u, { mustChange: false, locked: false, failed: 0 });
      const fresh = await newRecoveryCode();
      openSheet(recoveryShownSheet(fresh, u.id)); toast('Unlocked. Here is your NEW recovery code.');
    } finally { busy(form, false); }
  },
  async access(fd, form) {
    const id = fd.get('id'), staffId = fd.get('staffId') || '', role = fd.get('role') || 'waiter';
    const p = staffId ? byId(S.staff, staffId) : null;
    const name = (p ? p.name : String(fd.get('name') || '')).trim();
    const phone = (p ? p.phone || '' : String(fd.get('phone') || '')).trim();
    if (!name) return formError('Pick an employee or type a name.');
    if (S.users.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return formError('Someone already has that name — add a surname or initial.');
    if (staffId && S.users.some((x) => x.id !== id && x.staffId === staffId)) return formError('That employee already has login access.');
    const u = userById(id);
    if (u) {
      const active = !!fd.get('active');
      if (u.role === 'owner' && (role !== 'owner' || !active) && activeOwners().length <= 1) return formError('Keep at least one active owner.');
      if (u.id === currentUser()?.id && (!active || role !== u.role)) return formError("You can't change your own role or disable yourself.");
      Object.assign(u, { name, phone, role, active, staffId: staffId || null });
      closeSheet(); save(); return toast('Saved');
    }
    const err = passwordError(fd.get('pw1'), fd.get('pw2'), { name }); if (err) return formError(err);
    busy(form, true);
    const nu = { id: uid('u'), name, phone, role, staffId: staffId || null, active: true, mustChange: true, failed: 0, locked: false, createdAt: Date.now() };
    await setPassword(nu, fd.get('pw1'));
    S.users.push(nu); busy(form, false);
    closeSheet(); save();
    toast(`${name} can now log in${p ? ' with ' + p.empId : ''}`);
  },
  async setPw(fd, form) {
    const u = userById(fd.get('id')); if (!u) return;
    const err = passwordError(fd.get('pw1'), fd.get('pw2'), u); if (err) return formError(err);
    busy(form, true);
    await setPassword(u, fd.get('pw1'));
    Object.assign(u, { mustChange: true, locked: false, failed: 0 });
    closeRequests(u, 'done'); busy(form, false);
    closeSheet(); save(); toast(`New temporary password set for ${u.name}`);
  },
  async backup(fd, form) {
    const p1 = String(fd.get('pw1') || ''), p2 = String(fd.get('pw2') || '');
    if (p1.length < 8) return formError('Use at least 8 characters.');
    if (p1 !== p2) return formError("The two passphrases don't match.");
    busy(form, true);
    const file = await encryptBackup(S, p1);
    busy(form, false);
    download(`${slug(S.settings.name)}-backup-${dayKey()}.cjbackup.json`, JSON.stringify(file), 'application/json');
    closeSheet(); toast('Encrypted backup downloaded');
  },
  async restorePass(fd, form) {
    busy(form, true);
    try { const data = await decryptBackup(App.pendingRestore, String(fd.get('pass') || '')); App.pendingRestore = null; applyRestore(data); }
    catch (e) { formError('Wrong passphrase, or the file is damaged.'); }
    finally { busy(form, false); }
  },
});
