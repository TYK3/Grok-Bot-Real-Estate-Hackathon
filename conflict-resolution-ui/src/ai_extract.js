/**
 * AI document extractor for the conflict-resolution workbench.
 *
 * Turns arbitrary PDF / text evidence into structured facts (Person A → Person B
 * shape) using an OpenAI-compatible chat/completions API. No static document
 * catalogue is required — any brochure, survey, instruction or listing text can
 * be extracted on the fly.
 *
 * Browser: pass apiKey (e.g. from a local settings field).
 * Node: defaults to process.env.OPENAI_API_KEY.
 *
 * Zero npm dependencies.
 */

import { loadFacts, normaliseDate } from './resolve.js';

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';
export const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';

const SYSTEM_PROMPT = `You are Person A's property-fact extractor for a UK real-estate verification pipeline.
Extract ONLY facts that are explicitly supported by the provided document text or page images.
Return STRICT JSON (no markdown) with this shape:
{
  "property_name": string|null,
  "property_id": string|null,
  "documents": [{ "doc_id": string, "doc_type": string, "title": string, "published_date": "YYYY-MM-DD"|null, "issuer": string|null }],
  "facts": [{
    "field": string,
    "value": number|string,
    "unit": string|null,
    "area_basis": "net"|"gross"|null,
    "scope": "unit"|"development"|null,
    "page": number|null,
    "quote": string,
    "extraction_confidence": number,
    "source": { "doc_id": string, "doc_type": string, "title": string, "published_date": string|null, "issuer": string|null }
  }]
}

Allowed fields (use these names when possible):
price, tenure, net_floor_area, gross_floor_area, floor_area, lower_ground_floor_area,
energy_rating, parking, parking_total, parking_scope, en_suite_bathroom, bedrooms, bathrooms,
rent, availability, transaction_type, listed_status.

Rules:
- Prefer numeric values for price/areas/parking counts. Prices in GBP. Areas: unit "sqft" or "sqm".
- If NIA/net: area_basis "net" and field net_floor_area when clear. If GIA/gross: gross_floor_area.
- If a printed conversion looks wrong (e.g. 185 sq m shown as 2,700 sq ft), still extract both figures with quotes; do not invent corrections.
- Quote must be a short verbatim excerpt from the source.
- Do not invent Land Registry / EPC register values that are not in the document.
- If the document is marketing particulars, doc_type is "brochure" or "particulars".
- Measured survey → "measured_survey". Formal price instruction → "developer_instruction".
- If unsure about a value, omit it rather than guessing.
- entity_match_confidence is assumed 1.0 for facts from a single uploaded document about one property.`;

/**
 * Extract facts from one or more document payloads via AI.
 * @param {Array<{name:string, text?:string, pages?:Array<{page:number,text?:string,imageDataUrl?:string}>, doc_type?:string, mime?:string}>} docs
 * @param {object} [options]
 */
export async function extractFactsWithAi(docs, options = {}) {
  const apiKey = options.apiKey || defaultApiKey();
  if (!apiKey) {
    throw new Error(
      'No OpenAI API key configured. Set OPENAI_API_KEY (CLI) or enter a key in the workbench AI settings.'
    );
  }
  const model = options.model || DEFAULT_AI_MODEL;
  const baseUrl = (options.baseUrl || DEFAULT_AI_BASE_URL).replace(/\/$/, '');
  const list = Array.isArray(docs) ? docs : [docs];
  if (!list.length) return { facts: [], documents: [], warnings: ['No documents provided for AI extraction.'], raw: null };

  const warnings = [];
  const content = buildUserContent(list, warnings);
  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI extraction failed (${res.status}): ${errText.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`AI returned non-JSON content: ${err.message}`);
  }

  const envelope = normaliseAiEnvelope(parsed, list);
  const facts = loadFacts(envelope);
  return {
    facts,
    documents: envelope.documents || [],
    warnings,
    raw: parsed,
    model,
    usage: data.usage || null,
  };
}

function defaultApiKey() {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }
  } catch {
    /* browser */
  }
  return null;
}

