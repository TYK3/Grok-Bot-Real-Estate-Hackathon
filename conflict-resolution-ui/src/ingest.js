/**
 * Multi-document ingest for the Fact Reconciliation Workbench.
 *
 * Accepts JSON, PDF, ZIP (and nested archives), CSV/TSV listing rows,
 * and plain-text evidence snippets. Organises files into a document
 * library keyed by property / issuer / doc type, then extracts or
 * attaches facts for the contradiction engine.
 *
 * Zero npm dependencies. Browser + Node (Node uses node:zlib for ZIP).
 */

import { loadFacts, normaliseFact, canonicalDocType, normaliseDate } from './resolve.js';
import { isFactRecordExtracted, adaptFactRecordExtracted } from './fact_record_adapter.js';

const TEXT_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;

export const INGEST_KINDS = Object.freeze({
  JSON: 'json',
  PDF: 'pdf',
  ZIP: 'zip',
  CSV: 'csv',
  TEXT: 'text',
  UNKNOWN: 'unknown',
});

export function detectKind(name = '', mime = '', bytes = null) {
  const lower = String(name || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (lower.endsWith('.zip') || m.includes('zip') || looksLikeZip(bytes)) return INGEST_KINDS.ZIP;
  if (lower.endsWith('.pdf') || m.includes('pdf') || looksLikePdf(bytes)) return INGEST_KINDS.PDF;
  if (lower.endsWith('.json') || m.includes('json')) return INGEST_KINDS.JSON;
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || m.includes('csv') || m.includes('tab-separated')) {
    return INGEST_KINDS.CSV;
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md') || m.startsWith('text/')) return INGEST_KINDS.TEXT;
  if (bytes && looksLikeJsonText(bytes)) return INGEST_KINDS.JSON;
  return INGEST_KINDS.UNKNOWN;
}

function looksLikeZip(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
}

function looksLikePdf(bytes) {
  if (!bytes || bytes.length < 5) return false;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}

function looksLikeJsonText(bytes) {
  try {
    const t = decodeText(bytes).trim();
    return t.startsWith('{') || t.startsWith('[');
  } catch {
    return false;
  }
}

export function decodeText(bytes) {
  if (typeof bytes === 'string') return bytes;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (TEXT_DECODER) return TEXT_DECODER.decode(u8);
  // Node fallback
  return Buffer.from(u8).toString('utf8');
}

export function bytesFromArrayBuffer(buf) {
  return new Uint8Array(buf);
}

/**
 * Ingest one or many files. Returns { documents, facts, warnings, groups }.
 */
export async function ingestFiles(files, options = {}) {
  const list = Array.isArray(files) ? files : [files];
  const documents = [];
  const facts = [];
  const warnings = [];
  const scenarios = [];
  const contradictions = [];
  const seenDoc = new Set();

  for (const file of list) {
    if (!file) continue;
    const result = await ingestOne(file, { ...options, pathPrefix: file.pathPrefix || '' });
    for (const d of result.documents) {
      const key = `${d.doc_id}::${d.name}`;
      if (seenDoc.has(key)) continue;
      seenDoc.add(key);
      documents.push(d);
    }
    facts.push(...result.facts);
    warnings.push(...(result.warnings || []));
    if (Array.isArray(result.scenarios)) scenarios.push(...result.scenarios);
    if (Array.isArray(result.contradictions)) contradictions.push(...result.contradictions);
  }

  // Optional AI extraction for evidence that produced no structured facts.
  if (options.ai && !facts.length) {
    try {
      const { aiExtractFromFiles } = await import('./ai_extract.js');
      const ai = await aiExtractFromFiles(list, {
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl,
        maxPages: options.maxPages,
        forceImages: options.forceImages,
      });
      facts.push(...(ai.facts || []));
      warnings.push(...(ai.warnings || []));
      for (const d of ai.documents || []) {
        const key = `${d.doc_id || d.name}::${d.name || d.title}`;
        if (seenDoc.has(key)) continue;
        seenDoc.add(key);
        documents.push(
          makeDocument({
            ...d,
            name: d.name || d.title || d.doc_id,
            kind: d.kind || INGEST_KINDS.PDF,
            objectUrl: d.object_url || d.url || null,
          })
        );
      }
      if (ai.facts?.length) {
        warnings.push(`AI extracted ${ai.facts.length} fact(s) from uploaded evidence.`);
      }
    } catch (err) {
      warnings.push(`AI extraction skipped: ${err.message}`);
    }
  }

  const groups = organiseDocuments(documents, facts);
  return { documents, facts, warnings, groups, scenarios, contradictions };
}

/**
 * Normalise a loose file descriptor:
 *   { name, mime?, bytes?|text?|json?, objectUrl?, pathPrefix? }
 */
export async function ingestOne(file, options = {}) {
  const name = file.name || file.filename || 'upload';
  const mime = file.mime || file.type || '';
  let bytes = file.bytes || null;
  if (!bytes && file.arrayBuffer) bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes && file.buffer) bytes = new Uint8Array(file.buffer);
  if (!bytes && typeof file.text === 'string') bytes = new TextEncoder().encode(file.text);
  const kind = file.kind || detectKind(name, mime, bytes);
  const pathPrefix = options.pathPrefix || file.pathPrefix || '';
  const fullName = pathPrefix ? `${pathPrefix.replace(/\/?$/, '/')}${name}` : name;

  if (kind === INGEST_KINDS.ZIP) {
    return ingestZip(bytes, { ...options, archiveName: fullName });
  }
  if (kind === INGEST_KINDS.JSON) {
    return ingestJson(bytes != null ? decodeText(bytes) : file.text, fullName, options);
  }
  if (kind === INGEST_KINDS.CSV) {
    return ingestCsv(bytes != null ? decodeText(bytes) : file.text, fullName, options);
  }
  if (kind === INGEST_KINDS.PDF) {
    return ingestPdf(bytes, fullName, { ...options, objectUrl: file.objectUrl || null, mime });
  }
  if (kind === INGEST_KINDS.TEXT) {
    return ingestText(bytes != null ? decodeText(bytes) : file.text, fullName, options);
  }

  return {
    documents: [
      makeDocument({
        name: fullName,
        kind: INGEST_KINDS.UNKNOWN,
        mime,
        bytes,
        note: 'Unrecognised type — stored as evidence blob only.',
      }),
    ],
    facts: [],
    warnings: [`Unrecognised file type for ${fullName}; attached as raw evidence.`],
  };
}

