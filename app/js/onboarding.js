'use strict';
/* =========================================================
   Sign-up wizard (no sample data) — and the same Menu / Stock /
   Staff steps reused later from Settings → "Set up café details".

   Sign-up:  1 Place (type) · 2 How you work (short questions) · 3 Tax & bills · 4 Menu · 5 Stock · 6 Staff & logins · 7 Owner account
   Later:    1 Menu · 2 Stock · 3 Staff & logins           (adds to the current café)
   Profile:  Settings → Business setup: 1 Type · 2 How you work · 3 Tax & bills · 4 Review changes
   ========================================================= */

const ONLINE = () => typeof Cloud !== 'undefined' && Cloud.on;
const SIGNUP_STEPS = ['place', 'how', 'tax', 'menu', 'stock', 'staff', 'owner'];
const PROFILE_STEPS = ['preset', 'how', 'tax', 'review'];
const LATER_STEPS = ['menu', 'stock', 'staff'];
const newDraft = () => ({ type: 'cafe', currency: 'INR', tables: 8, tax: 5, menu: [{}], stock: [{}], staff: [{}], answers: presetAnswers('cafe') });
App.setup = { step: 0, mode: 'signup', d: newDraft() };
const stepList = () => (App.setup.mode === 'later' ? LATER_STEPS : App.setup.mode === 'profile' ? PROFILE_STEPS : SIGNUP_STEPS);
const stepName = () => stepList()[App.setup.step - 1];
const SETUP_TYPES = [
  ['cafe', 'Café', 'cup'], ['restaurant', 'Restaurant', 'flame'], ['hotel', 'Hotel / Dhaba', 'grid'],
  ['bakery', 'Bakery', 'box'], ['other', 'Something else', 'more'],
];
const ACCESS_ROLES = ['manager', 'cashier', 'waiter', 'kitchen', 'owner'];
const filled = (rows) => (rows || []).filter((r) => String(r.name || '').trim());
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const draftCounts = (d) => [filled(d.menu).length && plural(filled(d.menu).length, 'menu item', 'menu items'), filled(d.stock).length && plural(filled(d.stock).length, 'stock item', 'stock items'), filled(d.staff).length && plural(filled(d.staff).length, 'staff member', 'staff')].filter(Boolean);

