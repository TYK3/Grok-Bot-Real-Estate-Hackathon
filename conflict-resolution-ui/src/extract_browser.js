// In-browser port of Person A's rules extractor (fact_record/extraction/rules.py, simplified).
// Text layer via pdf.js; scanned pages are OCR'd with tesseract.js (loaded from CDN on demand).
// Emits facts in schema/extracted_fact.schema.json.

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const FLOOR_RE = /(lower\s+ground|upper\s+ground|ground|first|second|third|fourth|basement|mezzanine|attic)\s+floor/i;
const PRICE_EXCLUDE = /previous|\bwas\b|paid|reduced\s+from|\bfrom\b|fee|deposit|stamp\s+duty|referral|service\s+charge|ground\s+rent|council\s+tax/i;
const KNOWN = [
  [/kelso\s*villa|kelso-villa/i, 'kelso-villa', 'Kelso Villa, Upper Bristol Road, Bath BA1 3AU'],
  [/huberts/i, 'st-huberts-close', 'St Huberts Close, Gerrards Cross'],
];

export function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s).replace(/[,\s]/g, ''));

export function classifyDoc(name, text) {
  const t = `${name}\n${text.slice(0, 3000)}`.toLowerCase();
  if (/energy performance certificate|epc[-_ ]register/.test(t)) return ['epc_register', 2];
  if (/title register|land registry|hm land/.test(t)) return ['land_registry', 2];
  if (/measured[\s-]survey|schedule[\s-]of[\s-]finishes|specification schedule/.test(t)) return [/finishes/.test(t) ? 'schedule_of_finishes' : 'measured_survey', 3];
  if (/price[\s-]change|price list|instruction/.test(t)) return ['developer_instruction', 4];
  if (/rightmove|zoopla|onthemarket|portal/.test(t)) return ['listing', 6];
  return ['brochure', 5];
}

export function docDate(name, text) {
  const m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})\\s+(20\\d\\d)`, 'i'));
  if (m) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const f = name.match(/(20\d\d)-(\d\d)/); if (f) return `${f[1]}-${f[2]}`;
  const g = name.toLowerCase().match(new RegExp(`(${MONTHS.join('|')})[-_ ](20\\d\\d)`));
  if (g) return `${g[2]}-${String(MONTHS.indexOf(g[1]) + 1).padStart(2, '0')}`;
  const h = text.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(20\\d\\d)`, 'i'));
  if (h) return `${h[2]}-${String(MONTHS.indexOf(h[1].toLowerCase()) + 1).padStart(2, '0')}`;
  return null;
}

export function propertyFor(name, text) {
  for (const [re, id, label] of KNOWN) if (re.test(name) || re.test(text.slice(0, 4000))) return [id, label];
  const pc = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  const stem = name.replace(/\.pdf$/i, '');
  return [slug(pc ? pc[1] : stem), pc ? `Property ${pc[1]}` : stem];
}

function quoteAround(text, start, end) {
  let a = Math.max(0, text.lastIndexOf('\n', start - 1) + 1, start - 120);
  let b = text.indexOf('\n', end); if (b < 0 || b - end > 120) b = Math.min(text.length, end + 120);
  return clean(text.slice(a, b));
}
function floorScope(text, idx) {
  const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
  const pre = text.slice(Math.max(0, lineStart - 0), idx).slice(-80);
  const m = pre.match(FLOOR_RE);
  if (m) return slug(m[1].replace(/^lower$/i, 'lower ground'));
  if (/garage/i.test(pre)) return 'whole-garage';
  return 'whole';
}