function makeDocument(partial) {
  const name = partial.name || 'document';
  const base = name.split('/').pop();
  const doc_id =
    partial.doc_id ||
    guessDocId(base) ||
    `doc-${hashId(name + String(partial.bytes?.length || 0))}`;
  return {
    doc_id,
    name,
    base_name: base,
    kind: partial.kind || INGEST_KINDS.UNKNOWN,
    mime: partial.mime || null,
    doc_type: partial.doc_type || guessDocType(name, partial.kind),
    title: partial.title || humanTitle(base),
    published_date: partial.published_date || null,
    issuer: partial.issuer || null,
    property_ids: partial.property_ids || [],
    page_count: partial.page_count || null,
    object_url: partial.objectUrl || partial.object_url || null,
    text_preview: partial.text_preview || null,
    bytes: partial.bytes || null,
    byte_length: partial.bytes ? partial.bytes.length : partial.byte_length || null,
    parent_archive: partial.parent_archive || null,
    related_fact_ids: partial.related_fact_ids || [],
    note: partial.note || null,
    ingested_at: partial.ingested_at || new Date().toISOString(),
  };
}

function guessDocId(name) {
  const m = String(name).match(/(\d{6,})/);
  if (m) return m[1];
  const stem = String(name).replace(/\.[^.]+$/, '');
  if (/^[a-z0-9][\w.-]{2,}$/i.test(stem)) return stem;
  return null;
}