/* ---------------- rows editors ---------------- */
function rowsEditor(list) {
  const d = App.setup.d;
  const rows = d[list] && d[list].length ? d[list] : [{}];
  const del = (i) => `<button type="button" class="icon-btn sm" data-act="rowDel" data-list="${list}" data-i="${i}" aria-label="Remove row">${icon('x')}</button>`;
  const typeLabel = (BUSINESS_TYPES[d.type || S.settings?.type] || 'café').toLowerCase();
  if (list === 'menu') {
    const cats = [...new Set(rows.map((r) => r.cat).filter(Boolean).concat(S.menu.map((m) => m.cat)))];
    return `<div class="rows menu-rows">
      <div class="row-head"><span>Item name</span><span>Category</span><span>Price</span><span></span></div>
      ${rows.map((r, i) => `<div class="row-line">
        <input name="m_name" maxlength="40" value="${esc(r.name || '')}" placeholder="e.g. Cappuccino" aria-label="Item name">
        <input name="m_cat" maxlength="24" value="${esc(r.cat || '')}" placeholder="e.g. Coffee" list="cat-sugg" aria-label="Category">
        <input name="m_price" type="number" min="0" step="any" value="${esc(r.price ?? '')}" placeholder="0" aria-label="Price">${del(i)}</div>`).join('')}
      <datalist id="cat-sugg">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    </div>
    <div class="btn-row">${btn('Add item', 'rowAdd', { cls: 'ghost sm', ic: 'plus', data: 'data-list="menu"' })}${btn(`Fill with a typical ${typeLabel} menu`, 'rowStarter', { cls: 'ghost sm', data: 'data-list="menu"' })}</div>
    ${menuImportHtml()}
    <p class="muted sm">Optional — skip it now and add items any time in Settings → Menu. Starter lists are only added if you tap the button, and you can edit every row.</p>`;
  }
  if (list === 'stock') {
    return `<div class="rows stock-rows">
      <div class="row-head"><span>Item</span><span>Unit</span><span>In stock now</span><span>Alert below</span><span></span></div>
      ${rows.map((r, i) => `<div class="row-line">
        <input name="s_name" maxlength="40" value="${esc(r.name || '')}" placeholder="e.g. Milk" aria-label="Stock item">
        <select name="s_unit" aria-label="Unit">${UNITS.map((u) => `<option ${u === (r.unit || 'kg') ? 'selected' : ''}>${u}</option>`).join('')}</select>
        <input name="s_qty" type="number" min="0" step="any" value="${esc(r.qty ?? '')}" placeholder="0" aria-label="In stock now">
        <input name="s_low" type="number" min="0" step="any" value="${esc(r.low ?? '')}" placeholder="0" aria-label="Alert below">${del(i)}</div>`).join('')}
    </div>
    <div class="btn-row">${btn('Add item', 'rowAdd', { cls: 'ghost sm', ic: 'plus', data: 'data-list="stock"' })}${btn(`Fill with typical ${typeLabel} stock`, 'rowStarter', { cls: 'ghost sm', data: 'data-list="stock"' })}</div>
    <p class="muted sm">Optional. "Alert below" warns you on the dashboard before you run out.</p>`;
  }
  // staff
  return `<div class="staff-rows">
    ${rows.map((r, i) => `<div class="staff-card">
      <div class="staff-card-h"><b>Person ${i + 1}</b>${del(i)}</div>
      <div class="row-2">
        <label class="field"><span>Full name</span><input name="p_name" maxlength="60" value="${esc(r.name || '')}" placeholder="e.g. Priya Nair"></label>
        ${designationField('p_role', r.role)}
      </div>
      <div class="row-2">
        <label class="field"><span>Mobile</span><input name="p_phone" type="tel" maxlength="20" value="${esc(r.phone || '')}"></label>
        <label class="field"><span>Joining date</span><input name="p_join" type="date" value="${esc(r.join || dayKey())}" max="${shiftDay(dayKey(), 60)}"></label>
      </div>
      <div class="row-2">
        <label class="field"><span>Login access</span><select name="p_access">
          <option value="">No login (staff record only)</option>
          ${ACCESS_ROLES.filter((k) => !App.setup.d.answers || rolesOfferedFor(App.setup.d.answers).includes(k) || r.access === k).map((k) => `<option value="${k}" ${r.access === k ? 'selected' : ''}>${esc(ROLES[k].label)} — ${esc(ROLES[k].desc)}</option>`).join('')}</select></label>
        <label class="field"><span>First password <em>(if login)</em></span>
          <span class="pw-wrap"><input name="p_pw" type="password" maxlength="64" autocomplete="new-password" value="${esc(r.pw || '')}" placeholder="you type it"><button type="button" class="pw-eye" data-act="togglePw" aria-label="Show password">${icon('eye')}</button></span></label>
      </div>
    </div>`).join('')}
  </div>
  <div class="btn-row">${btn('Add person', 'rowAdd', { cls: 'ghost sm', ic: 'plus', data: 'data-list="staff"' })}</div>
  <p class="muted sm">Each person gets an employee ID automatically (e.g. ${esc(((App.setup.d.short || S.settings?.short || 'KK') + String(new Date().getFullYear()).slice(-2)).toUpperCase())}001). If you choose a login, they sign in with that ID and the password you type here, then must change it. Photo, KYC, blood group and other details can be added later under Staff.</p>`;
}

