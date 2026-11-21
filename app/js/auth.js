'use strict';
/* =========================================================
   People, logins & access
   - Every person has their own name, phone, role and 4-digit PIN
   - New people start with PIN 1234 and must set their own on first login
   - Forgot PIN → a one-time code (OTP) appears on the Owner dashboard,
     and the owner can send it to the person's phone by SMS / WhatsApp
   - Owners recover with a recovery code shown when they first set their PIN
   ========================================================= */

App.fails = {}; // wrong-PIN counters, in memory only
const ROLE_ORDER = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
const OTP_MINUTES = 15;
const MAX_TRIES = 5;

const userById = (id) => byId(S.users, id);
const activeUsers = () => S.users.filter((u) => u.active !== false);
const activeOwners = () => activeUsers().filter((u) => u.role === 'owner');
const currentUser = () => Session.user();
function makeUser(name, role, phone = '') {
  return { id: uid('u'), name: name || ROLES[role].label, role, phone, pin: DEFAULT_PIN, mustChange: true, active: true, createdAt: Date.now() };
}
const digits = (p) => String(p || '').replace(/\D/g, '');
const maskPhone = (p) => (digits(p) ? '•••• ' + digits(p).slice(-3) : '');
const pendingOtps = () => S.otps.filter((o) => !o.used && o.expiresAt > Date.now() && userById(o.userId));
function randomDigits(n) {
  const a = new Uint32Array(n);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (x) => x % 10).join('');
}
function randomRecovery() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(8); crypto.getRandomValues(a);
  const s = Array.from(a, (x) => chars[x % chars.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
const pinOk = (p) => /^[0-9]{4}$/.test(p);

/* ---------------- Login screen ---------------- */
Views.login = () => {
  const st = S.settings;
  const people = activeUsers().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const cards = people.map((u) => {
    const r = ROLES[u.role];
    return `<button class="role-card card" data-act="pickUser" data-id="${u.id}">
      <span class="avatar" style="background:${r.color}">${esc(initials(u.name))}</span>
      <strong>${esc(u.name)}</strong><small>${esc(r.label)}</small>
      ${u.mustChange ? `<span class="role-lock">${icon('lock')} First login — set your PIN</span>` : ''}
    </button>`;
  }).join('');
  return `<main class="center-screen">
    <div class="login">
      <div class="brand-mark lg">${esc(initials(st.name))}</div>
      <h1>${esc(st.name)}</h1>
      ${st.tagline ? `<p class="muted">${esc(st.tagline)}</p>` : ''}
      <p class="eyebrow center">Who's working?</p>
      <div class="role-grid">${cards}</div>
      <p class="fine">Tap your name and enter your PIN. New here? Your starting PIN is given by the owner — you'll choose your own the first time.</p>
    </div></main>`;
};

function pinPadSheet(u, msg = '') {
  const fail = App.fails[u.id];
  const locked = fail && fail.until > Date.now();
  return `${sheetHead(ROLES[u.role].label, u.name)}
    <div class="pin-dots" id="pin-dots">${'<i></i>'.repeat(4)}</div>
    <p class="pin-msg ${msg || locked ? 'neg' : 'muted'}" id="pin-msg">${esc(locked ? `Too many wrong tries. Wait ${Math.ceil((fail.until - Date.now()) / 1000)} seconds.` : msg || 'Enter your 4-digit PIN')}</p>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => (k === '' ? '<span></span>' : `<button class="key" data-act="pinKey" data-k="${k}">${k}</button>`)).join('')}</div>
    <button class="btn ghost block" data-act="forgotPin">Forgot PIN?</button>`;
}

function changePinSheet(u, mode) {
  const title = mode === 'first' ? 'Set your own PIN' : mode === 'self' ? 'Change my PIN' : 'New PIN';
  const note = mode === 'first'
    ? 'Welcome! This is your first login, so please replace the starting PIN with one only you know.'
    : 'Choose a 4-digit PIN only you know.';
  return `${sheetHead(u.name, title)}
  <form data-form="newPin" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${u.id}"><input type="hidden" name="mode" value="${mode}">
    <p class="muted">${esc(note)}</p>
    ${mode === 'self' ? `<label class="field"><span>Current PIN</span><input name="old" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>` : ''}
    <div class="row-2">
      <label class="field"><span>New PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
      <label class="field"><span>Repeat new PIN</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
    </div>
    <p class="neg sm" id="form-err"></p>
    <button class="btn primary block" type="submit">${icon('check')}<span>Save PIN${mode === 'first' ? ' & continue' : ''}</span></button>
  </form>`;
}

function otpSheet(u, otp) {
  return `${sheetHead('Forgot PIN', u.name)}
  <form data-form="otpReset" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${u.id}">
    <div class="banner info">${icon('lock')}<span>A 6-digit code has been sent to the <b>Owner dashboard</b>${u.phone ? ` — the owner can text it to your phone <b>${esc(maskPhone(u.phone))}</b>` : ''}. It works for ${OTP_MINUTES} minutes (until ${fmtTime(otp.expiresAt)}).</span></div>
    <label class="field"><span>6-digit code</span><input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus class="otp-input"></label>
    <div class="row-2">
      <label class="field"><span>New PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
      <label class="field"><span>Repeat new PIN</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
    </div>
    <p class="neg sm" id="form-err"></p>
    <button class="btn primary block" type="submit">${icon('check')}<span>Reset PIN & log in</span></button>
    <button class="btn ghost block" type="button" data-act="otpNew" data-id="${u.id}">Send a new code</button>
  </form>`;
}

function ownerRecoverySheet(u) {
  return `${sheetHead('Forgot PIN', u.name)}
  <form data-form="ownerRecover" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${u.id}">
    <p class="muted">Owners reset with the <b>recovery code</b> shown when the owner PIN was first set (looks like <code>ABCD-2345</code>).${activeOwners().length > 1 ? ' Another owner can also reset your PIN from Team & access.' : ''}</p>
    <label class="field"><span>Recovery code</span><input name="code" maxlength="9" required autofocus style="text-transform:uppercase"></label>
    <div class="row-2">
      <label class="field"><span>New PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
      <label class="field"><span>Repeat new PIN</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
    </div>
    <p class="neg sm" id="form-err"></p>
    <button class="btn primary block" type="submit">${icon('check')}<span>Reset PIN & log in</span></button>
  </form>`;
}

function recoveryShownSheet(code, then) {
  App.afterRecovery = then;
  return `${sheetHead('Owner recovery code', 'Write this down')}
    <p class="muted">If you ever forget your owner PIN, this code lets you reset it. Keep it somewhere safe — it is shown only now.</p>
    <div class="recovery-code">${esc(code)}</div>
    <button class="btn primary block" data-act="recoveryDone">${icon('check')}<span>I've saved it</span></button>`;
}

/* ---------------- Reset-request card (Owner dashboard + Team) ---------------- */
function otpRequestsCard() {
  if (Session.role() !== 'owner') return '';
  const list = pendingOtps();
  if (!list.length) return '';
  const st = S.settings;
  return `<section class="card otp-card">
    <div class="card-head">${eyebrow('PIN reset requests')}<span class="badge warm">${list.length} waiting</span></div>
    ${list.map((o) => {
      const u = userById(o.userId);
      const msg = `${st.name}: your PIN reset code is ${o.code}. It expires at ${fmtTime(o.expiresAt)}. Don't share it.`;
      let wa = digits(u.phone);
      if (wa.length === 10 && cur().code === 'INR') wa = '91' + wa;
      return `<div class="otp-row">
        <div class="with-av"><span class="avatar sm" style="background:${ROLES[u.role].color}">${esc(initials(u.name))}</span>
          <span><strong>${esc(u.name)} <small class="muted">· ${esc(ROLES[u.role].label)}</small></strong><small>Asked at ${fmtTime(o.createdAt)} · expires ${fmtTime(o.expiresAt)}${u.phone ? ' · ' + esc(u.phone) : ' · no phone saved'}</small></span></div>
        <div class="otp-code" aria-label="Code">${esc(o.code)}</div>
        <div class="btn-row tight">
          ${u.phone ? `<a class="btn ghost sm" href="sms:${esc(digits(u.phone))}?&body=${encodeURIComponent(msg)}">SMS</a>
          <a class="btn ghost sm" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button class="btn ghost sm" data-act="otpCancel" data-id="${o.id}">Cancel</button>
        </div>
      </div>`;
    }).join('')}
    <p class="fine">Check it's really them, then tell them the code or send it to their phone.</p>
  </section>`;
}

/* ---------------- Team & access (owner) ---------------- */
Views.team = () => {
  const me = currentUser();
  const groups = ROLE_ORDER.map((role) => {
    const people = S.users.filter((u) => u.role === role).sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));
    const r = ROLES[role];
    return `<section class="card">
      <div class="card-head"><div>${eyebrow(r.label + (people.length ? ` · ${people.length}` : ''))}<p class="muted sm">Can use: ${esc(r.views.map((v) => VIEWS[v].label).join(' · '))}</p></div>
        <button class="btn ghost sm" data-act="personAdd" data-role="${role}">${icon('plus')}<span>Add</span></button></div>
      ${people.length ? people.map((u) => `<div class="staff-row ${u.active === false ? 'off' : ''}">
        <span class="with-av"><span class="avatar sm" style="background:${u.active === false ? 'var(--muted)' : r.color}">${esc(initials(u.name))}</span>
          <span><strong>${esc(u.name)}${u.id === me?.id ? ' <small class="muted">(you)</small>' : ''}</strong>
          <small>${u.phone ? esc(u.phone) : 'No phone'} · ${u.active === false ? '<span class="neg">Disabled</span>' : u.mustChange ? `<span class="warn-t">Starting PIN ${esc(DEFAULT_PIN)} — sets own PIN on first login</span>` : u.lastLogin ? 'Last login ' + esc(fmtDate(u.lastLogin, { day: 'numeric', month: 'short' }) + ' ' + fmtTime(u.lastLogin)) : 'PIN set'}</small></span></span>
        <div class="btn-row tight">
          ${btn('Reset PIN', 'personResetPin', { cls: 'ghost sm', ic: 'lock', data: `data-id="${u.id}"` })}
          <button class="icon-btn sm" data-act="personEdit" data-id="${u.id}" aria-label="Edit ${esc(u.name)}">${icon('edit')}</button>
        </div></div>`).join('') : `<p class="muted sm">No one yet.</p>`}
    </section>`;
  }).join('');
  return `${pageHead('Team & access', 'Who can log in', btn('Add person', 'personAdd', { cls: 'primary', ic: 'plus', data: 'data-role="manager"' }))}
    ${otpRequestsCard()}
    <div class="banner info">${icon('lock')}<span>Everyone you add starts with PIN <b>${esc(DEFAULT_PIN)}</b> and must choose their own PIN the first time they log in. If someone forgets, they tap <b>Forgot PIN?</b> and a one-time code appears here and on your dashboard.</span></div>
    ${groups}
    <section class="card">${eyebrow('Owner recovery code')}
      <p class="muted">Used by an owner who forgets their PIN. ${S.recovery ? `Last created ${esc(fmtDate(S.recovery.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }))}.` : 'Not created yet.'}</p>
      <div class="btn-row">${btn(S.recovery ? 'Create a new code' : 'Create code', 'recoveryNew', { cls: 'ghost', ic: 'lock' })}${btn('Change my PIN', 'myPin', { cls: 'ghost', ic: 'edit' })}</div>
    </section>`;
};