function guessDocType(name, kind) {
  const n = String(name).toLowerCase();
  if (n.includes('land.registry') || n.includes('price.paid') || n.includes('title')) return 'land_registry';
  if (n.includes('epc')) return 'epc_register';
  if (n.includes('lease') || n.includes('contract')) return 'sale_contract';
  if (n.includes('listing') || n.includes('portal') || n.includes('rightmove') || n.includes('zoopla')) {
    return 'listing';
  }
  if (n.includes('brochure') || n.includes('particulars') || kind === INGEST_KINDS.PDF) return 'brochure';
  if (kind === INGEST_KINDS.CSV) return 'listing';
  if (kind === INGEST_KINDS.JSON) return 'extracted_facts';
  return 'unknown';
}

function humanTitle(name) {
  return String(name)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function ingestJson(textOrObj, name = 'facts.json', options = {}) {
  const warnings = [];
  let payload;
  try {
    payload = typeof textOrObj === 'string' ? JSON.parse(textOrObj) : textOrObj;
  } catch (err) {
    return {
      documents: [],
      facts: [],
      warnings: [`Could not parse JSON ${name}: ${err.message}`],
    };
  }

  // fact_record Person A contract (01_extracted.json)
  if (isFactRecordExtracted(payload)) {
    const adapted = adaptFactRecordExtracted(payload, {
      manifest: options.manifest || null,
      sampleDataBaseUrl: options.sampleDataBaseUrl || '../fact_record/sample_data',
    });
    const propertyIds = [...new Set(adapted.facts.map((f) => f.property_id).filter(Boolean))];
    const documents = [
      makeDocument({
        name,
        kind: INGEST_KINDS.JSON,
        mime: 'application/json',
        doc_type: 'extracted_facts',
        title: adapted.label || '01_extracted',
        property_ids: propertyIds,
        text_preview: `fact_record contract 01_extracted · ${adapted.facts.length} facts · ${adapted.contradictions.length} contradictions`,
        related_fact_ids: adapted.facts.map((f) => f.fact_id),
        note: `Adapted from fact_record/contracts/01_extracted.json (${adapted.facts.length} facts, ${adapted.contradictions.length} open contradictions).`,
      }),
      ...adapted.documents.map((d) =>
        makeDocument({
          ...d,
          name: d.name || d.title || d.doc_id,
          kind: d.kind || INGEST_KINDS.PDF,
          objectUrl: d.object_url || d.url || null,
          property_ids: d.property_ids || propertyIds,
        })
      ),
    ];
    return {
      documents,
      facts: adapted.facts,
      warnings: [...warnings, ...adapted.warnings],
      scenarios: adapted.scenarios,
      contradictions: adapted.contradictions,
      contract: '01_extracted',
      label: adapted.label,
    };
  }

  // Bundle: { documents: [...], facts: [...] } or Person A envelope
  const docsIn = Array.isArray(payload.documents) ? payload.documents : [];
  const facts = loadFacts(payload);
  const propertyIds = [...new Set(facts.map((f) => f.property_id).filter(Boolean))];

  const documents = [
    makeDocument({
      name,
      kind: INGEST_KINDS.JSON,
      mime: 'application/json',
      doc_type: 'extracted_facts',
      title: payload.label || humanTitle(name),
      property_ids: propertyIds,
      text_preview: typeof textOrObj === 'string' ? textOrObj.slice(0, 400) : JSON.stringify(payload).slice(0, 400),
      related_fact_ids: facts.map((f) => f.fact_id),
      note: facts.length ? `${facts.length} extracted fact(s)` : 'JSON envelope with no facts array',
    }),
    ...docsIn.map((d, i) =>
      makeDocument({
        ...d,
        name: d.name || d.title || `document-${i + 1}`,
        kind: d.kind || INGEST_KINDS.UNKNOWN,
        property_ids: d.property_ids || propertyIds,
      })
    ),
  ];

  // Attach evidence URLs mentioned on facts as virtual documents
  const byDoc = new Map(documents.map((d) => [d.doc_id, d]));
  for (const f of facts) {
    const src = f.source || {};
    if (!src.doc_id) continue;
    if (!byDoc.has(src.doc_id)) {
      const virtual = makeDocument({
        doc_id: src.doc_id,
        name: src.title || src.doc_id,
        kind: src.url && /\.pdf(\?|$)/i.test(src.url) ? INGEST_KINDS.PDF : INGEST_KINDS.TEXT,
        doc_type: src.doc_type || 'unknown',
        title: src.title || src.doc_id,
        published_date: src.published_date,
        issuer: src.issuer || src.agent,
        property_ids: [f.property_id],
        object_url: src.url || null,
        note: 'Referenced by extracted facts (file not uploaded locally).',
      });
      documents.push(virtual);
      byDoc.set(src.doc_id, virtual);
    }
    const doc = byDoc.get(src.doc_id);
    if (doc && !doc.related_fact_ids.includes(f.fact_id)) doc.related_fact_ids.push(f.fact_id);
    if (doc && f.property_id && !doc.property_ids.includes(f.property_id)) {
      doc.property_ids.push(f.property_id);
    }
  }

  if (!facts.length) {
    warnings.push(`${name} parsed but no facts were found (expected an array, { facts: [...] }, or fact_record 01_extracted).`);
  }

  return { documents, facts, warnings, scenarios: payload.scenarios || [] };
}

// ---------------------------------------------------------------------------
// CSV / listing rows
// ---------------------------------------------------------------------------

export function ingestCsv(text, name = 'listings.csv', options = {}) {
  const warnings = [];
  const rows = parseDelimited(text);
  if (!rows.length) {
    return {
      documents: [makeDocument({ name, kind: INGEST_KINDS.CSV, mime: 'text/csv', note: 'Empty CSV' })],
      facts: [],
      warnings: [`${name} had no data rows.`],
    };
  }
  const facts = [];
  rows.forEach((row, i) => {
    const field = row.field || row.Field || inferListingField(row);
    const value = row.value ?? row.Value ?? row.price ?? row.tenure ?? row.asking_price ?? row.guide_price;
    if (value == null || value === '') return;
    const raw = {
      property_id: row.property_id || row.propertyId || row.id || options.property_id,
      property_name: row.property_name || row.address || row.Property || row.name,
      field: field || (row.price || row.asking_price || row.guide_price ? 'price' : null),
      value: value,
      unit: row.unit || (field === 'price' || row.price ? 'GBP' : null),
      source: {
        doc_id: row.doc_id || `${name.replace(/\W+/g, '-')}-row-${i + 1}`,
        doc_type: row.doc_type || 'listing',
        title: row.title || row.source || `${humanTitle(name)} row ${i + 1}`,
        published_date: row.published_date || row.date || null,
        retrieved_date: row.retrieved_date || null,
        issuer: row.issuer || row.agent || null,
        agent: row.agent || null,
        url: row.url || null,
      },
      page: row.page || null,
      quote: row.quote || row.excerpt || String(value),
      extraction_confidence: row.confidence != null ? Number(row.confidence) : 0.7,
      entity_match_confidence: row.entity_match_confidence != null ? Number(row.entity_match_confidence) : 0.9,
    };
    if (!raw.field) {
      // Multi-field listing row: emit price and tenure if present
      if (row.price || row.asking_price || row.guide_price) {
        facts.push(
          normaliseFact(
            { ...raw, field: 'price', value: row.price || row.asking_price || row.guide_price, unit: 'GBP' },
            i,
            {}
          )
        );
      }
      if (row.tenure) {
        facts.push(normaliseFact({ ...raw, field: 'tenure', value: row.tenure, unit: null }, i, {}));
      }
      if (row.epc || row.energy_rating) {
        facts.push(
          normaliseFact({ ...raw, field: 'energy_rating', value: row.epc || row.energy_rating }, i, {})
        );
      }
      return;
    }
    facts.push(normaliseFact(raw, i, {}));
  });

  const propertyIds = [...new Set(facts.map((f) => f.property_id).filter(Boolean))];
  return {
    documents: [
      makeDocument({
        name,
        kind: INGEST_KINDS.CSV,
        mime: 'text/csv',
        doc_type: 'listing',
        property_ids: propertyIds,
        related_fact_ids: facts.map((f) => f.fact_id),
        text_preview: text.slice(0, 400),
        note: `${facts.length} fact(s) from ${rows.length} row(s)`,
      }),
    ],
    facts,
    warnings,
  };
}

function inferListingField(row) {
  if (row.tenure) return null; // multi-field
  if (row.price || row.asking_price || row.guide_price) return 'price';
  if (row.epc || row.energy_rating) return 'energy_rating';
  return row.field || null;
}

export function parseDelimited(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length);
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';
  const headers = splitDelimitedLine(lines[0], delim).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimitedLine(lines[i], delim);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] != null ? cols[j].trim() : '';
    });
    rows.push(row);
  }
  return rows;
}

