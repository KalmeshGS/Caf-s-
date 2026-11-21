'use strict';
/* =========================================================
   First-run: welcome screen + 3-step setup wizard
   ========================================================= */

App.setup = { step: 0, d: { type: 'cafe', currency: 'INR', tables: 8, tax: 5, demo: 'on' } };
const SETUP_TYPES = [
  ['cafe', 'Café', 'cup'], ['restaurant', 'Restaurant', 'flame'], ['hotel', 'Hotel / Dhaba', 'grid'],
  ['bakery', 'Bakery', 'box'], ['other', 'Something else', 'more'],
];

Views.setup = () => {
  const { step, d } = App.setup;
  if (step === 0) {
    return `<main class="center-screen onboard">
      <div class="card onb">
        <div class="brand-mark lg">${icon('cup')}</div>
        <h1>Welcome to Cafe Journal</h1>
        <p class="muted center">Orders, kitchen, billing, stock, staff and reports — one calm app for your café, restaurant or hotel.</p>
        ${App.setup.intent === 'login' ? `<div class="banner info">${icon('lock')}<span><b>No café is set up on this device yet.</b> If you already have an account on another phone or computer, restore your backup below. If you're new, sign up.</span></div>` : ''}
        <button class="choice primary" data-act="setupStart">${icon('plus')}<span><b>Sign up — new café</b><small>3 quick steps: your place, how you work, your owner account</small></span>${icon('right')}</button>
        <button class="choice" data-act="importData">${icon('upload')}<span><b>I already have an account</b><small>Restore your backup file from another phone or computer, then log in</small></span>${icon('right')}</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <p class="fine center">${icon('lock')} Your data stays on this device. Nothing is uploaded.</p>
      </div>
      <p class="fine center version">Cafe Journal v${APP_VERSION}</p></main>`;
  }
  const titles = ['', 'About your place', 'How you work', 'Your owner account'];
  const v = (k) => esc(d[k] ?? '');
  let body = '';
  if (step === 1) {
    body = `
      <label class="field"><span>Name of your place</span><input name="name" required maxlength="40" placeholder="e.g. Corner Café" value="${v('name')}" data-input="setupName" autofocus></label>
      <div class="row-2">
        <label class="field"><span>Short code <em>(for employee IDs)</em></span><input name="short" required maxlength="4" value="${v('short')}" placeholder="CC" style="text-transform:uppercase" data-input="setupShort"></label>
        <div class="field"><span>Employee IDs will look like</span><div class="emp-sample" id="emp-sample">${esc(((d.short || 'CC') + String(new Date().getFullYear()).slice(-2) + '001').toUpperCase())}</div></div>
      </div>
      <div class="field"><span>What kind of place is it?</span>
        <div class="type-grid">${SETUP_TYPES.map(([k, label, ic]) => `<label class="type-card"><input type="radio" name="type" value="${k}" ${d.type === k ? 'checked' : ''}><span>${icon(ic)}<b>${esc(label)}</b></span></label>`).join('')}</div></div>
      <label class="field"><span>Tagline <em>(optional — shows on login & receipts)</em></span><input name="tagline" maxlength="60" placeholder="e.g. Chai · Coffee · Sandwiches" value="${v('tagline')}"></label>`;
  } else if (step === 2) {
    body = `
      <label class="field"><span>Currency</span><select name="currency">${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === d.currency ? 'selected' : ''}>${esc(c.code)} · ${esc(c.symbol.trim())}</option>`).join('')}</select></label>
      <div class="row-2">
        <label class="field"><span>Number of tables</span><input name="tables" type="number" min="0" max="99" required value="${v('tables')}"><small class="muted">0 if you only do takeaway</small></label>
        <label class="field"><span>Tax on bills (%)</span><input name="tax" type="number" min="0" max="40" step="0.5" value="${v('tax')}"><small class="muted">e.g. 5 for GST 5%</small></label>
      </div>
      <p class="muted sm">You get a starter menu and stock list for your type of place — edit them any time in Settings.</p>`;
  } else {
    body = `
      <div class="row-2">
        <label class="field"><span>Your name</span><input name="owner" required maxlength="40" value="${v('owner')}" autocomplete="name"></label>
        <label class="field"><span>Your mobile</span><input name="phone" type="tel" required maxlength="20" value="${v('phone')}" autocomplete="tel"></label>
      </div>
      ${pwField('pw1', `Create a password <em>(at least ${PW_MIN} characters)</em>`)}
      ${pwField('pw2', 'Repeat password')}
      <label class="check"><input type="checkbox" name="demo" ${d.demo ? 'checked' : ''}><span>Add sample data so I can explore first <small class="muted">(remove later in Settings → Data)</small></span></label>
      <p class="muted sm">${icon('lock')} You'll log in with your name or mobile and this password. Next you'll get a recovery code in case you ever forget it.</p>`;
  }
  return `<main class="center-screen onboard">
    <form class="card onb" data-form="setupStep" autocomplete="off">
      <div class="steps-bar" aria-label="Step ${step} of 3">${[1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <p class="eyebrow">Sign up · step ${step} of 3</p>
      <h1>${titles[step]}</h1>
      ${body}
      <p class="neg sm" id="form-err" role="alert"></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-act="setupBack">${icon('left')}<span>Back</span></button>
        <button type="submit" class="btn primary">${step === 3 ? `${icon('check')}<span>Create my café</span>` : `<span>Continue</span>${icon('right')}`}</button>
      </div>
    </form></main>`;
};

