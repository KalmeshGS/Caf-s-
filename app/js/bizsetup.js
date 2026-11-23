'use strict';
/* =========================================================
   Business setup screens (spec §5) — used by sign-up and by
   Settings → Business setup (re-run, with a before/after diff).
   Inputs are named a_<questionId> so they never clash with other fields.
   ========================================================= */
const BOOL_QS = ['q_area_pricing', 'q_time_menus', 'q_alcohol', 'q_price_incl'];
const MULTI_QS = ['q_eat_where', 'q_order_by', 'q_pay_when', 'q_menu_style', 'q_bookings', 'q_regulars', 'q_staff_roles', 'q_devices', 'q_language'];
const listText = (arr) => asArr(arr).join(', ');
const textList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);

/** Is a follow-up question shown? (spec §13 showIf) */
function shown(qid, a) {
  const has = (q, v) => asArr(a[q]).includes(v);
  switch (qid) {
    case 'q_table_count': return has('q_eat_where', 'tables');
    case 'q_area_pricing': return has('q_eat_where', 'tables') && (a.q_table_count?.areas || []).length > 1;
    case 'q_brands': return has('q_eat_where', 'aggregator') || has('q_eat_where', 'own_delivery');
    case 'q_handoff': return has('q_pay_when', 'prepaid');
    case 'q_stations': return a.q_kitchen === 'multi';
    case 'q_kitchen_device': return (a.q_kitchen || 'single') !== 'none';
    case 'q_gstin': return (a.q_gst || 'regular') !== 'none';
    default: return true;
  }
}