function splitDelimitedLine(line, delim) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export function ingestPdf(bytes, name = 'document.pdf', options = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : null;
  const meta = extractPdfMetadata(u8);
  const doc = makeDocument({
    name,
    kind: INGEST_KINDS.PDF,
    mime: 'application/pdf',
    doc_type: options.doc_type || guessDocType(name, INGEST_KINDS.PDF),
    title: meta.title || humanTitle(name),
    published_date: meta.published_date,
    issuer: meta.issuer || options.issuer || null,
    page_count: meta.page_count,
    objectUrl: options.objectUrl || null,
    bytes: options.keepBytes === false ? null : u8,
    byte_length: u8 ? u8.length : null,
    text_preview: meta.text_preview,
    parent_archive: options.parent_archive || null,
    property_ids: options.property_ids || [],
    note: 'PDF evidence — open in the workbench evidence pane. Pair with Person A JSON for structured facts.',
  });
  return { documents: [doc], facts: [], warnings: [] };
}

export function extractPdfMetadata(bytes) {
  if (!bytes || !bytes.length) return {};
  const head = decodeLatin1(bytes.slice(0, Math.min(bytes.length, 512 * 1024)));
  const pageMatches = head.match(/\/Type\s*\/Page[^s]/g);
  const page_count = pageMatches ? pageMatches.length : null;
  const title = unescapePdfString(matchPdfInfo(head, 'Title'));
  const author = unescapePdfString(matchPdfInfo(head, 'Author'));
  const creation = unescapePdfString(matchPdfInfo(head, 'CreationDate') || matchPdfInfo(head, 'ModDate'));
  let published_date = null;
  if (creation) {
    const m = creation.match(/D:(\d{4})(\d{2})(\d{2})/);
    if (m) published_date = `${m[1]}-${m[2]}-${m[3]}`;
  }
  // Rough text peek from literal strings
  const literals = [...head.matchAll(/\(([^\\()]{12,120})\)/g)].map((m) => m[1]).slice(0, 8);
  return {
    title,
    issuer: author,
    published_date: normaliseDate(published_date),
    page_count,
    text_preview: literals.join(' · ').slice(0, 400) || null,
  };
}