/* ---------------- screens ---------------- */
Views.setup = () => {
  const { step, d, mode } = App.setup;
  if (step === 0) {
    return `<main class="center-screen onboard">
      <div class="card onb">
        <div class="brand-mark lg">${icon('cup')}</div>
        <h1>Welcome to Cafe Journal</h1>
        <p class="muted center">Orders, kitchen, billing, stock, staff and reports — one calm app for your café, restaurant or hotel.</p>
        ${App.setup.intent === 'login' ? `<div class="banner info">${icon('lock')}<span><b>No café is set up on this device yet.</b> If you already have an account on another phone or computer, restore your backup below. If you're new, sign up.</span></div>` : ''}
        <button class="choice primary" data-act="setupStart">${icon('plus')}<span><b>Sign up — new café</b><small>Your place, menu, stock, staff and owner account — step by step</small></span>${icon('right')}</button>
        <button class="choice" data-act="importData">${icon('upload')}<span><b>I already have an account</b><small>Restore your backup file from another phone or computer, then log in</small></span>${icon('right')}</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <p class="fine center">${icon('lock')} Your data stays on this device. Nothing is uploaded.</p>
      </div>
      <p class="fine center version">Cafe Journal v${APP_VERSION}</p></main>`;
  }
  const steps = stepList(), name = stepName(), total = steps.length;
  const titles = { place: 'About your place', how: 'How you work', tax: 'Tax & bills', preset: 'Your kind of place', review: 'Check the changes', menu: 'Your menu', stock: 'Your stock', staff: 'Your staff & their logins', owner: 'Your owner account' };
  const v = (k) => esc(d[k] ?? '');
  let body = '';
  if (name === 'place') {
    body = `
      <label class="field"><span>Name of your place</span><input name="name" required maxlength="40" placeholder="e.g. Corner Café" value="${v('name')}" data-input="setupName" autofocus></label>
      <div class="row-2">
        <label class="field"><span>Short code <em>(for employee IDs)</em></span><input name="short" required maxlength="4" value="${v('short')}" placeholder="CC" style="text-transform:uppercase" data-input="setupShort"></label>
        <div class="field"><span>Employee IDs will look like</span><div class="emp-sample" id="emp-sample">${esc(((d.short || 'CC') + String(new Date().getFullYear()).slice(-2) + '001').toUpperCase())}</div></div>
      </div>
      ${presetPicker(d.answers || presetAnswers('cafe'))}
      <label class="field"><span>Tagline <em>(optional — shows on login & receipts)</em></span><input name="tagline" maxlength="60" placeholder="e.g. Chai · Coffee · Sandwiches" value="${v('tagline')}"></label>`;
  } else if (name === 'preset') {
    body = presetPicker(d.answers, false) + `<p class="muted sm">Changing the type fills in its typical answers on the next screens — you can still change each one.</p>`;
  } else if (name === 'how') {
    body = howScreen(d.answers, App.setup.qi || 0);
  } else if (name === 'tax') {
    body = taxScreen(d.answers, mode === 'profile' ? null : d);
  } else if (name === 'review') {
    body = reviewScreen(d.before || legacyAnswers(S.settings), d.answers);
  } else if (name === 'menu' || name === 'stock' || name === 'staff') {
    body = rowsEditor(name);
  } else {
    const counts = draftCounts(d);
    body = `
      <div class="row-2">
        <label class="field"><span>Your name</span><input name="owner" required maxlength="40" value="${v('owner')}" autocomplete="name"></label>
        <label class="field"><span>Your mobile</span><input name="phone" type="tel" required maxlength="20" value="${v('phone')}" autocomplete="tel"></label>
      </div>
      ${ONLINE() ? `<label class="field"><span>Your email <em>(you log in with it; password-reset links are sent here)</em></span><input name="email" type="email" required maxlength="80" value="${v('email')}" autocomplete="email"></label>` : ''}
      ${pwField('pw1', `Create a password <em>(at least ${PW_MIN} characters)</em>`)}
      ${pwField('pw2', 'Repeat password')}
      <div class="banner info">${icon('check')}<span>${App.legacyChoice === 'move' ? 'Your existing data on this device will be moved online. ' : ''}${counts.length ? `Ready to save: <b>${esc(counts.join(' · '))}</b>.` : 'No menu, stock or staff added yet — you can add them any time later.'} No sample data is added.</span></div>
      <p class="muted sm">${icon('lock')} ${ONLINE() ? "Your café's data is stored securely online, not on this phone. You'll get a café code for your staff." : "You'll log in with your name or mobile and this password. Next you'll get a recovery code in case you ever forget it."}</p>`;
  }
  const last = App.setup.step === total;
  const lastLabel = mode === 'later' ? 'Save details' : mode === 'profile' ? 'Save changes' : 'Create my café';
  return `<main class="center-screen onboard">
    <form class="card onb ${['menu', 'stock', 'staff', 'place', 'preset', 'how', 'review'].includes(name) ? 'wide' : ''}" data-form="setupStep" autocomplete="off" novalidate>
      <div class="steps-bar" style="grid-template-columns:repeat(${total},1fr)" aria-label="Step ${step} of ${total}">${steps.map((_, i) => `<i class="${i < step ? 'on' : ''}"></i>`).join('')}</div>
      <p class="eyebrow">${mode === 'later' ? 'Set up café details' : mode === 'profile' ? 'Business setup' : 'Sign up'} · step ${step} of ${total}</p>
      <h1>${titles[name]}</h1>
      ${body}
      <p class="neg sm" id="form-err" role="alert"></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-act="setupBack">${icon('left')}<span>${step === 1 && (mode === 'later' || mode === 'profile') ? 'Cancel' : 'Back'}</span></button>
        <div class="btn-row tight">
          ${['menu', 'stock', 'staff'].includes(name) && !last ? `<button type="button" class="btn ghost" data-act="setupSkip">Skip</button>` : ''}
          ${name === 'how' && (App.setup.qi || 0) < HOW_SCREENS.length - 1 ? `<button type="button" class="btn ghost" data-act="howFinish">Looks right — skip the rest</button>` : ''}
          <button type="submit" class="btn primary">${last ? `${icon('check')}<span>${lastLabel}</span>` : `<span>Continue</span>${icon('right')}`}</button>
        </div>
      </div>
    </form></main>`;
};

/** Copy what's typed on the current step into the draft (passwords stay in memory only) */
function keepSetupFields(form) {
  if (!form) return;
  const fd = new FormData(form);
  const d = App.setup.d;
  for (const [k, val] of fd.entries()) if (!/^(pw|m_|s_|p_|a_)/.test(k)) d[k] = val;
  if (d.answers) {
    const pre = fd.get('a_q_preset'); if (pre && PRESETS[pre]) { d.answers.q_preset = String(pre); d.type = PRESETS[pre].type; }
    readAnswers(form, d.answers);
  }
  const name = stepName();
  const col = (k) => fd.getAll(k).map(String);
  if (name === 'menu') { const n = col('m_name'), c = col('m_cat'), p = col('m_price'); d.menu = n.map((x, i) => ({ name: x, cat: c[i], price: p[i] })); }
  if (name === 'stock') { const n = col('s_name'), u = col('s_unit'), q = col('s_qty'), l = col('s_low'); d.stock = n.map((x, i) => ({ name: x, unit: u[i], qty: q[i], low: l[i] })); }
  if (name === 'staff') { const n = col('p_name'), r0 = col('p_role'), ro = col('p_role_other'), r = r0.map((x, i) => designationValue(x, ro[i])), ph = col('p_phone'), j = col('p_join'), a = col('p_access'), pw = col('p_pw'); d.staff = n.map((x, i) => ({ name: x, role: r[i], phone: ph[i], join: j[i], access: a[i], pw: pw[i] })); }
}
function stepError(name, d) {
  if (d.answers) { const ae = answersError(name, d.answers); if (ae) return ae; }
  if (name === 'place') {
    if (!String(d.name || '').trim()) return 'Please enter the name of your place.';
    d.short = String(d.short || shortCode(d.name)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (d.short.length < 2) return 'Short code needs 2–4 letters, e.g. KK.';
  }
  if (name === 'menu') for (const r of filled(d.menu)) if (r.price === '' || isNaN(Number(r.price)) || Number(r.price) < 0) return `Please enter a price for "${r.name}".`;
  if (name === 'stock') for (const r of filled(d.stock)) if (r.qty !== '' && isNaN(Number(r.qty))) return `"${r.name}": stock should be a number.`;
  if (name === 'staff') {
    const seen = new Set(S.users.map((u) => u.name.toLowerCase()));
    for (const r of filled(d.staff)) {
      const nm = r.name.trim();
      if (r.phone && !/^[+\d][\d\s-]{6,}$/.test(r.phone.trim())) return `${nm}: please check the mobile number.`;
      if (r.access) {
        if (seen.has(nm.toLowerCase())) return `Two logins can't have the same name — add a surname or initial for ${nm}.`;
        seen.add(nm.toLowerCase());
        const e = passwordError(r.pw, r.pw, { name: nm });
        if (e) return `${nm}'s first password: ${e}`;
      }
    }
  }
  return '';
}

