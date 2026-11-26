'use strict';
/* =========================================================
   Files without any library or upload — everything stays on the device:
   - read Excel (.xlsx) and CSV
   - write Excel (.xlsx), Word (.docx), PDF and CSV
   ========================================================= */

/* ---------------- CSV ---------------- */
/** CSV text → rows of cells (handles "quoted, cells", "" escapes, ; separated files) */
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}
const csvText = (rows) => '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

/* ---------------- ZIP (Excel and Word files are zip files) ---------------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** { 'path/in/zip': 'text' | Uint8Array } → zip bytes (stored, no compression — small files) */
function zipFiles(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff], u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nm = enc.encode(name), crc = crc32(data);
    const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    parts.push(new Uint8Array(head), nm, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nm);
    offset += head.length + nm.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(Object.keys(files).length), ...u16(Object.keys(files).length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end]);
}
/** zip bytes → { path: Uint8Array } (reads stored and deflated entries) */
async function unzip(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf); const out = {};
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const raw = b.subarray(start, start + csize);
    if (method === 0) out[name] = raw;
    else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/* ---------------- Excel (.xlsx) ---------------- */
const xmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/** Every sheet of an .xlsx → [{ name, rows }] (rows of cell texts), in workbook order */
async function readXlsxSheets(file) {
  const z = await unzip(await file.arrayBuffer());
  const dec = new TextDecoder(), xml = (p) => (z[p] ? new DOMParser().parseFromString(dec.decode(z[p]), 'application/xml') : null);
  const tags = (doc, t) => (doc ? [...doc.getElementsByTagNameNS('*', t)] : []);
  const find = (p) => Object.keys(z).find((k) => k.toLowerCase() === p.toLowerCase());
  const shared = tags(xml(find('xl/sharedStrings.xml') || 'xl/sharedStrings.xml'), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join(''));
  const wb = xml('xl/workbook.xml'), rels = xml('xl/_rels/workbook.xml.rels');
  let list = tags(wb, 'sheet').map((sh, i) => {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = rels && tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid);
    let path = `xl/worksheets/sheet${i + 1}.xml`;
    if (rel) { const t = rel.getAttribute('Target').replace(/^\//, ''); path = t.startsWith('xl/') ? t : 'xl/' + t; }
    return { name: sh.getAttribute('name') || `Sheet ${i + 1}`, path: find(path) || path, hidden: (sh.getAttribute('state') || '') !== '' && sh.getAttribute('state') !== 'visible' };
  });
  if (!list.length) list = Object.keys(z).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/i.test(k)).sort().map((k, i) => ({ name: `Sheet ${i + 1}`, path: k }));
  const out = [];
  for (const sh of list) {
    const sheet = xml(sh.path); if (!sheet) continue;
    const rows = [];
    tags(sheet, 'row').forEach((r) => {
      const row = [];
      tags(r, 'c').forEach((c, k) => {
        const ref = c.getAttribute('r') || ''; const letters = ref.replace(/\d+/g, '');
        const ci = letters ? letters.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : k;
        const t = c.getAttribute('t'); const v = tags(c, 'v')[0]?.textContent ?? '';
        let val = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? tags(c, 't').map((x) => x.textContent).join('') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
        if (t !== 's' && t !== 'inlineStr' && /^-?\d+\.\d{6,}$/.test(val)) val = String(Math.round(+val * 100) / 100); // 39.99999999 → 40
        row[ci] = String(val).trim();
      });
      for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = '';
      if (row.some((x) => x !== '')) rows.push(row);
    });
    out.push({ name: sh.name, hidden: !!sh.hidden, rows });
  }
  if (!out.length) throw new Error('No sheet found in that Excel file.');
  return out;
}
/** First sheet of an .xlsx → rows of cell texts */
async function readXlsx(file) { return (await readXlsxSheets(file))[0].rows; }
/** Old Excel (.xls) / OpenDocument (.ods): loads the SheetJS reader only when needed */
async function readLegacySheets(file) {
  if (!window.XLSX) {
    await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx.full.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('Could not load the Excel reader — check the internet and try again.')); document.head.appendChild(sc); });
  }
  const wb = window.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  return wb.SheetNames.map((n) => ({ name: n, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean)) }));
}
/** [{ name, rows: [[...]], widths?: [chars] }] → .xlsx Blob. First row of each sheet is shown bold (header). */
function writeXlsx(sheets) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(String(s.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
  };
  sheets.forEach((s, i) => {
    const widths = s.widths || (s.rows[0] || []).map((_, c) => Math.min(60, Math.max(8, ...s.rows.map((r) => String(r[c] ?? '').length + 2))));
    const rowsXml = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1), st = ri === 0 && s.header !== false ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rowsXml}</sheetData></worksheet>`;
  });
  return new Blob([zipFiles(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------------- Word (.docx) ---------------- */
/** blocks: [{ h: 'Heading' } | { p: 'text', bold? } | { table: [[...]] }] → .docx Blob */
function writeDocx(blocks) {
  const run = (t, b) => `<w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const body = blocks.map((bl) => {
    if (bl.h) return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${bl.size || 28}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(bl.h)}</w:t></w:r></w:p>`;
    if (bl.table) {
      const cols = Math.max(...bl.table.map((r) => r.length));
      return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="BFB5A8"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('')}</w:tblGrid>${bl.table.map((r, ri) => `<w:tr>${Array.from({ length: cols }, (_, ci) => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/></w:tcPr><w:p>${run(r[ci] ?? '', ri === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
    }
    return `<w:p>${run(bl.p ?? '', bl.bold)}</w:p>`;
  }).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>`,
  };
  return new Blob([zipFiles(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------------- PDF (A4, plain text and simple tables) ---------------- */
/** Same blocks as writeDocx → PDF Blob. Uses the built-in Helvetica font (₹ is written as "Rs."). */
function writePdf(blocks, title = 'Report') {
  const W = 595, H = 842, M = 42, LH = 14;
  const clean = (s) => String(s ?? '').replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/[^\x20-\x7e]/g, '?');
  const pdfStr = (s) => clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const textW = (s, size) => clean(s).length * size * 0.5; // Helvetica average width
  const pages = []; let ops = [], y = H - M;
  const newPage = () => { if (ops.length) pages.push(ops.join('\n')); ops = []; y = H - M; };
  const ensure = (h) => { if (y - h < M) newPage(); };
  const text = (x, t, size = 10, bold = false) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfStr(t)}) Tj ET`);
  const fit = (s, width, size) => { let t = clean(s); while (t.length > 1 && textW(t, size) > width) t = t.slice(0, -1); return t.length < clean(s).length ? t.slice(0, -1) + '.' : t; };
  for (const bl of blocks) {
    if (bl.h) { ensure(30); y -= 8; text(M, bl.h, bl.size ? bl.size / 2 : 14, true); y -= LH + 6; continue; }
    if (bl.table) {
      const cols = Math.max(...bl.table.map((r) => r.length)); const cw = (W - 2 * M) / cols;
      bl.table.forEach((r, ri) => {
        ensure(LH + 6);
        if (ri === 0) ops.push(`0.95 0.92 0.88 rg ${M} ${(y - 4).toFixed(1)} ${W - 2 * M} ${LH + 2} re f 0 g`);
        r.forEach((c, ci) => text(M + ci * cw + 3, fit(c, cw - 6, 9), 9, ri === 0));
        ops.push(`0.8 G ${M} ${(y - 5).toFixed(1)} m ${W - M} ${(y - 5).toFixed(1)} l S 0 G`);
        y -= LH + 2;
      });
      y -= 8; continue;
    }
    // wrap a paragraph
    const words = clean(bl.p).split(' '); let line = '';
    for (const w of words) {
      if (textW(line + ' ' + w, 10) > W - 2 * M && line) { ensure(LH); text(M, line, 10, bl.bold); y -= LH; line = w; } else line = line ? line + ' ' + w : w;
    }
    ensure(LH); text(M, line, 10, bl.bold); y -= LH + 2;
  }
  newPage();
  // assemble objects
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(''), pagesObj = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = pages.map((content, i) => {
    const footer = `BT /F1 8 Tf ${M} 24 Td (${pdfStr(`${title} - page ${i + 1} of ${pages.length}`)}) Tj ET`;
    const body = content + '\n' + footer;
    const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
/** Save a Blob as a file */
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Save a file. iPhone / iPad: open the share sheet (Save to Files, WhatsApp, Mail…) — a plain download
    there opens the file over the app with no way back, and from the home-screen app it does nothing. */
function saveBlob(name, blob) {
  if (IS_IOS && navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch((e) => { if (!e || e.name !== 'AbortError') plainSave(name, blob); });
        return;
      }
    } catch (e) { /* fall back to a normal download */ }
  }
  plainSave(name, blob);
}
function plainSave(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}

Object.assign(Actions, { printPick(el) { const k = el.dataset.p; closeSheet(); printOn(k); } });