// Pure: page texts -> facts. pages: [{page, text}]
export function extractFactsFromPages(pages, { name, doc_id }) {
  const all = pages.map((p) => p.text).join('\n');
  const [doc_type, tier] = classifyDoc(name, all);
  const date = docDate(name, all);
  const [property_id, property_name] = propertyFor(name, all);
  const facts = [];
  let n = 0;
  const push = (page, text, m, fact) => {
    facts.push({
      fact_id: `${doc_id}:${fact.field}:${page}:${n++}`, property_id, property_name, scope: 'unit',
      ...fact,
      source: { doc_id, file_name: name, doc_type, title: name, published_date: date, authority_tier: tier, synthetic: /synthetic/i.test(name) },
      page, quote: quoteAround(text, m.index, m.index + m[0].length),
      extraction_confidence: 0.7, entity_match_confidence: 1.0, extraction_method: 'browser_regex',
    });
  };
  const seen = new Set();
  const once = (k) => (seen.has(k) ? false : (seen.add(k), true));
  for (const { page, text } of pages) {
    let m;
    // Price / rent
    const priceRe = /£\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(m\b|million|k\b)?/gi;
    while ((m = priceRe.exec(text))) {
      let v = num(m[1]); if (/^m|million/i.test(m[2] || '')) v *= 1e6; else if (/^k/i.test(m[2] || '')) v *= 1e3;
      const pre = text.slice(Math.max(0, m.index - 60), m.index), post = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (/^\s*(per\s+sq|psf)/i.test(post)) continue;
      if (/per\s+annum|\bp\.?a\.?\b|pcm|per\s+month|per\s+week/i.test(post)) {
        if (once(`rent:${v}:${page}`)) push(page, text, m, { field: 'rent', value: v, unit: 'GBP', plot: floorScope(text, m.index) });
        continue;
      }
      if (v < 50000) continue;
      if (PRICE_EXCLUDE.test(pre.slice(-35)) && !/revised|reduced\s+to|\bnow\b|new\s+(asking\s+)?price/i.test(pre)) continue;
      if (once(`price:${v}:${page}`)) push(page, text, m, { field: 'price', value: v, unit: 'GBP', plot: 'whole' });
    }
    // Tenure
    const tenRe = /\b(share\s+of\s+freehold|freehold|leasehold)\b/gi;
    while ((m = tenRe.exec(text))) { const v = m[1].toLowerCase().replace(/\s+/g, '_'); if (once(`tenure:${v}`)) push(page, text, m, { field: 'tenure', value: v, plot: 'whole' }); }
    // Transaction type
    const txRe = /\b(for\s+sale|to\s+let)\b/gi;
    while ((m = txRe.exec(text))) { const v = m[1].toLowerCase().replace(/\s+/g, '_'); if (once(`tx:${v}`)) push(page, text, m, { field: 'transaction_type', value: v, plot: 'whole' }); }
    // Floor areas: "468 sq ft (43.45 sq m)" or "42.8 m² (461 sq ft)" or single unit
    const areaRe = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|ft²|ft2|square\s+feet|sq\.?\s*m\b|sqm|m²|m2|square\s+met(?:re|er)s)\.?(?:\s*\(?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|ft²|sq\.?\s*m\b|sqm|m²)\s*\)?)?/gi;
    while ((m = areaRe.exec(text))) {
      const isFt = /ft|feet/i.test(m[2]);
      const v = num(m[1]); if (!v || v < 5) continue;
      const ctx = text.slice(Math.max(0, text.lastIndexOf('\n', m.index - 1) - 60), m.index + m[0].length + 25);
      if (/per\s+sq|£\s*$/i.test(text.slice(Math.max(0, m.index - 3), m.index)) || /^\s*(\)|\s)*(quoted\s+in|stated\s+in)/i.test(text.slice(m.index + m[0].length, m.index + m[0].length + 20))) continue;
      const basis = /\bNIA\b|net\s+internal|\bnet\b/i.test(ctx) ? 'net' : /\bGIA\b|gross\s+internal|\bgross\b/i.test(ctx) ? 'gross' : null;
      const plot = floorScope(text, m.index);
      const field = basis === 'net' ? 'net_floor_area' : basis === 'gross' ? 'gross_floor_area' : 'floor_area';
      const sqft = isFt ? v : m[3] && /ft/i.test(m[4] || '') ? num(m[3]) : Math.round(v * 10.7639);
      const eq = m[3] ? `${m[3]} ${m[4]}` : null;
      if (once(`area:${field}:${plot}:${sqft}:${page}`)) push(page, text, m, { field, value: sqft, unit: 'sqft', area_basis: basis, plot, stated_equivalent: eq });
    }
    // EPC
    const epcRe = /\b(?:EPC\)?\s*(?:rating|band)?\s*(?:has\s+been\s+assessed\s+as|is|of|:|-)?\s*|energy\s+(?:efficiency\s+)?rating\s*(?:is|:)?\s*|band\s+)([A-G])\b(?![\w'’])/g;
    while ((m = epcRe.exec(text))) {
      if (/^band/i.test(m[0]) && !/EPC|energy/i.test(text.slice(Math.max(0, m.index - 80), m.index + 40))) continue;
      if (once(`epc:${m[1]}:${page}`)) push(page, text, m, { field: 'energy_rating', value: m[1], plot: 'whole' });
    }
    // Parking
    const parkRe = /\b(\d{1,2}|one|two|three|four|five|six)\s+(allocated\s+)?(?:car\s+)?(?:parking\s+)?(spaces?|bays?)\b|parking\s+(?:spaces?|bays?)\s*[:\-]\s*(\d{1,3})|\b(single|double|triple)\s+garage\b/gi;
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, single: 1, double: 2, triple: 3 };
    while ((m = parkRe.exec(text))) {
      const around = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 40);
      if (m[3] && !/park|car|garage/i.test(around)) continue;
      const raw = (m[1] || m[4] || m[5]).toLowerCase(); const v = words[raw] ?? Number(raw);
      if (once(`parking:${v}:${page}:${m.index}`)) push(page, text, m, { field: 'parking', value: v, plot: /per\s+floor|each\s+floor/i.test(around) ? 'per-floor' : 'whole' });
    }
    // Bedrooms / bathrooms
    const roomRe = /\b(\d{1,2}|one|two|three|four|five|six)\s*(?:double\s+)?(bedrooms?|bed\b|bathrooms?)/gi;
    while ((m = roomRe.exec(text))) {
      const v = words[m[1].toLowerCase()] ?? Number(m[1]); if (!v || v > 15) continue;
      const field = /bath/i.test(m[2]) ? 'bathrooms' : 'bedrooms';
      if (once(`${field}:${v}:${page}`)) push(page, text, m, { field, value: v, plot: 'whole' });
    }
    // Listed status
    const lsRe = /\b(?:listed\s+grade\s+(II\*?|Il|I)\b|grade\s+(II\*?|Il|I)\s+listed)/gi;
    while ((m = lsRe.exec(text))) { const v = (m[1] || m[2]).replace('Il', 'II'); if (once(`listed:${v}`)) push(page, text, m, { field: 'listed_status', value: `Grade ${v}`, plot: 'whole' }); }
  }
  return { facts, doc_type, authority_tier: tier, published_date: date, property_id };
}