/* ---------------- one question → HTML ---------------- */
function optsHtml(qid, a, type) {
  const def = Q[qid]; const cur = a[qid];
  return `<div class="q-opts" role="${type === 'multi' ? 'group' : 'radiogroup'}" aria-label="${esc(def.label)}">${Object.entries(def.opts).map(([v, label]) => {
    const on = type === 'multi' ? asArr(cur).includes(v) : cur === v;
    return `<label><input type="${type === 'multi' ? 'checkbox' : 'radio'}" name="a_${qid}" value="${v}" ${on ? 'checked' : ''} data-live="1"><span>${esc(label)}</span></label>`;
  }).join('')}</div>`;
}
const yesNo = (name, val, live = true) => `<div class="q-opts" role="radiogroup">${[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${(val ? 'yes' : 'no') === v ? 'checked' : ''} ${live ? 'data-live="1"' : ''}><span>${l}</span></label>`).join('')}</div>`;
const skipNote = '<small>Not sure? Skip — you can change this later in Settings → Business setup.</small>';
function questionHtml(qid, a) {
  if (!shown(qid, a)) return '';
  const block = (title, inner, hint = '') => `<div class="q-block"><b>${esc(title)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}${inner}</div>`;
  switch (qid) {
    case 'q_table_count': return `<div class="q-sub">${block('How many tables?', `<input name="a_q_table_count_n" type="number" min="1" max="${MAX_TABLES}" step="1" value="${esc(a.q_table_count?.count ?? 8)}" inputmode="numeric">`, `1 to ${MAX_TABLES} tables.`)}
      ${block('Any separate areas?', `<input name="a_q_table_count_areas" maxlength="120" value="${esc(listText(a.q_table_count?.areas))}" placeholder="e.g. AC hall, Rooftop, Family section" data-blur-live="1">`, 'Separate with commas. Leave empty if it’s one room.')}</div>`;
    case 'q_area_pricing': return `<div class="q-sub">${block('Are prices different in some areas?', yesNo('a_q_area_pricing', a.q_area_pricing === true))}</div>`;
    case 'q_brands': return `<div class="q-sub">${block('Do you run more than one brand from this kitchen?', yesNo('a_q_brands_has', a.q_brands?.has === true))}
      ${a.q_brands?.has ? block('Brand names', `<input name="a_q_brands_names" maxlength="120" value="${esc(listText(a.q_brands?.names))}" placeholder="e.g. Biryani House, Roll Point">`) : ''}</div>`;
    case 'q_handoff': return `<div class="q-sub">${block(Q.q_handoff.label, optsHtml('q_handoff', a, 'single'))}</div>`;
    case 'q_stations': return `<div class="q-sub">${block('Name your counters', `<input name="a_q_stations" maxlength="160" value="${esc(listText(a.q_stations))}" placeholder="e.g. Dosa, Coffee, Tandoor, Bar">`, 'Separate with commas.')}</div>`;
    case 'q_kitchen_device': return `<div class="q-sub">${block(Q.q_kitchen_device.label, optsHtml('q_kitchen_device', a, 'single'))}</div>`;
    case 'q_time_menus': return block('Does your menu change by time of day?', yesNo('a_q_time_menus', a.q_time_menus === true), 'e.g. breakfast, lunch, snacks, dinner');
    case 'q_alcohol': return block('Do you serve alcohol?', yesNo('a_q_alcohol', a.q_alcohol === true));
    case 'q_rooms': return block('Do you have rooms for guests to stay?', `${yesNo('a_q_rooms_has', a.q_rooms?.has === true)}
      ${a.q_rooms?.has ? `<div class="row-2"><label class="field"><span>How many rooms?</span><input name="a_q_rooms_count" type="number" min="1" max="999" value="${esc(a.q_rooms?.count || '')}"></label>
      <label class="field"><span>Highest room rate per night (₹)</span><input name="a_q_rooms_tariff" type="number" min="0" step="1" value="${esc(a.q_rooms?.maxTariff || '')}"><small class="muted">Decides GST on food & rooms</small></label></div>` : ''}`, 'In South India “hotel” often means a restaurant — this is only about rooms to stay in.');
    case 'q_hours': return block('Do you stay open past midnight?', `${yesNo('a_q_hours_late', a.q_hours?.pastMidnight === true)}
      ${a.q_hours?.pastMidnight ? `<label class="field"><span>Business day ends at</span><input name="a_q_hours_cutoff" type="time" value="${esc(a.q_hours?.cutoff || '04:00')}"></label>` : ''}`);
    case 'q_gstin': return block('GSTIN', `<input name="a_q_gstin" maxlength="15" value="${esc(a.q_gstin || '')}" placeholder="e.g. 29ABCDE1234F1Z5" style="text-transform:uppercase" autocomplete="off">`, '15 characters — printed on your bills.');
    case 'q_fssai': return block('FSSAI licence / registration number', `<input name="a_q_fssai" maxlength="14" inputmode="numeric" value="${esc(a.q_fssai || '')}" placeholder="14 digits" autocomplete="off">
      <label class="check"><input type="checkbox" name="a_q_fssai_later" value="1" ${a.q_fssai_later ? 'checked' : ''}><span>I’ll add it later</span></label>`, 'Required by law on every bill since Oct 2021.');
    case 'q_price_incl': return block('Are your menu prices including GST?', yesNo('a_q_price_incl', a.q_price_incl === true, false), 'Yes = the price already has GST in it. No = GST is added on the bill.');
    default: {
      const def = Q[qid]; if (!def) return '';
      return block(def.label, optsHtml(qid, a, MULTI_QS.includes(qid) ? 'multi' : 'single') + (qid === 'q_internet' || qid === 'q_language' ? '' : ''), def.hint || '');
    }
  }
}

/* ---------------- read a screen back into the answers ---------------- */
function readAnswers(form, a) {
  const fd = new FormData(form); const has = (k) => form.querySelector(`[name="${k}"]`);
  MULTI_QS.forEach((q) => { if (has(`a_${q}`)) a[q] = fd.getAll(`a_${q}`).map(String); });
  ['q_handoff', 'q_kitchen', 'q_kitchen_device', 'q_internet', 'q_stock', 'q_gst', 'q_service_charge', 'q_packing', 'q_printer'].forEach((q) => { if (has(`a_${q}`)) a[q] = fd.get(`a_${q}`) || a[q]; });
  BOOL_QS.forEach((q) => { if (has(`a_${q}`)) a[q] = fd.get(`a_${q}`) === 'yes'; });
  // Keep exactly what was typed (checked in answersError) — never change it silently
  if (has('a_q_table_count_n')) { const raw = String(fd.get('a_q_table_count_n') ?? '').trim(); a.q_table_count = { count: raw === '' ? NaN : Number(raw), areas: textList(fd.get('a_q_table_count_areas')) }; }
  if (has('a_q_stations')) a.q_stations = textList(fd.get('a_q_stations'));
  if (has('a_q_brands_has')) a.q_brands = { has: fd.get('a_q_brands_has') === 'yes', names: has('a_q_brands_names') ? textList(fd.get('a_q_brands_names')) : (a.q_brands?.names || []) };
  if (has('a_q_rooms_has')) a.q_rooms = { has: fd.get('a_q_rooms_has') === 'yes', count: has('a_q_rooms_count') ? num(fd.get('a_q_rooms_count')) : (a.q_rooms?.count || 0), maxTariff: has('a_q_rooms_tariff') ? num(fd.get('a_q_rooms_tariff')) : (a.q_rooms?.maxTariff || 0) };
  if (has('a_q_hours_late')) a.q_hours = { pastMidnight: fd.get('a_q_hours_late') === 'yes', cutoff: has('a_q_hours_cutoff') ? String(fd.get('a_q_hours_cutoff') || '04:00') : (a.q_hours?.cutoff || '04:00') };
  if (has('a_q_gstin')) a.q_gstin = String(fd.get('a_q_gstin') || '').trim().toUpperCase();
  if (has('a_q_fssai')) { a.q_fssai = String(fd.get('a_q_fssai') || '').replace(/\D/g, ''); a.q_fssai_later = fd.get('a_q_fssai_later') === '1'; }
  return a;
}
function answersError(name, a) {
  if (name === 'tax') {
    if ((a.q_gst || 'regular') !== 'none') {
      const g = a.q_gstin || '';
      if (!g) return 'Enter your GSTIN — it must be printed on GST bills. Not registered? Choose “Not registered”.';
      if (g.length !== 15) return `GSTIN must be exactly 15 characters (you typed ${g.length}), like 29ABCDE1234F1Z5.`;
      if (!GSTIN_RE.test(g)) return 'That GSTIN doesn’t look right — check it: 2-digit state code, 10-character PAN, then 3 more characters (e.g. 29ABCDE1234F1Z5).';
    }
    if (!a.q_fssai_later && !FSSAI_RE.test(a.q_fssai || '')) return 'Please enter your 14-digit FSSAI number, or tick “I’ll add it later”.';
  }
  if (name === 'how' && asArr(a.q_eat_where).length === 0) return 'Pick at least one place where customers eat (or take a parcel).';
  if (name === 'how' && shown('q_table_count', a)) {
    const n = a.q_table_count?.count;
    if (!Number.isInteger(n) || n < 1 || n > MAX_TABLES) return `Number of tables must be a whole number from 1 to ${MAX_TABLES}.`;
  }
  return '';
}

/* ---------------- step bodies ---------------- */
function presetPicker(a, intro = true) {
  return `<div class="field"><span>Which is closest to your place?</span>
    <div class="preset-grid">${Object.entries(PRESETS).map(([k, p]) => `<label class="preset-card"><input type="radio" name="a_q_preset" value="${k}" ${a.q_preset === k ? 'checked' : ''} data-preset="1"><span>${icon(p.ic)}<b>${esc(p.label)}</b><small>${esc(p.blurb)}</small></span></label>`).join('')}</div>
    ${intro ? '<small class="muted">Next we’ll fill in typical answers for this kind of place — you just change what’s different.</small>' : ''}</div>`;
}
function howScreen(a, qi) {
  const scr = HOW_SCREENS[qi];
  const label = PRESETS[a.q_preset]?.label || 'place';
  return `<div class="q-progress" aria-label="Question ${qi + 1} of ${HOW_SCREENS.length}">${HOW_SCREENS.map((_, i) => `<i class="${i <= qi ? 'on' : ''}"></i>`).join('')}</div>
    <p class="muted sm">${qi === 0 ? `We’ve filled this in for a typical <b>${esc(label)}</b>. Change anything that’s different for you.` : `${esc(scr.title)} · ${qi + 1} of ${HOW_SCREENS.length}`}</p>
    ${scr.qs.map((q) => questionHtml(q, a)).join('')}
    ${skipNote}
    ${previewHtml(deriveFeatures(a))}`;
}
function taxScreen(a, d) {
  return `${d ? `<label class="field"><span>Currency</span><select name="currency">${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === (d.currency || 'INR') ? 'selected' : ''}>${esc(c.code)} · ${esc(c.symbol.trim())}</option>`).join('')}</select></label>` : ''}
    ${questionHtml('q_gst', a)}${questionHtml('q_gstin', a)}${questionHtml('q_fssai', a)}${questionHtml('q_price_incl', a)}
    ${questionHtml('q_service_charge', a)}${questionHtml('q_packing', a)}${questionHtml('q_printer', a)}
    <p class="fine">Tax rules here are research, not legal advice — please confirm the rates with your CA. You can change them any time.</p>`;
}
function reviewScreen(oldA, newA) {
  const before = deriveFeatures(oldA), after = deriveFeatures(newA);
  const d = flagDiff(before, after);
  return `${d.on.length || d.off.length ? `<div class="list compact">
      ${d.on.map((x) => `<div class="line-row"><span class="diff-on">${icon('plus')} ${esc(x)}</span><small class="muted">turns on</small></div>`).join('')}
      ${d.off.map((x) => `<div class="line-row"><span class="diff-off">${icon('x')} ${esc(x)}</span><small class="muted">hidden — data kept</small></div>`).join('')}
    </div>` : `<p class="muted">${icon('check')} No screens change — only your answers are updated.</p>`}
    ${previewHtml(after)}
    <p class="fine">${icon('lock')} Turning something off only hides it. Nothing is deleted — turn it back on and everything is still there.</p>`;
}