function personForm(u = {}, role = 'manager') {
  const isNew = !u.id;
  return `${sheetHead('Team & access', isNew ? 'Add person' : 'Edit person')}
  <form data-form="person" class="form" autocomplete="off">
    <input type="hidden" name="id" value="${esc(u.id || '')}">
    <div class="row-2">
      <label class="field"><span>Name</span><input name="name" required maxlength="40" value="${esc(u.name || '')}" placeholder="e.g. Priya"></label>
      <label class="field"><span>Phone <em>(for PIN reset codes)</em></span><input name="phone" type="tel" maxlength="20" value="${esc(u.phone || '')}" placeholder="98765 43210"></label>
    </div>
    <div class="field"><span>Role</span><div class="chip-row">${ROLE_ORDER.map((k) => `<label class="chip-radio"><input type="radio" name="role" value="${k}" ${(u.role || role) === k ? 'checked' : ''}><span>${esc(ROLES[k].label)}</span></label>`).join('')}</div></div>
    ${isNew ? `<p class="muted sm">Starting PIN will be <b>${esc(DEFAULT_PIN)}</b>. They'll set their own on first login.</p>`
      : `<label class="check"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}><span>Can log in (untick to disable)</span></label>`}
    <p class="neg sm" id="form-err"></p>
    <div class="form-actions">${!isNew ? btn('Remove', 'personDel', { cls: 'danger-ghost', ic: 'trash', data: `data-id="${u.id}"` }) : '<span></span>'}
      <button class="btn primary" type="submit">${isNew ? 'Add person' : 'Save'}</button></div>
  </form>`;
}

/* ---------------- helpers ---------------- */
function formError(msg) { const e = $('#form-err'); if (e) e.textContent = msg; else toast(msg); }
function newPinError(pin, pin2, u) {
  if (!pinOk(pin)) return 'PIN must be exactly 4 digits.';
  if (pin !== pin2) return "The two PINs don't match.";
  if (pin === DEFAULT_PIN) return `Please choose something other than ${DEFAULT_PIN}.`;
  if (/^(\d)\1{3}$/.test(pin)) return 'Too easy — avoid four of the same digit.';
  if (u && pin === u.pin && u.mustChange) return 'Choose a new PIN.';
  return '';
}
function loginAs(u) {
  Session.set(u.id);
  u.lastLogin = Date.now(); persist();
  closeSheet();
  history.replaceState(null, '', `#/${ROLES[u.role].views[0]}`);
  render();
  const n = u.role === 'owner' ? pendingOtps().length : 0;
  toast(n ? `Welcome, ${u.name} — ${n} PIN reset request${n > 1 ? 's' : ''} waiting` : `Welcome, ${u.name}`);
}
/** After a PIN is set: owners without a recovery code get one, then log in */
function finishPinSet(u) {
  if (u.role === 'owner' && !S.recovery) {
    const code = randomRecovery();
    S.recovery = { code, createdAt: Date.now() }; persist();
    openSheet(recoveryShownSheet(code, u.id));
  } else loginAs(u);
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  pickUser(el) {
    const u = userById(el.dataset.id); if (!u) return;
    App.pin = ''; App.pinUser = u.id;
    openSheet(pinPadSheet(u));
  },
  pinKey(el) {
    const u = userById(App.pinUser); if (!u || !$('#pin-dots')) return;
    const fail = App.fails[u.id];
    if (fail && fail.until > Date.now()) { $('#pin-msg').textContent = `Too many wrong tries. Wait ${Math.ceil((fail.until - Date.now()) / 1000)} seconds.`; return; }
    const k = el.dataset.k;
    App.pin = k === '⌫' ? App.pin.slice(0, -1) : (App.pin + k).slice(0, 4);
    $$('#pin-dots i').forEach((d, i) => d.classList.toggle('on', i < App.pin.length));
    if (App.pin.length < 4) return;
    if (App.pin === u.pin) {
      delete App.fails[u.id];
      if (u.mustChange) openSheet(changePinSheet(u, 'first'));
      else loginAs(u);
      return;
    }
    const f = App.fails[u.id] = { n: (fail?.n || 0) + 1, until: 0 };
    if (f.n >= MAX_TRIES) { f.until = Date.now() + 30000; f.n = 0; }
    const dots = $('#pin-dots'); dots.classList.add('shake');
    $('#pin-msg').textContent = f.until ? 'Too many wrong tries. Wait 30 seconds.' : `Wrong PIN — ${MAX_TRIES - f.n} tries left`;
    $('#pin-msg').className = 'pin-msg neg';
    setTimeout(() => { dots.classList.remove('shake'); App.pin = ''; $$('#pin-dots i').forEach((d) => d.classList.remove('on')); }, 450);
  },
  forgotPin() {
    const u = userById(App.pinUser); if (!u) return;
    if (u.role === 'owner') return openSheet(ownerRecoverySheet(u));
    const existing = pendingOtps().find((o) => o.userId === u.id);
    openSheet(otpSheet(u, existing || createOtp(u)));
  },
  otpNew(el) {
    const u = userById(el.dataset.id); if (!u) return;
    S.otps.forEach((o) => { if (o.userId === u.id && !o.used) o.used = true; });
    openSheet(otpSheet(u, createOtp(u))); toast('New code sent to the Owner dashboard');
  },
  otpCancel(el) { const o = byId(S.otps, el.dataset.id); if (o) { o.used = true; save(); } },
  recoveryDone() {
    const u = userById(App.afterRecovery); App.afterRecovery = null;
    if (u && !Session.user()) loginAs(u); else { closeSheet(); render(); }
  },
  recoveryNew() {
    if (S.recovery && !confirm('Create a new recovery code? The old one will stop working.')) return;
    const code = randomRecovery(); S.recovery = { code, createdAt: Date.now() }; persist();
    openSheet(recoveryShownSheet(code, null));
  },
  myPin() { const u = currentUser(); u && openSheet(changePinSheet(u, 'self')); },
  personAdd(el) { openSheet(personForm({}, el.dataset.role || 'manager')); },
  personEdit(el) { const u = userById(el.dataset.id); u && openSheet(personForm(u)); },
  personResetPin(el) {
    const u = userById(el.dataset.id); if (!u) return;
    if (!confirm(`Reset ${u.name}'s PIN to ${DEFAULT_PIN}? They'll have to choose a new one at their next login.`)) return;
    u.pin = DEFAULT_PIN; u.mustChange = true; save();
    toast(`${u.name}'s PIN is now ${DEFAULT_PIN}`);
  },
  personDel(el) {
    const u = userById(el.dataset.id); if (!u) return;
    if (u.id === currentUser()?.id) return formError("You can't remove yourself.");
    if (u.role === 'owner' && activeOwners().length <= 1 && u.active !== false) return formError('Keep at least one owner.');
    if (!confirm(`Remove ${u.name}? They won't be able to log in any more.`)) return;
    S.users = S.users.filter((x) => x.id !== u.id); closeSheet(); save();
  },
});