function matchPdfInfo(text, key) {
  const re = new RegExp(`/${key}\\s*\\(([^)]*)\\)`);
  const m = text.match(re);
  if (m) return m[1];
  const reHex = new RegExp(`/${key}\\s*<([0-9A-Fa-f]+)>`);
  const h = text.match(reHex);
  if (h) {
    try {
      return h[1].match(/.{1,2}/g).map((b) => String.fromCharCode(parseInt(b, 16))).join('');
    } catch {
      return null;
    }
  }
  return null;
}

function unescapePdfString(s) {
  if (!s) return null;
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .trim();
}

function decodeLatin1(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

// ---------------------------------------------------------------------------
// Plain text evidence
// ---------------------------------------------------------------------------

export function ingestText(text, name = 'notes.txt', options = {}) {
  const facts = [];
  // Optional: YAML-ish or "field: value" lines
  const lines = String(text || '').split(/\r?\n/);
  let i = 0;
  for (const line of lines) {
    const m = line.match(/^(price|tenure|net_floor_area|gross_floor_area|floor_area|energy_rating|parking|epc|nia|gia)\s*[:=]\s*(.+)$/i);
    if (!m) continue;
    facts.push(
      normaliseFact(
        {
          property_id: options.property_id,
          property_name: options.property_name,
          field: m[1],
          value: m[2].trim(),
          source: {
            doc_id: options.doc_id || name.replace(/\W+/g, '-'),
            doc_type: options.doc_type || 'crm',
            title: humanTitle(name),
          },
          quote: line.trim(),
        },
        i++,
        {}
      )
    );
  }
  return {
    documents: [
      makeDocument({
        name,
        kind: INGEST_KINDS.TEXT,
        mime: 'text/plain',
        doc_type: options.doc_type || 'crm',
        text_preview: String(text || '').slice(0, 400),
        related_fact_ids: facts.map((f) => f.fact_id),
        property_ids: [...new Set(facts.map((f) => f.property_id).filter(Boolean))],
        note: facts.length ? `${facts.length} key:value fact(s)` : 'Text evidence attachment',
      }),
    ],
    facts,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// ZIP (stored + deflate), recursive
// ---------------------------------------------------------------------------

export async function ingestZip(bytes, options = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const archiveName = options.archiveName || 'archive.zip';
  const warnings = [];
  const documents = [
    makeDocument({
      name: archiveName,
      kind: INGEST_KINDS.ZIP,
      mime: 'application/zip',
      doc_type: 'archive',
      title: humanTitle(archiveName.split('/').pop()),
      byte_length: u8.length,
      bytes: options.keepBytes === false ? null : u8,
      note: 'Archive — members ingested below.',
      parent_archive: options.parent_archive || null,
    }),
  ];
  const facts = [];

  let entries;
  try {
    entries = await readZipEntries(u8);
  } catch (err) {
    warnings.push(`Could not read ZIP ${archiveName}: ${err.message}`);
    return { documents, facts, warnings };
  }

  const depth = options.depth || 0;
  if (depth > 4) {
    warnings.push(`Skipped nested archive depth > 4 inside ${archiveName}`);
    return { documents, facts, warnings };
  }

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    if (entry.name.startsWith('__MACOSX/') || entry.name.split('/').pop().startsWith('.')) continue;
    const member = {
      name: entry.name.split('/').pop(),
      pathPrefix: `${archiveName}!${entry.name.includes('/') ? entry.name.split('/').slice(0, -1).join('/') : ''}`,
      bytes: entry.data,
      parent_archive: archiveName,
      kind: detectKind(entry.name, '', entry.data),
    };
    // Fix pathPrefix for display
    member.pathPrefix = `${archiveName}::${entry.name.split('/').slice(0, -1).join('/')}`;
    if (member.pathPrefix.endsWith('::')) member.pathPrefix = `${archiveName}::`;

    const nested = await ingestOne(
      {
        name: entry.name.split('/').pop(),
        bytes: entry.data,
        pathPrefix: `${archiveName}/${entry.name.includes('/') ? entry.name.replace(/\/[^/]+$/, '') : ''}`.replace(/\/$/, ''),
        kind: member.kind,
      },
      {
        ...options,
        depth: depth + 1,
        parent_archive: archiveName,
        keepBytes: options.keepBytes,
      }
    );
    for (const d of nested.documents) {
      d.parent_archive = d.parent_archive || archiveName;
      documents.push(d);
    }
    facts.push(...nested.facts);
    warnings.push(...nested.warnings);
  }

  documents[0].note = `Archive with ${entries.length} member(s); produced ${facts.length} fact(s).`;
  documents[0].related_fact_ids = facts.map((f) => f.fact_id);
  documents[0].property_ids = [...new Set(facts.map((f) => f.property_id).filter(Boolean))];

  return { documents, facts, warnings };
}

/**
 * Minimal ZIP reader (local file headers + central directory).
 * Supports stored (0) and deflate (8).
 */
export async function readZipEntries(u8) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // Find EOCD
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');
  const entryCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  const entries = [];

  for (let n = 0; n < entryCount; n++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) throw new Error('Bad ZIP central directory');
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const uncompSize = view.getUint32(cdOffset + 24, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeader = view.getUint32(cdOffset + 42, true);
    const nameBytes = u8.subarray(cdOffset + 46, cdOffset + 46 + nameLen);
    const name = decodeText(nameBytes);
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (view.getUint32(localHeader, true) !== 0x04034b50) throw new Error(`Bad local header for ${name}`);
    const localNameLen = view.getUint16(localHeader + 26, true);
    const localExtraLen = view.getUint16(localHeader + 28, true);
    const dataStart = localHeader + 30 + localNameLen + localExtraLen;
    const comp = u8.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = comp.slice();
    else if (method === 8) data = await inflateRaw(comp, uncompSize);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    entries.push({ name, data, method, size: uncompSize });
  }
  return entries;
}

async function inflateRaw(comp, uncompSize) {
  if (typeof DecompressionStream !== 'undefined') {
    // Browser: wrap raw deflate with zlib header via DecompressionStream('deflate-raw')
    try {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([comp]).stream().pipeThrough(ds);
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    } catch {
      // fall through
    }
  }
  // Node
  const zlib = await import('node:zlib');
  const { promisify } = await import('node:util');
  const inflateRawSync = promisify(zlib.inflateRaw);
  const out = await inflateRawSync(Buffer.from(comp));
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

// ---------------------------------------------------------------------------
// Document organisation — related docs + property clusters
// ---------------------------------------------------------------------------

/**
 * Group documents by property, then by issuer / family (related versions).
 */
export function organiseDocuments(documents, facts = []) {
  const byProperty = new Map();
  const unassigned = [];

  const factDocs = new Map();
  for (const f of facts) {
    const id = f.source && f.source.doc_id;
    if (!id) continue;
    if (!factDocs.has(id)) factDocs.set(id, []);
    factDocs.get(id).push(f);
  }

  for (const doc of documents) {
    const props =
      (doc.property_ids && doc.property_ids.length && doc.property_ids) ||
      inferPropertyIds(doc, factDocs.get(doc.doc_id) || []);
    if (!props.length) {
      unassigned.push(doc);
      continue;
    }
    for (const pid of props) {
      if (!byProperty.has(pid)) byProperty.set(pid, []);
      byProperty.get(pid).push(doc);
    }
  }

  const groups = [];
  for (const [property_id, docs] of byProperty) {
    const families = clusterRelatedDocuments(docs);
    const nameFromFacts = (facts.find((f) => f.property_id === property_id) || {}).property_name;
    groups.push({
      property_id,
      property_name: nameFromFacts || property_id,
      document_count: docs.length,
      families,
      documents: docs,
      contradiction_fields: fieldsWithDisagreement(facts.filter((f) => f.property_id === property_id)),
    });
  }

  if (unassigned.length) {
    groups.push({
      property_id: null,
      property_name: 'Unassigned evidence',
      document_count: unassigned.length,
      families: clusterRelatedDocuments(unassigned),
      documents: unassigned,
      contradiction_fields: [],
    });
  }

  groups.sort((a, b) => {
    if (a.property_id == null) return 1;
    if (b.property_id == null) return -1;
    return String(a.property_name).localeCompare(String(b.property_name));
  });
  return groups;
}

function inferPropertyIds(doc, factsForDoc) {
  const ids = new Set(doc.property_ids || []);
  for (const f of factsForDoc) if (f.property_id) ids.add(f.property_id);
  const blob = `${doc.name} ${doc.title || ''}`.toLowerCase();
  if (blob.includes('kelso')) ids.add('kelso-villa');
  if (blob.includes('lumley')) ids.add('lumley-house');
  return [...ids];
}

/**
 * Related documents: same issuer + same doc_type, or shared stem / brochure family.
 */
export function clusterRelatedDocuments(docs) {
  const families = [];
  const used = new Set();

  const sorted = [...docs].sort((a, b) => String(a.published_date || '').localeCompare(String(b.published_date || '')));

  for (const doc of sorted) {
    if (used.has(doc.doc_id + doc.name)) continue;
    const family = [doc];
    used.add(doc.doc_id + doc.name);
    for (const other of sorted) {
      const key = other.doc_id + other.name;
      if (used.has(key)) continue;
      if (areRelatedDocuments(doc, other)) {
        family.push(other);
        used.add(key);
      }
    }
    family.sort((a, b) => String(a.published_date || '').localeCompare(String(b.published_date || '')));
    const issuer = family.map((d) => d.issuer).find(Boolean) || null;
    const docType = canonicalDocType(family[0].doc_type);
    families.push({
      family_id: `fam-${hashId(family.map((d) => d.doc_id).join('|'))}`,
      label: familyLabel(family, issuer, docType),
      issuer,
      doc_type: docType,
      documents: family,
      version_timeline: family.map((d) => ({
        doc_id: d.doc_id,
        title: d.title,
        published_date: d.published_date,
        kind: d.kind,
      })),
    });
  }
  return families;
}

export function areRelatedDocuments(a, b) {
  if (a.doc_id && b.doc_id && a.doc_id === b.doc_id) return true;
  const typeA = canonicalDocType(a.doc_type);
  const typeB = canonicalDocType(b.doc_type);
  if (typeA && typeB && typeA === typeB) {
    const issA = (a.issuer || '').toLowerCase();
    const issB = (b.issuer || '').toLowerCase();
    if (issA && issB && issA === issB) return true;
  }
  const stemA = stemName(a.base_name || a.name);
  const stemB = stemName(b.base_name || b.name);
  if (stemA && stemB && stemA === stemB) return true;
  // Brochure families often share a numeric prefix or brand + property
  if (typeA === 'brochure' && typeB === 'brochure') {
    const ta = `${a.title} ${a.name}`.toLowerCase();
    const tb = `${b.title} ${b.name}`.toLowerCase();
    if (ta.includes('carter jonas') && tb.includes('carter jonas') && ta.includes('kelso') && tb.includes('kelso')) {
      return true;
    }
  }
  return false;
}

function stemName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[-_\s]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_\s]?\d{2,4}/g, '')
    .replace(/[-_\s]?\d{4}[-_\s]?\d{2}[-_\s]?\d{2}/g, '')
    .replace(/[-_\s]+(v\d+|final|draft|rev\d+)$/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

function familyLabel(family, issuer, docType) {
  const type = (docType || 'document').replace(/_/g, ' ');
  if (issuer) return `${issuer} · ${type} (${family.length})`;
  if (family.length === 1) return family[0].title || family[0].name;
  return `${type} family · ${family.length} versions`;
}

function fieldsWithDisagreement(facts) {
  const byField = new Map();
  for (const f of facts) {
    if (!byField.has(f.field)) byField.set(f.field, new Set());
    byField.get(f.field).add(String(f.value).toLowerCase());
  }
  return [...byField.entries()].filter(([, vals]) => vals.size > 1).map(([field]) => field);
}

/**
 * Merge facts from multiple ingest passes, de-duplicating by fact_id.
 */
export function mergeFactSets(...sets) {
  const out = [];
  const seen = new Set();
  for (const set of sets) {
    for (const f of set || []) {
      const id = f.fact_id || `${f.property_id}:${f.field}:${f.source?.doc_id}:${f.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(f);
    }
  }
  return out;
}

export function mergeDocumentSets(...sets) {
  const out = [];
  const seen = new Set();
  for (const set of sets) {
    for (const d of set || []) {
      const key = `${d.doc_id}::${d.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}