/* ---------------- what the answers mean for the café settings ---------------- */
function profileSettings(answers, by) {
  const f = deriveFeatures(answers);
  const plain = JSON.parse(JSON.stringify(f));
  return {
    profile: { preset: answers.q_preset, answers: JSON.parse(JSON.stringify(answers)), updatedAt: Date.now(), updatedBy: by || '' },
    features: plain, taxProfile: plain.tax,
    tables: f.tables ? clamp(num(answers.q_table_count?.count), 0, 99) : 0,
    tax: billTaxPct(f.tax), gstin: answers.q_gst !== 'none' ? (answers.q_gstin || '') : '', fssai: answers.q_fssai || '',
    type: PRESETS[answers.q_preset]?.type || 'restaurant',
  };
}

/* ---------------- live updates while answering ---------------- */
document.addEventListener('change', (e) => {
  const el = e.target; const form = el.closest?.('form[data-form="setupStep"]'); if (!form || !App.setup?.d) return;
  if (el.dataset.preset) {
    // a new starting type: fill in its typical answers (keep tax details already typed)
    keepSetupFields(form);
    const old = App.setup.d.answers || {};
    App.setup.d.answers = { ...presetAnswers(el.value), q_gst: old.q_gst, q_gstin: old.q_gstin, q_fssai: old.q_fssai, q_fssai_later: old.q_fssai_later, q_price_incl: old.q_price_incl, q_service_charge: old.q_service_charge || 'no', q_packing: old.q_packing || 'none', q_printer: old.q_printer || 'none' };
    render(); return;
  }
  if (el.dataset.live || el.dataset.blurLive) { keepSetupFields(form); render(); const again = $(`[name="${el.name}"]`); if (again && el.type !== 'checkbox' && el.type !== 'radio') again.focus(); }
});