// ---- Browser-only: pdf.js text layer + tesseract.js OCR -------------------
let workerPromise = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`Could not load ${src}`)); document.head.appendChild(s); });
}
async function ocrWorker() {
  if (!workerPromise) workerPromise = (async () => {
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    return window.Tesseract.createWorker('eng');
  })();
  return workerPromise;
}

export async function pdfPageTexts(bytes, name, onProgress = () => {}) {
  const lib = window.pdfjsLib; if (!lib) throw new Error('pdf.js is not loaded');
  lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await lib.getDocument({ data: bytes.slice() }).promise;
  const pages = []; let ocrPages = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    onProgress(`Reading page ${i}/${pdf.numPages} of ${name}`);
    const tc = await page.getTextContent();
    let text = ''; for (const it of tc.items) text += it.str + (it.hasEOL ? '\n' : ' ');
    if (text.replace(/\s/g, '').length < 80) {
      onProgress(`OCR page ${i}/${pdf.numPages} of ${name}`);
      const vp = page.getViewport({ scale: 2 }); const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const w = await ocrWorker(); const r = await w.recognize(canvas);
      text = r.data.text || ''; ocrPages++;
    }
    pages.push({ page: i, text });
  }
  return { pages, ocrPages, numPages: pdf.numPages };
}

export async function extractPdfInBrowser(bytes, { name, doc_id }, onProgress) {
  const { pages, ocrPages, numPages } = await pdfPageTexts(bytes, name, onProgress);
  return { ...extractFactsFromPages(pages, { name, doc_id }), ocrPages, numPages };
}