/** Turn the draft rows into real records inside `state` (assigns employee IDs) */
function applyDraft(state, d) {
  filled(d.stock).forEach((r) => {
    const qty = num(r.qty), low = num(r.low);
    state.stock.push({ id: uid('s'), name: r.name.trim(), unit: r.unit || 'pcs', qty, low, max: Math.max(qty, low * 4, 1), step: 1 });
  });
  // Menu items get typical ingredients from the stock above, so stock reduces as they are served
  filled(d.menu).forEach((r) => state.menu.push({ id: uid('m'), name: r.name.trim(), cat: String(r.cat || '').trim() || 'General', price: num(r.price), available: true, recipe: suggestRecipe(r.name, state.stock) }));
  const logins = [];
  filled(d.staff).forEach((r) => {
    const joinDate = r.join || dayKey();
    const { empId, n } = nextEmpId(state, joinDate); state.seq.emp = n;
    const p = { id: uid('p'), empId, name: r.name.trim(), role: String(r.role || '').trim(), phone: String(r.phone || '').trim(), joinDate, shift: '', salary: 0, active: true, createdAt: Date.now() };
    state.staff.push(p);
    if (r.access) logins.push({ staff: p, role: r.access, pw: r.pw });
  });
  return logins;
}
/** Offline mode: create local logins (hashed passwords, must change at first login) */
async function createLocalLogins(logins) {
  for (const L of logins) {
    const u = { id: uid('u'), name: L.staff.name, phone: L.staff.phone, role: L.role, staffId: L.staff.id, active: true, mustChange: true, failed: 0, locked: false, createdAt: Date.now() };
    await setPassword(u, L.pw);
    S.users.push(u);
  }
}
function loginsSummary(results) {
  if (!results.length) return '';
  return `<p class="muted">Logins created — give each person their ID and first password privately:</p>
    <div class="list compact">${results.map((r) => `<div class="line-row"><span>${esc(r.name)} · ${esc(ROLES[r.role].label)}</span><b class="${r.ok ? 'emp-id' : 'neg'}">${r.ok ? esc(r.loginId) : esc(r.error)}</b></div>`).join('')}</div>`;
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  setupStart() { App.setup = { step: 1, mode: 'signup', qi: 0, d: { ...newDraft(), ...App.setup.d } }; render(); },
  howFinish(el) { keepSetupFields(el.closest('form')); App.setup.qi = HOW_SCREENS.length - 1; Forms.setupStep(new FormData(el.closest('form')), el.closest('form')); },
  setupBack(el) {
    keepSetupFields(el.closest('form'));
    if (stepName() === 'how' && (App.setup.qi || 0) > 0) { App.setup.qi -= 1; render(); window.scrollTo(0, 0); return; }
    if (App.setup.mode === 'profile' && App.setup.step <= 1) { App.setup = { step: 0, mode: 'signup', d: newDraft() }; history.replaceState(null, '', '#/settings'); return render(); }
    if (App.setup.mode === 'later' && App.setup.step <= 1) { App.setup = { step: 0, mode: 'signup', d: newDraft() }; return render(); }
    App.setup.step = Math.max(0, App.setup.step - 1); if (stepName() === 'how') App.setup.qi = HOW_SCREENS.length - 1; render(); window.scrollTo(0, 0);
  },
  setupSkip(el) { keepSetupFields(el.closest('form')); App.setup.d[stepName()] = [{}]; App.setup.step += 1; render(); window.scrollTo(0, 0); },
  rowAdd(el) { keepSetupFields(el.closest('form')); App.setup.d[el.dataset.list].push({}); render(); },
  rowDel(el) {
    keepSetupFields(el.closest('form'));
    const list = App.setup.d[el.dataset.list]; list.splice(Number(el.dataset.i), 1); if (!list.length) list.push({});
    render();
  },
  rowStarter(el) {
    keepSetupFields(el.closest('form'));
    const d = App.setup.d, list = el.dataset.list;
    const type = d.type || S.settings?.type || 'cafe', currency = d.currency || S.settings?.currency || 'INR';
    const keep = filled(d[list]);
    const extra = list === 'menu'
      ? starterMenu(type, currency).map((m) => ({ name: m.name, cat: m.cat, price: m.price }))
      : starterStock(type).map((s) => ({ name: s.name, unit: s.unit, qty: s.max, low: s.low }));
    d[list] = keep.concat(extra.filter((x) => !keep.some((k) => k.name.toLowerCase() === x.name.toLowerCase())));
    render(); toast('Starter list added — edit or remove anything that doesn\'t fit');
  },
  /** Settings → Data: open the Menu/Stock/Staff steps for an existing café */
  setupLater() { App.setup = { step: 1, mode: 'later', d: { ...newDraft(), type: S.settings.type, currency: S.settings.currency, short: S.settings.short } }; render(); window.scrollTo(0, 0); },
  eraseCafeData() {
    if (!confirm('Erase ALL café data — menu, stock, staff, bills, expenses, vendors, attendance and journal?\n\nYour café settings and login accounts stay. This cannot be undone.')) return;
    if (!confirm('Are you sure? Download a backup first if you might need this data.')) return;
    ['menu', 'orders', 'kots', 'stock', 'expenses', 'vendors', 'vendorTx', 'staff'].forEach((k) => { S[k] = []; });
    S.attendance = {}; S.journal = {};
    const hasLinked = S.users.some((u) => u.staffId || u.loginId);
    S.seq = { day: '', n: 0, emp: hasLinked ? S.seq.emp : 0 };
    S.users.forEach((u) => { if (u.staffId) u.staffId = null; });
    save(); toast('Café data erased');
    Actions.setupLater();
  },
});
Inputs.setupName = (el) => {
  const s = el.form.short;
  if (s && !s.dataset.touched) { s.value = shortCode(el.value); Inputs.setupShort(s, true); }
};
Inputs.setupShort = (el, auto) => {
  if (auto !== true) el.dataset.touched = '1';
  const code = (el.value || 'CC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'CC';
  const b = $('#emp-sample'); if (b) b.textContent = `${code}${String(new Date().getFullYear()).slice(-2)}001`;
};

/* ---------------- submit ---------------- */
Object.assign(Forms, {
  async setupStep(fd, form) {
    keepSetupFields(form);
    const d = App.setup.d, name = stepName();
    const err = stepError(name, d); if (err) return formError(err);
    if (name === 'how' && (App.setup.qi || 0) < HOW_SCREENS.length - 1) { App.setup.qi = (App.setup.qi || 0) + 1; render(); window.scrollTo(0, 0); return; }
    const last = App.setup.step === stepList().length;
    if (!last) { App.setup.step += 1; if (stepName() === 'how') App.setup.qi = 0; render(); window.scrollTo(0, 0); return; }

    if (App.setup.mode === 'later') return finishLater(form);
    if (App.setup.mode === 'profile') return saveProfile(form);

    // Offline (on-device) sign-up
    const perr = passwordError(fd.get('pw1'), fd.get('pw2'), { name: d.owner });
    if (!String(d.owner || '').trim()) return formError('Please enter your name.');
    if (!/^[+\d][\d\s-]{6,}$/.test(String(d.phone || '').trim())) return formError('Please enter a valid mobile number.');
    if (perr) return formError(perr);
    busy(form, true);
    const st = {
      name: d.name.trim(), short: d.short, tagline: String(d.tagline || '').trim(), type: d.type || 'cafe',
      currency: d.currency || 'INR', tables: clamp(num(d.tables), 0, 99), tax: num(d.tax),
      openHour: 8, closeHour: 22, accent: 'clay', theme: 'light', look: 3, footer: 'Thank you, visit again!',
      ...profileSettings(d.answers, d.owner),
    };
    S = emptyState(); S.settings = st;
    const owner = { id: uid('u'), name: d.owner.trim(), phone: String(d.phone).trim(), role: 'owner', staffId: null, active: true, mustChange: false, failed: 0, locked: false, createdAt: Date.now() };
    await setPassword(owner, fd.get('pw1'));
    S.users = [owner];
    await createLocalLogins(applyDraft(S, d));
    persist();
    App.setup = { step: 0, mode: 'signup', d: newDraft() };
    history.replaceState(null, '', location.pathname); render();
    openSheet(recoveryShownSheet(await newRecoveryCode(), owner.id)); // then logs in
  },
});

/** "Set up café details" from Settings: add menu / stock / staff to the current café */
async function finishLater(form) {
  const d = App.setup.d;
  busy(form, true);
  try {
    const logins = applyDraft(S, d);
    save();
    let results = [];
    if (ONLINE()) { await Cloud.flush(); results = await Cloud.giveAccessMany(logins); }
    else { await createLocalLogins(logins); persist(); results = logins.map((L) => ({ name: L.staff.name, role: L.role, ok: true, loginId: L.staff.empId })); }
    const added = draftCounts(d);
    App.setup = { step: 0, mode: 'signup', d: newDraft() };
    history.replaceState(null, '', '#/dashboard'); render();
    openSheet(`${sheetHead('Café details saved', S.settings.name)}<p>${added.length ? `Added ${esc(added.join(' · '))}.` : 'Nothing new was added.'}</p>${loginsSummary(results)}${btn('Done', 'closeSheet', { cls: 'primary block' })}`);
  } catch (e) { formError(e.message || String(e)); } finally { busy(form, false); }
}
