/** Person B · evidence-first Fact Review. Client-only UI over the original reconciliation engine. */
import {
  loadFacts, resolveAll, applyOverride, buildVerifiedRecord, buildAcceptanceRecords,
  highlightSpans, fieldLabel, displayValue, factDate, sourceTier,
  REVIEW_CLASSIFICATIONS, CLASSIFICATIONS,
} from '../src/resolve.js';
import { ingestFiles, ingestJson, mergeFactSets, mergeDocumentSets, organiseDocuments, detectKind, decodeText } from '../src/ingest.js';
import { aiExtractFromFiles } from '../src/ai_extract.js';
import { buildDatabaseHandoff } from '../src/database_handoff.js';
import { factsForUploads, sha256Hex } from '../src/extracted_lookup.js';
import { extractPdfInBrowser } from '../src/extract_browser.js';

const $ = (id) => document.getElementById(id);
const STATE_KEY = 'conflict-resolution-ui-v4';
const API_KEY_STORE = 'conflict-resolution-ui-openai-key';
const MANIFEST_URL = '../fact_record/sample_data/manifest.json';
const FIELD_LABELS = {
  price: 'Asking price',
  floor_area: 'Total floor area',
  net_floor_area: 'Net floor area',
  gross_floor_area: 'Gross floor area',
  lower_ground_floor_area: 'Lower ground floor area',
  parking: 'Parking',
  parking_scope: 'Parking · how it is counted',
  parking_total: 'Parking · total spaces',
  en_suite_bathroom: 'En-suite bathrooms',
  energy_rating: 'Energy rating (EPC)',
  tenure: 'Tenure',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  rent: 'Rent',
  availability: 'Availability',
  transaction_type: 'Transaction type',
  listed_status: 'Listed status',
};
const CLASS_LABELS = {
  AGREE: 'Sources agree', TRUE_CONFLICT: 'True conflict', SUPERSEDED: 'Newer version',
  UNIT_MISMATCH: 'Measurement mismatch', STALE_LISTING: 'Out-of-date listing',
  OFFICIAL_RECORD_DISAGREEMENT: 'Official-record difference', SCOPE_DIFFERENCE: 'Different scope',
  PLOT_OR_TYPE: 'Plot / type variation', UNMATCHED: 'Unmatched entity', WINNER: 'Suggested',
};
const state = {
  view: 'landing', // 'landing' | 'review'
  reviewer: '', facts: [], records: [], documents: [], groups: [], rules: null,
  scenarios: [], inputLabel: '', dataUrl: '', isExample: false, rawFingerprint: '',
  propertyId: null, selectedKey: null, stage: 'all', selectedCandidateId: null,
  selectedClassification: null, reason: '', focusedDocId: null,
  editingKey: null, warnings: [],
  pendingFiles: [], // File objects staged on the landing page (multi-doc)
  parsing: false,
};
let noticeTimeout;

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function plain(text) { return String(text ?? '').replace(/\s+/g, ' ').trim(); }
function fieldName(rec) { return FIELD_LABELS[rec.field] || fieldLabel(rec.field, state.rules || undefined); }
function recordKey(rec) { return `${rec.property_id}::${rec.field}`; }
function selectedRecord() { return state.records.find((r) => recordKey(r) === state.selectedKey) || null; }
function activePropertyRecords() { return state.records.filter((r) => r.property_id === state.propertyId); }
function isContext(rec) { return rec?.resolution_kind === 'scoped_context'; }
function isHumanDone(rec) { return rec.status === 'verified' && !isContext(rec); }
function needsReview(rec) { return rec.status !== 'verified' && !isContext(rec); }
function formatWhen(iso) {
  if (!iso) return 'No time recorded';
  try { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(iso)) + ' (London)'; }
  catch { return String(iso); }
}
function sourceDate(candidate) {
  const src = candidate?.source || {};
  const date = factDate(candidate);
  if (!date) return 'Date not provided';
  if (src.date_precision === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
function scopeLabel(scope) {
  const labels = { per_floor: 'Per floor', unit_total: 'Total for property', unit: 'This unit only', development: 'Whole development', building: 'Whole building' };
  return labels[scope] || String(scope || 'Scope not stated').replaceAll('_', ' ');
}
function valueFor(rec, cand) {
  if (!cand) return '—';
  if (rec.field === 'parking_scope' || rec.field === 'parking_total') {
    const n = Number(cand.value);
    return `${Number.isFinite(n) ? n : cand.value} ${n === 1 ? 'space' : 'spaces'}${cand.scope === 'per_floor' ? ' per floor' : cand.scope === 'unit_total' ? ' total' : ''}`;
  }
  return displayValue(cand);
}
function statusTag(rec) {
  if (isContext(rec)) return '<span class="tag auto">Auto organised</span>';
  if (rec.document_error) return '<span class="tag error">Document error</span>';
  if (rec.status === 'conflicting' || rec.blocked) return '<span class="tag conflict">Needs decision</span>';
  if (rec.status === 'verified') return '<span class="tag approved">Approved</span>';
  return '<span class="tag pending">Needs sign-off</span>';
}
function kindTag(rec) {
  if (rec.document_error) return '<span class="tag error">Document error</span>';
  if (rec.primary_classification === 'SCOPE_DIFFERENCE') return '<span class="tag scope">Scope difference</span>';
  if (rec.basis_uncertain) return '<span class="tag mismatch">Basis not stated</span>';
  const tone = rec.primary_classification === 'TRUE_CONFLICT' ? 'conflict'
    : rec.primary_classification === 'SUPERSEDED' ? 'version'
      : rec.primary_classification === 'UNIT_MISMATCH' ? 'mismatch' : '';
  return `<span class="tag ${tone}">${esc(CLASS_LABELS[rec.primary_classification] || rec.primary_classification)}</span>`;
}
function winner(rec) { return rec.candidates?.find((c) => c.is_winner) || null; }
function chosenCandidate(rec) {
  return rec.candidates?.find((c) => c.fact_id === state.selectedCandidateId || c.source?.doc_id === state.selectedCandidateId)
    || winner(rec) || rec.candidates?.[0] || null;
}
function summaryOf(rec) {
  const chosen = winner(rec);
  const source = chosen?.source?.title || 'selected evidence';
  if (rec.document_error) return {
    title: 'Document error detected', suggestion: 'Do not publish this total',
    text: '185 sq m and 2,700 sq ft are not equivalent. The April row mixes net and gross measurements. Keep it blocked until a valid total is evidenced.',
    tone: 'error', reason: 'April total row pairs 185 sq m (net) with 2,700 sq ft (gross). They are not equivalents. Do not publish a combined total from this row.',
  };
  if (isContext(rec) && rec.basis_uncertain) return {
    title: 'Automatically kept separate', suggestion: 'Retain both measurements',
    text: 'One source does not state whether its area is net or gross. The survey explicitly says net. Comparing them as if they share a basis would be misleading.',
    tone: 'auto', reason: 'Keep the 468 sq ft unlabelled brochure figure and the 461 sq ft net survey figure with their original measurement bases.',
  };
  if (isContext(rec)) return {
    title: 'Automatically kept separate', suggestion: 'Keep both at their own scope',
    text: rec.field === 'en_suite_bathroom'
      ? 'The finishes schedule covers the whole close, but No. 59 has its own brochure claim. Do not apply the general statement to this unit.'
      : 'One space per floor and six spaces in total measure different things. Both statements remain in the evidence record.',
    tone: 'auto', reason: 'The sources use different scopes, so neither should overwrite the other or be treated as a conflicting number.',
  };
  if (rec.primary_classification === 'SUPERSEDED') return {
    title: 'Newer authoritative version found', suggestion: valueFor(rec, chosen),
    text: rec.field === 'price' && chosen?.source?.doc_type === 'developer_instruction'
      ? 'The formal price-change instruction is newer and has higher authority than the brochure. This is the proposed current asking price; confirm before publishing.'
      : 'The later document from the same issuer and source tier supersedes the earlier version. It is selected automatically; a person still confirms the price.',
    tone: '', reason: `Confirmed ${valueFor(rec, chosen)} from ${source} as the current asking price. Earlier version retained in history.`,
  };
  if (rec.primary_classification === 'TRUE_CONFLICT') return {
    title: 'Human sign-off required', suggestion: valueFor(rec, chosen),
    text: `${source} ranks higher in the source hierarchy. That makes it the suggested value, not an automatically verified one. Check the evidence and confirm or keep on hold.`,
    tone: 'caution', reason: `After comparing the same-scope sources, accepted ${valueFor(rec, chosen)} from ${source} because its source authority is higher; the conflicting value remains in the audit record.`,
  };
  if (rec.primary_classification === 'OFFICIAL_RECORD_DISAGREEMENT') return {
    title: 'Official record needs checking', suggestion: valueFor(rec, chosen),
    text: 'Marketing and the official record disagree. Do not silently correct it; check that the official record is current and relevant before signing off.',
    tone: 'caution', reason: `Checked the current official evidence and accepted ${valueFor(rec, chosen)} from ${source}.`,
  };
  if (rec.primary_classification === 'STALE_LISTING') return {
    title: 'Out-of-date listing', suggestion: valueFor(rec, chosen),
    text: 'A portal or CRM entry is behind a higher-authority document. Use the newer verified figure and flag the listing for update.',
    tone: '', reason: `Confirmed ${valueFor(rec, chosen)} from ${source}; the older listing should be updated.`,
  };
  return {
    title: 'Suggested from the strongest source', suggestion: valueFor(rec, chosen),
    text: 'The rules have selected a candidate. Compare the source quotations before approval.',
    tone: '', reason: `Accepted ${valueFor(rec, chosen)} from ${source} after reviewing the evidence.`,
  };
}

function fingerprint(facts) {
  return JSON.stringify(facts.map((f) => [f.fact_id, f.property_id, f.field, f.value, f.area_basis, f.scope,
    f.quote, f.source?.doc_id, f.source?.published_date]));
}
function persist() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({
    reviewer: state.reviewer, records: state.records, fingerprint: state.rawFingerprint,
    propertyId: state.propertyId, stage: state.stage, selectedKey: state.selectedKey,
  })); } catch (e) { console.warn('Local save was unavailable', e); }
}
function restore(fingerprintValue) {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (saved?.reviewer) state.reviewer = saved.reviewer;
    if (saved?.fingerprint === fingerprintValue && Array.isArray(saved.records)) return saved;
  } catch { /* local storage is optional */ }
  return null;
}
function propertyList() {
  const map = new Map();
  for (const r of state.records) if (!map.has(r.property_id)) map.set(r.property_id, r.property_name || r.property_id);
  return [...map].map(([id, name]) => ({id, name}));
}
function listForStage() {
  const all = activePropertyRecords();
  const filter = state.stage === 'review' ? (r) => needsReview(r)
    : state.stage === 'automatic' ? (r) => isContext(r)
      : state.stage === 'verified' ? (r) => isHumanDone(r) : () => true;
  const order = new Map(state.scenarios.map((c, i) => [c.id, i]));
  return all.filter(filter).sort((a, b) => {
    if (order.has(a.case_id) && order.has(b.case_id)) return order.get(a.case_id) - order.get(b.case_id);
    const priority = (r) => needsReview(r) ? (r.document_error || r.status === 'conflicting' ? 0 : 1) : isContext(r) ? 2 : 3;
    return priority(a) - priority(b) || fieldName(a).localeCompare(fieldName(b));
  });
}
function ensureSelection() {
  const visible = listForStage();
  if (!visible.length) { state.selectedKey = null; state.selectedCandidateId = null; return; }
  const found = visible.find((r) => recordKey(r) === state.selectedKey);
  syncSelection(found || visible[0]);
}
function syncSelection(rec) {
  state.selectedKey = recordKey(rec);
  state.selectedCandidateId = winner(rec)?.fact_id || null;
  state.selectedClassification = rec.reviewer_classification || rec.primary_classification;
  const lastReview = [...(rec.audit || [])].reverse().find((a) => a.accepted_by !== 'engine' && a.accepted_by !== 'rules-engine');
  state.reason = lastReview?.note || summaryOf(rec).reason;
}
function selectRecord(rec) { syncSelection(rec); persist(); render(); }
function replaceRecord(next) {
  state.records = state.records.map((r) => recordKey(r) === recordKey(next) ? next : r);
  syncSelection(next);
  persist();
  render();
}
function advanceQueue() {
  const next = activePropertyRecords().find((r) => needsReview(r) && recordKey(r) !== state.selectedKey);
  if (next && state.stage !== 'verified' && state.stage !== 'automatic') selectRecord(next);
}
function flashError(message) {
  const node = $('error-banner'); node.hidden = !message; node.textContent = message || '';
  if (message) node.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function notify(message) {
  const node = $('notice'); node.textContent = message; node.hidden = false;
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => { node.hidden = true; }, 4200);
}
function showWarnings(warnings = []) {
  const node = $('ingest-banner'); node.hidden = !warnings.length;
  node.textContent = warnings.join(' · ');
}
function showLanding() {
  state.view = 'landing';
  document.body.classList.add('is-landing');
  document.body.classList.remove('is-review');
  const landing = $('view-landing');
  const review = $('view-review');
  const actions = $('review-actions');
  if (landing) landing.hidden = false;
  if (review) review.hidden = true;
  if (actions) actions.hidden = true;
  renderPendingFiles();
}
function showReview() {
  state.view = 'review';
  document.body.classList.remove('is-landing');
  document.body.classList.add('is-review');
  const landing = $('view-landing');
  const review = $('view-review');
  const actions = $('review-actions');
  if (landing) landing.hidden = true;
  if (review) review.hidden = false;
  if (actions) actions.hidden = false;
}
function fileKey(file) {
  return `${file.name}::${file.size}::${file.lastModified || 0}`;
}
function addPendingFiles(fileList) {
  const incoming = [...(fileList || [])];
  if (!incoming.length) return;
  const seen = new Set(state.pendingFiles.map(fileKey));
  let added = 0;
  for (const file of incoming) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    state.pendingFiles.push(file);
    added += 1;
  }
  renderPendingFiles();
  if (added) flashError('');
  else if (incoming.length) notify('Those files are already in the upload list.');
}
function removePendingFile(index) {
  state.pendingFiles.splice(index, 1);
  renderPendingFiles();
}
function clearPendingFiles() {
  state.pendingFiles = [];
  renderPendingFiles();
}
function renderPendingFiles() {
  const panel = $('file-chips-panel');
  const list = $('file-chips');
  const label = $('file-chips-label');
  const parseBtn = $('btn-parse');
  const count = state.pendingFiles.length;
  if (!panel || !list) return;
  panel.hidden = count === 0;
  if (label) label.textContent = `${count} document${count === 1 ? '' : 's'} ready`;
  list.innerHTML = state.pendingFiles.map((file, i) => `
    <li>
      <span class="chip-name" title="${esc(file.name)}">${esc(file.name)}</span>
      <button type="button" class="chip-remove" data-remove-index="${i}" aria-label="Remove ${esc(file.name)}">×</button>
    </li>`).join('');
  if (parseBtn) {
    parseBtn.hidden = count === 0;
    const countNode = $('parse-count');
    const plural = $('parse-plural');
    if (countNode) countNode.textContent = String(count);
    if (plural) plural.textContent = count === 1 ? '' : 's';
    parseBtn.disabled = state.parsing;
  }
}
function setParseStatus(active, text = 'Parsing documents…') {
  state.parsing = active;
  const status = $('parse-status');
  const statusText = $('parse-status-text');
  if (status) status.hidden = !active;
  if (statusText) statusText.textContent = text;
  const parseBtn = $('btn-parse');
  if (parseBtn) parseBtn.disabled = active || !state.pendingFiles.length;
  const choose = $('btn-choose-files');
  if (choose) choose.disabled = active;
}
function readApiKey() {
  const input = $('api-key');
  const fromInput = input?.value?.trim() || '';
  if (fromInput) {
    try { localStorage.setItem(API_KEY_STORE, fromInput); } catch { /* optional */ }
    return fromInput;
  }
  try { return localStorage.getItem(API_KEY_STORE) || ''; } catch { return ''; }
}
function loadStoredApiKey() {
  const input = $('api-key');
  if (!input) return;
  try {
    const saved = localStorage.getItem(API_KEY_STORE);
    if (saved) input.value = saved;
  } catch { /* optional */ }
}
function needsAiAssist(prepared, ingested) {
  if (!($('ai-enabled')?.checked)) return false;
  if (ingested.facts?.length) return false;
  return prepared.some((f) => {
    const kind = detectKind(f.name, f.mime, f.bytes);
    return kind === 'pdf' || kind === 'text' || kind === 'csv';
  });
}
async function prepareUploadFiles(files) {
  return Promise.all(files.map(async (f) => ({
    name: f.name,
    mime: f.type,
    bytes: new Uint8Array(await f.arrayBuffer()),
    objectUrl: (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) ? URL.createObjectURL(f) : null,
  })));
}
async function enrichIngestedFacts(prepared, ingested, { requireAiKey = false, statusLabel = '' } = {}) {
  let facts = ingested.facts || [];
  let documents = ingested.documents || [];
  let warnings = [...(ingested.warnings || [])];

  // Prefer Person A's extractor / precomputed sample for uploaded PDFs.
  const extracted = await extractPdfFacts(prepared, { ...ingested, facts, documents, warnings });
  if (extracted.facts.length) {
    facts = mergeFactSets(facts, extracted.facts);
    warnings = [...warnings, ...(extracted.warnings || [])];
  }

  // Optional OpenAI path when JSON + extractor still produced no facts.
  if (needsAiAssist(prepared, { facts, documents, warnings })) {
    const apiKey = readApiKey();
    if (!apiKey) {
      if (requireAiKey) {
        throw new Error(
          'These files need AI extraction (or upload Person A JSON). Enter an OpenAI API key, or include a .json extraction.'
        );
      }
    } else {
      if (statusLabel) setParseStatus(true, statusLabel);
      const aiReady = prepared.map((f) => {
        const kind = detectKind(f.name, f.mime, f.bytes);
        if (kind === 'text' || kind === 'csv') return { ...f, text: decodeText(f.bytes), kind };
        return { ...f, kind };
      });
      const ai = await aiExtractFromFiles(aiReady, { apiKey });
      warnings = [...warnings, ...(ai.warnings || [])];
      facts = mergeFactSets(facts, ai.facts);
      documents = mergeDocumentSets(documents, ai.documents);
    }
  }

  return { facts, documents, warnings };
}

