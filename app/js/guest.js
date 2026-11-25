'use strict';
/* =========================================================
   Guest demo — lets an owner try Cafe Journal in seconds:
   pick a kind of place → straight into a café full of sample
   data, logged in as the owner. No account, no password.
   NOTHING is saved online: every write stays in this browser tab.
   Refreshing starts a fresh demo of the same kind; "Exit demo"
   (or Log out) ends it.
   ========================================================= */
(function () {
  if (typeof Cloud === 'undefined') return;
  const GUEST_KEY = 'cj.guest';
  const GUEST_ID = 'guest-owner';
  App.guestPreset = App.guestPreset || 'cafe';

  /* ---------------- screens ---------------- */
  function guestView() {
    const a = presetAnswers(App.guestPreset);
    return `<main class="center-screen onboard">
      <form class="card onb wide" data-form="guestStart" novalidate>
        <div class="brand-mark lg">${icon('cup')}</div>
        <h1>Try it as a guest</h1>
        <p class="muted center">No sign-up, no password. Pick the kind of place you run and open a demo café full of sample orders, bills, stock and staff — as the owner.</p>
        ${presetPicker(a, false)}
        ${previewHtml(deriveFeatures(a))}
        <div class="banner info">${icon('lock')}<span><b>Nothing is saved.</b> It's a practice café that lives only in this browser tab. Close or refresh and it starts fresh. To keep your work, sign up.</span></div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="guestBack">${icon('left')}<span>Back</span></button>
          <button type="submit" class="btn primary">${icon('right')}<span>Open the demo</span></button>
        </div>
      </form></main>`;
  }
  const guestChoice = `<button class="choice" data-act="goGuest">${icon('eye')}<span><b>Try as a guest</b><small>No sign-up — open a demo café with sample data</small></span>${icon('right')}</button>`;
  const guestLink = `<p class="center sm guest-link"><button type="button" class="link-btn" data-act="goGuest">${icon('eye')} Just looking? Try a demo as a guest</button></p>`;

  const baseScreen = Cloud.screen;
  Cloud.screen = () => {
    if (parseHash().view === 'guest') { App.cloudView = 'guest'; history.replaceState(null, '', location.pathname); }
    if (App.cloudView === 'guest') return guestView();
    let h = baseScreen();
    if (h.includes('data-act="goLogin"') && h.includes('Welcome to Cafe Journal')) h = h.replace(/(<button class="choice" data-act="goLogin">[\s\S]*?<\/button>)/, `$1${guestChoice}`);
    else if (h.includes('data-form="login"')) h = h.replace('</form>', `${guestLink}</form>`);
    return h;
  };

  /* ---------------- start / stop ---------------- */
  function demoSettings(preset) {
    const p = PRESETS[preset] || PRESETS.cafe;
    const a = presetAnswers(preset);
    a.q_gst = 'regular'; a.q_gstin = '29ABCDE1234F1Z5'; a.q_fssai = '10012345678901';
    return {
      name: `Demo ${p.label.split(' / ')[0]}`, short: 'DM', tagline: 'Guest demo · sample data', currency: 'INR',
      openHour: 8, closeHour: 22, accent: 'ink', theme: 'light', look: 4, footer: 'Thank you, visit again!',
      ...profileSettings(a, 'Guest'),
    };
  }
  function startGuest(preset) {
    Cloud.demo = true;
    S = emptyState();
    S.settings = demoSettings(preset);
    if (!S.settings.tables && S.settings.features.tables) S.settings.tables = 8;
    makeDemo(S);
    // the guest is the owner; demo staff have no logins
    S.users = [{ id: GUEST_ID, name: 'Guest Owner', role: 'owner', staffId: null, active: true, mustChange: false, locked: false, hash: 'guest', createdAt: Date.now() }];
    Cloud.me = { id: GUEST_ID, uid: GUEST_ID, name: 'Guest Owner', role: 'owner' };
    Cloud.cid = 'demo'; Cloud.attached = true; Cloud.loading = false; Cloud.restoring = false;
    App.cloudView = ''; App.chat = [];
    Session.set(GUEST_ID);
    try { sessionStorage.setItem(GUEST_KEY, preset); } catch (e) { /* ignore */ }
    history.replaceState(null, '', '#/dashboard');
    render(); window.scrollTo(0, 0);
    toast('Welcome! This is a demo café — try anything, nothing is saved.');
  }
  function stopGuest(goTo) {
    Cloud.demo = false; Cloud.attached = false; Cloud.me = null; Cloud.cid = '';
    try { sessionStorage.removeItem(GUEST_KEY); } catch (e) { /* ignore */ }
    Session._id = null; Session.locked = false; Session.save();
    S = emptyState(); App.chat = [];
    closeSheet();
    App.cloudView = goTo || '';
    history.replaceState(null, '', location.pathname);
    render();
  }
  Cloud.startGuest = startGuest; Cloud.stopGuest = stopGuest;

  /* ---------------- never touch the real database while in the demo ---------------- */
  const wrap = (obj, name, fn) => { const orig = obj[name]; obj[name] = function (...args) { return Cloud.demo ? fn(...args) : orig.apply(this, args); }; };
  wrap(Cloud, 'push', () => {});
  wrap(Cloud, 'flush', async () => {});
  wrap(Cloud, 'ensureMonth', async () => {});
  wrap(Cloud, 'signOut', async () => stopGuest(''));
  wrap(Cloud, 'giveAccessMany', async (list) => list.map((L) => ({ name: L.staff.name, role: L.role, ok: false, error: 'Not in the demo' })));
  const notInDemo = () => toast('Logins and passwords can’t be changed in the guest demo. Sign up to create real staff logins.');
  ['access', 'setPw', 'newPw'].forEach((k) => wrap(Forms, k, notInDemo));
  ['unlockUser', 'accessDel', 'setPwOpen', 'myPin', 'exportData'].forEach((k) => wrap(Actions, k, notInDemo));
  // stock goes down locally in the demo
  const baseUse = applyStockUse;
  applyStockUse = (use) => {
    if (!Cloud.demo) return baseUse(use);
    Object.entries(use).forEach(([id, q]) => { const s = byId(S.stock, id); if (s) s.qty = Math.max(0, r6(Number(s.qty) - q)); });
  };
  // no idle lock for the guest (there is no password to unlock with)
  const baseIdle = Session.idleLimit.bind(Session);
  Session.idleLimit = (role) => (Cloud.demo ? Infinity : baseIdle(role));

  /* ---------------- a slim bar on every demo screen ---------------- */
  window.guestBar = () => (Cloud.demo ? `<div class="guest-bar" role="status">${icon('eye')}<span><b>Guest demo</b> · sample data · nothing is saved</span>
    <button type="button" class="btn primary sm" data-act="guestSignup">Sign up free</button><button type="button" class="btn ghost sm" data-act="guestExit">Exit demo</button></div>` : '');

  Object.assign(Actions, {
    goGuest() { App.cloudView = 'guest'; render(); window.scrollTo(0, 0); },
    guestBack() { App.cloudView = ''; render(); },
    guestExit() { stopGuest(''); },
    guestSignup() { stopGuest('signup'); App.setup.step = 0; render(); },
  });
  Forms.guestStart = (fd) => startGuest(PRESETS[fd.get('a_q_preset')] ? String(fd.get('a_q_preset')) : 'cafe');
  // picking a type updates the preview right away
  document.addEventListener('change', (e) => {
    if (e.target.name === 'a_q_preset' && e.target.closest('form[data-form="guestStart"]')) { App.guestPreset = e.target.value; render(); }
  });

  // A refresh during the demo opens a fresh demo of the same kind
  let again = ''; try { again = sessionStorage.getItem(GUEST_KEY) || ''; } catch (e) { /* ignore */ }
  if (again && PRESETS[again]) {
    App.guestPreset = again;
    const t = setInterval(() => { if (!Cloud.restoring) { clearInterval(t); if (!Cloud.attached) startGuest(again); } }, 100);
  }
})();