function buildUserContent(docs, warnings) {
  const parts = [];
  parts.push({
    type: 'text',
    text:
      'Extract structured property facts from the following document(s). ' +
      'Use only evidence present in the text/images. Return JSON only.\n',
  });

  for (const doc of docs) {
    const name = doc.name || 'document';
    const header = `\n--- DOCUMENT: ${name} (doc_type hint: ${doc.doc_type || 'unknown'}) ---\n`;
    parts.push({ type: 'text', text: header });

    if (Array.isArray(doc.pages) && doc.pages.length) {
      for (const page of doc.pages) {
        const pageNo = page.page || 1;
        if (page.text && String(page.text).trim()) {
          parts.push({
            type: 'text',
            text: `\n[page ${pageNo} text]\n${String(page.text).slice(0, 12000)}\n`,
          });
        }
        if (page.imageDataUrl) {
          parts.push({
            type: 'image_url',
            image_url: { url: page.imageDataUrl, detail: 'high' },
          });
          parts.push({ type: 'text', text: `\n[page ${pageNo} image above]\n` });
        }
        if (!page.text && !page.imageDataUrl) {
          warnings.push(`${name} page ${pageNo} had no text or image for the model.`);
        }
      }
    } else if (doc.text) {
      parts.push({ type: 'text', text: String(doc.text).slice(0, 60000) });
    } else {
      warnings.push(`${name} provided no extractable text or page images.`);
    }
  }
  return parts;
}

function normaliseAiEnvelope(parsed, sourceDocs) {
  const fallbackDoc = sourceDocs[0] || {};
  const fallbackId = slugId(fallbackDoc.name || 'upload');
  const docsIn = Array.isArray(parsed.documents) ? parsed.documents : [];
  const documents = docsIn.length
    ? docsIn
    : [
        {
          doc_id: fallbackId,
          doc_type: fallbackDoc.doc_type || 'brochure',
          title: fallbackDoc.name || 'Uploaded document',
          published_date: null,
          issuer: null,
          name: fallbackDoc.name || 'upload.pdf',
          kind: 'pdf',
        },
      ];

  const primaryDoc = documents[0];
  const factsIn = Array.isArray(parsed.facts) ? parsed.facts : [];
  const facts = factsIn.map((f, i) => {
    const src = f.source || {};
    return {
      ...f,
      property_id: f.property_id || parsed.property_id || null,
      property_name: f.property_name || parsed.property_name || null,
      page: f.page ?? null,
      quote: f.quote || f.excerpt || null,
      extraction_confidence: f.extraction_confidence ?? 0.7,
      entity_match_confidence: f.entity_match_confidence ?? 1.0,
      source: {
        doc_id: src.doc_id || primaryDoc.doc_id || fallbackId,
        doc_type: src.doc_type || primaryDoc.doc_type || fallbackDoc.doc_type || 'brochure',
        title: src.title || primaryDoc.title || fallbackDoc.name || 'Uploaded document',
        published_date: normaliseDate(src.published_date || primaryDoc.published_date),
        issuer: src.issuer || primaryDoc.issuer || null,
        agent: src.agent || src.issuer || primaryDoc.issuer || null,
        url: fallbackDoc.objectUrl || fallbackDoc.url || null,
      },
      _ai: true,
      _ai_index: i,
    };
  });

  return {
    label: parsed.property_name || fallbackDoc.name || 'ai-extraction',
    property_id: parsed.property_id || null,
    property_name: parsed.property_name || null,
    documents,
    facts,
    extraction: { method: 'ai', model_hint: true },
  };
}

function slugId(name) {
  return String(name || 'doc')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'doc';
}

/**
 * Build AI input pages from a PDF in the browser using PDF.js (global pdfjsLib).
 * Uses text layer when present; falls back to rendered page images for scans.
 */