/* ---------------- Settings → Business setup ---------------- */
function businessSetupCard() {
  const prof = profileOf();
  const f = features();
  return `<section class="card"><div class="card-head">${eyebrow('Business setup')}${prof.legacy ? '<span class="badge warm">Not set yet</span>' : ''}</div>
    <p><b>${esc(PRESETS[prof.answers.q_preset]?.label || 'Family restaurant')}</b>${prof.legacy ? ' <span class="muted">(how the app worked so far)</span>' : ''}</p>
    ${previewHtml(f)}
    <p class="muted sm">Answer a few questions about how you work — the app then shows only what your place needs. Nothing is ever deleted when you change this.</p>
    <div class="btn-row">${btn(prof.legacy ? 'Set up how you work' : 'Change business setup', 'bizSetup', { cls: 'primary', ic: 'edit' })}</div></section>`;
}
Object.assign(Actions, {
  bizSetup() {
    const prof = profileOf();
    App.setup = { step: 1, mode: 'profile', qi: 0, d: { answers: clone(prof.answers), before: clone(prof.answers) } };
    history.replaceState(null, '', '#/settings'); render(); window.scrollTo(0, 0);
  },
});
async function saveProfile(form) {
  const d = App.setup.d;
  busy(form, true);
  try {
    Object.assign(S.settings, profileSettings(d.answers, Session.user()?.name), { look: S.settings.look });
    save();
    App.setup = { step: 0, mode: 'signup', d: newDraft() };
    history.replaceState(null, '', '#/settings'); render();
    toast('Business setup saved — your screens now match how you work');
  } catch (e) { formError(e.message || String(e)); } finally { busy(form, false); }
}

