'use strict';
/* =========================================================
   Staff: employee records, KYC, photo, auto employee ID, ID cards
   Employee ID = café short code + joining year (YY) + running serial
   e.g. KK26001, KK26002 … (the serial never restarts)
   Personal & KYC details are shown to owners only.
   ========================================================= */

const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const ID_TYPES = ['Aadhaar', 'PAN', 'Voter ID', 'Driving licence', 'Passport', 'Other'];
const isOwner = () => Session.role() === 'owner';
const canManageStaff = () => ['owner', 'manager'].includes(Session.role());
const PRIVATE_FIELDS = ['salary', 'dob', 'email', 'address', 'emergencyName', 'emergencyPhone', 'idType', 'idNumber', 'pan'];
const maskId = (s) => { const c = String(s || '').replace(/\s/g, ''); return c ? `•••• •••• ${c.slice(-4)}` : '—'; };
const staffAvatar = (p, cls = 'sm') => (p.photo
  ? `<img class="avatar ${cls} photo" src="${esc(p.photo)}" alt="">`
  : `<span class="avatar ${cls} soft">${esc(initials(p.name))}</span>`);
const loginFor = (p) => S.users.find((u) => u.staffId === p.id);
const fmtD = (k) => (k ? fmtDate(keyToDate(k), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/* ---------------- list + attendance ---------------- */
Views.staff = () => {
  const dk = dayKey();
  const att = { ...(typeof autoAtt === 'function' ? autoAtt(dk) : {}), ...(S.attendance[dk] || {}) }; // check-ins and approved leave fill in by themselves
  const active = S.staff.filter((p) => p.active !== false);
  const former = S.staff.filter((p) => p.active === false);
  const present = active.filter((p) => att[p.id] === 'present' || att[p.id] === 'late').length;
  const mk = monthKey();
  const row = (p) => {
    const s = att[p.id] || '';
    const paid = S.expenses.some((e) => e.staffId === p.id && e.forMonth === mk);
    return `<div class="staff-row ${p.active === false ? 'off' : ''}">
      <button class="with-av plain" data-act="staffOpen" data-id="${p.id}">${staffAvatar(p)}
        <span><strong>${esc(p.name)} <small class="muted">· ${esc(p.role || 'Staff')}</small></strong>
        <small><b class="emp-id">${esc(p.empId || '')}</b> · Shift ${esc(p.shift || '—')}${isOwner() ? ` · ${money(p.salary)}/mo${paid ? ' · paid' : ''}` : ''}</small></span></button>
      ${p.active === false ? '<span class="status off">Left</span>' : `<div class="att" role="group" aria-label="Attendance for ${esc(p.name)}">${Object.entries(ATT).map(([k, a]) => `<button class="att-b ${k} ${s === k ? 'on' : ''}" data-act="att" data-id="${p.id}" data-s="${k}" title="${a.label}">${a.short}</button>`).join('')}</div>`}
    </div>`;
  };
  return `${pageHead('Staff · today', 'Team & attendance', canManageStaff() ? btn('Add staff', 'staffAdd', { cls: 'primary', ic: 'plus' }) : '')}
  ${typeof mgrToolsHtml === 'function' ? mgrToolsHtml() : ''}
  <div class="kpis two">${kpi('Present today', `${present} / ${active.length}`, fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' }), 'pos')}
    ${isOwner() ? kpi('Monthly salaries', money(sum(active, (p) => p.salary)), `${pl(active.length, 'person', 'people')}`) : kpi('Team', String(active.length), 'active staff')}</div>
  <section class="card">
    ${active.length ? active.map(row).join('') : empty('Add your team to keep their details, track attendance and print ID cards.', canManageStaff() ? btn('Add staff', 'staffAdd', { cls: 'ghost', ic: 'plus' }) : '')}
  </section>
  ${former.length && isOwner() ? `<details class="card former"><summary>${eyebrow(`Former staff (${former.length})`)}</summary>${former.map(row).join('')}</details>` : ''}
  <p class="fine">P = Present · L = Late · Lv = Leave · A = Absent. Tap a name to see the profile${isOwner() ? ', print an ID card or pay salary' : ''}.</p>`;
};

/* ---------------- add / edit form ---------------- */
function staffForm(p = {}) {
  const isNew = !p.id;
  const own = isOwner();
  const preview = isNew ? nextEmpId(S, dayKey()).empId : p.empId;
  const sel = (name, list, v) => `<select name="${name}"><option value="">—</option>${list.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  return `${sheetHead('Staff', isNew ? 'Add staff' : `Edit · ${p.name}`)}
  <form data-form="staff" class="form staff-form" autocomplete="off">
    <input type="hidden" name="id" value="${esc(p.id || '')}">
    <div class="profile-top">
      <div class="photo-pick">
        <img id="photo-prev" class="photo-box" src="${esc(p.photo || '')}" alt="Photo" ${p.photo ? '' : 'hidden'}>
        <span id="photo-ph" class="photo-box ph" ${p.photo ? 'hidden' : ''}>${icon('camera')}</span>
        <input type="hidden" name="photo" value="${esc(p.photo || '')}">
        <label class="btn ghost sm">${icon('upload')}<span>${p.photo ? 'Change' : 'Add'} photo</span><input type="file" accept="image/*" data-change="photo" hidden></label>
        <button type="button" class="link-btn" data-act="photoClear">Remove</button>
      </div>
      <div class="stack">
        <div class="emp-badge"><small>Employee ID</small><b id="emp-preview">${esc(preview)}</b>${isNew ? '<small>assigned automatically when you save (year = joining year)</small>' : ''}</div>
        <label class="field"><span>Full name *</span><input name="name" required maxlength="60" value="${esc(p.name || '')}"></label>
        ${designationField('role', p.role)}
      </div>
    </div>

    <p class="form-section">Work</p>
    <div class="row-3">
      <label class="field"><span>Joining date *</span><input name="joinDate" type="date" required value="${esc(p.joinDate || dayKey())}" max="${shiftDay(dayKey(), 60)}" ${isNew ? 'data-input="joinYear"' : ''}></label>
      <label class="field"><span>Shift</span><input name="shift" maxlength="30" value="${esc(p.shift || '')}" placeholder="09:00 – 18:00"></label>
      ${own ? `<label class="field"><span>Salary / month</span><input name="salary" type="number" min="0" step="any" value="${esc(p.salary ?? '')}"></label>` : ''}
    </div>

    <p class="form-section">Personal</p>
    <div class="row-3">
      <label class="field"><span>Mobile *</span><input name="phone" type="tel" required maxlength="20" value="${esc(p.phone || '')}"></label>
      <label class="field"><span>Gender</span>${sel('gender', ['Female', 'Male', 'Other'], { F: 'Female', M: 'Male' }[p.gender] || p.gender)}</label>
      <label class="field"><span>Blood group</span>${sel('blood', BLOOD_GROUPS, String(p.blood || '').replace('-', '−'))}</label>
    </div>
    ${own ? `<div class="row-3">
      <label class="field"><span>Email</span><input name="email" type="email" maxlength="80" value="${esc(p.email || '')}"></label>
      <label class="field"><span>Date of birth</span><input name="dob" type="date" value="${esc(p.dob || '')}" max="${dayKey()}"></label>
      <label class="field"><span>Emergency contact</span><input name="emergencyName" maxlength="40" value="${esc(p.emergencyName || '')}" placeholder="Name / relation"></label>
    </div>
    <div class="row-2">
      <label class="field"><span>Emergency phone</span><input name="emergencyPhone" type="tel" maxlength="20" value="${esc(p.emergencyPhone || '')}"></label>
      <label class="field"><span>Address</span><input name="address" maxlength="160" value="${esc(p.address || '')}"></label>
    </div>

    <p class="form-section">KYC <small class="muted">— visible to owners only</small></p>
    <div class="row-3">
      <label class="field"><span>ID proof type</span>${sel('idType', ID_TYPES, p.idType || 'Aadhaar')}</label>
      <label class="field"><span>ID number</span><input name="idNumber" maxlength="30" value="${esc(p.idNumber || '')}" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>PAN <em>(optional)</em></span><input name="pan" maxlength="10" value="${esc(p.pan || '')}" style="text-transform:uppercase" autocomplete="off" spellcheck="false"></label>
    </div>` : `<p class="muted sm">${icon('lock')} Salary, date of birth, address, emergency contact and KYC are filled in by the owner.</p>`}
    ${isNew ? '' : `<label class="check"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}><span>Still working here (untick if they have left)</span></label>`}
    <p class="neg sm" id="form-err" role="alert"></p>
    <div class="form-actions">${isNew || !own ? '<span></span>' : btn('Delete record', 'staffDel', { cls: 'danger-ghost', ic: 'trash', data: `data-id="${p.id}"` })}
      <button class="btn primary" type="submit">${isNew ? 'Add staff' : 'Save'}</button></div>
  </form>`;
}

/* ---------------- profile ---------------- */
function staffSheet(p) {
  const mk = monthKey();
  const days = Object.entries(S.attendance).filter(([k]) => k.startsWith(mk)).map(([, v]) => v[p.id]).filter(Boolean);
  const count = (s) => days.filter((d) => d === s).length;
  const attRow = `<div class="kpis four">${Object.entries(ATT).map(([k, a]) => kpi(a.label, String(count(k)))).join('')}</div>`;
  const head = `<div class="profile-head">${staffAvatar(p, 'xl')}
      <div><p class="eyebrow">${esc(p.role || 'Staff')}${p.active === false ? ' · left' : ''}</p><h2>${esc(p.name)}</h2>
      <p class="emp-id lg">${esc(p.empId || '')}</p></div>
      <button class="icon-btn" data-act="closeSheet" aria-label="Close">${icon('x')}</button></div>`;
  if (!isOwner()) {
    return `${head}${canManageStaff() ? `<div class="btn-row">${btn('Edit', 'staffEdit', { cls: 'ghost', ic: 'edit', data: `data-id="${p.id}"` })}</div>` : ''}
      ${eyebrow(`Attendance · ${monthLabel(mk)}`)}${attRow}
      <div class="dl"><div><span>Mobile</span><b>${esc(p.phone || '—')}</b></div><div><span>Shift</span><b>${esc(p.shift || '—')}</b></div><div><span>Joined</span><b>${fmtD(p.joinDate)}</b></div>${p.blood ? `<div><span>Blood group</span><b>${esc(p.blood)}</b></div>` : ''}</div>`;
  }
  const paid = S.expenses.find((e) => e.staffId === p.id && e.forMonth === mk);
  const u = loginFor(p);
  const item = (label, value) => `<div><span>${esc(label)}</span><b>${value || '—'}</b></div>`;
  return `${head}
    <div class="btn-row">
      ${btn('ID card', 'idCard', { cls: 'primary', ic: 'idcard', data: `data-id="${p.id}"` })}
      ${btn('Edit', 'staffEdit', { cls: 'ghost', ic: 'edit', data: `data-id="${p.id}"` })}
      ${paid ? `<span class="badge ok">${icon('check')} Salary paid ${esc(fmtDate(keyToDate(paid.date)))}</span>` : btn('Pay salary', 'staffPay', { cls: 'ghost', ic: 'wallet', data: `data-id="${p.id}"` })}
      ${u ? `<span class="badge ok">${icon('lock')} Login: ${esc(ROLES[u.role].label)}</span>` : btn('Give login access', 'accessAdd', { cls: 'ghost', ic: 'lock', data: `data-staff="${p.id}"` })}
    </div>
    ${eyebrow(`Attendance · ${monthLabel(mk)}`)}${attRow}
    <p class="form-section">Work</p>
    <div class="dl">${item('Joined', fmtD(p.joinDate))}${item('Shift', esc(p.shift))}${item('Salary', money(p.salary) + '/mo')}</div>
    <p class="form-section">Personal</p>
    <div class="dl">${item('Mobile', esc(p.phone))}${item('Email', esc(p.email))}${item('Date of birth', p.dob ? fmtD(p.dob) : '')}
      ${item('Gender', esc({ F: 'Female', M: 'Male' }[p.gender] || p.gender))}${item('Blood group', esc(p.blood))}
      ${item('Emergency', esc([p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · ')))}${item('Address', esc(p.address))}</div>
    <p class="form-section">KYC</p>
    <div class="dl">
      <div><span>${esc(p.idType || 'ID proof')}</span><b><span class="kyc" data-full="${esc(p.idNumber || '')}">${esc(maskId(p.idNumber))}</span>
        ${p.idNumber ? `<button class="link-btn" data-act="revealKyc">Show</button>` : ''}</b></div>
      <div><span>PAN</span><b><span class="kyc" data-full="${esc(p.pan || '')}">${esc(p.pan ? maskId(p.pan) : '—')}</span>${p.pan ? `<button class="link-btn" data-act="revealKyc">Show</button>` : ''}</b></div>
    </div>`;
}

/* ---------------- ID card ---------------- */
function idCardHtml(p) {
  const st = S.settings;
  const owner = activeOwners()[0];
  return `<div class="idcards">
    <div class="idcard front">
      <div class="idc-top"><span class="idc-mark">${esc((st.short || shortCode(st.name)).slice(0, 3))}</span><span><b>${esc(st.name)}</b>${st.tagline ? `<small>${esc(st.tagline)}</small>` : ''}</span></div>
      <div class="idc-body">
        ${p.photo ? `<img class="idc-photo" src="${esc(p.photo)}" alt="">` : `<span class="idc-photo ph">${esc(initials(p.name))}</span>`}
        <div class="idc-info">
          <b class="idc-name">${esc(p.name)}</b>
          <span class="idc-role">${esc(p.role || 'Staff')}</span>
          <dl><dt>Emp ID</dt><dd>${esc(p.empId || '')}</dd>
          <dt>Blood</dt><dd>${esc(p.blood || '—')}</dd>
          <dt>Phone</dt><dd>${esc(p.phone || '—')}</dd></dl>
        </div>
      </div>
      <div class="idc-foot">EMPLOYEE · ${esc(p.empId || '')}</div>
    </div>
    <div class="idcard back">
      <div class="idc-back">
        <dl>
          <dt>Joined</dt><dd>${fmtD(p.joinDate)}</dd>
          <dt>Emergency</dt><dd>${esc([p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · ') || '—')}</dd>
          <dt>Address</dt><dd>${esc(p.address || '—')}</dd>
        </dl>
        <p class="idc-note">This card belongs to ${esc(st.name)}. If found, please return it${owner?.phone ? ` or call ${esc(owner.phone)}` : ''}.</p>
        <div class="idc-sign"><span></span><small>Authorised signatory</small></div>
      </div>
      <div class="idc-foot">${esc(st.name)}</div>
    </div>
  </div>`;
}

/* ---------------- photo: resize to a small 3:4 JPEG ---------------- */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Not an image'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('Image is too large'));
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const W = 300, H = 400, c = document.createElement('canvas'); c.width = W; c.height = H;
        const s = Math.max(W / img.width, H / img.height);
        const w = img.width * s, h = img.height * s;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = r.result;
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}
Changes.photo = (el) => {
  const f = el.files[0]; el.value = '';
  readPhoto(f).then((url) => {
    const form = el.form; form.photo.value = url;
    const prev = $('#photo-prev'), ph = $('#photo-ph');
    prev.src = url; prev.hidden = false; if (ph) ph.hidden = true;
  }).catch((e) => toast(e.message));
};
Inputs.joinYear = (el) => { const b = $('#emp-preview'); if (b && el.value) b.textContent = nextEmpId(S, el.value).empId; };

/* ---------------- actions & forms ---------------- */
Object.assign(Actions, {
  staffAdd() { if (canManageStaff()) openSheet(staffForm(), { wide: true }); },
  staffOpen(el) { const p = byId(S.staff, el.dataset.id); p && openSheet(staffSheet(p), { wide: true }); },
  staffEdit(el) { const p = byId(S.staff, el.dataset.id); p && canManageStaff() && openSheet(staffForm(p), { wide: true }); },
  staffDel(el) {
    const p = byId(S.staff, el.dataset.id); if (!p || !isOwner()) return;
    if (!confirm(`Delete ${p.name}'s record completely? (To keep history, untick "Still working here" instead.) Their employee ID will not be reused.`)) return;
    S.staff = S.staff.filter((x) => x.id !== p.id);
    S.users.forEach((u) => { if (u.staffId === p.id) u.staffId = null; });
    closeSheet(); save();
  },
  staffPay(el) {
    const p = byId(S.staff, el.dataset.id); if (!p || !isOwner()) return;
    if (!confirm(`Record salary of ${money(p.salary)} for ${p.name}? It will be added to expenses.`)) return;
    S.expenses.push({ id: uid('e'), date: dayKey(), cat: 'Salary', title: `Salary · ${p.name}`, amount: Number(p.salary) || 0, staffId: p.id, forMonth: monthKey() });
    save(); openSheet(staffSheet(p), { wide: true }); toast('Salary recorded');
  },
  photoClear(el) {
    const form = el.closest('form'); form.photo.value = '';
    $('#photo-prev').hidden = true; $('#photo-ph').hidden = false;
  },
  revealKyc(el) {
    const s = el.parentElement.querySelector('.kyc'); if (!s) return;
    const showing = el.textContent === 'Hide';
    s.textContent = showing ? maskId(s.dataset.full) : s.dataset.full;
    el.textContent = showing ? 'Show' : 'Hide';
  },
  idCard(el) {
    const p = byId(S.staff, el.dataset.id); if (!p || !isOwner()) return;
    openSheet(`${sheetHead('ID card', p.name)}<div class="idcard-preview">${idCardHtml(p)}</div>
      <p class="fine">Prints at real ID-card size (85.6 × 54 mm), front and back. Use thick paper or card, then cut and laminate.</p>
      <div class="btn-row">${btn('Print ID card', 'printId', { cls: 'primary', ic: 'printer', data: `data-id="${p.id}"` })}${btn('Back to profile', 'staffOpen', { cls: 'ghost', data: `data-id="${p.id}"` })}</div>`, { wide: true });
  },
  printId(el) {
    const p = byId(S.staff, el.dataset.id); if (!p) return;
    $('#print').className = ''; $('#print-page')?.remove(); $('#print').innerHTML = idCardHtml(p); window.print();
  },
});

Object.assign(Forms, {
  staff(fd) {
    if (!canManageStaff()) return;
    const g = (k) => String(fd.get(k) || '').trim();
    const d = {
      name: g('name'), role: designationValue(g('role'), g('role_other')), phone: g('phone'), email: g('email'), joinDate: g('joinDate') || dayKey(), shift: g('shift'),
      salary: num(fd.get('salary')), dob: g('dob'), gender: g('gender'), blood: g('blood'), address: g('address'),
      emergencyName: g('emergencyName'), emergencyPhone: g('emergencyPhone'),
      idType: g('idType'), idNumber: g('idNumber'), pan: g('pan').toUpperCase(), photo: g('photo'),
    };
    if (!d.name) return formError('Please enter the full name.');
    if (!validPhone(d.phone)) return formError('Please enter a valid mobile number (10 digits, e.g. 98765 43210).');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return formError('That email address looks wrong.');
    if (d.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(d.pan)) return formError('PAN should look like ABCDE1234F.');
    if (d.idType === 'Aadhaar' && d.idNumber && !/^\d{12}$/.test(d.idNumber.replace(/\s/g, ''))) return formError('Aadhaar number should be 12 digits.');
    if (!isOwner()) PRIVATE_FIELDS.forEach((k) => delete d[k]); // managers never touch salary / KYC
    const p = byId(S.staff, fd.get('id'));
    if (p) {
      Object.assign(p, d, { active: !!fd.get('active') });
      S.users.forEach((u) => { if (u.staffId === p.id) { u.name = p.name; u.phone = p.phone; } });
      closeSheet(); save(); return toast('Saved');
    }
    const { empId, n } = nextEmpId(S, d.joinDate);
    S.seq.emp = n;
    const np = { id: uid('p'), empId, ...d, active: true, createdAt: Date.now() };
    S.staff.push(np);
    save(); openSheet(staffSheet(np), { wide: true });
    toast(`${np.name} added · ${empId}`);
  },
});