export async function pdfToAiPages(bytesOrUrl, options = {}) {
  const maxPages = options.maxPages || 6;
  const renderScale = options.renderScale || 1.25;
  const forceImages = Boolean(options.forceImages);

  if (typeof window === 'undefined' || !window.pdfjsLib) {
    // Node / no PDF.js: best-effort latin1 text peek
    const bytes =
      typeof bytesOrUrl === 'string' ? null : bytesOrUrl instanceof Uint8Array ? bytesOrUrl : new Uint8Array(bytesOrUrl || []);
    const text = bytes ? roughPdfText(bytes) : '';
    return [{ page: 1, text: text || null, imageDataUrl: null }];
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    window.pdfjsLib.GlobalWorkerOptions.workerSrc ||
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const loadingTask =
    typeof bytesOrUrl === 'string'
      ? window.pdfjsLib.getDocument(bytesOrUrl)
      : window.pdfjsLib.getDocument({ data: bytesOrUrl });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages = [];

  for (let n = 1; n <= pageCount; n++) {
    const page = await pdf.getPage(n);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    let imageDataUrl = null;
    if (forceImages || text.length < 80) {
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      imageDataUrl = canvas.toDataURL('image/jpeg', 0.72);
    }
    pages.push({ page: n, text: text || null, imageDataUrl });
  }
  return pages;
}

function roughPdfText(u8) {
  let s = '';
  const lim = Math.min(u8.length, 400000);
  for (let i = 0; i < lim; i++) s += String.fromCharCode(u8[i]);
  const out = [];
  const re = /\(([^\n\r()]{8,200})\)/g;
  let m;
  while ((m = re.exec(s)) && out.length < 200) {
    const t = m[1].replace(/\\n/g, ' ').replace(/\\(.)/g, '$1').trim();
    if (t) out.push(t);
  }
  return out.join('\n');
}

/**
 * High-level helper: AI-extract from prepared ingest file descriptors.
 */
export async function aiExtractFromFiles(fileDescriptors, options = {}) {
  const docs = [];
  const warnings = [];
  for (const f of fileDescriptors || []) {
    const name = f.name || 'document';
    const isPdf = /\.pdf$/i.test(name) || f.mime === 'application/pdf' || f.kind === 'pdf';
    const isText = /\.(txt|md|csv|tsv)$/i.test(name) || (f.mime || '').startsWith('text/');
    if (isPdf) {
      try {
        const pages = await pdfToAiPages(f.bytes || f.objectUrl || f.url, options);
        docs.push({
          name,
          doc_type: f.doc_type || guessDocTypeFromName(name),
          pages,
          objectUrl: f.objectUrl || null,
          url: f.url || f.objectUrl || null,
        });
      } catch (err) {
        warnings.push(`PDF prepare failed for ${name}: ${err.message}`);
      }
    } else if (isText || f.text) {
      const text = f.text || (f.bytes ? new TextDecoder().decode(f.bytes) : '');
      docs.push({ name, doc_type: f.doc_type || 'crm', text, objectUrl: null });
    } else {
      warnings.push(`Skipping ${name} for AI extraction (unsupported type).`);
    }
  }
  if (!docs.length) {
    return { facts: [], documents: [], warnings: [...warnings, 'No AI-extractable documents found.'], raw: null };
  }
  const result = await extractFactsWithAi(docs, options);
  result.warnings = [...warnings, ...(result.warnings || [])];
  // Attach object URLs onto returned documents by name/doc_id when possible
  for (const d of result.documents || []) {
    const match = docs.find((x) => x.name === d.name || slugId(x.name) === d.doc_id);
    if (match?.objectUrl) {
      d.object_url = match.objectUrl;
      d.url = match.objectUrl;
      d.kind = 'pdf';
    }
  }
  return result;
}

function guessDocTypeFromName(name) {
  const n = String(name).toLowerCase();
  if (n.includes('survey')) return 'measured_survey';
  if (n.includes('instruction') || n.includes('price-change') || n.includes('price_change')) {
    return 'developer_instruction';
  }
  if (n.includes('finish') || n.includes('specification')) return 'specification';
  if (n.includes('listing')) return 'listing';
  return 'brochure';
}
