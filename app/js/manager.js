'use strict';
/* =========================================================
   Manager tools + "My work" for every staff member
   · Weekly shift roster (staff see their shifts and get a reminder)
   · Leave requests (ask from the phone, manager approves → attendance + payroll)
   · Check in / check out from the phone (attendance fills itself, late marks)
   · Purchase orders to suppliers (from low stock, WhatsApp, receive against it)
   · Repairs & maintenance · Complaints & incidents
   · Staff tasks · Staff scorecard · Training & how-to library
   ========================================================= */
const MGR_ROLES = ['owner', 'manager'];
const isMgr = () => MGR_ROLES.includes(Session.role());
const meKey = () => { const u = Session.user(); return u ? (u.staffId || u.id) : null; };
const meName = () => Session.user()?.name || '';
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_SHIFTS = { Morning: { start: '08:00', end: '16:00' }, Evening: { start: '16:00', end: '23:59' }, 'Full day': { start: '10:00', end: '22:00' } };
const LATE_GRACE_MIN = 15;
const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);
/** Attendance is saved as present / late / leave / absent; counts use P / L / Lv / A */
const ATT_SHORT = { present: 'P', late: 'L', leave: 'Lv', absent: 'A' }, ATT_LONG = { P: 'present', L: 'late', Lv: 'leave', A: 'absent' };

