'use strict';
/* =========================================================
   More than one branch (owner, online)
   · Add a branch: a new café under the same owner login (menu + settings copied if wanted)
   · Switch between branches; the app remembers the last one
   · All branches: today's and this month's sales side by side
   ========================================================= */
const branchesOn = () => typeof Cloud !== 'undefined' && Cloud.on && Cloud.attached && Session.role() === 'owner';

async function loadBranches(force) {
  const uidMe = Cloud.auth?.currentUser?.uid;
  if (!branchesOn() || !uidMe || (App.branches && App.branchesFor === uidMe && !force)) return App.branches;
  App.branchesFor = uidMe;
  try {
    const prof = await FB.getDoc(FB.doc(Cloud.db, 'profiles', uidMe));
    const p = prof.exists() ? prof.data() : {};
    const ids = [...new Set([p.cafeId || Cloud.cid, ...(p.branches || [])].filter(Boolean))];
    const list = [];
    for (const id of ids) { try { const c = await FB.getDoc(FB.doc(Cloud.db, 'cafes', id)); list.push({ id, name: c.exists() ? c.data().name : id, main: id === p.cafeId }); } catch (e) { list.push({ id, name: id }); } }
    App.branches = list; App.branchProfile = p;
  } catch (e) { App.branches = [{ id: Cloud.cid, name: S.settings?.name || Cloud.cid, main: true }]; }
  return App.branches;
}
/** Sales today and this month for every branch (read straight from each branch) */
async function loadBranchSales() {
  const list = await loadBranches(); if (!list) return;
  const today = dayKey(), mStart = keyToDate(`${monthKey()}-01`).getTime();
  const out = {};
  for (const b of list) {
    try {
      const snap = await FB.getDocs(FB.query(FB.collection(Cloud.db, 'cafes', b.id, 'orders'), FB.where('createdAt', '>=', mStart - 864e5 * 2)));
      const paid = snap.docs.map((d) => d.data()).filter((o) => o.status === 'paid' && o.paidAt >= mStart);
      out[b.id] = { today: round2(sum(paid.filter((o) => dayKey(o.paidAt) === today), (o) => o.total)), month: round2(sum(paid, (o) => o.total)), bills: paid.filter((o) => dayKey(o.paidAt) === today).length };
    } catch (e) { out[b.id] = { error: true }; }
  }
  App.branchSales = { at: Date.now(), data: out };
  calmRender();
}
function branchCard() {
  if (!branchesOn()) return '';
  if (!App.branches || App.branchesFor !== Cloud.auth?.currentUser?.uid) { if (!App.brLoad) { App.brLoad = true; loadBranches(true).finally(() => { App.brLoad = false; calmRender(); }); } return ''; }
  if (App.branches.length > 1 && (!App.branchSales || Date.now() - App.branchSales.at > 120000) && !App.brLoading) { App.brLoading = true; loadBranchSales().finally(() => { App.brLoading = false; }); }
  const d = App.branchSales?.data || {};
  const list = App.branches;
  return `<section class="card br-card"><div class="card-head">${eyebrow(list.length > 1 ? 'All branches' : 'Branches')}${btn('Add a branch', 'branchAddOpen', { cls: 'ghost sm', ic: 'plus' })}</div>
    ${list.length > 1 ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Branch</th><th>Today</th><th>This month</th><th></th></tr></thead><tbody>${list.map((b) => `<tr class="${b.id === Cloud.cid ? 'b' : ''}"><td>${esc(b.name)}${b.id === Cloud.cid ? ' <small class="muted">(open now)</small>' : ''}</td><td>${d[b.id] ? (d[b.id].error ? '—' : money(d[b.id].today)) : '…'}</td><td>${d[b.id] ? (d[b.id].error ? '—' : money(d[b.id].month)) : '…'}</td><td>${b.id === Cloud.cid ? '' : btn('Open', 'branchSwitch', { cls: 'ghost sm', data: `data-id="${esc(b.id)}"` })}</td></tr>`).join('')}
      <tr class="b"><td>All branches</td><td>${money(sum(Object.values(d), (x) => x.today || 0))}</td><td>${money(sum(Object.values(d), (x) => x.month || 0))}</td><td></td></tr></tbody></table></div>`
      : '<p class="muted sm">Run more than one outlet? Add a branch — one login for you, its own staff, tables and bills, and combined sales here.</p>'}
  </section>`;
}
function branchAddSheet() {
  return `${sheetHead('Add a branch', 'Same owner login · its own staff, tables and bills')}
    <form class="form" data-form="branchAdd">
      <label class="field"><span>Branch name</span><input name="name" required maxlength="40" placeholder="e.g. ${esc(S.settings?.name || 'Cafe')} — Indiranagar" value="${esc(S.settings?.name || '')} — "></label>
      <label class="check"><input type="checkbox" name="menu" checked><span>Copy the menu (${pl(S.menu.length, 'dish', 'dishes')})</span></label>
      <label class="check"><input type="checkbox" name="settings" checked><span>Copy tax, bill and floor settings</span></label>
      <p class="muted sm">Staff, stock, tables' orders and bills start empty — add staff logins in the new branch's Team &amp; access.</p>
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('plus')}<span>Create the branch</span></button>
    </form>`;
}
/** Open another branch: same login, another café */
async function switchBranch(cid) {
  const user = Cloud.auth.currentUser; if (!user || cid === Cloud.cid) return;
  Cloud.unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
  Cloud.unsubs = []; Cloud.attached = false; Cloud.mirror = {};
  App.branchSales = null; App.ownerSeen = null; App.cleanSeen = null; App.billSeen = null; App.apprSeen = null;
  closeSheet();
  await attach(cid, user);
  toast(`Now in ${S.settings?.name || cid}`);
}
Object.assign(Actions, {
  branchAddOpen() { if (branchesOn()) openSheet(branchAddSheet()); },
  async branchSwitch(el) { await switchBranch(el.dataset.id); },
});
Object.assign(Forms, {
  async branchAdd(fd, form) {
    if (!branchesOn()) return;
    const name = String(fd.get('name') || '').trim().replace(/\s*[—-]\s*$/, '');
    if (name.length < 2) return formError('Enter the branch name.');
    busy(form, true);
    try {
      const user = Cloud.auth.currentUser, short = shortCode(name);
      let cid = '';
      for (let i = 0; i < 5 && !cid; i++) { const c = `${short.toLowerCase()}-${randomCode(5)}`; if (!(await FB.getDoc(FB.doc(Cloud.db, 'cafes', c))).exists()) cid = c; }
      if (!cid) throw new Error('Could not make a branch code — please try again.');
      await FB.setDoc(FB.doc(Cloud.db, 'cafes', cid), { name, short, tagline: S.settings?.tagline || '', ownerUid: user.uid, createdAt: Date.now() });
      const me = Cloud.members?.[user.uid] || Cloud.me || {};
      await FB.setDoc(FB.doc(Cloud.db, 'cafes', cid, 'members', user.uid), { name: me.name || 'Owner', phone: me.phone || '', email: me.email || user.email || '', role: 'owner', staffId: null, loginId: null, active: true, mustChange: false, createdAt: Date.now() });
      const keep = fd.get('settings') === 'on';
      const st = keep ? { ...plain(S.settings), name, short, licences: [], targets: {}, checklists: S.settings.checklists || null } : { name, short, currency: S.settings.currency, tax: S.settings.tax, tables: S.settings.tables, openHour: 8, closeHour: 22, accent: 'ink', theme: 'light', look: 4, footer: S.settings.footer || 'Thank you, visit again!', profile: S.settings.profile, features: S.settings.features };
      await FB.setDoc(FB.doc(Cloud.db, 'cafes', cid, 'meta', 'settings'), plain(st));
      await FB.setDoc(FB.doc(Cloud.db, 'cafes', cid, 'meta', 'seq'), { day: '', n: 0, emp: 0 });
      if (fd.get('menu') === 'on' && S.menu.length) {
        for (let i = 0; i < S.menu.length; i += 400) {
          const b = FB.writeBatch(Cloud.db);
          S.menu.slice(i, i + 400).forEach((m) => { const x = plain(m); delete x.recipe; delete x.soldOut; b.set(FB.doc(Cloud.db, 'cafes', cid, 'menu', m.id), x); });
          await b.commit();
        }
      }
      const prof = (await FB.getDoc(FB.doc(Cloud.db, 'profiles', user.uid))).data() || {};
      await FB.updateDoc(FB.doc(Cloud.db, 'profiles', user.uid), { branches: [...new Set([...(prof.branches || []), cid])] });
      await loadBranches(true);
      closeSheet();
      openSheet(`${sheetHead('Branch created', name)}<p>Branch code: <b class="recovery-code">${esc(cid)}</b> — staff of this branch log in with it.</p><div class="btn-row">${btn(`Open ${esc(name)}`, 'branchSwitch', { cls: 'primary', data: `data-id="${esc(cid)}"` })}${btn('Stay here', 'closeSheet', { cls: 'ghost' })}</div>`);
    } catch (e) { formError(friendly(e)); } finally { busy(form, false); }
  },
});