async function parsePendingFiles({ append = false } = {}) {
  const files = [...state.pendingFiles];
  if (!files.length) {
    flashError('Choose one or more documents to parse.');
    return;
  }
  setParseStatus(true, `Reading ${files.length} document${files.length === 1 ? '' : 's'}…`);
  flashError('');
  try {
    const prepared = await prepareUploadFiles(files);
    setParseStatus(true, 'Extracting structured facts…');
    const baseIngested = await ingestFiles(prepared, { keepBytes: false });
    const ingested = await enrichIngestedFacts(prepared, baseIngested, {
      requireAiKey: true,
      statusLabel: `Running AI extraction on ${files.length} document${files.length === 1 ? '' : 's'}…`,
    });

    const replaceDemo = state.isExample || state.view === 'landing' || !append;
    const baseFacts = replaceDemo ? [] : state.facts;
    const baseDocs = replaceDemo ? [] : state.documents;
    const facts = mergeFactSets(baseFacts, ingested.facts);
    const documents = mergeDocumentSets(baseDocs, ingested.documents);
    const label = [...new Set([
      replaceDemo ? '' : state.inputLabel,
      ...files.map((f) => f.name),
    ].filter(Boolean))].join(' + ');

    if (!facts.length) {
      state.facts = [];
      state.records = [];
      state.documents = documents;
      state.groups = organiseDocuments(documents, []);
      state.scenarios = [];
      state.propertyId = null;
      state.selectedKey = null;
      state.isExample = false;
      state.inputLabel = label;
      state.rawFingerprint = '';
      state.pendingFiles = [];
      showReview();
      render();
      showWarnings([
        ...ingested.warnings,
        'Documents loaded as evidence, but no facts were extracted. Add Person A JSON, start the extraction service, or enable AI extraction with an API key.',
      ]);
      return;
    }

    state.pendingFiles = [];
    applyDataset(facts, {
      label,
      documents,
      warnings: ingested.warnings,
      example: false,
    });
    notify(`${files.length} document${files.length === 1 ? '' : 's'} parsed · ${state.records.length} field group${state.records.length === 1 ? '' : 's'} ready.`);
  } finally {
    setParseStatus(false);
    renderPendingFiles();
  }
}
async function resetToLanding() {
  state.facts = [];
  state.records = [];
  state.documents = [];
  state.groups = [];
  state.scenarios = [];
  state.propertyId = null;
  state.selectedKey = null;
  state.inputLabel = '';
  state.dataUrl = '';
  state.isExample = false;
  state.rawFingerprint = '';
  state.warnings = [];
  state.pendingFiles = [];
  flashError('');
  showWarnings([]);
  showLanding();
}
function requireReviewer() {
  const name = state.reviewer.trim();
  if (!name) { $('reviewer').focus(); throw new Error('Enter your name under “Reviewed by” to record this decision.'); }
  return name;
}