/* ---------------- menu import (spec §14.4 menu_import): Excel / CSV paste, CSV file, or a photo ---------------- */
/** "Masala Dosa, 60, Tiffin" · "Masala Dosa\t60" · "Masala Dosa ...... 60" · a line without a price = category heading */
function parseMenuText(text) {
  const out = []; let cat = '';
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.replace(/[₹$]|\bRs\.?\s*(?=\d)/gi, ' ').replace(/\s+$/, '');
    if (!line.trim()) return;
    const cells = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : null;
    if (cells && cells.length >= 2) {
      const ci = cells.findIndex((c, i) => i > 0 && /^\s*\d+(\.\d+)?\s*$/.test(c));
      if (ci > 0) {
        const name = cells.slice(0, ci).join(' ').trim(); const rest = cells.slice(ci + 1).map((c) => c.trim()).filter(Boolean);
        if (/^(item|name|dish)s?$/i.test(name)) return; // header row
        if (name) out.push({ name: name.slice(0, 40), price: Number(cells[ci]), cat: (rest[0] || cat || 'General').slice(0, 24) });
        return;
      }
    }
    const m = line.match(/^(.*?)[\s.·:\-–]+(\d{1,5}(?:\.\d{1,2})?)\s*\/?-?\s*$/);
    if (m && m[1].trim().length > 1) { out.push({ name: m[1].replace(/[.·:\-–]+$/, '').trim().slice(0, 40), price: Number(m[2]), cat: cat || 'General' }); return; }
    const head = line.trim();
    if (head.length <= 24 && !/\d/.test(head)) cat = head.replace(/[:\-–]+$/, '').trim();
  });
  return out.filter((r) => r.name && r.price >= 0);
}
function addImportedMenu(rows) {
  const d = App.setup.d; const keep = filled(d.menu);
  const fresh = rows.filter((r) => !keep.some((k) => k.name.toLowerCase() === r.name.toLowerCase()));
  d.menu = keep.concat(fresh);
  render(); toast(fresh.length ? `${pl(fresh.length, 'item')} added — check names, prices and categories` : 'No new items found. One item per line, like "Masala Dosa, 60".');
}
Object.assign(Actions, {
  menuImport(el) {
    keepSetupFields(el.closest('form'));
    const box = $('#menu-import'); if (box) { box.hidden = !box.hidden; return; }
  },
  menuImportRead(el) { const t = $('#menu-import-text'); keepSetupFields(el.closest('form')); addImportedMenu(parseMenuText(t ? t.value : '')); },
  menuImportFile() { $('#menu-import-file')?.click(); },
  menuImportPhoto() { $('#menu-import-photo')?.click(); },
});
Changes.menuImportFile = (el) => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  if (/\.xlsx?$/i.test(f.name)) return toast('Please save the sheet as CSV (File → Download → CSV), or copy the cells and paste them here.');
  const r = new FileReader(); r.onload = () => { keepSetupFields(el.closest('form')); addImportedMenu(parseMenuText(r.result)); }; r.readAsText(f);
};
Changes.menuImportPhoto = async (el) => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  const st = $('#menu-import-status'); if (st) st.textContent = 'Reading the menu photo… (the first time, the reader downloads about 7 MB)';
  try {
    const worker = await ocrWorker((m) => { if (st && m.status === 'recognizing text') st.textContent = `Reading the photo… ${Math.round(m.progress * 100)}%`; });
    const { data } = await worker.recognize(await downscale(f));
    const t = $('#menu-import-text'); if (t) t.value = (data.text || '').trim();
    if (st) st.textContent = 'Text read from the photo — check it, fix any mistakes, then tap “Add these items”.';
  } catch (e) { if (st) st.textContent = `Couldn't read the photo here (${e.message}). Type or paste the menu instead.`; }
};
const menuImportHtml = () => `<div class="btn-row">${btn('Import from Excel or a photo', 'menuImport', { cls: 'ghost sm', ic: 'upload' })}</div>
  <div id="menu-import" class="imp-panel" hidden>
    <label class="field"><span>Paste your menu <em>(copy cells from Excel / Google Sheets, or type one item per line: “Masala Dosa, 60, Tiffin”)</em></span>
      <textarea id="menu-import-text" rows="6" placeholder="TIFFIN&#10;Idli Vada, 50&#10;Masala Dosa, 60&#10;BEVERAGES&#10;Filter Coffee, 25"></textarea></label>
    <div class="btn-row tight">${btn('Add these items', 'menuImportRead', { cls: 'primary sm', ic: 'check' })}${btn('Choose CSV file', 'menuImportFile', { cls: 'ghost sm', ic: 'upload' })}${btn('From a photo of the menu', 'menuImportPhoto', { cls: 'ghost sm', ic: 'camera' })}</div>
    <input type="file" id="menu-import-file" accept=".csv,text/csv,text/plain" hidden data-change="menuImportFile">
    <input type="file" id="menu-import-photo" accept="image/*" hidden data-change="menuImportPhoto">
    <p class="muted sm" id="menu-import-status">Lines without a price become category headings. You can check and edit every row before saving.</p>
  </div>`;