/* ---------------- roster ---------------- */
const weekOf = (k) => (typeof weekStart === 'function' ? weekStart(k) : k);
const rosterOf = (ws) => (S.roster || {})[ws] || null;
const shiftsOf = (r) => (r && r.shifts && Object.keys(r.shifts).length ? r.shifts : DEFAULT_SHIFTS);
/** Someone's plan for a day: shift name, 'Off', 'Leave' or '' */
function planFor(pk, dk) {
  if (leaveOn(pk, dk)) return 'Leave';
  const r = rosterOf(weekOf(dk)); return r?.plan?.[pk]?.[dk] || '';
}
function shiftTime(dk, name) { const r = rosterOf(weekOf(dk)); const s = shiftsOf(r)[name]; return s ? `${s.start}–${s.end}` : ''; }
const people = () => (S.staff || []).filter((p) => p.active !== false);
function rosterSheet() {
  const ws = App.ui.rosterWeek || weekOf(dayKey()), r = rosterOf(ws) || {}, sh = shiftsOf(r);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(ws, i));
  const opts = (sel) => `<option value="">—</option>${Object.keys(sh).map((n) => `<option ${sel === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option ${sel === 'Off' ? 'selected' : ''}>Off</option>`;
  return `${sheetHead('Shift roster', `Week of ${fmtDate(keyToDate(ws), { day: 'numeric', month: 'short' })}`)}
    <div class="btn-row tight">${btn('◀ Previous', 'rosterWeek', { cls: 'ghost sm', data: 'data-d="-7"' })}${btn('Next ▶', 'rosterWeek', { cls: 'ghost sm', data: 'data-d="7"' })}${btn('Copy last week', 'rosterCopy', { cls: 'ghost sm' })}${btn('Send on WhatsApp', 'rosterShare', { cls: 'ghost sm', ic: 'send' })}</div>
    <p class="muted sm">Shifts: ${Object.entries(sh).map(([n, s]) => `${esc(n)} ${esc(s.start)}–${esc(s.end)}`).join(' · ')}. Approved leave shows by itself.</p>
    ${people().length ? `<form class="form" data-form="roster" data-ws="${ws}"><div class="tbl-wrap"><table class="tbl roster-tbl"><thead><tr><th>Staff</th>${days.map((d, i) => `<th>${DOW[i]} ${Number(d.slice(8))}</th>`).join('')}</tr></thead><tbody>
      ${people().map((p) => `<tr><td>${esc(p.name)}<small class="muted"> ${esc(p.role || '')}</small></td>${days.map((d) => leaveOn(p.id, d) ? '<td><em class="lv">Leave</em></td>' : `<td><select name="${esc(p.id)}|${d}" aria-label="${esc(p.name)} ${d}">${opts(r.plan?.[p.id]?.[d] || '')}</select></td>`).join('')}</tr>`).join('')}
    </tbody></table></div><button class="btn primary block" type="submit">${icon('check')}<span>Save roster</span></button></form>`
      : '<p class="muted">Add staff first (Staff).</p>'}`;
}
function rosterText(ws) {
  const r = rosterOf(ws) || {}, days = Array.from({ length: 7 }, (_, i) => shiftDay(ws, i));
  return [`*Roster — week of ${fmtDate(keyToDate(ws), { day: 'numeric', month: 'short' })}*`, ...people().map((p) => `${p.name}: ${days.map((d, i) => `${DOW[i]} ${planFor(p.id, d) || '—'}`).join(', ')}`)].join('\n');
}

/* ---------------- leave ---------------- */
const leaveOn = (pk, dk) => (S.leaves || []).some((l) => l.pk === pk && l.status === 'approved' && dk >= l.from && dk <= l.to);
const pendingLeaves = () => (S.leaves || []).filter((l) => l.status === 'pending').sort((a, b) => a.at - b.at);
function leaveAdminSheet() {
  const list = (S.leaves || []).slice().sort((a, b) => b.at - a.at).slice(0, 60);
  return `${sheetHead('Leave requests', `${pendingLeaves().length} waiting`)}
    ${list.map((l) => `<div class="line-row lv-row"><span><b>${esc(l.name)}</b><small class="muted"> · ${esc(fmtDate(keyToDate(l.from), { day: 'numeric', month: 'short' }))}${l.to !== l.from ? ` – ${esc(fmtDate(keyToDate(l.to), { day: 'numeric', month: 'short' }))}` : ''} · ${pl(leaveDays(l), 'day')}${l.reason ? ` · ${esc(l.reason)}` : ''}</small></span>
      ${l.status === 'pending' ? `<span class="btn-row tight">${btn('Approve', 'leaveDecide', { cls: 'primary sm', data: `data-id="${l.id}" data-v="approved"` })}${btn('No', 'leaveDecide', { cls: 'ghost sm', data: `data-id="${l.id}" data-v="rejected"` })}</span>` : `<small class="${l.status === 'approved' ? 'pos' : 'neg'}">${l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Not approved' : 'Cancelled'}${l.decidedBy ? ` · ${esc(l.decidedBy)}` : ''}</small>`}</div>`).join('') || '<p class="muted">No leave requests yet. Staff ask from “My work” on their phone.</p>'}`;
}
const leaveDays = (l) => Math.round((keyToDate(l.to) - keyToDate(l.from)) / 864e5) + 1;

/* ---------------- check in / out → attendance ---------------- */
const clockOf = (pk, dk) => (S.clock || []).find((c) => c.pk === pk && c.day === dk) || null;
/** Attendance for a day: what the manager marked, else check-in (late after the shift start + 15 min), else approved leave */
function attOf(dk, pk) {
  const man = (S.attendance || {})[dk]?.[pk]; if (man) return ATT_SHORT[man] || man;
  const c = clockOf(pk, dk);
  if (c?.in) {
    const plan = planFor(pk, dk), s = shiftsOf(rosterOf(weekOf(dk)))[plan];
    if (s) { const [h, m] = s.start.split(':').map(Number); const startT = keyToDate(dk).getTime() + (h * 60 + m) * 60000; return c.in > startT + LATE_GRACE_MIN * 60000 ? 'L' : 'P'; }
    return 'P';
  }
  return leaveOn(pk, dk) ? 'Lv' : '';
}
/** For the Staff screen: check-ins and approved leave, as present / late / leave */
const autoAtt = (dk) => { const out = {}; people().forEach((p) => { if (!(S.attendance || {})[dk]?.[p.id]) { const a = attOf(dk, p.id); if (a) out[p.id] = ATT_LONG[a]; } }); return out; };

/* ---------------- tasks ---------------- */
const taskDone = (tid, dk = dayKey()) => (S.taskLog || {})[dk]?.[tid] || null;
const tasksFor = (pk, role, dk = dayKey()) => (S.taskDefs || []).filter((t) => (t.daily || t.date === dk) && (t.who === 'all' || t.who === pk || t.who === `role:${role}`));
function tasksAdminSheet() {
  const dk = dayKey(), defs = (S.taskDefs || []).filter((t) => t.daily || t.date >= dk);
  const whoLabel = (w) => (w === 'all' ? 'Everyone' : w.startsWith('role:') ? `All ${ROLES[w.slice(5)]?.label || w.slice(5)}s` : byId(S.staff, w)?.name || 'Someone');
  return `${sheetHead('Staff tasks', 'Daily jobs and one-off tasks')}
    ${defs.map((t) => { const d = taskDone(t.id, dk); return `<div class="line-row tk-row"><span><b>${esc(t.title)}</b><small class="muted"> · ${esc(whoLabel(t.who))} · ${t.daily ? 'every day' : esc(fmtDate(keyToDate(t.date), { day: 'numeric', month: 'short' }))}</small></span><span>${d ? `<small class="pos">${icon('check')} ${esc(d.by)} ${esc(fmtTime(d.at))}</small>` : '<small class="muted">not done</small>'} <button class="icon-btn sm" data-act="taskDel" data-id="${t.id}" aria-label="Remove">${icon('trash')}</button></span></div>`; }).join('') || '<p class="muted sm">No tasks yet.</p>'}
    <form class="form" data-form="taskAdd">${eyebrow('Add a task')}
      <label class="field"><span>Task</span><input name="title" required maxlength="60" placeholder="e.g. Clean the kitchen chimney"></label>
      <div class="row-2"><label class="field"><span>For</span><select name="who"><option value="all">Everyone</option>${['waiter', 'captain', 'kitchen', 'cashier', 'housekeeping'].map((r) => `<option value="role:${r}">All ${ROLES[r].label}s</option>`).join('')}${people().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>When</span><select name="when"><option value="daily">Every day</option><option value="today">Today only</option></select></label></div>
      <button class="btn primary block" type="submit">${icon('plus')}<span>Add</span></button></form>`;
}

/* ---------------- repairs & complaints ---------------- */
const openRepairs = () => (S.repairs || []).filter((r) => r.status !== 'fixed').sort((a, b) => a.at - b.at);
const openIncidents = () => (S.incidents || []).filter((r) => r.status !== 'solved').sort((a, b) => a.at - b.at);
function repairSheet() {
  return `${sheetHead('Report a repair', 'Something broken or not working')}
    <form class="form" data-form="repairAdd"><label class="field"><span>What is broken</span><input name="what" required maxlength="60" placeholder="e.g. Fridge 2 not cooling"></label>
    <label class="field"><span>Where <em>(optional)</em></span><input name="where" maxlength="40" placeholder="e.g. Kitchen, Table 4"></label>
    <button class="btn primary block" type="submit">${icon('send')}<span>Report</span></button></form>`;
}
function incidentSheet() {
  return `${sheetHead('Complaint / incident', 'Write down what happened')}
    <form class="form" data-form="incidentAdd">
      <div class="seg">${[['guest', 'Guest complaint'], ['staff', 'Staff issue'], ['other', 'Other']].map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label class="field"><span>What happened</span><textarea name="text" required maxlength="400" rows="3"></textarea></label>
      <label class="field"><span>Table / guest <em>(optional)</em></span><input name="where" maxlength="40"></label>
      <button class="btn primary block" type="submit">${icon('send')}<span>Save</span></button></form>`;
}
function issuesSheet() {
  const rep = (S.repairs || []).slice().sort((a, b) => (a.status === 'fixed') - (b.status === 'fixed') || b.at - a.at).slice(0, 40);
  const inc = (S.incidents || []).slice().sort((a, b) => (a.status === 'solved') - (b.status === 'solved') || b.at - a.at).slice(0, 40);
  return `${sheetHead('Repairs & complaints', `${openRepairs().length} repairs open · ${openIncidents().length} complaints open`)}
    <div class="btn-row tight">${btn('Report a repair', 'repairOpen', { cls: 'ghost sm', ic: 'plus' })}${btn('Log a complaint', 'incidentOpen', { cls: 'ghost sm', ic: 'plus' })}</div>
    ${eyebrow('Repairs')}${rep.map((r) => `<div class="line-row is-row ${r.status}"><span><b>${esc(r.what)}</b><small class="muted">${r.where ? ` · ${esc(r.where)}` : ''} · by ${esc(r.by)} · ${esc(ago(r.at))}${r.assignee ? ` · with ${esc(r.assignee)}` : ''}${r.status === 'fixed' ? ` · fixed${r.cost ? ` (${money(r.cost)})` : ''} by ${esc(r.fixedBy || '')}` : ''}</small></span>${r.status === 'fixed' ? `<small class="pos">${icon('check')} Fixed</small>` : `<span class="btn-row tight">${btn('Assign', 'repairAssign', { cls: 'ghost sm', data: `data-id="${r.id}"` })}${btn('Fixed', 'repairFixed', { cls: 'primary sm', data: `data-id="${r.id}"` })}</span>`}</div>`).join('') || '<p class="muted sm">Nothing broken.</p>'}
    ${eyebrow('Complaints & incidents')}${inc.map((r) => `<div class="line-row is-row ${r.status}"><span><b>${esc({ guest: 'Guest', staff: 'Staff', other: 'Other' }[r.kind] || 'Note')}:</b> ${esc(r.text)}<small class="muted">${r.where ? ` · ${esc(r.where)}` : ''} · by ${esc(r.by)} · ${esc(ago(r.at))}${r.status === 'solved' ? ` · solved: ${esc(r.resolution || '')} (${esc(r.solvedBy || '')})` : ''}</small></span>${r.status === 'solved' ? `<small class="pos">${icon('check')}</small>` : btn('Solved', 'incidentSolve', { cls: 'primary sm', data: `data-id="${r.id}"` })}</div>`).join('') || '<p class="muted sm">No complaints logged.</p>'}`;
}

/* ---------------- purchase orders ---------------- */
function poSheet() {
  const list = (S.pos || []).slice().sort((a, b) => b.at - a.at).slice(0, 30);
  return `${sheetHead('Purchase orders', 'Order from suppliers, receive against the order')}
    ${btn('New order from low stock', 'poNew', { cls: 'primary', ic: 'plus' })}
    ${list.map((p) => { const short = p.got ? p.lines.filter((l) => (p.got[l.stockId] || 0) < l.qty) : []; return `<div class="card po-row"><div class="line-row"><span><b>PO-${p.no} · ${esc(p.vendorName)}</b><small class="muted"> · ${esc(fmtDate(keyToDate(p.date), { day: 'numeric', month: 'short' }))} · ${pl(p.lines.length, 'item')} · ${money(sum(p.lines, (l) => l.qty * l.price))}</small></span><small class="${p.status === 'received' ? 'pos' : ''}">${p.status === 'received' ? 'Received' : p.status === 'cancelled' ? 'Cancelled' : 'Sent'}</small></div>
      <small class="muted">${p.lines.map((l) => `${esc(l.name)} ${+l.qty.toFixed(2)} ${esc(l.unit)}${p.got ? ` (got ${+(p.got[l.stockId] || 0).toFixed(2)})` : ''}`).join(' · ')}</small>
      ${short.length ? `<p class="sm neg">${icon('alert')} Short: ${short.map((l) => esc(l.name)).join(', ')}</p>` : ''}
      ${p.status === 'sent' ? `<div class="btn-row tight">${btn('Receive', 'poReceiveOpen', { cls: 'primary sm', data: `data-id="${p.id}"` })}${btn('WhatsApp', 'poShare', { cls: 'ghost sm', ic: 'send', data: `data-id="${p.id}"` })}${btn('Cancel', 'poCancel', { cls: 'ghost sm', data: `data-id="${p.id}"` })}</div>` : ''}</div>`; }).join('') || '<p class="muted sm">No orders yet.</p>'}`;
}
function poNewSheet() {
  const low = S.stock.filter((s) => Number(s.qty) < Number(s.max || 0) && (isLow(s) || Number(s.qty) < Number(s.max) * 0.5));
  return `${sheetHead('New purchase order', 'Quantities suggested to fill up to the maximum')}
    <form class="form" data-form="poAdd">
      <label class="field"><span>Supplier</span><select name="vendor" required><option value="">Choose…</option>${S.vendors.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>
      ${S.stock.map((s) => { const sug = Math.max(0, r6(Number(s.max || 0) - Number(s.qty || 0))); const on = low.includes(s); return `<div class="line-row po-line"><label class="check"><input type="checkbox" name="pick" value="${s.id}" ${on ? 'checked' : ''}><span>${esc(s.name)}<small class="muted"> · have ${+Number(s.qty).toFixed(2)} ${esc(s.unit)}${isLow(s) ? ' · <b class="neg">low</b>' : ''}</small></span></label><input class="inline-input" name="q:${s.id}" type="number" min="0" step="any" value="${+sug.toFixed(2) || ''}" aria-label="${esc(s.name)} quantity"></div>`; }).join('') || '<p class="muted">Add stock items first.</p>'}
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('send')}<span>Save & send on WhatsApp</span></button>
    </form>`;
}
function poReceiveSheet(p) {
  return `${sheetHead(`Receive PO-${p.no}`, p.vendorName)}
    <form class="form" data-form="poReceive" data-id="${p.id}">
      ${p.lines.map((l) => `<div class="row-3 po-rec"><span>${esc(l.name)}<small class="muted"> · ordered ${+l.qty.toFixed(2)} ${esc(l.unit)}</small></span><label class="field"><span>Got</span><input name="g:${l.stockId}" type="number" min="0" step="any" value="${l.qty}"></label><label class="field"><span>Amount ₹</span><input name="a:${l.stockId}" type="number" min="0" step="any" value="${round2(l.qty * l.price) || ''}"></label></div>`).join('')}
      <div class="seg"><label><input type="radio" name="paid" value="1" checked><span>Paid now</span></label><label><input type="radio" name="paid" value="0"><span>Pay later</span></label></div>
      <label class="field"><span>Bill / invoice no. <em>(optional)</em></span><input name="invoice" maxlength="30"></label>
      <p class="neg sm" id="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${icon('check')}<span>Add to stock</span></button></form>`;
}

/* ---------------- scorecard ---------------- */
function scorecardRows(mk) {
  const today = dayKey(), days = []; for (let k = `${mk}-01`; k.startsWith(mk) && k <= today; k = shiftDay(k, 1)) days.push(k);
  return people().map((p) => {
    const users = (S.users || []).filter((u) => u.staffId === p.id).map((u) => u.id);
    const bills = paidOrders().filter((o) => monthKey(o.paidAt) === mk && users.includes(o.byId));
    const rated = bills.filter((o) => o.rating);
    const c = { P: 0, L: 0, Lv: 0, A: 0 }; days.forEach((d) => { const a = attOf(d, p.id); if (a) c[a] = (c[a] || 0) + 1; });
    const tasks = sum(days, (d) => Object.keys((S.taskLog || {})[d] || {}).filter((tid) => ((S.taskLog[d][tid].pk) === p.id)).length);
    return { p, bills: bills.length, sales: round2(sum(bills, (o) => o.total)), rating: rated.length ? (sum(rated, (o) => o.rating) / rated.length).toFixed(1) : '—', ...c, tasks, linked: users.length > 0 };
  });
}
function scorecardSheet() {
  const mk = App.ui.scMonth || monthKey(), rows = scorecardRows(mk);
  return `${sheetHead('Staff scorecard', monthLabel(mk))}
    <label class="field"><span>Month</span><input type="month" value="${mk}" max="${monthKey()}" data-change="scMonth"></label>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff</th><th>Bills</th><th>Sales</th><th>Rating</th><th>Present</th><th>Late</th><th>Leave</th><th>Absent</th><th>Tasks</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.p.name)}${r.linked ? '' : ' <small class="muted">(no login)</small>'}</td><td>${r.bills}</td><td>${money(r.sales)}</td><td>${r.rating}</td><td>${r.P}</td><td class="${r.L > 2 ? 'neg' : ''}">${r.L}</td><td>${r.Lv}</td><td class="${r.A ? 'neg' : ''}">${r.A}</td><td>${r.tasks}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="fine">Attendance counts marked days and check-ins (late = more than ${LATE_GRACE_MIN} min after the shift start). Sales and ratings count bills the person opened.</p>`;
}

/* ---------------- training ---------------- */
const guidesFor = (role) => (S.guides || []).filter((g) => !g.roles?.length || g.roles.includes(role));
const readBy = (gid) => (S.guideReads || {})[gid] || {};
function guidesAdminSheet() {
  return `${sheetHead('Training & how-to', 'Short pages staff read on their phone')}
    ${(S.guides || []).map((g) => { const r = readBy(g.id), n = Object.keys(r).length; const target = people().filter((p) => !g.roles?.length || (S.users || []).some((u) => u.staffId === p.id && g.roles.includes(u.role))); const notYet = target.filter((p) => !r[p.id]); return `<div class="line-row gd-row"><span><b>${esc(g.title)}</b><small class="muted"> · for ${g.roles?.length ? g.roles.map((x) => ROLES[x]?.label).join(', ') : 'everyone'} · read by ${n}${notYet.length ? ` · not yet: ${notYet.slice(0, 6).map((p) => esc(p.name)).join(', ')}` : ''}</small></span><span class="btn-row tight">${btn('Open', 'guideOpen', { cls: 'ghost sm', data: `data-id="${g.id}"` })}<button class="icon-btn sm" data-act="guideDel" data-id="${g.id}" aria-label="Remove">${icon('trash')}</button></span></div>`; }).join('') || '<p class="muted sm">No pages yet.</p>'}
    <form class="form" data-form="guideAdd">${eyebrow('New page')}
      <label class="field"><span>Title</span><input name="title" required maxlength="60" placeholder="e.g. How to plate a thali"></label>
      <label class="field"><span>Steps / text</span><textarea name="body" required maxlength="3000" rows="6" placeholder="1. …&#10;2. …"></textarea></label>
      <div class="chip-row">${['waiter', 'captain', 'kitchen', 'cashier', 'housekeeping', 'manager'].map((r) => `<label class="chip-radio"><input type="checkbox" name="roles" value="${r}"><span>${ROLES[r].label}</span></label>`).join('')}</div>
      <p class="muted sm">No role ticked = everyone.</p>
      <button class="btn primary block" type="submit">${icon('plus')}<span>Add page</span></button></form>`;
}
function guideSheet(g) {
  const pk = meKey(), done = pk && readBy(g.id)[pk];
  return `${sheetHead('How-to', g.title)}<div class="guide-body">${esc(g.body).replace(/\n/g, '<br>')}</div>
    ${pk ? (done ? `<p class="pos sm">${icon('check')} You read this on ${esc(fmtDate(done.at, { day: 'numeric', month: 'short' }))}</p>` : btn('I have read this', 'guideRead', { cls: 'primary block', data: `data-id="${g.id}"` })) : ''}`;
}

/* ---------------- "My work" (every staff member) ---------------- */
Views.me = () => {
  const me = Session.user(), pk = meKey(), role = Session.role(), dk = dayKey();
  const linked = !!me?.staffId || role === 'owner';
  const plan = planFor(pk, dk), c = clockOf(pk, dk);
  const ws = weekOf(dk), week = Array.from({ length: 7 }, (_, i) => shiftDay(ws, i));
  const tasks = tasksFor(pk, role, dk);
  const mine = (S.leaves || []).filter((l) => l.pk === pk).sort((a, b) => b.at - a.at).slice(0, 5);
  const gs = guidesFor(role);
  return `${pageHead('My work', `${me?.name || ''} · ${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' })}`)}
    ${linked ? '' : `<div class="banner info">${icon('idcard')}<span>Ask the owner to link your login to your staff record (Team &amp; access) so your shifts, attendance and salary match.</span></div>`}
    <div class="grid-2">
      <section class="card"><div class="card-head">${eyebrow('Today')}</div>
        <p class="me-shift">${plan ? (plan === 'Off' ? 'Day off' : plan === 'Leave' ? 'On leave' : `<b>${esc(plan)}</b> ${esc(shiftTime(dk, plan))}`) : '<span class="muted">No shift planned</span>'}</p>
        ${c?.in ? `<p class="sm">In at <b>${hhmm(c.in)}</b>${attOf(dk, pk) === 'L' ? ' <span class="neg">(late)</span>' : ''}${c.out ? ` · out at <b>${hhmm(c.out)}</b>` : ''}</p>` : ''}
        ${!c?.in ? btn('Check in', 'clockIn', { cls: 'primary block', ic: 'check' }) : !c.out ? btn('Check out', 'clockOut', { cls: 'ghost block', ic: 'logout' }) : `<p class="muted sm">${icon('check')} Done for today</p>`}
      </section>
      <section class="card"><div class="card-head">${eyebrow('My tasks today')}<b class="fb-n">${tasks.filter((t) => !taskDone(t.id)).length}</b></div>
        ${tasks.map((t) => { const d = taskDone(t.id); return `<label class="check tk-mine"><input type="checkbox" data-act="taskTick" data-id="${t.id}" ${d ? 'checked' : ''}><span>${esc(t.title)}${d ? `<small class="muted"> · ${esc(d.by)} ${esc(fmtTime(d.at))}</small>` : ''}</span></label>`; }).join('') || '<p class="muted sm">No tasks for you today.</p>'}
      </section>
    </div>
    <section class="card"><div class="card-head">${eyebrow('My week')}</div><div class="week-row">${week.map((d, i) => { const pn = planFor(pk, d); return `<div class="wk ${d === dk ? 'on' : ''}"><small>${DOW[i]} ${Number(d.slice(8))}</small><b>${esc(pn || '—')}</b>${pn && !['Off', 'Leave'].includes(pn) ? `<small>${esc(shiftTime(d, pn))}</small>` : ''}</div>`; }).join('')}</div></section>
    <div class="grid-2">
      <section class="card"><div class="card-head">${eyebrow('Leave')}${btn('Ask for leave', 'leaveAskOpen', { cls: 'ghost sm', ic: 'calendar' })}</div>
        ${mine.map((l) => `<div class="line-row sm"><span>${esc(fmtDate(keyToDate(l.from), { day: 'numeric', month: 'short' }))}${l.to !== l.from ? ` – ${esc(fmtDate(keyToDate(l.to), { day: 'numeric', month: 'short' }))}` : ''}${l.reason ? ` · ${esc(l.reason)}` : ''}</span><b class="${l.status === 'approved' ? 'pos' : l.status === 'rejected' ? 'neg' : ''}">${l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Not approved' : l.status === 'cancelled' ? 'Cancelled' : 'Waiting'}</b></div>`).join('') || '<p class="muted sm">No leave asked.</p>'}</section>
      <section class="card"><div class="card-head">${eyebrow('Training')}</div>
        ${gs.map((g) => `<button class="list-btn" data-act="guideOpen" data-id="${g.id}"><span><strong>${esc(g.title)}</strong></span>${readBy(g.id)[pk] ? `<small class="pos">${icon('check')} read</small>` : '<small class="neg">to read</small>'}</button>`).join('') || '<p class="muted sm">No training pages yet.</p>'}</section>
    </div>
    <div class="btn-row">${btn('Report a repair', 'repairOpen', { cls: 'ghost', ic: 'alert' })}${btn('Log a complaint / incident', 'incidentOpen', { cls: 'ghost', ic: 'edit' })}</div>`;
};
function leaveAskSheet() {
  return `${sheetHead('Ask for leave', meName())}
    <form class="form" data-form="leaveAsk"><div class="row-2"><label class="field"><span>From</span><input name="from" type="date" required min="${dayKey()}" value="${shiftDay(dayKey(), 1)}"></label><label class="field"><span>To</span><input name="to" type="date" required min="${dayKey()}" value="${shiftDay(dayKey(), 1)}"></label></div>
    <label class="field"><span>Reason <em>(optional)</em></span><input name="reason" maxlength="60"></label>
    <p class="neg sm" id="form-err" role="alert"></p>
    <button class="btn primary block" type="submit">${icon('send')}<span>Send to the manager</span></button></form>`;
}
/** Manager tools on the Staff screen + dashboard card */
function mgrToolsHtml() {
  if (!isMgr()) return '';
  const n = pendingLeaves().length;
  return `<div class="btn-row mgr-tools">${btn('Shift roster', 'rosterOpen', { cls: 'ghost sm', ic: 'calendar' })}${btn(`Leave requests${n ? ` (${n})` : ''}`, 'leaveAdminOpen', { cls: n ? 'primary sm' : 'ghost sm', ic: 'clock' })}${btn('Tasks', 'tasksAdminOpen', { cls: 'ghost sm', ic: 'check' })}${btn('Scorecard', 'scorecardOpen', { cls: 'ghost sm', ic: 'chart' })}${btn('Training', 'guidesAdminOpen', { cls: 'ghost sm', ic: 'book' })}</div>`;
}
function issuesCard() {
  if (!isMgr()) return '';
  const r = openRepairs(), i = openIncidents(), l = pendingLeaves();
  if (!r.length && !i.length && !l.length) return '';
  return `<section class="card issues-card"><div class="card-head">${eyebrow('Team & place')}${btn('Open', 'issuesOpen', { cls: 'ghost sm' })}</div>
    ${l.length ? `<button class="list-btn" data-act="leaveAdminOpen"><span><strong>${pl(l.length, 'leave request')} waiting</strong><small>${l.map((x) => esc(x.name)).join(', ')}</small></span></button>` : ''}
    ${r.length ? `<button class="list-btn" data-act="issuesOpen"><span><strong>${pl(r.length, 'repair')} open</strong><small>${r.slice(0, 3).map((x) => esc(x.what)).join(' · ')}</small></span></button>` : ''}
    ${i.length ? `<button class="list-btn" data-act="issuesOpen"><span><strong>${pl(i.length, 'complaint')} open</strong><small>${i.slice(0, 2).map((x) => esc(x.text.slice(0, 50))).join(' · ')}</small></span></button>` : ''}
  </section>`;
}
/** Alerts: manager on new leave / repair / complaint; staff on leave answer and today's shift */
function checkTeamAlerts() {
  const me = Session.user(); if (!me) { App.teamSeen = null; return; }
  const pk = meKey(), keys = [];
  const items = [];
  if (isMgr()) {
    pendingLeaves().forEach((l) => items.push([`lv:${l.id}`, `Leave asked · ${l.name}`, `${l.from}${l.to !== l.from ? ' – ' + l.to : ''}${l.reason ? ' · ' + l.reason : ''}`]));
    openRepairs().forEach((r) => items.push([`rp:${r.id}`, `Repair needed · ${r.what}`, `${r.where || ''} — reported by ${r.by}`]));
    openIncidents().forEach((r) => items.push([`in:${r.id}`, `Complaint logged`, `${r.text.slice(0, 80)} — ${r.by}`]));
  }
  (S.leaves || []).filter((l) => l.pk === pk && l.status !== 'pending').forEach((l) => items.push([`lvd:${l.id}:${l.status}`, `Leave ${l.status === 'approved' ? 'approved ✓' : 'not approved'}`, `${l.from}${l.to !== l.from ? ' – ' + l.to : ''}`]));
  items.forEach((x) => keys.push(x[0]));
  const prev = App.teamSeen; App.teamSeen = new Set(keys);
  if (!prev) {
    const plan = planFor(pk, dayKey());
    if (plan && !['Off', 'Leave'].includes(plan) && !clockOf(pk, dayKey())?.in) setTimeout(() => toast(`Your shift today: ${plan} ${shiftTime(dayKey(), plan)} — check in from “My work”`), 2500);
    return;
  }
  items.filter((x) => !prev.has(x[0]) && !String(x[2]).includes(me.name)).forEach((x) => phoneAlert(x[1], x[2], 'team'));
}

/* ---------------- actions ---------------- */
Object.assign(Actions, {
  rosterOpen() { if (!isMgr()) return; App.ui.rosterWeek = App.ui.rosterWeek || weekOf(dayKey()); openSheet(rosterSheet(), { wide: true }); },
  rosterWeek(el) { App.ui.rosterWeek = shiftDay(App.ui.rosterWeek || weekOf(dayKey()), Number(el.dataset.d)); openSheet(rosterSheet(), { wide: true }); },
  rosterCopy() {
    const ws = App.ui.rosterWeek || weekOf(dayKey()), prev = rosterOf(shiftDay(ws, -7)); if (!prev) return toast('Nothing planned last week');
    const plan = {}; Object.entries(prev.plan || {}).forEach(([pk, days]) => { plan[pk] = {}; Object.entries(days).forEach(([d, v]) => { plan[pk][shiftDay(d, 7)] = v; }); });
    S.roster = S.roster || {}; S.roster[ws] = { ...(prev || {}), plan }; save(); openSheet(rosterSheet(), { wide: true }); toast('Copied from last week');
  },
  rosterShare() { window.open(`https://wa.me/?text=${encodeURIComponent(rosterText(App.ui.rosterWeek || weekOf(dayKey())))}`, '_blank', 'noopener'); },
  leaveAdminOpen() { if (isMgr()) openSheet(leaveAdminSheet(), { wide: true }); },
  leaveDecide(el) {
    const l = byId(S.leaves || [], el.dataset.id); if (!l || !isMgr() || l.status !== 'pending') return;
    Object.assign(l, { status: el.dataset.v, decidedBy: meName(), decidedAt: Date.now() });
    if (l.status === 'approved') { for (let d = l.from; d <= l.to; d = shiftDay(d, 1)) { S.attendance[d] = S.attendance[d] || {}; S.attendance[d][l.pk] = 'leave'; } }
    save(); openSheet(leaveAdminSheet(), { wide: true }); toast(l.status === 'approved' ? `Leave approved for ${l.name}` : 'Leave not approved');
  },
  leaveAskOpen() { openSheet(leaveAskSheet()); },
  clockIn() {
    const pk = meKey(), dk = dayKey(); if (!pk) return;
    S.clock = S.clock || [];
    if (clockOf(pk, dk)) return;
    S.clock.push({ id: `${dk}_${pk}`, pk, uid: Session.user().id, name: meName(), day: dk, in: Date.now(), out: null });
    save(); toast(attOf(dk, pk) === 'L' ? `Checked in at ${hhmm(Date.now())} — late` : `Checked in at ${hhmm(Date.now())} ✓`);
  },
  clockOut() { const c = clockOf(meKey(), dayKey()); if (!c || c.out) return; c.out = Date.now(); save(); toast(`Checked out at ${hhmm(c.out)}`); },
  tasksAdminOpen() { if (isMgr()) openSheet(tasksAdminSheet(), { wide: true }); },
  taskDel(el) { if (!isMgr()) return; S.taskDefs = (S.taskDefs || []).filter((t) => t.id !== el.dataset.id); save(); openSheet(tasksAdminSheet(), { wide: true }); },
  taskTick(el) {
    const dk = dayKey(); S.taskLog = S.taskLog || {}; const d = S.taskLog[dk] = S.taskLog[dk] || {};
    if (el.checked) d[el.dataset.id] = { by: meName(), pk: meKey(), at: Date.now() }; else delete d[el.dataset.id];
    save();
  },
  scorecardOpen() { if (!isMgr()) return; App.ui.scMonth = App.ui.scMonth || monthKey(); openSheet(scorecardSheet(), { wide: true }); },
  guidesAdminOpen() { if (isMgr()) openSheet(guidesAdminSheet(), { wide: true }); },
  guideOpen(el) { const g = byId(S.guides || [], el.dataset.id); if (g) openSheet(guideSheet(g)); },
  guideRead(el) {
    const pk = meKey(); if (!pk) return;
    S.guideReads = S.guideReads || {}; const r = S.guideReads[el.dataset.id] = S.guideReads[el.dataset.id] || {};
    r[pk] = { name: meName(), at: Date.now() }; closeSheet(); save(); toast('Marked as read ✓');
  },
  guideDel(el) { if (!isMgr() || !confirm('Remove this page?')) return; S.guides = (S.guides || []).filter((g) => g.id !== el.dataset.id); save(); openSheet(guidesAdminSheet(), { wide: true }); },
  repairOpen() { openSheet(repairSheet()); },
  incidentOpen() { openSheet(incidentSheet()); },
  issuesOpen() { if (isMgr()) openSheet(issuesSheet(), { wide: true }); },
  repairAssign(el) { const r = byId(S.repairs || [], el.dataset.id); if (!r) return; const who = prompt('Who will fix it? (name or company)', r.assignee || ''); if (who == null) return; r.assignee = who.trim().slice(0, 40); r.status = 'doing'; save(); openSheet(issuesSheet(), { wide: true }); },
  repairFixed(el) {
    const r = byId(S.repairs || [], el.dataset.id); if (!r) return;
    const cost = Number(prompt(`Repair cost for "${r.what}" (₹, 0 if free)`, '0'));
    Object.assign(r, { status: 'fixed', fixedAt: Date.now(), fixedBy: meName(), cost: cost > 0 ? round2(cost) : 0 });
    if (cost > 0 && isMgr()) S.expenses.push({ id: uid('e'), date: dayKey(), cat: 'Maintenance', title: `Repair · ${r.what}`, amount: round2(cost) });
    save(); openSheet(issuesSheet(), { wide: true }); toast('Marked fixed');
  },
  incidentSolve(el) { const r = byId(S.incidents || [], el.dataset.id); if (!r) return; const how = prompt('How was it solved?', ''); if (how == null) return; Object.assign(r, { status: 'solved', resolution: how.trim().slice(0, 120), solvedBy: meName(), solvedAt: Date.now() }); save(); openSheet(issuesSheet(), { wide: true }); },
  poOpen() { if (isMgr()) openSheet(poSheet(), { wide: true }); },
  poNew() { openSheet(poNewSheet(), { wide: true }); },
  poShare(el) {
    const p = byId(S.pos || [], el.dataset.id); if (!p) return;
    const v = byId(S.vendors, p.vendorId), ph = String(v?.phone || '').replace(/\D/g, '');
    const text = [`*Purchase order PO-${p.no}* — ${S.settings?.name || ''}`, fmtDate(keyToDate(p.date), { day: 'numeric', month: 'short', year: 'numeric' }), '', ...p.lines.map((l) => `• ${l.name}: ${+l.qty.toFixed(2)} ${l.unit}`), '', 'Please confirm. Thank you!'].join('\n');
    window.open(`https://wa.me/${ph.length === 10 && cur().code === 'INR' ? '91' + ph : ph}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  },
  poCancel(el) { const p = byId(S.pos || [], el.dataset.id); if (!p || !confirm(`Cancel PO-${p.no}?`)) return; p.status = 'cancelled'; save(); openSheet(poSheet(), { wide: true }); },
  poReceiveOpen(el) { const p = byId(S.pos || [], el.dataset.id); if (p) openSheet(poReceiveSheet(p), { wide: true }); },
});
Object.assign(Changes, { scMonth(el) { if (el.value) { App.ui.scMonth = el.value; openSheet(scorecardSheet(), { wide: true }); } } });
Object.assign(Forms, {
  roster(fd, form) {
    if (!isMgr()) return;
    const ws = form.dataset.ws, plan = {};
    for (const [k, v] of fd.entries()) { const [pk, d] = k.split('|'); if (!d) continue; if (v) { plan[pk] = plan[pk] || {}; plan[pk][d] = v; } }
    S.roster = S.roster || {};
    S.roster[ws] = { shifts: shiftsOf(rosterOf(ws)), plan, names: Object.fromEntries(people().map((p) => [p.id, p.name])), by: meName(), at: Date.now() };
    save(); toast('Roster saved — staff see it on their phones');
  },
  leaveAsk(fd) {
    const pk = meKey(); if (!pk) return;
    const from = fd.get('from'), to = fd.get('to');
    if (!from || !to || to < from) return formError('Check the dates.');
    S.leaves = S.leaves || [];
    S.leaves.push({ id: uid('lv'), pk, uid: Session.user().id, name: meName(), from, to, reason: String(fd.get('reason') || '').trim().slice(0, 60), status: 'pending', at: Date.now() });
    closeSheet(); save(); toast('Sent — the manager gets an alert');
  },
  taskAdd(fd) {
    if (!isMgr()) return;
    const title = String(fd.get('title') || '').trim(); if (!title) return;
    S.taskDefs = S.taskDefs || [];
    S.taskDefs.push({ id: uid('tk'), title: title.slice(0, 60), who: String(fd.get('who') || 'all'), daily: fd.get('when') === 'daily', date: dayKey(), by: meName(), at: Date.now() });
    save(); openSheet(tasksAdminSheet(), { wide: true }); toast('Task added');
  },
  guideAdd(fd) {
    if (!isMgr()) return;
    S.guides = S.guides || [];
    S.guides.push({ id: uid('gd'), title: String(fd.get('title') || '').trim().slice(0, 60), body: String(fd.get('body') || '').trim().slice(0, 3000), roles: fd.getAll('roles'), by: meName(), at: Date.now() });
    save(); openSheet(guidesAdminSheet(), { wide: true }); toast('Page added');
  },
  repairAdd(fd) {
    S.repairs = S.repairs || [];
    S.repairs.push({ id: uid('rp'), what: String(fd.get('what') || '').trim().slice(0, 60), where: String(fd.get('where') || '').trim().slice(0, 40), by: meName(), byUid: Session.user()?.id || '', at: Date.now(), status: 'open' });
    closeSheet(); save(); toast('Reported — the manager is alerted');
  },
  incidentAdd(fd) {
    S.incidents = S.incidents || [];
    S.incidents.push({ id: uid('in'), kind: fd.get('kind') || 'other', text: String(fd.get('text') || '').trim().slice(0, 400), where: String(fd.get('where') || '').trim().slice(0, 40), by: meName(), byUid: Session.user()?.id || '', at: Date.now(), status: 'open' });
    closeSheet(); save(); toast('Saved — the manager / owner can see it');
  },
  poAdd(fd) {
    const v = byId(S.vendors, fd.get('vendor')); if (!v) return formError('Choose the supplier.');
    const lines = fd.getAll('pick').map((id) => { const s = byId(S.stock, id); const q = Number(fd.get(`q:${id}`)); return s && q > 0 ? { stockId: s.id, name: s.name, unit: s.unit, qty: q, price: round2(unitCost(s) || Number(s.cost) || 0) } : null; }).filter(Boolean);
    if (!lines.length) return formError('Tick at least one item with a quantity.');
    S.pos = S.pos || [];
    const no = (S.pos.reduce((m, p) => Math.max(m, p.no || 0), 0)) + 1;
    const p = { id: uid('po'), no, vendorId: v.id, vendorName: v.name, date: dayKey(), at: Date.now(), by: meName(), lines, status: 'sent' };
    S.pos.push(p); save();
    openSheet(poSheet(), { wide: true });
    Actions.poShare({ dataset: { id: p.id } });
  },
  poReceive(fd, form) {
    const p = byId(S.pos || [], form.dataset.id); if (!p || p.status !== 'sent') return closeSheet();
    const got = {}, pf = new FormData();
    pf.set('vendor', p.vendorId || ''); pf.set('invoice', String(fd.get('invoice') || `PO-${p.no}`)); pf.set('date', dayKey()); pf.set('paid', fd.get('paid') === '0' ? '0' : '1');
    p.lines.forEach((l) => { const q = Number(fd.get(`g:${l.stockId}`)) || 0; got[l.stockId] = q; if (q > 0) { pf.append('p_item', l.stockId); pf.append('p_qty', String(q)); pf.append('p_amt', String(Number(fd.get(`a:${l.stockId}`)) || 0)); } });
    if (!Object.values(got).some((q) => q > 0)) return formError('Nothing received? Type what came.');
    Forms.purchase(pf);
    Object.assign(p, { status: 'received', got, receivedAt: Date.now(), receivedBy: meName() });
    const short = p.lines.filter((l) => got[l.stockId] < l.qty);
    save(); openSheet(poSheet(), { wide: true });
    toast(short.length ? `Received — short: ${short.map((l) => l.name).join(', ')}` : 'Received in full ✓');
  },
});