function applyDataset(facts, {label,example=false,dataUrl='',documents=[],warnings=[],scenarios=[]} = {}) {
  const { records, rules } = resolveAll(facts, { rules: state.rules, autoRetainContext: true });
  const fp = fingerprint(facts), saved = restore(fp);
  state.facts = facts;
  state.records = saved?.records || records;
  state.rules = rules;
  state.rawFingerprint = fp;
  state.documents = documents.length ? documents : ingestJson({facts, documents:[]}, label || 'facts.json').documents;
  state.groups = organiseDocuments(state.documents, facts);
  state.scenarios = scenarios;
  state.inputLabel = label || 'Uploaded evidence';
  state.isExample = example;
  state.dataUrl = dataUrl;
  state.warnings = warnings;
  state.propertyId = saved?.propertyId && state.records.some((r)=>r.property_id===saved.propertyId)
    ? saved.propertyId
    : (
      propertyList().find((p) => p.id === 'kelso-villa-ba1-3au:whole')
      || propertyList().find((p) => p.id === 'kelso-villa')
      || propertyList()[0]
    )?.id || null;
  state.stage = saved?.stage || 'all';
  state.selectedKey = saved?.selectedKey || null;
  ensureSelection();
  persist();
  showReview();
  render();
  showWarnings(warnings);
}
async function loadFromUrl(url,{example=true}={}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const payload = await response.json();
  let manifest = null;
  const looksLikeFactRecord = payload?.contract === '01_extracted' || payload?.developments;
  if (looksLikeFactRecord) {
    try {
      const mRes = await fetch(MANIFEST_URL);
      if (mRes.ok) manifest = await mRes.json();
    } catch {
      /* optional — PDFs still work if object URLs are absent */
    }
  }
  const ingested = ingestJson(payload, url, {
    manifest,
    sampleDataBaseUrl: '../fact_record/sample_data',
  });
  const facts = ingested.facts.length ? ingested.facts : loadFacts(payload);
  const bundled = Array.isArray(payload.documents) ? payload.documents : [];
  applyDataset(facts,{
    label: ingested.label || payload.label || url,
    example: Boolean(payload.example || example || looksLikeFactRecord),
    dataUrl: url,
    documents: mergeDocumentSets(
      ingested.documents,
      bundled.map((d) => ({ ...d, name: d.name || d.title }))
    ),
    warnings: ingested.warnings,
    scenarios: ingested.scenarios || payload.scenarios || [],
  });
}
const EXTRACTOR_URL='http://localhost:8765/extract';
const SAMPLE_EXTRACTION_URL='./data/extracted/sample_extraction.json';
// Run Person A's extractor on uploaded PDFs: live service first (short timeout),
// then the precomputed extraction for known sample PDFs (matched by hash/filename).
async function extractPdfFacts(prepared,ingested){
  const pdfs=prepared.map((p,i)=>({p,doc:ingested.documents.find(d=>d.kind==='pdf'&&(d.base_name===p.name||d.name===p.name))})).filter(x=>x.p.objectUrl&&x.doc);
  if(!pdfs.length)return {facts:[],warnings:[]};
  const banner=$('ingest-banner');banner.hidden=false;banner.textContent=`Extracting facts from ${pdfs.length} PDF${pdfs.length===1?'':'s'}…`;
  const uploads=await Promise.all(pdfs.map(async x=>({name:x.p.name,doc_id:x.doc.doc_id,sha256:await sha256Hex(x.p.bytes)})));
  let payload=null,via='';
  try{
    const form=new FormData();for(const x of pdfs)form.append('files',new Blob([x.p.bytes],{type:'application/pdf'}),x.p.name);
    const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),1500);
    // Short timeout only for reachability; extraction itself may take a while.
    const health=await fetch(EXTRACTOR_URL.replace('/extract','/health'),{signal:ctl.signal});clearTimeout(t);
    if(health.ok){
      banner.textContent=`Extracting facts from ${pdfs.length} PDF${pdfs.length===1?'':'s'} (live extractor, OCR may take a minute)…`;
      const r=await fetch(EXTRACTOR_URL,{method:'POST',body:form});
      if(r.ok){payload=await r.json();via='live extractor';}
    }
  }catch{/* service not running: fall back */}
  let result=payload?factsForUploads(payload,uploads):{facts:[],matched:[],unmatched:uploads.map(u=>u.name)};
  // PDFs the service did not cover (service down, or no OCR there) are extracted live in the browser
  // (pdf.js text layer + tesseract.js OCR for scanned pages).
  const withFacts=new Set(result.facts.map(f=>f.source?.doc_id));
  const browserPdfs=pdfs.filter(x=>!withFacts.has(x.doc.doc_id));
  if(browserPdfs.length){
    const t0=performance.now();let ocr=0;const facts=[...result.facts],matched=[...result.matched.filter(n=>!browserPdfs.some(x=>x.p.name===n))],failed=[];
    via=(payload?'live extractor + ':'')+'in-browser extraction';
    for(const x of browserPdfs){
      try{
        const r=await extractPdfInBrowser(x.p.bytes,{name:x.p.name,doc_id:x.doc.doc_id},msg=>{banner.textContent=`Extracting facts… ${msg}`;});
        facts.push(...r.facts);matched.push(x.p.name);ocr+=r.ocrPages;
        x.doc.doc_type=r.doc_type;if(r.published_date)x.doc.published_date=r.published_date;
        if(!x.doc.property_ids.includes(r.property_id))x.doc.property_ids.push(r.property_id);
      }catch(e){console.error(e);failed.push(x);}
    }
    result={facts,matched,unmatched:[]};
    via+=` in ${((performance.now()-t0)/1000).toFixed(0)}s, ${ocr} page${ocr===1?'':'s'} OCR'd`;
    if(failed.length){
      // Last resort: precomputed sample extraction for files the browser could not read.
      try{const r=await fetch(SAMPLE_EXTRACTION_URL);if(r.ok){const fb=factsForUploads(await r.json(),uploads.filter(u=>failed.some(f=>f.p.name===u.name)));result.facts.push(...fb.facts);result.matched.push(...fb.matched);result.unmatched=failed.map(f=>f.p.name).filter(n=>!fb.matched.includes(n));}}catch{/* ignore */}
    }
  }
  const warnings=[];
  if(result.facts.length){
    warnings.push(`Extracted ${result.facts.length} facts from ${result.matched.length} PDF${result.matched.length===1?'':'s'} (${via}).`);
    if(result.unmatched.length)warnings.push(`No facts extracted from: ${result.unmatched.join(', ')}.`);
  }
  banner.hidden=true;
  return {facts:ingestJson({facts:result.facts},'extractor').facts,warnings};
}
async function ingestUserFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  if (state.view === 'landing') {
    addPendingFiles(files);
    return;
  }
  // Review mode: parse this multi-file batch immediately and merge into the open case.
  setParseStatus(true, `Reading ${files.length} document${files.length === 1 ? '' : 's'}…`);
  try {
    const prepared = await prepareUploadFiles(files);
    const baseIngested = await ingestFiles(prepared, { keepBytes: false });
    const ingested = await enrichIngestedFacts(prepared, baseIngested, {
      requireAiKey: false,
      statusLabel: `Running AI extraction on ${files.length} document${files.length === 1 ? '' : 's'}…`,
    });
    // The first real upload replaces demo data. Never mix example claims into a live case.
    const baseFacts = state.isExample ? [] : state.facts;
    const baseDocs = state.isExample ? [] : state.documents;
    const facts = mergeFactSets(baseFacts, ingested.facts);
    const documents = mergeDocumentSets(baseDocs, ingested.documents);
    const label = [...new Set([state.isExample ? '' : state.inputLabel, ...files.map((f) => f.name)].filter(Boolean))].join(' + ');
    if (!facts.length) {
      state.facts = [];
      state.records = [];
      state.documents = documents;
      state.groups = organiseDocuments(documents, []);
      state.scenarios = [];
      state.propertyId = null;
      state.selectedKey = null;
      state.isExample = false;
      state.inputLabel = label;
      state.rawFingerprint = '';
      render();
      showWarnings([
        ...ingested.warnings,
        'Files loaded as evidence. Add Person A’s extracted JSON, start the extraction service, or enable AI extraction to create facts.',
      ]);
      return;
    }
    applyDataset(facts, {
      label,
      documents,
      warnings: ingested.warnings,
      example: false,
    });
    notify(`${files.length} document${files.length === 1 ? '' : 's'} added · ${state.records.length} field groups ready.`);
  } finally {
    setParseStatus(false);
  }
}
function downloadJson(obj,filename){
  const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportArchive(){
  if (!state.records.length){flashError('There are no facts to export. Add extraction JSON first.');return;}
  const result=buildVerifiedRecord(state.records,{
    rules:state.rules,generated_by:state.reviewer?`${state.reviewer} (local reviewer)`:'local fact review',
    input_label:state.inputLabel,reviewer:state.reviewer||null,
  });
  result.export_note='Accepted facts are separately identified from pending/blocked and context-only facts. This browser-only demo does not authenticate reviewers or produce trusted server timestamps.';
  result.documents=state.documents.map(d=>({doc_id:d.doc_id,title:d.title||d.name,doc_type:d.doc_type,published_date:d.published_date,kind:d.kind}));
  downloadJson(result,'property-facts-full-review-archive.json');
  notify('Full review archive exported.');
}
function exportRecord(){
  if (!state.records.length){flashError('There are no facts to export. Add extraction JSON first.');return;}
  const result=buildDatabaseHandoff(state.records,{
    documents:state.documents,
    input_label:state.inputLabel,
    example:state.isExample,
  });
  downloadJson(result, 'property-facts-database-handoff.json');
  notify(`${result.counts.accepted} accepted · ${result.counts.unresolved} awaiting review · ${result.counts.context} context-only exported separately.`);
}
function exportBlocked(){
  const pack=buildAcceptanceRecords(state.records,{input_label:state.inputLabel});
  downloadJson({generated_at:pack.generated_at,exception_queue:pack.blocked},`${state.propertyId||'property'}-exceptions.json`);
  notify('Outstanding cases exported.');
}
function onApprove(){
  const rec=selectedRecord();if (!rec)return;
  try{
    if(isContext(rec))throw new Error('This is context-only evidence. There is no single fact to approve.');
    if(rec.document_error)throw new Error('This printed total mixes measurement bases. Keep it blocked or enter a corrected, supported value.');
    const reviewer=requireReviewer();
    const note=state.reason.trim();if(!note)throw new Error('Add a short explanation for the decision.');
    const selected=chosenCandidate(rec);
    const action=selected && !selected.is_winner?'choose_candidate':'accept';
    const next=applyOverride(rec,{
      action,accepted_by:reviewer,classification:state.selectedClassification,
      candidate_doc_id:selected?.fact_id,note,
    });
    flashError('');replaceRecord(next);notify(`${fieldName(rec)} approved by ${reviewer}.`);advanceQueue();
  }catch(e){flashError(e.message);}
}
function onEscalate(){
  const rec=selectedRecord();if(!rec)return;
  try{
    const reviewer=requireReviewer();
    const note=state.reason.trim();if(!note)throw new Error('Explain why the fact should remain on hold.');
    const next=applyOverride(rec,{
      action:'escalate',accepted_by:reviewer,classification:state.selectedClassification,
      candidate_doc_id:state.selectedCandidateId,note,
    });
    flashError('');replaceRecord(next);notify(`${fieldName(rec)} kept on hold. It will not be published.`);advanceQueue();
  }catch(e){flashError(e.message);}
}
function openEdit(){
  const rec=selectedRecord();if(!rec)return;
  try{requireReviewer();if(isContext(rec))throw new Error('Different scopes cannot be turned into one value using a correction.');}
  catch(e){flashError(e.message);return;}
  state.editingKey=recordKey(rec);flashError('');
  $('edit-field-label').textContent=`${fieldName(rec)} · ${rec.winning_display}`;
  $('edit-value').value=rec.winning_value??'';$('edit-unit').value=rec.winning_unit||'';
  $('edit-note').value='';$('edit-error').hidden=true;$('edit-dialog').showModal();
}
function submitEdit(event){
  event.preventDefault();const rec=state.records.find(r=>recordKey(r)===state.editingKey);if(!rec)return;
  try{
    const next=applyOverride(rec,{
      action:'edit',accepted_by:requireReviewer(),value:$('edit-value').value,
      unit:$('edit-unit').value.trim()||null,note:$('edit-note').value,
      classification:state.selectedClassification,
    });
    $('edit-dialog').close();flashError('');replaceRecord(next);
    notify(`${fieldName(rec)} corrected with a reviewer audit entry.`);advanceQueue();
  }catch(e){$('edit-error').hidden=false;$('edit-error').textContent=e.message;}
}

function renderHeader(){
  if (state.view !== 'review') return;
  const props=propertyList();const select=$('property');
  if (!select) return;
  select.innerHTML=props.map(p=>`<option value="${esc(p.id)}" ${p.id===state.propertyId?'selected':''}>${esc(p.name)}</option>`).join('');
  select.disabled=props.length===0;
  const prop=props.find(p=>p.id===state.propertyId);
  $('property-title').textContent=prop?prop.name:'Review the facts';
  $('property-description').textContent=prop
    ? 'Compare the documents, understand the suggested rule, then approve only what is supported by evidence.'
    : 'Add Person A’s extraction JSON and source files to get started.';
  $('example-banner').hidden=!state.isExample;
  $('file-meta').textContent=state.inputLabel?`${state.facts.length} facts · ${state.documents.length} source files · ${state.inputLabel}`:'';
  $('reviewer').value=state.reviewer;
  for(const button of document.querySelectorAll('.stage')){
    button.setAttribute('aria-pressed',String(button.dataset.stage===state.stage));
  }
  const samples=$('samples');
  if (samples && state.dataUrl) {
    const options=[...samples.options];
    if (options.some(o=>o.value===state.dataUrl)) samples.value=state.dataUrl;
  }
}
function renderSummary(){
  const records=activePropertyRecords();
  const review=records.filter(needsReview).length;
  const auto=records.filter(isContext).length;
  const approved=records.filter(isHumanDone).length;
  const stats=[
    ['≡','Differences found',records.length,''],
    ['!','Need your decision',review,'alert'],
    ['↔','Safely auto-organised',auto,'auto'],
    ['✓','Facts approved',approved,'approved'],
  ];
  $('summary').innerHTML=stats.map(([icon,label,num,tone])=>`<div class="stat ${tone}"><span class="stat-icon" aria-hidden="true">${icon}</span><span><b>${num}</b><small>${label}</small></span></div>`).join('');
  for(const [key,num] of Object.entries({all:records.length,review,automatic:auto,verified:approved})){
    const node=$(`count-${key}`);if(node)node.textContent=num;
  }
}
function caseTitle(rec){return state.scenarios.find(c=>c.id===rec.case_id)?.title || fieldName(rec);}
function renderQueue(){
  const records=listForStage();
  $('queue-sub').textContent=`${records.length} ${records.length===1?'difference':'differences'} in this view`;
  if(!records.length){$('queue').innerHTML='<p class="empty-hint">Nothing here yet. Choose another filter or add more evidence.</p>';return;}
  $('queue').innerHTML=records.map(rec=>{
    const selected=state.selectedKey===recordKey(rec);
    const suggestion=summaryOf(rec);
    const primary=isContext(rec)?'Values kept separately':rec.document_error?'Invalid combined total':rec.winning_display;
    return `<button type="button" class="queue-item" data-key="${esc(recordKey(rec))}" aria-current="${selected?'true':'false'}">
      <span class="queue-item-top"><span class="queue-field">${esc(caseTitle(rec))}</span>${statusTag(rec)}</span>
      <div class="queue-value">${esc(primary||'Review evidence')}</div>
      <p class="queue-secondary">${esc(suggestion.title)} · ${esc(suggestion.text)}</p>
    </button>`;
  }).join('');
}
function renderDocLibrary(){
  const docsById=new Map();
  for(const rec of activePropertyRecords())for(const c of rec.candidates||[]){
    const id=c.source?.doc_id;if(id&&!docsById.has(id))docsById.set(id,c.source);
  }
  const docs=[...docsById.values()];$('source-count').textContent=String(docs.length);
  $('doc-library').innerHTML=docs.length?docs.map(doc=>`<button type="button" class="doc-row" data-doc="${esc(doc.doc_id)}"><span class="doc-title">${esc(doc.title||doc.doc_id)}</span><span class="doc-meta">${esc(doc.doc_type||'source')}${doc.synthetic?' · synthetic':''}</span></button>`).join(''):'<p class="subtext">No source documents listed.</p>';
}
function highlightedQuote(candidate){
  if(!candidate?.quote)return '<p class="quote-block">No quotation supplied with this extraction.</p>';
  const quote=String(candidate.quote);
  const spans=highlightSpans(quote,candidate).sort((a,b)=>a.start-b.start);
  if(!spans.length)return `<p class="quote-block">${esc(quote)}</p>`;
  let html='',start=0;
  for(const s of spans){if(s.start<start)continue;html+=esc(quote.slice(start,s.start));html+=`<mark>${esc(quote.slice(s.start,s.end))}</mark>`;start=s.end;}
  html+=esc(quote.slice(start));return `<p class="quote-block">${html}</p>`;
}
function findDocument(candidate){
  const id=candidate?.source?.doc_id;
  return state.documents.find(d=>d.doc_id===id&&d.object_url) || state.documents.find(d=>d.doc_id===id) || null;
}
function evidenceCandidates(rec){
  if(!rec)return [null,null];
  const list=[...rec.candidates];
  if(isContext(rec))return [list[0]||null,list[1]||null];
  const first=chosenCandidate(rec);
  const other=list.find(c=>c.fact_id!==first?.fact_id && (c.value!==first?.value||c.scope!==first?.scope)) || list.find(c=>c!==first) || null;
  return [first,other];
}
function renderEvidenceCard(side,rec,candidate){
  const card=$(`evidence-${side}`),head=$(`evidence-${side}-meta`),body=$(`evidence-${side}-body`);
  if(!candidate){card.classList.remove('is-recommended');head.innerHTML='<div class="source-name">No second source</div>';body.innerHTML='<p class="empty-hint">One piece of evidence is available for this field.</p>';return;}
  const source=candidate.source||{},isSuggested=rec.resolution_kind!=='scoped_context'&&chosenCandidate(rec)?.fact_id===candidate.fact_id;
  card.classList.toggle('is-recommended',isSuggested);
  const date=sourceDate(candidate),scope=candidate.scope?` · ${scopeLabel(candidate.scope)}`:'';
  const basis=candidate.area_basis?`${candidate.area_basis.toUpperCase()} area`:
    (rec.field.includes('area')?'Basis not stated':'');
  const note=source.synthetic?' · synthetic source':'';
  head.innerHTML=`<div class="source-head"><span class="source-name">${esc(source.title||source.doc_id||'Source')}</span>${isSuggested&&!rec.document_error?'<span class="tag auto">Suggested</span>':''}</div>
    <div class="source-date">${esc(date)} · ${esc((source.doc_type||'source').replaceAll('_',' '))}${esc(note)}</div>
    <div class="source-value">${esc(valueFor(rec,candidate))}</div>
    <div class="source-basis">${esc([basis,candidate.scope?scopeLabel(candidate.scope):null].filter(Boolean).join(' · '))}</div>`;
  const page=candidate.page?`Page ${candidate.page}`:'Page not provided';
  const isSummary=state.isExample||String(candidate.quote_attribution||'').includes('Scenario summary');
  let html=`<p class="quote-label">${esc(page)} · ${isSummary?'Scenario evidence':'Extracted quotation'}</p>
    ${highlightedQuote(candidate)}
    <p class="evidence-provenance">${esc(isSummary?'Illustrative scenario summary — upload the source PDF to verify the original wording.':candidate.quote_attribution||'From extracted source evidence.')}</p>`;
  const doc=findDocument(candidate);
  if(doc?.object_url&&doc.kind==='pdf'){
    html=`<div class="pdf-canvas-wrap" id="pdf-${side}"><p class="empty-hint">Loading PDF page…</p></div>${html}`;
  }else if(source.url&&/^https?:\/\//.test(source.url)){
    html+=`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Open original document</a>`;
  }
  body.innerHTML=html;
  if(doc?.object_url&&doc.kind==='pdf')renderPdf(`pdf-${side}`,doc.object_url,Number(candidate.page)||1);
}
async function renderPdf(elementId,url,pageNumber){
  const host=$(elementId);if(!host)return;
  if(!window.pdfjsLib){host.innerHTML='<p class="empty-hint">PDF viewer is unavailable. Use the supporting quote below.</p>';return;}
  const token=`${url}#${pageNumber}`;host.dataset.token=token;
  try{
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await window.pdfjsLib.getDocument(url).promise;
    const page=await pdf.getPage(Math.min(Math.max(1,pageNumber),pdf.numPages));
    const viewport=page.getViewport({scale:1.05});const canvas=document.createElement('canvas');
    canvas.width=viewport.width;canvas.height=viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    if(host.isConnected&&host.dataset.token===token){host.replaceChildren(canvas);}
  }catch(err){if(host.isConnected)host.innerHTML=`<p class="empty-hint">PDF unavailable: ${esc(err.message)}</p>`;}
}
function renderEvidence(){
  const rec=selectedRecord();
  if(!rec){$('insight').innerHTML='<p>Choose a difference to compare its source evidence.</p>';$('evidence-count').textContent='';renderEvidenceCard('a',{field:''},null);renderEvidenceCard('b',{field:''},null);$('other-evidence').innerHTML='';return;}
  const advice=summaryOf(rec);
  $('evidence-sub').textContent=fieldName(rec);
  $('evidence-count').textContent=`${rec.candidates.length} ${rec.candidates.length===1?'source':'sources'}`;
  $('insight').className=`guidance ${advice.tone==='error'?'warning':advice.tone==='caution'?'caution':''}`;
  $('insight').innerHTML=`<div class="guidance-top"><span class="guidance-icon">${rec.document_error?'!':isContext(rec)?'↔':rec.primary_classification==='TRUE_CONFLICT'?'!':'✓'}</span><strong>${esc(advice.title)}</strong></div><p>${esc(advice.text)}</p>`;
  const [a,b]=evidenceCandidates(rec);renderEvidenceCard('a',rec,a);renderEvidenceCard('b',rec,b);
  const additional=rec.candidates.filter(c=>c.fact_id!==a?.fact_id&&c.fact_id!==b?.fact_id);
  $('other-evidence').innerHTML=additional.length?`<details><summary>${additional.length} more supporting source${additional.length===1?'':'s'}</summary>${additional.map(c=>`<button type="button" data-other-cand="${esc(c.fact_id)}">${esc(valueFor(rec,c))} · ${esc(c.source?.title)}</button>`).join('')}</details>`:'';
}
function renderAudit(rec){
  const audit=(rec.audit||[]).slice().reverse();
  const rows=audit.map(entry=>`<li><strong>${esc(entry.accepted_by||'unknown')}</strong> · ${esc(entry.action.replaceAll('_',' '))}<br><time>${esc(formatWhen(entry.accepted_at))}</time>${entry.note?`<br>${esc(entry.note)}`:''}</li>`).join('');
  return `<details class="audit-details"><summary>Decision history (${audit.length})</summary><ol>${rows||'<li>No decisions yet</li>'}</ol></details>`;
}
function renderResolve(){
  const host=$('resolve-panel'),rec=selectedRecord();
  if(!rec){host.innerHTML='<p class="empty-hint">Select a field on the left. The suggested rule and the next action will appear here.</p>';return;}
  const advice=summaryOf(rec),classOptions=REVIEW_CLASSIFICATIONS.map(c=>`<option value="${esc(c.id)}" ${state.selectedClassification===c.id?'selected':''}>${esc(c.label)}</option>`).join('');
  const status=isContext(rec)?'<span class="tag auto">No human action needed</span>':statusTag(rec);
  const top=`<div class="decision-status">${kindTag(rec)}${status}</div><h3 class="decision-title">${esc(fieldName(rec))}</h3>
    <p class="decision-explain">${esc(advice.title)}</p><div class="proposed ${advice.tone==='error'?'error':isContext(rec)?'auto':''}">
    <p class="overline">${rec.document_error?'DOCUMENT CHECK':isContext(rec)?'SAFE AUTOMATIC RULE':'ENGINE RECOMMENDATION'}</p>
    <p class="suggestion">${esc(advice.suggestion)}</p><p>${esc(advice.text)}</p></div>`;
  const audit=renderAudit(rec);
  const rules=`<details class="rule-details"><summary>Why did the rule suggest this?</summary><p>${esc(rec.rule_applied||'Per-field source authority then recency.')}</p><p>${esc(plain(rec.headline_reason||''))}</p></details>`;
  if(isContext(rec)){
    const facts=rec.scoped_facts?.length?rec.scoped_facts:rec.candidates;
    host.innerHTML=`${top}<div class="auto-detail"><p><strong>What the system did:</strong> labelled each claim and kept both. No single fact is quotable from this comparison.</p>
      <ul>${facts.map(c=>`<li><strong>${esc(valueFor(rec,c))}</strong> — ${esc(c.area_basis?c.area_basis.toUpperCase()+' basis':c.scope?scopeLabel(c.scope):'basis not stated')} <span>(${esc(c.source?.title||c.source_doc_id||'source')})</span></li>`).join('')}</ul></div>
      <p class="context-note">This record goes into <strong>context_facts</strong>, not the published <strong>accepted_facts</strong>.</p>${rules}${audit}`;
    return;
  }
  const chosen=chosenCandidate(rec);
  const choose=rec.document_error?'':`<div><h4 class="choice-heading">Which source should win?</h4>${rec.candidates.map(c=>{
    const selected=chosen?.fact_id===c.fact_id;
    return `<label class="candidate-option ${selected?'selected':''}"><input type="radio" name="candidate" value="${esc(c.fact_id)}" ${selected?'checked':''}>
      <span><strong>${esc(valueFor(rec,c))}</strong><small>${esc(c.source?.title||'Source')} · ${esc(sourceDate(c))}</small></span></label>`;
  }).join('')}</div>`;
  const isDone=isHumanDone(rec);
  const primaryLabel=rec.document_error?'Keep document error on hold':isDone?'Confirm updated decision':`✓ Confirm ${valueFor(rec,chosen)}`;
  const buttons=rec.document_error?`<button type="button" class="button danger" id="btn-escalate">Keep on hold · do not publish</button>
    <button type="button" class="button secondary" id="btn-edit-value">Enter evidenced correction</button>`
    : `<button type="button" class="button primary" id="btn-approve">${esc(primaryLabel)}</button>
      <button type="button" class="button secondary" id="btn-escalate">Keep on hold instead</button>
      <button type="button" class="link-button" id="btn-edit-value">Enter a corrected value…</button>`;
  const info=rec.check_this?'<p class="context-note">Check the current official record before signing off. A source ranking alone is insufficient.</p>':'';
  host.innerHTML=`${top}${choose}
    <label for="reason-input" class="form-label">Why is this correct?</label>
    <textarea id="reason-input" rows="3" placeholder="A short, evidence-based explanation">${esc(state.reason)}</textarea>
    <div class="decision-actions">${buttons}</div>${info}
    <details class="class-details"><summary>Change the suggested classification</summary><select id="class-choice" aria-label="Difference classification">${classOptions}</select>
    <p>Change only if the evidence supports a different explanation. The original engine result remains in the audit.</p></details>
    ${rules}${audit}<p class="context-note">${rec.voice?.quotable?'Verified and eligible for downstream use.':'Not yet quotable. Human approval is required for this single-valued fact.'}</p>`;
  host.querySelectorAll('input[name="candidate"]').forEach(input=>input.addEventListener('change',()=>{
    const defaultNote=summaryOf(rec).reason;
    const wasDefault=state.reason===defaultNote;
    state.selectedCandidateId=input.value;
    const selection=chosenCandidate(rec);
    if(wasDefault||!state.reason.trim())state.reason=`Selected ${valueFor(rec,selection)} from ${selection?.source?.title||'evidence'} after comparing the sources; reviewer overrode the automatic candidate.`;
    renderEvidence();renderResolve();
  }));
  host.querySelector('#reason-input')?.addEventListener('input',e=>{state.reason=e.target.value;});
  host.querySelector('#class-choice')?.addEventListener('change',e=>{state.selectedClassification=e.target.value;});
  host.querySelector('#btn-approve')?.addEventListener('click',onApprove);
  host.querySelector('#btn-escalate')?.addEventListener('click',onEscalate);
  host.querySelector('#btn-edit-value')?.addEventListener('click',openEdit);
}
function render(){renderHeader();renderSummary();renderQueue();renderDocLibrary();renderEvidence();renderResolve();}

function wire(){
  $('btn-ingest')?.addEventListener('click',()=>$('file-input').click());
  $('btn-choose-files')?.addEventListener('click',(e)=>{e.stopPropagation();$('file-input').click();});
  $('btn-parse')?.addEventListener('click',async (e)=>{
    e.stopPropagation();
    try{await parsePendingFiles();flashError('');}
    catch(err){flashError(err.message);}
  });
  $('btn-clear-files')?.addEventListener('click',()=>clearPendingFiles());
  $('btn-new-case')?.addEventListener('click',()=>resetToLanding());
  $('btn-home')?.addEventListener('click',(e)=>{
    if (state.view === 'review') {
      e.preventDefault();
      resetToLanding();
    }
  });
  $('file-chips')?.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-remove-index]');
    if(!btn)return;
    removePendingFile(Number(btn.dataset.removeIndex));
  });
  $('upload-zone')?.addEventListener('click',(e)=>{
    if(e.target.closest('button'))return;
    $('file-input').click();
  });
  $('upload-zone')?.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file-input').click();}
  });
  $('file-input').addEventListener('change',async e=>{
    if(!e.target.files?.length)return;
    try{
      if(state.view==='landing'){
        addPendingFiles(e.target.files);
      }else{
        await ingestUserFiles(e.target.files,{append:true});
      }
      flashError('');
    }catch(err){flashError(`Could not read these files: ${err.message}`);}
    e.target.value='';
  });
  $('api-key')?.addEventListener('change',()=>readApiKey());
  $('btn-export').addEventListener('click',exportRecord);
  $('btn-export-archive').addEventListener('click',exportArchive);
  $('btn-export-blocked').addEventListener('click',exportBlocked);
  $('reviewer').addEventListener('input',e=>{state.reviewer=e.target.value;persist();});
  $('property').addEventListener('change',e=>{state.propertyId=e.target.value;state.selectedKey=null;ensureSelection();persist();render();});
  document.querySelectorAll('.stage').forEach(button=>button.addEventListener('click',()=>{
    state.stage=button.dataset.stage;ensureSelection();persist();render();
  }));
  $('queue').addEventListener('click',e=>{
    const button=e.target.closest('[data-key]');if(!button)return;
    const rec=state.records.find(r=>recordKey(r)===button.dataset.key);if(rec)selectRecord(rec);
  });
  $('doc-library').addEventListener('click',e=>{
    const button=e.target.closest('[data-doc]');if(!button)return;
    const rec=activePropertyRecords().find(r=>r.candidates.some(c=>c.source?.doc_id===button.dataset.doc));
    if(rec)selectRecord(rec);const drawer=$('source-disclosure');if(drawer)drawer.open=false;
  });
  $('other-evidence').addEventListener('click',e=>{
    const button=e.target.closest('[data-other-cand]');if(!button)return;
    state.selectedCandidateId=button.dataset.otherCand;renderEvidence();renderResolve();
  });
  $('btn-load-sample')?.addEventListener('click',async ()=>{
    const url=$('samples')?.value;
    if(!url){flashError('Choose a sample dataset first.');return;}
    try{await loadFromUrl(url,{example:true});flashError('');notify('Sample loaded into the review workbench.');}
    catch(err){flashError(err.message);}
  });
  $('samples')?.addEventListener('change',()=>flashError(''));
  $('edit-form').addEventListener('submit',submitEdit);
  $('edit-cancel').addEventListener('click',()=>$('edit-dialog').close());
  const overlay=$('drop-overlay');let depth=0;
  const isFile=e=>Boolean(e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files'));
  document.addEventListener('dragenter',e=>{if(!isFile(e))return;e.preventDefault();depth++;overlay.hidden=false;});
  document.addEventListener('dragover',e=>{if(!isFile(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';});
  document.addEventListener('dragleave',()=>{depth=Math.max(0,depth-1);if(depth===0)overlay.hidden=true;});
  document.addEventListener('drop',async e=>{
    if(!isFile(e))return;
    e.preventDefault();depth=0;overlay.hidden=true;
    try{
      if(state.view==='landing'){
        addPendingFiles(e.dataTransfer.files);
        flashError('');
      }else{
        await ingestUserFiles(e.dataTransfer.files,{append:true});
        flashError('');
      }
    }catch(err){flashError(err.message);}
  });
}
async function boot(){
  loadStoredApiKey();
  wire();
  showLanding();
  try{
    const response=await fetch('config/field_rules.json');
    if(response.ok)state.rules=await response.json();
  }catch{/* original defaults remain valid offline */}
  const params=new URLSearchParams(location.search);
  const data=params.get('data');
  if(data){
    try{await loadFromUrl(data,{example:/example\.json$/.test(data)});flashError('');}
    catch(err){flashError(`Could not load ${data}: ${err.message}`);showLanding();}
  }
}
boot();