/* ---------------- dashboard: "Your setup" summary (new cafés) / invitation (older cafés) ---------------- */
const seenKey = () => `cj.setupSeen.${(typeof Cloud !== 'undefined' && Cloud.cid) || 'local'}`;
function setupBanner() {
  if (Session.role() !== 'owner') return '';
  let seen = ''; try { seen = localStorage.getItem(seenKey()) || ''; } catch (e) { /* private mode */ }
  const prof = profileOf();
  if (prof.legacy) {
    if (seen === 'legacy') return '';
    return `<section class="card setup-banner"><div class="card-head">${eyebrow('New · Business setup')}<button class="icon-btn sm" data-act="setupSeen" data-v="legacy" aria-label="Dismiss">${icon('x')}</button></div>
      <p>Tell Cafe Journal how your place works — counter or tables, tokens, delivery, rooms… The app then shows only what you need. Nothing you have now is removed.</p>
      <div class="btn-row">${btn('Set up how you work', 'bizSetup', { cls: 'primary sm', ic: 'edit' })}</div></section>`;
  }
  if (seen === String(prof.updatedAt)) return '';
  return `<section class="card setup-banner"><div class="card-head">${eyebrow(`Your setup · ${PRESETS[prof.answers.q_preset]?.label || ''}`)}<button class="icon-btn sm" data-act="setupSeen" data-v="${esc(String(prof.updatedAt))}" aria-label="Dismiss">${icon('x')}</button></div>
    ${previewHtml(features())}
    <div class="btn-row">${btn('Change', 'bizSetup', { cls: 'ghost sm', ic: 'edit' })}</div></section>`;
}
Actions.setupSeen = (el) => { try { localStorage.setItem(seenKey(), el.dataset.v); } catch (e) { /* ignore */ } render(); };