function keepSetupFields(form) {
  if (!form) return;
  const fd = new FormData(form);
  for (const [k, val] of fd.entries()) if (!/^pw/.test(k)) App.setup.d[k] = val;
  if (App.setup.step === 3) App.setup.d.demo = fd.get('demo') ? 'on' : '';
}

Object.assign(Actions, {
  setupStart() { App.setup.step = 1; render(); },
  setupBack(el) { keepSetupFields(el.closest('form')); App.setup.step = Math.max(0, App.setup.step - 1); render(); },
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

Object.assign(Forms, {
  async setupStep(fd, form) {
    keepSetupFields(form);
    const d = App.setup.d;
    if (App.setup.step === 1) {
      if (!String(d.name || '').trim()) return formError('Please enter the name of your place.');
      d.short = String(d.short || shortCode(d.name)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (d.short.length < 2) return formError('Short code needs 2–4 letters, e.g. KK.');
    }
    if (App.setup.step < 3) { App.setup.step += 1; return render(); }

    const err = passwordError(fd.get('pw1'), fd.get('pw2'), { name: d.owner });
    if (!String(d.owner || '').trim()) return formError('Please enter your name.');
    if (!/^[+\d][\d\s-]{6,}$/.test(String(d.phone || '').trim())) return formError('Please enter a valid mobile number.');
    if (err) return formError(err);
    busy(form, true);
    const st = {
      name: d.name.trim(), short: d.short, tagline: String(d.tagline || '').trim(), type: d.type || 'cafe',
      currency: d.currency || 'INR', tables: clamp(num(d.tables), 0, 99), tax: num(d.tax),
      openHour: 8, closeHour: 22, accent: 'green', theme: 'auto', footer: 'Thank you, visit again!',
    };
    S = emptyState(); S.settings = st;
    const owner = { id: uid('u'), name: d.owner.trim(), phone: String(d.phone).trim(), role: 'owner', staffId: null, active: true, mustChange: false, failed: 0, locked: false, createdAt: Date.now() };
    await setPassword(owner, fd.get('pw1'));
    S.users = [owner];
    if (d.demo) makeDemo(S);
    else { S.menu = starterMenu(st.type, st.currency); S.stock = starterStock(st.type); }
    persist();
    App.setup = { step: 0, d: {} };
    history.replaceState(null, '', location.pathname); render();
    openSheet(recoveryShownSheet(await newRecoveryCode(), owner.id)); // then logs in
  },
});