function createOtp(u) {
  const otp = { id: uid('otp'), userId: u.id, code: randomDigits(6), createdAt: Date.now(), expiresAt: Date.now() + OTP_MINUTES * 60000, used: false, tries: 0 };
  S.otps = [...S.otps.filter((o) => o.createdAt > Date.now() - 7 * 864e5).slice(-30), otp];
  persist();
  return otp;
}

/* ---------------- forms ---------------- */
Object.assign(Forms, {
  newPin(fd) {
    const u = userById(fd.get('id')); if (!u) return;
    const mode = fd.get('mode'), pin = fd.get('pin'), pin2 = fd.get('pin2');
    if (mode === 'first' && App.pinUser !== u.id) return;
    if (mode === 'self' && fd.get('old') !== u.pin) return formError('Current PIN is not right.');
    const err = newPinError(pin, pin2, u); if (err) return formError(err);
    u.pin = pin; u.mustChange = false; u.pinChangedAt = Date.now(); persist();
    if (mode === 'self') { closeSheet(); toast('PIN changed'); return render(); }
    finishPinSet(u);
  },
  otpReset(fd) {
    const u = userById(fd.get('id')); if (!u) return;
    const otp = pendingOtps().find((o) => o.userId === u.id);
    if (!otp) return formError('This code has expired. Tap "Send a new code".');
    if (fd.get('code').trim() !== otp.code) {
      otp.tries = (otp.tries || 0) + 1;
      if (otp.tries >= MAX_TRIES) { otp.used = true; persist(); return formError('Too many wrong codes. Tap "Send a new code".'); }
      persist(); return formError(`That code is not right — ${MAX_TRIES - otp.tries} tries left.`);
    }
    const err = newPinError(fd.get('pin'), fd.get('pin2'), null); if (err) return formError(err);
    otp.used = true; u.pin = fd.get('pin'); u.mustChange = false; u.pinChangedAt = Date.now(); persist();
    loginAs(u);
  },
  ownerRecover(fd) {
    const u = userById(fd.get('id')); if (!u) return;
    const code = fd.get('code').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!S.recovery || code !== S.recovery.code.replace('-', '')) return formError('That recovery code is not right.');
    const err = newPinError(fd.get('pin'), fd.get('pin2'), null); if (err) return formError(err);
    u.pin = fd.get('pin'); u.mustChange = false;
    const fresh = randomRecovery(); S.recovery = { code: fresh, createdAt: Date.now() }; persist();
    openSheet(recoveryShownSheet(fresh, u.id)); toast('PIN reset. Here is your NEW recovery code.');
  },
  person(fd) {
    const id = fd.get('id'), name = fd.get('name').trim(), phone = fd.get('phone').trim(), role = fd.get('role') || 'manager';
    if (!name) return formError('Please enter a name.');
    if (S.users.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return formError('Someone already has that name — add a surname or initial.');
    const u = userById(id);
    if (u) {
      const active = !!fd.get('active');
      const losingOwner = u.role === 'owner' && u.active !== false && (role !== 'owner' || !active);
      if (losingOwner && activeOwners().length <= 1) return formError('Keep at least one active owner.');
      if (u.id === currentUser()?.id && (!active || role !== u.role)) return formError("You can't change your own role or disable yourself.");
      Object.assign(u, { name, phone, role, active });
      toast('Saved');
    } else {
      S.users.push(makeUser(name, role, phone));
      toast(`${name} added — starting PIN ${DEFAULT_PIN}`);
    }
    closeSheet(); save();
  },
});
