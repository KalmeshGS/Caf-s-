'use strict';
/* =========================================================
   Add a dish's ingredients without typing them one by one:
   - Search on Google (opens the search; copy the ingredient list back)
   - Paste ingredients (any recipe text: "2 cups milk, 2 tsp tea powder…")
   - From a photo (reads the text on the phone with OCR — nothing is uploaded)
   Amounts are converted (cups/spoons → ml/g), divided by the number of
   servings, and matched to your stock items. You check a preview first.
   ========================================================= */

const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const UNITS_IN = [ // [pattern, kind, amount in base unit (ml / g / pcs)]
  [/^(cups?|c)$/i, 'vol', 240], [/^(tbsps?|tbls?|tbs|tablespoons?|tb)$/i, 'vol', 15], [/^(tsps?|teaspoons?|ts)$/i, 'vol', 5],
  [/^(ml|mls|millilit(er|re)s?)$/i, 'vol', 1], [/^(l|lt|ltrs?|lit(er|re)s?)$/i, 'vol', 1000], [/^(glass(es)?)$/i, 'vol', 250],
  [/^(g|gm|gms|grams?|gr)$/i, 'wt', 1], [/^(kg|kgs|kilos?|kilograms?)$/i, 'wt', 1000], [/^(oz|ounces?)$/i, 'wt', 28.35], [/^(lbs?|pounds?)$/i, 'wt', 453.6],
  [/^(pinch(es)?|dash(es)?)$/i, 'wt', 0.5],
  [/^(pcs?|pieces?|nos?|numbers?|cloves?|slices?|packets?|packs?|sachets?|sticks?|leaves|leaf|sprigs?|inch(es)?|cm)$/i, 'count', 1],
];
const SKIP_WORDS = /\b(chopped|finely|roughly|fresh(ly)?|sliced|diced|grated|boiled|optional|to taste|as needed|as required|approx\.?|about|heaped|level|crushed|minced|ground|powdered|of|for garnish(ing)?|garnish)\b/gi;
const NOT_STOCK = /^(water|hot water|cold water|ice|ice cubes?)$/i;
const SYNONYMS = [ // ingredient words → words likely used in stock names
  [/\btea (leaves|leaf|powder|dust)\b|\bchai patti\b/g, 'tea'], [/\b(yogh?urt|dahi)\b/g, 'curd'], [/\b(wheat flour|whole wheat flour|chapati flour)\b/g, 'atta'],
  [/\b(maida|all purpose flour|plain flour|refined flour)\b/g, 'flour'], [/\bcottage cheese\b/g, 'paneer'], [/\bchil(i|ies|lies)\b/g, 'chilli'],
  [/\b(bell pepper|capsicums?)\b/g, 'capsicum'], [/\bcilantro\b/g, 'coriander'], [/\b(instant coffee|coffee powder|ground coffee)\b/g, 'coffee'],
  [/\baloo\b/g, 'potato'], [/\b(pyaz|pyaaz)\b/g, 'onion'], [/\b(cheese slices?)\b/g, 'cheese'], [/\b(cooking oil|vegetable oil|sunflower oil|refined oil)\b/g, 'oil'],
  [/\bcaster sugar|granulated sugar|white sugar\b/g, 'sugar'], [/\bfull cream milk|whole milk|toned milk\b/g, 'milk'],
];
const stem = (w) => w.replace(/ies$/, 'y').replace(/(oes)$/, 'o').replace(/([^s])s$/, '$1');
function normName(s) {
  let t = ` ${String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  SYNONYMS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  return t.trim().split(' ').filter(Boolean).map(stem);
}
function parseNum(s) {
  s = String(s).trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (mixed) return +mixed[1] + mixed[2] / mixed[3];
  const fr = s.match(/^(\d+)\/(\d+)$/); if (fr) return fr[1] / fr[2];
  return parseFloat(s.replace(',', '.'));
}
const NUM = '\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[.,]\\d+';

/** One ingredient line → { name, amount (in ml / g / pcs), kind } */
function parseLine(raw) {
  let s = raw.replace(/\b(a|an|one)\s+(pinch|dash|cup|glass|teaspoon|tablespoon|tsp|tbsp)\b/gi, '1 $2').replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (m) => ` ${FRAC[m]} `).replace(/(\d)\s+(0\.\d+)/g, (a, b, c) => String(+b + +c));
  // drop bullets and stray symbols at the start (photos often turn • into «, +, ~ …)
  s = s.replace(/^[^A-Za-z0-9.]+/, '').replace(/^\s*\d+[.)]\s+(?=[a-zA-Z])/, '').trim();
  if (!s) return null;
  const re = new RegExp(`(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*([a-zA-Z]+\\.?)?`, 'g');
  let m, best = null;
  while ((m = re.exec(s))) {
    const unitTok = (m[3] || '').replace(/\.$/, '');
    const u = UNITS_IN.find(([p]) => p.test(unitTok));
    const a = parseNum(m[1]), b = m[2] ? parseNum(m[2]) : null;
    const qty = b ? (a + b) / 2 : a;
    if (!(qty > 0)) continue;
    const cand = { qty, unit: u, text: u ? m[0] : m[0].replace(new RegExp(`${unitTok}$`), '').trimEnd() };
    if (u) { best = cand; break; }
    if (!best) best = cand;
  }
  let name = best ? s.replace(best.text, ' ') : s;
  name = name.replace(/^[^A-Za-z]+/, '').replace(/\([^)]*\)/g, ' ').split(/,|;| - | – /)[0].replace(SKIP_WORDS, ' ').replace(/[:\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 40) return null;
  if (!best) return { name, amount: null, kind: null, raw };
  const [, kind, factor] = best.unit || [null, 'count', 1];
  return { name, amount: best.qty * factor, kind, raw };
}
/** Whole recipe text → { servings, items } */
function parseIngredients(text) {
  const t = String(text || '');
  const sv = t.match(/\b(serves|servings?|makes|yields?|for)\s*:?\s*(\d{1,2})\b/i);
  const servings = sv ? Math.max(1, +sv[2]) : 1;
  let lines = t.split(/\r?\n/);
  if (lines.filter((l) => l.trim()).length <= 2) lines = t.split(/[,;\n]/);
  const items = [];
  for (const l of lines) {
    const line = l.trim();
    if (!line) continue;
    if (/^(method|instructions?|directions?|steps?|preparation|how to (make|prepare))\b/i.test(line)) break;
    if (/^(ingredients?|for the\b|serves|servings?|makes|yield)/i.test(line) && !/\d+\s*[a-z]+\s+\w/i.test(line.replace(/^\w+:?/, ''))) continue;
    if (line.length > 90) continue;
    if (/\b(serves|servings?|makes|yields?)\s*:?\s*\d/i.test(line) && !/\d+\s*(cups?|tbsp|tsp|ml|g|kg|l)\b/i.test(line)) continue; // "Masala chai — serves 4" is a title, not an ingredient
    const p = parseLine(line);
    if (p && !items.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) items.push(p);
  }
  return { servings, items };
}
const CHANGERS = ['ice', 'powder', 'sauce', 'syrup', 'oil', 'flour', 'paste', 'essence', 'juice', 'masala', 'batter', 'bag', 'bottle', 'sheet', 'base', 'bun', 'patty'];
const CHANGERS_ING = CHANGERS.filter((w) => w !== 'powder' && w !== 'masala');
/** Best matching stock item for an ingredient name */
function matchStock(name, stock = S.stock) {
  const ing = normName(name); if (!ing.length) return null;
  let best = null, score = 0;
  stock.forEach((s) => {
    const st = normName(s.name);
    const hit = st.filter((w) => ing.includes(w)).length;
    // "cream" is not "Ice cream", "milk" is not "Milk powder", "rice" is not "Rice flour"
    if (st.some((w) => CHANGERS.includes(w) && !ing.includes(w)) || ing.some((w) => CHANGERS_ING.includes(w) && !st.includes(w))) return;
    const sc = st.length ? hit / st.length + (hit ? 0.1 * hit : 0) : 0;
    if (sc > score) { score = sc; best = s; }
  });
  return score >= 0.5 ? best : null;
}
/** amount (ml / g / pcs) → amount in a stock item's handy unit (ml, g, pcs …); rough 1 ml ≈ 1 g */
function amountFor(stockItem, amount, kind) {
  if (amount == null || !stockItem) return null;
  const hu = handyUnit(stockItem.unit);
  const base = UNIT_BASE[hu]?.[0];
  if ((kind === 'vol' || kind === 'wt') && (base === 'L' || base === 'kg')) return r3(amount); // ml or g
  if (kind === 'count' && base === 'pcs') return r3(convertUnit(amount, 'pcs', hu) ?? amount);
  if (hu === stockItem.unit && kind === 'count') return r3(amount);
  return null;
}
const newStockUnit = (kind) => (kind === 'vol' ? 'L' : kind === 'wt' ? 'kg' : 'pcs');

/* ---------------- UI inside the menu item form ---------------- */
const canAddStock = () => ['owner', 'manager'].includes(Session.role());
function importTools() {
  return `<div class="imp-tools">
    <span class="muted sm">Add ingredients faster:</span>
    <div class="btn-row tight">
      ${btn('Recipe library', 'libFill', { cls: 'ghost sm', ic: 'book' })}
      ${window.AI_RECIPE_URL ? btn('Ask AI', 'aiFill', { cls: 'ghost sm', ic: 'spark' }) : ''}
      ${btn('Search on Google', 'impGoogle', { cls: 'ghost sm', ic: 'search' })}
      ${btn('Paste ingredients', 'impPaste', { cls: 'ghost sm', ic: 'clipboard' })}
      ${btn('From a photo', 'impPhoto', { cls: 'ghost sm', ic: 'camera' })}
    </div>
    <input type="file" id="imp-file" accept="image/*" hidden data-change="impPhotoFile">
    <div id="imp-panel" class="imp-panel" hidden>
      <label class="field"><span>Recipe text <em>(paste from Google, a website, WhatsApp — or read from a photo)</em></span>
        <textarea id="imp-text" rows="5" placeholder="e.g.&#10;Serves 4&#10;2 cups milk&#10;3 tsp tea powder&#10;4 tsp sugar"></textarea></label>
      <div class="imp-row2">
        <label class="field"><span>This recipe makes how many servings?</span><input id="imp-serves" type="number" min="1" max="200" value="1" inputmode="numeric"></label>
        ${btn('Read ingredients', 'impRead', { cls: 'primary', ic: 'check' })}
      </div>
      <p class="muted sm" id="imp-status"></p>
      <div id="imp-preview"></div>
    </div>
  </div>`;
}
function previewRow(it, i) {
  const st = matchStock(it.name);
  const skip = NOT_STOCK.test(it.name);
  const qty = st ? amountFor(st, it.amount, it.kind) : it.amount;
  const unit = st ? handyUnit(st.unit) : ({ vol: 'ml', wt: 'g', count: 'pcs' })[it.kind] || '';
  const options = `<option value="">— skip —</option>${S.stock.map((s) => `<option value="${s.id}" ${st && st.id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}${canAddStock() ? `<option value="__new" ${!st && !skip && it.amount != null ? 'selected' : ''}>+ Add "${esc(it.name)}" to stock</option>` : ''}`;
  const on = !skip && it.amount != null && (st || canAddStock());
  return `<div class="imp-item" data-i="${i}" data-amount="${it.amount ?? ''}" data-kind="${it.kind || ''}" data-name="${esc(it.name)}">
    <input type="checkbox" class="imp-on" ${on ? 'checked' : ''} aria-label="Use ${esc(it.name)}">
    <div class="imp-src"><b>${esc(it.name)}</b><small>${esc(it.raw.trim().slice(0, 50))}</small></div>
    <select class="imp-stock" aria-label="Stock item">${options}</select>
    <input class="imp-qty" type="number" min="0" step="any" value="${qty != null ? esc(String(qty)) : ''}" aria-label="Amount per serving">
    <span class="imp-unit">${esc(unit)}</span></div>`;
}
function refreshPreviewRow(row) {
  const id = row.querySelector('.imp-stock').value, kind = row.dataset.kind, amt = row.dataset.amount === '' ? null : +row.dataset.amount;
  const st = byId(S.stock, id);
  const unitEl = row.querySelector('.imp-unit'), qEl = row.querySelector('.imp-qty');
  if (st) { const q = amountFor(st, amt, kind); unitEl.textContent = handyUnit(st.unit); qEl.value = q != null ? q : ''; }
  else if (id === '__new') { unitEl.textContent = ({ vol: 'ml', wt: 'g', count: 'pcs' })[kind] || ''; qEl.value = amt != null ? r3(amt) : ''; }
  row.querySelector('.imp-on').checked = !!id && qEl.value !== '';
}

/* ---------------- photo → text (OCR on the phone) ---------------- */
let ocrWorkerPromise = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the photo reader')); document.head.appendChild(s); }); }
async function ocrWorker(onProgress) {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
      const base = new URL('vendor/tesseract/', location.href).href;
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js', corePath: base, langPath: base + 'lang', gzip: true, workerBlobURL: false,
        logger: (m) => App.ocrProgress && App.ocrProgress(m),
      });
    })().catch((e) => { ocrWorkerPromise = null; throw e; });
  }
  App.ocrProgress = onProgress;
  return ocrWorkerPromise;
}
/** Shrink big phone photos (faster, same accuracy) */
function downscale(file, max = 2000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); c.toBlob((b) => resolve(b || file), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Show reader items (from text, a photo, the library or AI) for checking before adding */
function showItems(items, note) {
  App.impItems = items;
  $('#imp-preview').innerHTML = items.length
    ? `<p class="muted sm">${esc(note)}. Check the matches and amounts, then add.</p>
      <div class="imp-list">${items.map(previewRow).join('')}</div>
      <div class="btn-row">${btn('Add ticked to recipe', 'impAdd', { cls: 'primary', ic: 'plus' })}</div>`
    : '<p class="neg sm">No ingredients found. Put one ingredient per line, like "2 cups milk".</p>';
}
/* ---------------- actions ---------------- */
function showPanel(noText) { const p = $('#imp-panel'); if (p) { p.hidden = false; p.querySelectorAll(':scope > .field, :scope > .imp-row2').forEach((x) => { x.hidden = !!noText; }); } return p; }
Object.assign(Actions, {
  impGoogle(el) {
    const name = el.closest('form').name.value.trim();
    if (!name) return toast('Type the dish name first.');
    window.open(`https://www.google.com/search?q=${encodeURIComponent(`${name} recipe ingredients`)}`, '_blank', 'noopener');
    showPanel(); $('#imp-status').textContent = 'Copy the ingredient list from the recipe page, come back, paste it above and tap "Read ingredients".';
  },
  impPaste() { showPanel(); setTimeout(() => $('#imp-text')?.focus(), 30); },
  impPhoto() { $('#imp-file')?.click(); },
  impRead() {
    const { servings, items } = parseIngredients($('#imp-text').value);
    const sv = $('#imp-serves');
    if (sv && (+sv.value || 1) === 1 && servings > 1) sv.value = servings;
    const per = Math.max(1, +(sv?.value) || 1);
    const scaled = items.filter((it) => it.amount != null || matchStock(it.name)).map((it) => ({ ...it, amount: it.amount != null ? it.amount / per : null })); // titles / headings without amounts are left out
    showItems(scaled, `${pl(scaled.length, 'ingredient')} found${per > 1 ? ` · amounts divided by ${per} servings` : ''}`);
  },
  impAdd() {
    const rows = $$('#imp-preview .imp-item').filter((r) => r.querySelector('.imp-on').checked);
    if (!rows.length) return toast('Tick at least one ingredient.');
    const box = $('#rec-rows'); let added = 0, created = 0;
    // remove the empty starter row
    $$('#rec-rows .rec-row').forEach((r) => { if (!r.querySelector('select').value && !r.querySelector('input').value) r.remove(); });
    rows.forEach((r) => {
      let id = r.querySelector('.imp-stock').value; const q = +r.querySelector('.imp-qty').value;
      if (!id || !(q > 0)) return;
      if (id === '__new') {
        if (!canAddStock()) return;
        const unit = newStockUnit(r.dataset.kind);
        const name = r.dataset.name.replace(/^\w/, (c) => c.toUpperCase());
        const s = { id: uid('s'), name, unit, qty: 0, max: unit === 'pcs' ? 50 : 5, low: 0, step: 1 };
        S.stock.push(s); id = s.id; created++;
      }
      const st = byId(S.stock, id);
      const qty = convertUnit(q, handyUnit(st.unit), st.unit) ?? q;
      box.insertAdjacentHTML('beforeend', recipeRow({ stockId: id, qty: r6(qty) }));
      added++;
    });
    if (created) { persist(); }
    // refresh dropdowns in all recipe rows so new stock items appear
    if (created) $$('#rec-rows .rec-row').forEach((row) => { const sel = row.querySelector('select[name=r_stock]'); const v = sel.value; sel.innerHTML = `<option value="">Choose ingredient…</option>${S.stock.map((x) => `<option value="${x.id}" ${x.id === v ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`; });
    $('#imp-panel').hidden = true;
    toast(`${pl(added, 'ingredient')} added${created ? ` · ${pl(created, 'new stock item')} created (set their quantity in Stock)` : ''} — tap Save`);
  },
});
document.addEventListener('change', (e) => { if (e.target.classList.contains('imp-stock')) refreshPreviewRow(e.target.closest('.imp-item')); });
Changes.impPhotoFile = async (el) => {
  const f = el.files[0]; el.value = ''; if (!f) return;
  showPanel();
  const status = $('#imp-status');
  status.textContent = 'Reading the photo… (the first time, the reader downloads about 7 MB)';
  try {
    const worker = await ocrWorker((m) => { if (m.status === 'recognizing text') status.textContent = `Reading the photo… ${Math.round(m.progress * 100)}%`; else if (/load/.test(m.status || '')) status.textContent = `Getting the photo reader ready… ${Math.round((m.progress || 0) * 100)}%`; });
    const { data } = await worker.recognize(await downscale(f));
    const text = (data.text || '').trim();
    if (!text) { status.textContent = 'No text found in that photo. Try a clearer, straight photo of the ingredient list.'; return; }
    $('#imp-text').value = text;
    status.textContent = 'Text read from the photo — check it, then tap "Read ingredients".';
    Actions.impRead();
  } catch (e) {
    status.textContent = `Couldn't read the photo here (${e.message}). Use "Paste ingredients" instead.`;
  }
};
